/** Namespace aware DAV XML. DTDs/entities, processing instructions, deep trees
 * and excessive nodes are rejected before any data is consumed by the client.
 */
import { SaxesParser } from 'saxes';
import { CaldavError, httpStatus } from './caldavErrors';
import { DAV_MAX_BYTES } from './caldavTransport';
export const DAV = 'DAV:';
export const CAL = 'urn:ietf:params:xml:ns:caldav';
export interface DavNode { ns: string; name: string; text: string; attrs: Record<string, string>; children: DavNode[] }
export const children = (n: DavNode, ns: string, name: string): DavNode[] => n.children.filter((c) => c.ns === ns && c.name === name);
export function one(n: DavNode, ns: string, name: string, required = false): DavNode | undefined {
  const matches = children(n, ns, name);
  if (matches.length > 1 || (required && !matches.length)) throw new CaldavError('malformed');
  return matches[0];
}
export function leaf(n: DavNode): string {
  if (n.children.length) throw new CaldavError('malformed');
  return n.text;
}
export function parseDavXml(xml: string): DavNode {
  if (Buffer.byteLength(xml) > DAV_MAX_BYTES) throw new CaldavError('too-large');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new CaldavError('malformed');
  const parser = new SaxesParser({ xmlns: true });
  const stack: DavNode[] = [];
  let root: DavNode | undefined;
  let nodes = 0;
  parser.on('error', () => { throw new CaldavError('malformed'); });
  parser.on('doctype', () => { throw new CaldavError('malformed'); });
  parser.on('processinginstruction', () => { throw new CaldavError('malformed'); });
  parser.on('opentag', (tag) => {
    if (++nodes > 60_000 || stack.length >= 32) throw new CaldavError('too-large');
    const attrs = Object.create(null) as Record<string, string>;
    for (const a of Object.values(tag.attributes)) if (!a.uri) attrs[a.local] = a.value;
    const node: DavNode = { ns: tag.uri, name: tag.local, text: '', attrs, children: [] };
    if (stack.length) stack[stack.length - 1].children.push(node);
    else if (root) throw new CaldavError('malformed');
    else root = node;
    stack.push(node);
  });
  const text = (value: string) => {
    if (stack.length) stack[stack.length - 1].text += value;
    else if (value.trim()) throw new CaldavError('malformed');
  };
  parser.on('text', text);
  parser.on('cdata', text);
  parser.on('closetag', () => { stack.pop(); });
  try { parser.write(xml).close(); } catch (e) { throw e instanceof CaldavError ? e : new CaldavError('malformed'); }
  if (!root || stack.length || root.ns !== DAV || root.name !== 'multistatus') throw new CaldavError('malformed');
  return root;
}
function status(n: DavNode): number {
  const match = /^HTTP\/\d(?:\.\d)? ([1-5]\d\d)(?: .*)?$/.exec(leaf(n).trim());
  if (!match) throw new CaldavError('malformed');
  return Number(match[1]);
}
export interface DavResource { href: string; properties: Map<string, DavNode>; failed: Map<string, number> }
export const propertyKey = (ns: string, name: string): string => `${ns}|${name}`;
export function davResources(xml: string): DavResource[] {
  const root = parseDavXml(xml);
  if (root.text.trim() || root.children.some((c) => c.ns !== DAV || !['response', 'responsedescription', 'sync-token'].includes(c.name))) throw new CaldavError('malformed');
  const responses = children(root, DAV, 'response');
  if (responses.length > 10_000) throw new CaldavError('too-large');
  return responses.map((response) => {
    if (response.text.trim() || one(response, DAV, 'error')) throw new CaldavError('malformed');
    const href = leaf(one(response, DAV, 'href', true)!).trim();
    if (!href) throw new CaldavError('malformed');
    const direct = one(response, DAV, 'status');
    if (direct && status(direct) !== 200) httpStatus(status(direct));
    const properties = new Map<string, DavNode>();
    const failed = new Map<string, number>();
    for (const ps of children(response, DAV, 'propstat')) {
      const code = status(one(ps, DAV, 'status', true)!);
      const prop = one(ps, DAV, 'prop', true)!;
      if (prop.text.trim()) throw new CaldavError('malformed');
      for (const p of prop.children) {
        const key = propertyKey(p.ns, p.name);
        if (properties.has(key) || failed.has(key)) throw new CaldavError('malformed');
        if (code === 200 && !one(ps, DAV, 'error')) properties.set(key, p);
        else failed.set(key, code);
      }
    }
    if (!properties.size && !failed.size) throw new CaldavError('malformed');
    return { href, properties, failed };
  });
}
export function property(r: DavResource, ns: string, name: string, required = false): DavNode | undefined {
  const key = propertyKey(ns, name);
  const value = r.properties.get(key);
  if (!value && required) {
    const failed = r.failed.get(key);
    if (failed && failed !== 404) httpStatus(failed);
    throw new CaldavError('unsupported');
  }
  return value;
}
export const DAV_DECL = 'xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"';
export const propfindBody = (properties: string): string => `<?xml version="1.0" encoding="utf-8"?><D:propfind ${DAV_DECL}><D:prop>${properties}</D:prop></D:propfind>`;
