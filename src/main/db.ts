/**
 * PersistStore — durable harness state in SQLite (better-sqlite3, synchronous).
 *
 * Phase A scope (the rest of the renderer state stays in localStorage for now):
 *   - kv:               scalar app state. Today: the main window's bounds.
 *   - command_history:  made by migration 1, dropped by migration 7 (owner,
 *                       2026-11-11: the typed prompts it held were never read).
 *
 * Lives in the Electron MAIN process (better-sqlite3 is native + synchronous);
 * the renderer reaches it over IPC. The DB file sits next to config.json under
 * app.getPath('userData'). WAL mode so reads never block the single writer.
 *
 * Schema evolves via PRAGMA user_version migrations: an ordered array where
 * migration N runs when user_version < N+1, then bumps it. NEVER edit a shipped
 * migration — only append. Phases B/C (agents + message_queue mirror) are
 * reserved as future additive migrations (see below); they are deliberately
 * NOT built in v1. The cost ledger landed in migration 5 (costLedger.ts).
 */
import Database from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'node:path';

/**
 * Ordered, append-only migrations. Index N takes the DB from user_version N to
 * N+1. To evolve the schema, APPEND a new function — never edit an existing one
 * (shipped DBs have already run it).
 *
 * FUTURE (do NOT build in v1 — reserved so the array isn't painted into a corner):
 *   - Phase B: `agents` + `message_queue` mirror of the renderer roster/queues
 *     (dual-write), enabling the eventual authority flip off localStorage.
 */
const MIGRATIONS: Array<(db: Database.Database) => void> = [
  // → user_version 1 (Phase A): scalar kv + net-new command history.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS kv (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,     -- JSON-encoded
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS command_history (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        cwd      TEXT,
        text     TEXT NOT NULL,
        ts       INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ch_agent_ts ON command_history(agent_id, ts DESC);
    `);
  },
  // → user_version 2: Pulse telemetry (docs/designs/team-performance.md, D16).
  // Data points are written only by main; runs, daily totals and the rest are
  // derived and can be rebuilt from the events. Keyed by office (harness home).
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS telemetry_events (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        office   TEXT NOT NULL,
        agent_id TEXT,
        kind     TEXT NOT NULL,
        ts       INTEGER NOT NULL,
        value    REAL,
        attrs    TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_te_office_ts ON telemetry_events(office, ts);
      CREATE TABLE IF NOT EXISTS telemetry_runs (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        office     TEXT NOT NULL,
        agent_id   TEXT NOT NULL,
        mission_id TEXT NOT NULL,
        dispatched INTEGER NOT NULL,
        start      INTEGER,
        end        INTEGER,
        usd        REAL NOT NULL DEFAULT 0,
        work       INTEGER NOT NULL DEFAULT 0,
        outcome    TEXT,
        relay      INTEGER NOT NULL DEFAULT 0,
        day        TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tr_office_start ON telemetry_runs(office, dispatched);
      CREATE TABLE IF NOT EXISTS telemetry_daily (
        office         TEXT NOT NULL,
        agent_id       TEXT NOT NULL,
        day            TEXT NOT NULL,
        usd            REAL NOT NULL DEFAULT 0,
        run_usd        REAL NOT NULL DEFAULT 0,
        tokens         REAL NOT NULL DEFAULT 0,
        emails         INTEGER NOT NULL DEFAULT 0,
        sent           INTEGER NOT NULL DEFAULT 0,
        tasks          INTEGER NOT NULL DEFAULT 0,
        checks         INTEGER NOT NULL DEFAULT 0,
        checks_nothing INTEGER NOT NULL DEFAULT 0,
        away_pieces    INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (office, agent_id, day)
      );
      CREATE TABLE IF NOT EXISTS telemetry_failures (
        office TEXT NOT NULL,
        day    TEXT NOT NULL,
        count  INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (office, day)
      );
      CREATE TABLE IF NOT EXISTS telemetry_dismissed (
        office    TEXT NOT NULL,
        advice_id TEXT NOT NULL,
        band      INTEGER NOT NULL,
        at        INTEGER NOT NULL,
        PRIMARY KEY (office, advice_id)
      );
      CREATE TABLE IF NOT EXISTS telemetry_applied (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        office    TEXT NOT NULL,
        advice_id TEXT NOT NULL,
        agent_id  TEXT NOT NULL,
        kind      TEXT NOT NULL,
        before    TEXT NOT NULL,
        after     TEXT NOT NULL,
        at        INTEGER NOT NULL,
        undone_at INTEGER
      );
    `);
  },
  // → user_version 3: Pulse's Team at work and Kept safe (owner, 2026-10-15,
  // proposal 3). Working time and turns per member and day; trust layer
  // decisions and rule refusals per day, one counter per key.
  (db) => {
    db.exec(`
      ALTER TABLE telemetry_daily ADD COLUMN busy_ms INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE telemetry_daily ADD COLUMN turns INTEGER NOT NULL DEFAULT 0;
      CREATE TABLE IF NOT EXISTS telemetry_safety (
        office TEXT NOT NULL,
        day    TEXT NOT NULL,
        key    TEXT NOT NULL,
        n      INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (office, day, key)
      );
    `);
  },
  // → user_version 4: indexes for Pulse's hot reads, so they stay quick as an
  // office ages (ship review, 2026-10-16): a member's open run, the events
  // after the processor's cursor, and the kinds a snapshot reads by day.
  (db) => {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tr_open ON telemetry_runs(office, agent_id, id) WHERE end IS NULL;
      CREATE INDEX IF NOT EXISTS idx_te_office_id ON telemetry_events(office, id);
      CREATE INDEX IF NOT EXISTS idx_te_office_kind_ts ON telemetry_events(office, kind, ts);
    `);
  },
  // → user_version 5: the cost ledger, moved off the agent writable
  // hive/cost-ledger.jsonl (TODOS.md, D17). The file's keys 1:1, plus the
  // office like the telemetry tables. Rows are running totals per agent and
  // session (one per live agent per breaker beat); costLifetime.ts folds them.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS cost_ledger (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        office         TEXT NOT NULL,
        agent_id       TEXT NOT NULL,
        session_id     TEXT,
        ts             INTEGER,
        input          INTEGER NOT NULL DEFAULT 0,
        output         INTEGER NOT NULL DEFAULT 0,
        cache_read     INTEGER NOT NULL DEFAULT 0,
        cache_creation INTEGER NOT NULL DEFAULT 0,
        model          TEXT,
        usd            REAL NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_cl_office_id ON cost_ledger(office, id);
    `);
  },
  // → user_version 6: the owner's own notes for members' memory (memory
  // evidence, D9). Kept here, outside every agent folder, so a note in a
  // member's inbox can never pass for the owner's; the tidy-up files each one
  // and marks it filed (src/main/ownerNotes.ts).
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS owner_notes (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        office   TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        at       TEXT NOT NULL,
        text     TEXT NOT NULL,
        why      TEXT NOT NULL,
        filed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_on_pending ON owner_notes(office, agent_id, id) WHERE filed_at IS NULL;
    `);
  },
  // → user_version 7: the prompts the owner typed to team members are no
  // longer recorded and nothing read them (owner, 2026-11-11), so the ones an
  // older build saved are deleted. secure_delete zeroes the freed pages, so the
  // text does not linger in the file's free space.
  (db) => {
    const was = db.pragma('secure_delete', { simple: true });
    db.pragma('secure_delete = ON');
    try {
      db.exec('DROP INDEX IF EXISTS idx_ch_agent_ts; DROP TABLE IF EXISTS command_history;');
    } finally {
      db.pragma(`secure_delete = ${was ? 'ON' : 'OFF'}`);
    }
  }
];

/** The tables whose rows belong to one office (the `office` column). */
export const OFFICE_TABLES = [
  'telemetry_events', 'telemetry_runs', 'telemetry_daily', 'telemetry_failures', 'telemetry_dismissed',
  'telemetry_applied', 'telemetry_safety', 'cost_ledger', 'owner_notes'
] as const;

/** kv keys that end in the office they belong to (the cost ledger's import
 *  mark, Pulse's backfill mark, processor position and last seen board, the
 *  run comparison's suggestions). pulse-office-id.test.cjs fails when a new
 *  one is not listed. */
export const OFFICE_KV_PREFIXES = ['cost-ledger:import:', 'pulse:backfill:', 'pulse:state:', 'pulse:cards:', 'run-compare:'] as const;

/** The kv key that marks an office's rows as moved from its folder to its id. */
const relabelledKey = (id: string): string => `office:relabelled:${id}`;

export class PersistStore {
  private db: Database.Database | null = null;

  /** @param dbPath  Override the DB location (tests). Defaults to userData/harness.db. */
  constructor(private dbPath?: string) {}

  /** Open (creating if needed) and migrate the DB. Idempotent — a second call is
   *  a no-op. Throws if the native module fails to load or the file is unusable;
   *  callers should guard so a DB failure can't crash app startup. */
  open(): void {
    if (this.db) return;
    const path = this.dbPath ?? join(app.getPath('userData'), 'harness.db');
    const db = new Database(path);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('busy_timeout = 5000');
    db.pragma('foreign_keys = ON');
    this.migrate(db);
    this.db = db;
  }

  private migrate(db: Database.Database): void {
    const version = db.pragma('user_version', { simple: true }) as number;
    for (let i = version; i < MIGRATIONS.length; i++) {
      // Each migration + its version bump run in one transaction so a crash
      // mid-migration never leaves a half-applied schema at the wrong version.
      const run = db.transaction(() => {
        MIGRATIONS[i](db);
        db.pragma(`user_version = ${i + 1}`);
      });
      run();
    }
  }

  /** Close the handle (checkpoints WAL). Safe to call when already closed. */
  close(): void {
    try { this.db?.close(); } catch { /* best-effort on shutdown */ }
    this.db = null;
  }

  get isOpen(): boolean { return this.db !== null; }

  /** The open handle for main-process stores built on this database (Pulse
   *  telemetry), or null when it is closed or failed to open. */
  database(): Database.Database | null { return this.db; }

  /** Every row one office wrote (Pulse, the cost ledger, owner notes), in one
   *  transaction: a factory reset of one business leaves the others' history.
   *  True when they are gone (or the store is closed and there is nothing to
   *  do here). */
  eraseOffice(office: string): boolean {
    const db = this.db;
    if (!db) return false;
    try {
      db.transaction(() => {
        for (const t of OFFICE_TABLES) db.prepare(`DELETE FROM ${t} WHERE office = ?`).run(office);
        for (const p of OFFICE_KV_PREFIXES) db.prepare('DELETE FROM kv WHERE key = ?').run(p + office);
        db.prepare('DELETE FROM kv WHERE key = ?').run(relabelledKey(office));
      })();
      return true;
    } catch (e) {
      console.error('[db] could not erase the office rows:', e);
      return false;
    }
  }

  /**
   * Once settings are per office, Pulse keys an office's rows by its lasting id
   * instead of its folder (docs/designs/separate-businesses.md, E5), so moving
   * the folder keeps its history. This moves the rows and kv marks written
   * under the folder (`from`) to the id (`to`), once per id, in one
   * transaction. A row the id already has for the same key stays as it is.
   * True when the rows are under the id now (moved now or before); false when
   * the store is closed or the move failed (nothing changed; next launch tries
   * again).
   */
  relabelOffice(from: string, to: string): boolean {
    const db = this.db;
    if (!db || !from || !to || from === to) return false;
    try {
      if (db.prepare('SELECT 1 FROM kv WHERE key = ?').get(relabelledKey(to))) return true;
      db.transaction(() => {
        for (const t of OFFICE_TABLES) db.prepare(`UPDATE OR IGNORE ${t} SET office = ? WHERE office = ?`).run(to, from);
        for (const p of OFFICE_KV_PREFIXES) {
          const had = db.prepare('SELECT 1 FROM kv WHERE key = ?').get(p + to);
          if (!had) db.prepare('UPDATE kv SET key = ? WHERE key = ?').run(p + to, p + from);
        }
        db.prepare('INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, ?)').run(relabelledKey(to), JSON.stringify(from), Date.now());
      })();
      return true;
    } catch (e) {
      console.error('[db] could not move the office rows to its id:', e);
      return false;
    }
  }

  /**
   * A restore on a computer whose home folder differs (backup.ts): office rows
   * and marks filed under a folder in the old home move to the same folder in
   * this one. Office ids (once settings are per office) are not paths and stay.
   */
  movePathPrefix(from: string, to: string): void {
    const db = this.db;
    if (!db || !from || !to || from === to) return;
    const n = from.length;
    db.transaction(() => {
      for (const t of OFFICE_TABLES) {
        db.prepare(`UPDATE OR IGNORE ${t} SET office = ? || substr(office, ?) WHERE office = ? OR substr(office, 1, ?) = ?`)
          .run(to, n + 1, from, n + 1, `${from}/`);
      }
      for (const p of OFFICE_KV_PREFIXES) {
        db.prepare('UPDATE OR IGNORE kv SET key = ? || ? || substr(key, ?) WHERE key = ? OR substr(key, 1, ?) = ?')
          .run(p, to, p.length + n + 1, p + from, p.length + n + 1, `${p}${from}/`);
      }
    })();
  }

  // ─── kv (scalar app state) ─────────────────────────────────────────────────

  /** Read a JSON-decoded scalar, or undefined if absent/unparseable. */
  getKv<T = unknown>(key: string): T | undefined {
    if (!this.db) return undefined;
    const row = this.db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
    if (!row) return undefined;
    try { return JSON.parse(row.value) as T; } catch { return undefined; }
  }

  /** Upsert a JSON-encoded scalar. */
  setKv(key: string, value: unknown): void {
    if (!this.db) return;
    this.db.prepare(
      `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(key, JSON.stringify(value), Date.now());
  }
}

