/** HTTPS transport with DNS pinning. Tests replace DNS and the socket sender,
 * never the endpoint policy. No proxy environment or pooled sockets are used.
 */
import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import type { RequestOptions } from 'node:https';
import ipaddr from 'ipaddr.js';
import { CaldavError } from './caldavErrors';

export const DAV_MAX_BYTES = 4 * 1024 * 1024;
export const DAV_TIMEOUT_MS = 30_000;
export interface DavResponse { status: number; headers: Record<string, string | undefined>; body: string }
export interface DavSendRequest {
  url: URL; address: string; family: 4 | 6; method: 'PROPFIND' | 'REPORT';
  headers: Record<string, string>; body: string; signal: AbortSignal; maxBytes: number;
}
export interface DavNetwork {
  resolve(host: string): Promise<Array<{ address: string; family: number }>>;
  send(request: DavSendRequest): Promise<DavResponse>;
}

export function publicDavAddress(address: string): boolean {
  if (!isIP(address)) return false;
  try {
    const ip = ipaddr.parse(address);
    if (ip.range() !== 'unicast') return false;
    // Allow IPv6 global unicast only; block newer documentation and transition
    // allocations even if the parser library predates them.
    if (ip.kind() === 'ipv6') {
      const v6 = ip as ipaddr.IPv6;
      return v6.match(ipaddr.parseCIDR('2000::/3')) && !v6.match(ipaddr.parseCIDR('3fff::/20'))
        && !v6.match(ipaddr.parseCIDR('2002::/16'));
    }
    return true;
  } catch { return false; }
}

export function davUrl(value: string, base?: string): URL {
  if (typeof value !== 'string' || !value || value.length > 2048 || /[\s\\\u0000-\u001f\u007f]/.test(value)) throw new CaldavError('security');
  let u: URL;
  try {
    const decoded = decodeURIComponent(value);
    if (/[\\\u0000-\u001f\u007f]/.test(decoded) || decoded.split('/').some((s) => s === '.' || s === '..')) throw new Error();
    u = new URL(value, base);
  } catch { throw new CaldavError('security'); }
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || value.includes('?') || value.includes('#')
    || !host || host.endsWith('.') || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')
    || host.endsWith('.internal') || host.endsWith('.home') || (!isIP(host) && !host.includes('.'))
    || (isIP(host) && !publicDavAddress(host))) throw new CaldavError('security');
  return u;
}

/** Credentials stay on the configured origin, except Apple's explicit CalDAV
 * shard hostnames for an iCloud account configured on Apple's CalDAV service.
 * Merely selecting iCloud on a custom server never enables this exception.
 */
export function davOriginAllowed(origin: URL, target: URL, provider: string): boolean {
  if (origin.origin === target.origin) return true;
  const apple = /^(?:caldav|p[0-9]+-caldav)\.icloud\.com$/;
  return provider === 'icloud' && !origin.port && !target.port && apple.test(origin.hostname)
    && /^p[0-9]+-caldav\.icloud\.com$/.test(target.hostname);
}

export const sendDavHttps: DavNetwork['send'] = (input) => new Promise((resolve, reject) => {
  const options: RequestOptions = {
    method: input.method, headers: input.headers, agent: false, rejectUnauthorized: true,
    maxHeaderSize: 16 * 1024, signal: input.signal, family: input.family,
    // The validated IP is the only address the socket can connect to. TLS and
    // Host still use the original hostname, with normal certificate checks.
    lookup: (_hostname, options, callback) => options.all
      ? callback(null, [{ address: input.address, family: input.family }])
      : callback(null, input.address, input.family)
  };
  const req = httpsRequest(input.url, options, (res) => {
    const length = res.headers['content-length'];
    if ((length !== undefined && (!/^\d+$/.test(length) || Number(length) > input.maxBytes))
      || (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity')) {
      res.destroy(); req.destroy(); reject(new CaldavError('too-large')); return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    res.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > input.maxBytes) { res.destroy(); req.destroy(); reject(new CaldavError('too-large')); }
      else chunks.push(chunk);
    });
    res.on('error', () => reject(new CaldavError('network')));
    res.on('aborted', () => reject(new CaldavError('network')));
    res.on('end', () => {
      if (!res.complete) { reject(new CaldavError('network')); return; }
      try {
        const body = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
        resolve({ status: res.statusCode ?? 0, headers: Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : v])), body });
      } catch { reject(new CaldavError('malformed')); }
    });
  });
  req.on('socket', (socket) => {
    socket.once('secureConnect', () => {
      try {
        if (!socket.remoteAddress || ipaddr.process(socket.remoteAddress).toString() !== ipaddr.process(input.address).toString()) {
          req.destroy(new CaldavError('security'));
        }
      } catch { req.destroy(new CaldavError('security')); }
    });
  });
  req.on('error', (e) => reject(e instanceof CaldavError ? e : new CaldavError(input.signal.aborted ? 'timeout' : 'network')));
  req.end(input.body);
});

/** Race DNS and injected senders against the same abort signal as sockets. */
async function bounded<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new CaldavError('timeout');
  return new Promise((resolve, reject) => {
    const abort = () => reject(new CaldavError('timeout'));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export class CaldavTransport {
  constructor(private network: DavNetwork = { resolve: (host) => lookup(host, { all: true, verbatim: true }), send: sendDavHttps }) {}

  async request(input: {
    url: string; origin: string; provider: string; method: 'PROPFIND' | 'REPORT'; depth: '0' | '1'; body: string;
    username: string; password: string; signal: AbortSignal; guard: () => void;
  }): Promise<DavResponse & { url: string }> {
    if ((input.method !== 'PROPFIND' && input.method !== 'REPORT') || (input.depth !== '0' && input.depth !== '1')
      || !input.username || /[\r\n:\u0000]/.test(input.username) || !input.password || /[\r\n\u0000]/.test(input.password)) throw new CaldavError('invalid');
    const origin = davUrl(input.origin);
    let url = davUrl(input.url);
    for (let redirects = 0; redirects <= 3; redirects++) {
      if (!davOriginAllowed(origin, url, input.provider)) throw new CaldavError('security');
      const host = url.hostname.replace(/^\[|\]$/g, '');
      let addresses;
      try { addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await bounded(this.network.resolve(host), input.signal); }
      catch (e) { throw e instanceof CaldavError ? e : new CaldavError('network'); }
      if (!addresses.length || addresses.length > 32 || addresses.some((a) => !publicDavAddress(a.address) || a.family !== isIP(a.address))) throw new CaldavError('security');
      if (input.signal.aborted) throw new CaldavError('timeout');
      input.guard();
      const response = await bounded(this.network.send({ url, address: addresses[0].address, family: addresses[0].family as 4 | 6,
        method: input.method, headers: { 'content-type': 'application/xml; charset=utf-8', accept: 'application/xml, text/xml',
          'accept-encoding': 'identity', depth: input.depth, authorization: `Basic ${Buffer.from(`${input.username}:${input.password}`, 'utf8').toString('base64')}`,
          'content-length': String(Buffer.byteLength(input.body)) }, body: input.body, signal: input.signal, maxBytes: DAV_MAX_BYTES }), input.signal);
      if (typeof response.body !== 'string' || Buffer.byteLength(response.body) > DAV_MAX_BYTES) throw new CaldavError('too-large');
      if ([301, 302, 307, 308].includes(response.status)) {
        if (redirects === 3 || !response.headers.location) throw new CaldavError('security');
        url = davUrl(response.headers.location, url.href);
        continue;
      }
      if (response.status === 303) throw new CaldavError('security');
      return { ...response, url: url.href };
    }
    throw new CaldavError('security');
  }
}
