'use strict';
/*
 * Report generation. On Vercel there is no long-running process, so work is started with
 * waitUntil() from the request that discovers a paid report (Stripe webhook, or the customer's
 * report page polling). The atomic claim in the database makes sure only one invocation runs it.
 * A report left in "processing" by a timed-out function is put back to "paid" and picked up again.
 */
const store = require('./db');
const { generateReport } = require('./analysis');
const email = require('./email');

const MAX_ATTEMPTS = 3;
const STALE_MS = 6 * 60 * 1000;
const local = new Set(); // reports running in this instance

let waitUntil = null;
try { waitUntil = require('@vercel/functions').waitUntil; } catch { /* local */ }

async function run(id) {
  const row = await store.claim(id);
  if (!row) return 'skipped'; // someone else has it, or it isn't paid
  local.add(id);
  const started = Date.now();
  try {
    const files = await store.files(id);
    if (!files.length) throw Object.assign(new Error('Uploaded contract is no longer available'), { permanent: true });
    const input = { files, answers: JSON.parse(row.answers_json), notes: row.notes };
    let report;
    try {
      report = await generateReport(input);
    } catch (first) {
      // One immediate in-invocation retry if there is clearly time left (functions run up to 300s).
      if (first.permanent || Date.now() - started > 90 * 1000) throw first;
      console.warn(`[job] ${id.slice(0, 8)} retrying after: ${first.message}`);
      report = await generateReport(input);
    }
    await store.complete(id, report);
    console.log(`[job] ${id.slice(0, 8)} complete in ${Math.round((Date.now() - started) / 1000)}s (${report.overallRisk} ${report.riskScore}/10)`);
    if (row.email && (await email.reportReady(row.email, id, report))) await store.markEmailed(id);
    return 'complete';
  } catch (err) {
    console.error(`[job] ${id.slice(0, 8)} attempt ${row.attempts} failed: ${err.status || ''} ${err.message}`);
    if (!err.permanent && row.attempts < MAX_ATTEMPTS) {
      await store.fail(id, 'paid', err.message); // the next poll (or cron) retries it
      return 'retry';
    }
    await store.fail(id, 'failed', err.message);
    if (row.email) await email.reportFailed(row.email, id);
    return 'failed';
  } finally {
    local.delete(id);
  }
}

/** Start generating a report without blocking the current response. */
function start(id) {
  if (local.has(id)) return;
  const p = run(id).catch((e) => console.error('[job] unexpected', e));
  if (waitUntil) {
    try { waitUntil(p); } catch { /* outside a request */ }
  }
}

/** Housekeeping, called by the daily Vercel Cron and on local start-up. */
async function sweep() {
  const recovered = await store.recoverStale(STALE_MS);
  const pending = await store.pendingIds(5);
  const results = [];
  for (const id of pending) results.push(await run(id));
  const purged = await store.purge();
  return { recovered, pending: pending.length, results, purged };
}

module.exports = { start, run, sweep, STALE_MS, isRunningHere: (id) => local.has(id) };
