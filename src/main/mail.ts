/**
 * Mail client for connected mailboxes (docs/designs/multi-mailbox.md, eng T1).
 *
 * Main process only. The broker calls `handleMailRequest` for an agent's md-mail
 * tool call; the Settings screen calls `testMailbox` before saving a mailbox.
 * Passwords never leave the main process: they are read from the secret store
 * through `deps.getPassword` at call time.
 *
 * One IMAP connection per mailbox, reused across agents and serialized per folder
 * with ImapFlow's mailbox lock; closed after it sits idle. Sends go through SMTP
 * with a Message-ID the broker chooses, so a retried send is answered from memory
 * instead of sending twice, and a send that times out is looked up in Sent before
 * it is reported (send once).
 *
 * The IMAP and SMTP factories are injected so tests can use a fake client or
 * local test servers (eng review E4).
 */
import { createHash, randomBytes } from 'node:crypto';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer';
import { simpleParser } from 'mailparser';
import {
  agentMailboxes,
  CLAUDE_ACCOUNT_MAILBOX,
  isMicrosoftAddress,
  mailAccess,
  mailboxIdFor,
  secretRefForMailbox,
  type MailAccessConfig,
  type MailboxRecord,
  type MailOp,
  type MailServer
} from '../shared/mailboxes';

// Limits (eng review E6 left these to the implementer).
const CALL_TIMEOUT_MS = 30_000;
const SEND_TIMEOUT_MS = 60_000;
const SEARCH_DEFAULT = 20;
const SEARCH_MAX = 50;
const BODY_MAX_CHARS = 50_000;
const IDLE_CLOSE_MS = 5 * 60_000;
const SEND_MEMORY_MS = 10 * 60_000;

export type MailErrorKind = 'auth' | 'provider-blocked' | 'network' | 'not-found' | 'bad-request' | 'refused' | 'unsupported' | 'timeout' | 'unknown';

export class MailError extends Error {
  constructor(readonly kind: MailErrorKind, message: string) { super(message); }
}

/** The slice of ImapFlow this module uses (so tests can inject a fake). */
export interface ImapLike {
  usable?: boolean;
  connect(): Promise<void>;
  logout(): Promise<void>;
  close?(): void;
  list(): Promise<Array<{ path: string; specialUse?: string; flags?: Set<string> }>>;
  getMailboxLock(path: string): Promise<{ release(): void }>;
  search(query: Record<string, unknown>, opts?: { uid?: boolean }): Promise<number[] | false>;
  fetchOne(uid: string | number, query: Record<string, unknown>, opts?: { uid?: boolean }): Promise<any>;
  fetch(range: string | number[], query: Record<string, unknown>, opts?: { uid?: boolean }): AsyncIterable<any>;
  append(path: string, content: Buffer | string, flags?: string[]): Promise<unknown>;
  on?(event: string, fn: (...a: any[]) => void): unknown;
}

export interface SmtpLike {
  sendMail(msg: Record<string, unknown>): Promise<{ messageId?: string; accepted?: unknown[] }>;
  verify?(): Promise<unknown>;
  close?(): void;
}

export interface MailDeps {
  getConfig(): MailAccessConfig;
  getPassword(mailboxId: string): string | undefined;
  /** MB-7: record connected / needs-attention on the mailbox. */
  markStatus(mailboxId: string, status: 'connected' | 'needs-attention', reason?: string): void;
  createImap?(server: MailServer, user: string, pass: string): ImapLike;
  createSmtp?(server: MailServer, user: string, pass: string): SmtpLike;
  log?(line: string): void;
}

function defaultImap(server: MailServer, user: string, pass: string): ImapLike {
  return new ImapFlow({
    host: server.host, port: server.port, secure: server.secure,
    auth: { user, pass }, logger: false, connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 60_000
  }) as unknown as ImapLike;
}

function defaultSmtp(server: MailServer, user: string, pass: string): SmtpLike {
  return nodemailer.createTransport({
    host: server.host, port: server.port, secure: server.secure,
    auth: { user, pass }, connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 45_000
  }) as unknown as SmtpLike;
}

/** Plain-language classification of an IMAP or SMTP failure. */
export function classifyMailError(e: unknown): MailError {
  if (e instanceof MailError) return e;
  const err = e as { code?: string; authenticationFailed?: boolean; responseText?: string; response?: string; message?: string };
  const text = `${err?.responseText ?? ''} ${err?.response ?? ''} ${err?.message ?? ''}`;
  if (/application-specific password required|web login required|basic auth(entication)? (is )?(disabled|blocked)|app passwords? (are |is )?(not allowed|disabled)|please log ?in via your web browser/i.test(text)) {
    return new MailError('provider-blocked', 'This provider no longer accepts the app password for this mailbox.');
  }
  if (err?.authenticationFailed || err?.code === 'EAUTH' || /AUTHENTICATIONFAILED|invalid credentials|authentication failed|535/i.test(text)) {
    return new MailError('auth', "The mailbox didn't accept that password. Check it's an app password, not your normal one.");
  }
  if (['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH', 'ESOCKET', 'ECONNECTION', 'EPIPE', 'NoConnection'].includes(err?.code ?? '')) {
    return new MailError('network', "Couldn't reach the mail server. Check the server name and your connection.");
  }
  if (/timed out/i.test(text)) return new MailError('timeout', 'The mail server took too long to answer.');
  return new MailError('unknown', `The mail server returned an error: ${String(err?.message ?? e).slice(0, 200)}`);
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new MailError('timeout', `${what} took longer than ${Math.round(ms / 1000)} seconds.`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

function addrText(a: any): string {
  if (!a) return '';
  if (Array.isArray(a)) return a.map(addrText).filter(Boolean).join(', ');
  if (typeof a === 'string') return a;
  if (a.text) return a.text;
  if (a.address) return a.name ? `${a.name} <${a.address}>` : a.address;
  if (Array.isArray(a.value)) return a.value.map(addrText).join(', ');
  return '';
}

export interface MailRef { mailbox: string; id: string }

export interface ComposeInput {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  /** Reply to a message in the same mailbox (threading headers). */
  replyTo?: MailRef;
  /** Forward a message (MB-8: only by reference, only from the sending mailbox). */
  forward?: MailRef;
  /** Attach the attachments of other messages (same rule). */
  attachFrom?: MailRef[];
}

interface OpenBox { client: ImapLike; lastUsed: number; timer?: ReturnType<typeof setTimeout> }

export class MailService {
  private readonly boxes = new Map<string, OpenBox>();
  private readonly sent = new Map<string, { at: number; result: { messageId: string } }>();
  private readonly createImap: NonNullable<MailDeps['createImap']>;
  private readonly createSmtp: NonNullable<MailDeps['createSmtp']>;

  constructor(private readonly deps: MailDeps) {
    this.createImap = deps.createImap ?? defaultImap;
    this.createSmtp = deps.createSmtp ?? defaultSmtp;
  }

  private record(id: string): MailboxRecord {
    const rec = (this.deps.getConfig().mailboxes ?? []).find((m) => m.id === id);
    if (!rec) throw new MailError('not-found', `The mailbox "${id}" was removed in Settings.`);
    return rec;
  }

  private password(id: string): string {
    const pass = this.deps.getPassword(id);
    if (!pass) throw new MailError('auth', 'This mailbox has no saved password. Fix it in Settings.');
    return pass;
  }

  /** Mark the mailbox from the outcome of a real call (MB-7). Only auth and
   *  provider-blocked mark it; a network blip does not. */
  private note(id: string, err?: MailError): void {
    try {
      if (!err) this.deps.markStatus(id, 'connected');
      else if (err.kind === 'auth' || err.kind === 'provider-blocked') this.deps.markStatus(id, 'needs-attention', err.message);
    } catch { /* status is best-effort */ }
  }

  private async imap(id: string): Promise<ImapLike> {
    const open = this.boxes.get(id);
    if (open && open.client.usable !== false) { this.touch(id, open); return open.client; }
    if (open) this.drop(id);
    const rec = this.record(id);
    const client = this.createImap(rec.imap, rec.address, this.password(id));
    client.on?.('error', () => this.drop(id));
    client.on?.('close', () => this.drop(id));
    try {
      await withTimeout(client.connect(), CALL_TIMEOUT_MS, 'Connecting to the mailbox');
    } catch (e) {
      // A failed login leaves a half-open socket: close it, or every failed
      // attempt leaks a connection.
      try { client.close?.(); } catch { /* already gone */ }
      throw e;
    }
    const box: OpenBox = { client, lastUsed: Date.now() };
    this.boxes.set(id, box);
    this.touch(id, box);
    return client;
  }

  private touch(id: string, box: OpenBox): void {
    box.lastUsed = Date.now();
    if (box.timer) clearTimeout(box.timer);
    box.timer = setTimeout(() => this.drop(id), IDLE_CLOSE_MS);
    (box.timer as { unref?: () => void }).unref?.();
  }

  private drop(id: string): void {
    const box = this.boxes.get(id);
    if (!box) return;
    this.boxes.delete(id);
    if (box.timer) clearTimeout(box.timer);
    box.client.logout().catch(() => box.client.close?.());
  }

  /** Close every connection (app quit, reset, mailbox removed). */
  closeAll(): void { for (const id of [...this.boxes.keys()]) this.drop(id); }
  close(id: string): void { this.drop(id); }

  /** Run `fn` with the folder locked; one reconnect after a dropped socket
   *  (sleep and wake), then a classified error. */
  private async inFolder<T>(id: string, folder: (c: ImapLike) => Promise<string>, fn: (c: ImapLike) => Promise<T>, what: string): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const client = await this.imap(id);
        const path = await folder(client);
        const lock = await withTimeout(client.getMailboxLock(path), CALL_TIMEOUT_MS, what);
        try {
          const out = await withTimeout(fn(client), CALL_TIMEOUT_MS, what);
          this.note(id);
          return out;
        } finally { lock.release(); }
      } catch (e) {
        const err = classifyMailError(e);
        if (err.kind === 'network' && attempt === 0) { this.drop(id); continue; }
        if (err.kind === 'network' || err.kind === 'timeout') this.drop(id);
        this.note(id, err);
        throw err;
      }
    }
    throw new MailError('network', "Couldn't reach the mail server.");
  }

  private static async special(client: ImapLike, use: '\\Drafts' | '\\Sent', names: string[]): Promise<string> {
    const list = await client.list();
    const hit = list.find((f) => f.specialUse === use) ?? list.find((f) => names.some((n) => f.path.toLowerCase() === n.toLowerCase()));
    if (!hit) throw new MailError('not-found', use === '\\Drafts' ? 'This mailbox has no Drafts folder.' : 'This mailbox has no Sent folder.');
    return hit.path;
  }
  private static inbox = async (): Promise<string> => 'INBOX';
  private static drafts = (c: ImapLike): Promise<string> => MailService.special(c, '\\Drafts', ['Drafts', '[Gmail]/Drafts', 'INBOX.Drafts', 'Draft']);
  private static sentBox = (c: ImapLike): Promise<string> => MailService.special(c, '\\Sent', ['Sent', '[Gmail]/Sent Mail', 'Sent Messages', 'INBOX.Sent', 'Sent Items']);

  async search(id: string, q: { text?: string; from?: string; subject?: string; since?: string; unread?: boolean; limit?: number; page?: number }) {
    const limit = Math.min(Math.max(1, Math.floor(q.limit ?? SEARCH_DEFAULT)), SEARCH_MAX);
    const page = Math.max(0, Math.floor(q.page ?? 0));
    return this.inFolder(id, MailService.inbox, async (c) => {
      const query: Record<string, unknown> = {};
      if (q.text) query.text = q.text;
      if (q.from) query.from = q.from;
      if (q.subject) query.subject = q.subject;
      if (q.since) { const d = new Date(q.since); if (!Number.isNaN(d.getTime())) query.since = d; }
      if (q.unread) query.seen = false;
      if (!Object.keys(query).length) query.all = true;
      const uids = (await c.search(query, { uid: true })) || [];
      const newest = [...uids].sort((a, b) => b - a);
      const slice = newest.slice(page * limit, page * limit + limit);
      const messages: Array<{ id: string; from: string; subject: string; date: string; unread: boolean }> = [];
      if (slice.length) {
        for await (const m of c.fetch(slice, { uid: true, envelope: true, flags: true }, { uid: true })) {
          messages.push({
            id: String(m.uid),
            from: addrText(m.envelope?.from),
            subject: m.envelope?.subject ?? '',
            date: m.envelope?.date ? new Date(m.envelope.date).toISOString() : '',
            unread: !(m.flags instanceof Set ? m.flags.has('\\Seen') : false)
          });
        }
      }
      messages.sort((a, b) => Number(b.id) - Number(a.id));
      return { messages, total: newest.length, page, more: newest.length > (page + 1) * limit };
    }, 'Searching the mailbox');
  }

  private async source(c: ImapLike, uid: string): Promise<Buffer> {
    const m = await c.fetchOne(uid, { uid: true, source: true }, { uid: true });
    if (!m || !m.source) throw new MailError('not-found', `No message with id ${uid} in this mailbox.`);
    return Buffer.isBuffer(m.source) ? m.source : Buffer.from(m.source);
  }

  async read(id: string, uid: string) {
    return this.inFolder(id, MailService.inbox, async (c) => {
      const parsed = await simpleParser(await this.source(c, uid));
      let text = parsed.text ?? (typeof parsed.html === 'string' ? parsed.html.replace(/<[^>]+>/g, ' ') : '') ?? '';
      const truncated = text.length > BODY_MAX_CHARS;
      if (truncated) text = `${text.slice(0, BODY_MAX_CHARS)}\n\n[message cut at ${BODY_MAX_CHARS} characters]`;
      return {
        id: uid,
        from: addrText(parsed.from), to: addrText(parsed.to), cc: addrText(parsed.cc),
        subject: parsed.subject ?? '', date: parsed.date ? parsed.date.toISOString() : '',
        messageId: parsed.messageId ?? '',
        text, truncated,
        attachments: (parsed.attachments ?? []).map((a) => ({ name: a.filename ?? 'attachment', size: a.size }))
      };
    }, 'Reading the message');
  }

  /** Build the MIME for a draft or send. References are fetched here, from the
   *  sending mailbox only (MB-8 is checked by the caller first). */
  private async compose(id: string, from: string, input: ComposeInput, messageId: string): Promise<Record<string, unknown>> {
    const msg: Record<string, unknown> = { from, to: input.to, cc: input.cc, subject: input.subject, text: input.body, messageId };
    const refs = [input.replyTo, input.forward, ...(input.attachFrom ?? [])].filter(Boolean) as MailRef[];
    if (!refs.length) return msg;
    await this.inFolder(id, MailService.inbox, async (c) => {
      const attachments: Array<Record<string, unknown>> = [];
      if (input.replyTo) {
        const parsed = await simpleParser(await this.source(c, input.replyTo.id));
        if (parsed.messageId) {
          msg.inReplyTo = parsed.messageId;
          const prior = Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : [];
          msg.references = [...prior, parsed.messageId];
        }
      }
      if (input.forward) {
        attachments.push({ filename: 'forwarded-message.eml', content: await this.source(c, input.forward.id), contentType: 'message/rfc822' });
      }
      for (const ref of input.attachFrom ?? []) {
        const parsed = await simpleParser(await this.source(c, ref.id));
        for (const a of parsed.attachments ?? []) attachments.push({ filename: a.filename ?? 'attachment', content: a.content, contentType: a.contentType });
      }
      if (attachments.length) msg.attachments = attachments;
    }, 'Fetching the referenced message');
    return msg;
  }

  private static build(msg: Record<string, unknown>): Promise<Buffer> {
    return new Promise((resolve, reject) => new MailComposer(msg as never).compile().build((e: Error | null, out: Buffer) => (e ? reject(e) : resolve(out))));
  }

  private static newMessageId(address: string): string {
    return `<${randomBytes(12).toString('hex')}@${address.split('@')[1] ?? 'dontbemichael.local'}>`;
  }

  async draft(id: string, input: ComposeInput) {
    const rec = this.record(id);
    const msg = await this.compose(id, rec.address, input, MailService.newMessageId(rec.address));
    const raw = await MailService.build(msg);
    await this.inFolder(id, MailService.drafts, async (c) => { await c.append(await MailService.drafts(c), raw, ['\\Draft', '\\Seen']); }, 'Saving the draft');
    return { saved: true, messageId: String(msg.messageId) };
  }

  async send(agentId: string, id: string, input: ComposeInput) {
    const rec = this.record(id);
    // Send once: the same agent sending the same message to the same people from
    // the same mailbox within 10 minutes gets the first result back.
    const key = createHash('sha256').update(JSON.stringify([agentId, id, input.to, input.cc ?? '', input.subject, input.body, input.replyTo ?? null, input.forward ?? null, input.attachFrom ?? []])).digest('hex');
    const now = Date.now();
    for (const [k, v] of this.sent) if (now - v.at > SEND_MEMORY_MS) this.sent.delete(k);
    const prior = this.sent.get(key);
    if (prior) return { ...prior.result, sent: true, repeated: true };

    const messageId = MailService.newMessageId(rec.address);
    const msg = await this.compose(id, rec.address, input, messageId);
    const smtp = this.createSmtp(rec.smtp, rec.address, this.password(id));
    try {
      await withTimeout(smtp.sendMail(msg), SEND_TIMEOUT_MS, 'Sending');
    } catch (e) {
      const err = classifyMailError(e);
      if (err.kind === 'timeout' || err.kind === 'network') {
        // The server may have accepted it before the line dropped: look in Sent.
        const found = await this.inSent(id, messageId).catch(() => false);
        if (found) { this.sent.set(key, { at: now, result: { messageId } }); return { sent: true, messageId }; }
      }
      this.note(id, err);
      throw new MailError(err.kind, `Not sent. ${err.message}`);
    } finally { smtp.close?.(); }
    this.note(id);
    this.sent.set(key, { at: now, result: { messageId } });
    // Gmail files sent mail itself; other services need the copy appended.
    if (rec.provider !== 'gmail' && rec.provider !== 'google-workspace') {
      const raw = await MailService.build(msg).catch(() => null);
      if (raw) await this.inFolder(id, MailService.sentBox, async (c) => { await c.append(await MailService.sentBox(c), raw, ['\\Seen']); }, 'Saving to Sent').catch(() => undefined);
    }
    return { sent: true, messageId };
  }

  private async inSent(id: string, messageId: string): Promise<boolean> {
    return this.inFolder(id, MailService.sentBox, async (c) => {
      const hits = await c.search({ header: { 'message-id': messageId } }, { uid: true });
      return Array.isArray(hits) && hits.length > 0;
    }, 'Checking Sent');
  }

  /** Settings "Test and save": log in to IMAP and SMTP with the given password
   *  before anything is stored. */
  async test(rec: Pick<MailboxRecord, 'address' | 'imap' | 'smtp'>, password: string): Promise<{ ok: true } | { ok: false; kind: MailErrorKind; reason: string }> {
    if (isMicrosoftAddress(rec.address)) {
      return { ok: false, kind: 'unsupported', reason: 'Outlook and Microsoft 365 mailboxes stopped accepting app passwords, so they cannot be connected yet.' };
    }
    const client = this.createImap(rec.imap, rec.address, password);
    try {
      await withTimeout(client.connect(), CALL_TIMEOUT_MS, 'Connecting to the mailbox');
      await client.logout().catch(() => undefined);
    } catch (e) {
      const err = classifyMailError(e);
      client.close?.();
      return { ok: false, kind: err.kind, reason: err.message };
    }
    const smtp = this.createSmtp(rec.smtp, rec.address, password);
    try {
      if (smtp.verify) await withTimeout(smtp.verify(), CALL_TIMEOUT_MS, 'Checking outgoing mail');
    } catch (e) {
      const err = classifyMailError(e);
      return { ok: false, kind: err.kind, reason: `Incoming mail works, but sending does not. ${err.message}` };
    } finally { smtp.close?.(); }
    return { ok: true };
  }
}

// ── The broker's mail route ─────────────────────────────────────────────────

export interface MailRequestResult { status: number; body: Record<string, unknown> }

function str(v: unknown, max = 5000): string | undefined {
  return typeof v === 'string' && v.trim() ? v.slice(0, max) : undefined;
}

function ref(v: unknown): MailRef | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  return typeof o.mailbox === 'string' && (typeof o.id === 'string' || typeof o.id === 'number') ? { mailbox: o.mailbox, id: String(o.id) } : undefined;
}

/**
 * One md-mail tool call, already authenticated by the broker token (so `agentId`
 * is trusted). Checks `mailAccess` for the op, MB-8 for references, then runs it.
 * Never throws: every outcome is a status and a JSON body the MCP server relays.
 */
export async function handleMailRequest(svc: MailService, deps: Pick<MailDeps, 'getConfig'>, agentId: string, op: string, body: Record<string, unknown>): Promise<MailRequestResult> {
  const cfg = deps.getConfig();
  const allowedOps: Record<string, MailOp> = { list_mailboxes: 'list', search: 'read', read: 'read', draft: 'draft', send: 'send' };
  const mop = allowedOps[op];
  if (!mop) return { status: 404, body: { error: `Unknown mail tool "${op}".` } };
  const mailbox = str(body.mailbox, 100);
  const access = mailAccess(cfg, agentId, mailbox, mop);
  if (!access.ok) return { status: 403, body: { error: access.reason } };

  if (op === 'list_mailboxes') {
    const recs = cfg.mailboxes ?? [];
    const email = cfg.agentCapabilities?.[agentId]?.email;
    return {
      status: 200,
      body: {
        mailboxes: agentMailboxes(cfg, agentId).map((mid) => {
          const r = recs.find((m) => m.id === mid);
          return mid === CLAUDE_ACCOUNT_MAILBOX
            ? { mailbox: mid, address: 'your Claude account Gmail', note: 'Use the Gmail tools for this one, not md-mail.' }
            : { mailbox: mid, address: r?.address, status: r?.status };
        }),
        sending: email?.send ? 'can send' : 'draft only'
      }
    };
  }
  if (mailbox === CLAUDE_ACCOUNT_MAILBOX) {
    return { status: 400, body: { error: 'Your Claude account mailbox is used through the Gmail tools, not md-mail.' } };
  }

  // MB-8: forwards and attachments only by reference, and only from the mailbox
  // doing the sending. Pasted text is not traceable and is not checked.
  const input: ComposeInput = {
    to: str(body.to, 2000) ?? '', cc: str(body.cc, 2000), subject: str(body.subject, 500) ?? '', body: str(body.body, 200_000) ?? '',
    replyTo: ref(body.reply_to), forward: ref(body.forward), attachFrom: Array.isArray(body.attach_from) ? (body.attach_from.map(ref).filter(Boolean) as MailRef[]).slice(0, 10) : undefined
  };
  const refs = [input.replyTo, input.forward, ...(input.attachFrom ?? [])].filter(Boolean) as MailRef[];
  const foreign = refs.find((r) => r.mailbox !== mailbox);
  if (foreign && (op === 'draft' || op === 'send')) {
    return { status: 403, body: { error: `You can't forward, attach or reply to mail from "${foreign.mailbox}" while writing from "${mailbox}".` } };
  }

  try {
    if (op === 'search') {
      return { status: 200, body: await svc.search(mailbox!, {
        text: str(body.text, 200), from: str(body.from, 200), subject: str(body.subject, 200), since: str(body.since, 40),
        unread: body.unread === true, limit: typeof body.limit === 'number' ? body.limit : undefined, page: typeof body.page === 'number' ? body.page : undefined
      }) };
    }
    if (op === 'read') {
      const id = str(body.id, 40) ?? (typeof body.id === 'number' ? String(body.id) : undefined);
      if (!id) return { status: 400, body: { error: 'read needs the message id from search.' } };
      return { status: 200, body: await svc.read(mailbox!, id) };
    }
    if (!input.to || !input.subject) return { status: 400, body: { error: `${op} needs "to" and "subject".` } };
    if (op === 'draft') return { status: 200, body: await svc.draft(mailbox!, input) };
    return { status: 200, body: await svc.send(agentId, mailbox!, input) };
  } catch (e) {
    const err = classifyMailError(e);
    const status = err.kind === 'not-found' ? 404 : err.kind === 'bad-request' ? 400 : err.kind === 'timeout' ? 504 : 502;
    return { status, body: { error: err.message, kind: err.kind } };
  }
}

// ── Settings: add, fix, remove mailboxes; set Capabilities ─────────────────

export interface MailAdminDeps {
  getConfig(): MailAccessConfig & { mailboxes?: MailboxRecord[] };
  saveConfig(patch: { mailboxes?: MailboxRecord[]; agentCapabilities?: MailAccessConfig['agentCapabilities'] }): void;
  setSecret(ref: string, value: string): { ok: boolean; error?: string };
  deleteSecret(ref: string): void;
}

export interface AddMailboxInput {
  /** Present when fixing an existing mailbox (new password or servers). */
  id?: string;
  provider: MailboxRecord['provider'];
  address: string;
  password: string;
  imap?: MailServer;
  smtp?: MailServer;
}

/** Test first, then store: nothing is saved for a mailbox that does not work
 *  (design review 3A: failure shows its reason and "Try again"). */
export async function saveMailbox(svc: MailService, admin: MailAdminDeps, presets: Record<string, { imap: MailServer; smtp: MailServer }>, input: AddMailboxInput): Promise<{ ok: true; record: MailboxRecord } | { ok: false; kind: MailErrorKind | 'invalid'; reason: string }> {
  const address = (input.address ?? '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) return { ok: false, kind: 'invalid', reason: 'That does not look like an email address.' };
  if (!input.password || !input.password.trim()) return { ok: false, kind: 'invalid', reason: 'Enter the app password.' };
  const preset = presets[input.provider];
  const imap = preset?.imap ?? input.imap;
  const smtp = preset?.smtp ?? input.smtp;
  if (!imap?.host || !smtp?.host) return { ok: false, kind: 'invalid', reason: 'Enter the incoming and outgoing mail servers.' };
  const cfg = admin.getConfig();
  const existing = cfg.mailboxes ?? [];
  if (!input.id && existing.some((m) => m.address.toLowerCase() === address.toLowerCase())) {
    return { ok: false, kind: 'invalid', reason: `${address} is already connected.` };
  }
  const password = input.password.replace(/\s+/g, '');
  const tested = await svc.test({ address, imap, smtp }, password);
  if (!tested.ok) return { ok: false, kind: tested.kind, reason: tested.reason };

  const id = input.id && existing.some((m) => m.id === input.id) ? input.id : mailboxIdFor(address, existing.map((m) => m.id));
  const stored = admin.setSecret(secretRefForMailbox(id), password);
  if (!stored.ok) return { ok: false, kind: 'unknown', reason: stored.error ?? "Couldn't store the password securely on this Mac." };
  const now = Date.now();
  const prior = existing.find((m) => m.id === id);
  const record: MailboxRecord = { id, address, provider: input.provider, imap, smtp, status: 'connected', createdAt: prior?.createdAt ?? now, updatedAt: now };
  admin.saveConfig({ mailboxes: prior ? existing.map((m) => (m.id === id ? record : m)) : [...existing, record] });
  svc.close(id); // a fixed password must not reuse the old connection
  return { ok: true, record };
}

/** Remove a mailbox, its password and every agent's grant to it (design 8A). */
export function removeMailbox(svc: MailService, admin: MailAdminDeps, id: string): { ok: boolean; affected: string[] } {
  const cfg = admin.getConfig();
  const affected: string[] = [];
  const caps = { ...(cfg.agentCapabilities ?? {}) };
  for (const [agentId, c] of Object.entries(caps)) {
    if (c.email?.mailboxes.includes(id)) {
      affected.push(agentId);
      caps[agentId] = { ...c, email: { ...c.email, mailboxes: c.email.mailboxes.filter((m) => m !== id) } };
    }
  }
  admin.saveConfig({ mailboxes: (cfg.mailboxes ?? []).filter((m) => m.id !== id), agentCapabilities: caps });
  admin.deleteSecret(secretRefForMailbox(id));
  svc.close(id);
  return { ok: true, affected };
}

/** Save one agent's Capabilities. Unknown mailbox ids are dropped. Returns
 *  whether email just turned on (E2: that agent needs a restart to get md-mail). */
export function setAgentCapabilities(admin: MailAdminDeps, agentId: string, next: { email?: { enabled: boolean; mailboxes: string[]; send: boolean } }): { ok: true; restartNeeded: boolean } {
  const cfg = admin.getConfig();
  const known = new Set([CLAUDE_ACCOUNT_MAILBOX, ...(cfg.mailboxes ?? []).map((m) => m.id)]);
  const before = cfg.agentCapabilities?.[agentId];
  const email = next.email
    ? { enabled: !!next.email.enabled, mailboxes: [...new Set(next.email.mailboxes.filter((m) => known.has(m)))], send: !!next.email.send }
    : undefined;
  admin.saveConfig({ agentCapabilities: { ...(cfg.agentCapabilities ?? {}), [agentId]: { ...(before ?? {}), email } } });
  return { ok: true, restartNeeded: !before?.email?.enabled && !!email?.enabled };
}
