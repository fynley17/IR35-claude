'use strict';
/*
 * Storage. Production (Vercel): Postgres via DATABASE_URL (e.g. Neon from the Vercel Marketplace).
 * Local development: an embedded Postgres (PGlite) stored in ./data — no setup needed.
 */
const crypto = require('crypto');
const config = require('./config');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS reports (
  id                TEXT PRIMARY KEY,
  created_at        BIGINT NOT NULL,
  status            TEXT NOT NULL,          -- awaiting_payment | paid | processing | complete | failed
  answers_json      TEXT NOT NULL,
  notes             TEXT,
  consent_at        BIGINT NOT NULL,
  stripe_session_id TEXT,
  email             TEXT,
  paid_at           BIGINT,
  amount_pence      INTEGER,
  attempts          INTEGER NOT NULL DEFAULT 0,
  processing_at     BIGINT,
  last_error        TEXT,
  report_json       TEXT,
  completed_at      BIGINT,
  emailed_at        BIGINT
);
CREATE INDEX IF NOT EXISTS reports_status ON reports(status);
CREATE TABLE IF NOT EXISTS report_files (
  report_id  TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  role       TEXT NOT NULL,
  filename   TEXT NOT NULL,
  mime       TEXT NOT NULL,
  data       BYTEA NOT NULL
);
CREATE INDEX IF NOT EXISTS report_files_report ON report_files(report_id);
`;

let ready = null;
let backend = null;

async function connect() {
  const url = config.databaseUrl;
  if (url) {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 5000, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
    try { require('@vercel/functions').attachDatabasePool(pool); } catch { /* not on Vercel */ }
    backend = { query: (text, params) => pool.query(text, params), kind: 'postgres' };
  } else {
    if (config.isProd) throw new Error('DATABASE_URL is not set. Add a Postgres database (e.g. Neon) to the Vercel project.');
    const { PGlite } = require('@electric-sql/pglite');
    const fs = require('fs');
    fs.mkdirSync(config.dataDir, { recursive: true });
    const pg = new PGlite(require('path').join(config.dataDir, 'pglite'));
    backend = { query: (text, params) => pg.query(text, params), kind: 'pglite' };
  }
  for (const stmt of SCHEMA.split(';').map((s) => s.trim()).filter(Boolean)) await backend.query(stmt);
  return backend;
}

async function q(text, params = []) {
  if (!ready) ready = connect().catch((e) => { ready = null; throw e; });
  const b = await ready;
  const res = await b.query(text, params);
  return res;
}

const newId = () => crypto.randomBytes(24).toString('base64url');
const num = (v) => (v == null ? v : Number(v)); // BIGINT comes back as string from pg
function row(r) {
  if (!r) return undefined;
  for (const k of ['created_at', 'consent_at', 'paid_at', 'processing_at', 'completed_at', 'emailed_at']) r[k] = num(r[k]);
  return r;
}

module.exports = {
  init: () => q('SELECT 1'),
  async createReport({ answers, notes, files }) {
    const id = newId();
    const now = Date.now();
    await q(`INSERT INTO reports (id, created_at, status, answers_json, notes, consent_at) VALUES ($1, $2, 'awaiting_payment', $3, $4, $2)`, [id, now, JSON.stringify(answers), notes || null]);
    for (const f of files) await q(`INSERT INTO report_files (report_id, role, filename, mime, data) VALUES ($1, $2, $3, $4, $5)`, [id, f.role, f.filename, f.mime, f.data]);
    return id;
  },
  async get(id) {
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) return undefined;
    return row((await q(`SELECT * FROM reports WHERE id = $1`, [id])).rows[0]);
  },
  async files(id) {
    const rows = (await q(`SELECT role, filename, mime, data FROM report_files WHERE report_id = $1 ORDER BY role`, [id])).rows;
    return rows.map((r) => ({ ...r, data: Buffer.from(r.data) }));
  },
  setStripeSession: (id, sid) => q(`UPDATE reports SET stripe_session_id = $1 WHERE id = $2`, [sid, id]),
  async markPaid(id, { email, amount }) {
    const r = await q(`UPDATE reports SET status = 'paid', paid_at = $1, email = COALESCE($2, email), amount_pence = $3 WHERE id = $4 AND status = 'awaiting_payment'`, [Date.now(), email || null, amount ?? null, id]);
    return r.rowCount > 0 || r.affectedRows > 0;
  },
  /** Atomically take a paid report for processing. Returns the row or undefined. */
  async claim(id) {
    const r = await q(`UPDATE reports SET status = 'processing', processing_at = $1, attempts = attempts + 1 WHERE id = $2 AND status = 'paid' RETURNING *`, [Date.now(), id]);
    return row(r.rows[0]);
  },
  async complete(id, report) {
    await q(`UPDATE reports SET status = 'complete', report_json = $1, completed_at = $2, last_error = NULL WHERE id = $3`, [JSON.stringify(report), Date.now(), id]);
    await q(`DELETE FROM report_files WHERE report_id = $1`, [id]); // contract deleted as soon as the report exists
  },
  fail: (id, status, message) => q(`UPDATE reports SET status = $1, last_error = $2 WHERE id = $3`, [status, String(message).slice(0, 500), id]),
  markEmailed: (id) => q(`UPDATE reports SET emailed_at = $1 WHERE id = $2`, [Date.now(), id]),
  async resetFailed(id) {
    const r = await q(`UPDATE reports SET status = 'paid' WHERE id = $1 AND status = 'failed'`, [id]);
    return r.rowCount > 0 || r.affectedRows > 0;
  },
  /** Reports stuck in processing (e.g. a function timed out) go back to paid so they are retried. */
  async recoverStale(olderThanMs) {
    const r = await q(`UPDATE reports SET status = 'paid' WHERE status = 'processing' AND processing_at < $1 AND attempts < 4`, [Date.now() - olderThanMs]);
    await q(`UPDATE reports SET status = 'failed', last_error = COALESCE(last_error, 'Timed out') WHERE status = 'processing' AND processing_at < $1 AND attempts >= 4`, [Date.now() - olderThanMs]);
    return r.rowCount || r.affectedRows || 0;
  },
  async pendingIds(limit = 10) {
    return (await q(`SELECT id FROM reports WHERE status = 'paid' ORDER BY paid_at LIMIT $1`, [limit])).rows.map((r) => r.id);
  },
  async purge() {
    const unpaid = await q(`DELETE FROM reports WHERE status = 'awaiting_payment' AND created_at < $1`, [Date.now() - config.unpaidRetentionHours * 3600e3]);
    const old = await q(`DELETE FROM reports WHERE status IN ('complete', 'failed') AND created_at < $1`, [Date.now() - config.reportRetentionDays * 86400e3]);
    return { unpaid: unpaid.rowCount || unpaid.affectedRows || 0, old: old.rowCount || old.affectedRows || 0 };
  },
  backendKind: () => backend?.kind,
};
