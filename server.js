'use strict';
const path = require('path');
const express = require('express');
const multer = require('multer');
const helmet = require('helmet');
const compression = require('compression');
const { rateLimit } = require('express-rate-limit');

const config = require('./src/config');
const store = require('./src/db');
const jobs = require('./src/jobs');
const payments = require('./src/payments');
const { preflight, validateAnswers } = require('./src/analysis');
const { renderReportPdf } = require('./src/pdf-report');
const { build } = require('./src/render');

const site = build();
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Vercel's edge is the single proxy in front of the app

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ─── Canonical host (production only; Vercel itself handles HTTPS) ──────────
const canonicalHost = new URL(config.baseUrl).host;
const isLiveProduction = config.isProd && (!config.onVercel || process.env.VERCEL_ENV === 'production');
app.use((req, res, next) => {
  if (isLiveProduction && req.path !== '/health' && !req.path.startsWith('/api/')) {
    const host = req.headers.host;
    if ((host && host !== canonicalHost) || (!config.onVercel && req.protocol !== 'https')) {
      return res.redirect(301, config.baseUrl + req.originalUrl);
    }
  }
  next();
});

// ─── Security headers ────────────────────────────────────────────────────────
const analyticsSrc = config.plausibleDomain ? ['https://plausible.io'] : [];
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", ...analyticsSrc],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'", ...analyticsSrc],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        upgradeInsecureRequests: config.isProd ? [] : null,
      },
    },
    strictTransportSecurity: config.isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);
app.use(compression());

app.get('/health', (req, res) => res.status(200).send('OK'));

// ─── Stripe webhook (raw body, before any JSON parser) ──────────────────────
app.post(
  '/api/webhook',
  express.raw({ type: 'application/json', limit: '1mb' }),
  asyncRoute(async (req, res) => {
    let event;
    try {
      event = payments.constructWebhookEvent(req.body, req.headers['stripe-signature']);
    } catch (err) {
      console.warn('[webhook] signature check failed:', err.message);
      return res.status(400).send('Invalid signature');
    }
    if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
      const session = event.data.object;
      if (await payments.applyPaidSession(session)) jobs.start(session.metadata.reportId);
    }
    res.json({ received: true });
  })
);

// ─── Daily housekeeping (Vercel Cron sends "Authorization: Bearer $CRON_SECRET") ─
app.get(
  '/api/cron/sweep',
  asyncRoute(async (req, res) => {
    if (!config.cronSecret || req.headers.authorization !== `Bearer ${config.cronSecret}`) return res.status(401).json({ error: 'Unauthorised' });
    const result = await jobs.sweep();
    console.log('[cron] sweep', JSON.stringify(result));
    res.json(result);
  })
);

// ─── Old URLs → new URLs ─────────────────────────────────────────────────────
app.get(['/index.html', '/index'], (req, res) => res.redirect(301, '/'));
app.get(['/analyze.html', '/analyze'], (req, res) => res.redirect(301, '/check'));
app.get('/report.html', (req, res) => res.redirect(301, '/'));

// ─── Static assets (served by Vercel's CDN from /public in production) ─────
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d', index: false, redirect: false }));

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(
    ['User-agent: *', 'Disallow: /report/', 'Disallow: /api/', 'Disallow: /dev/', 'Allow: /', '', `Sitemap: ${config.baseUrl}/sitemap.xml`, ''].join('\n')
  );
});

app.get('/sitemap.xml', (req, res) => {
  const urls = site.sitemap
    .map((u) => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<priority>${u.priority}</priority></url>`)
    .join('\n');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
});

// ─── Pages ───────────────────────────────────────────────────────────────────
function sendPage(res, pagePath, status = 200) {
  const page = site.pages.get(pagePath);
  if (!page) return sendPage(res, '/404', 404);
  if (page.meta.noindex) res.set('X-Robots-Tag', 'noindex, nofollow');
  res
    .status(status)
    .type('html')
    .set('Cache-Control', page.meta.noindex || status !== 200 ? 'no-store' : 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400')
    .send(page.html);
}

// No trailing slashes (one canonical URL per page)
app.use((req, res, next) => {
  if (req.method === 'GET' && req.path.length > 1 && req.path.endsWith('/') && !req.path.startsWith('/api/')) {
    const q = req.originalUrl.slice(req.path.length);
    return res.redirect(301, req.path.replace(/\/+$/, '') + q);
  }
  next();
});

const SPECIAL = new Set(['/404', '/report', '/dev/fake-checkout']);
for (const [p] of site.pages) {
  if (SPECIAL.has(p)) continue;
  app.get(p, (req, res) => sendPage(res, p));
}

app.get(
  '/report/:id',
  asyncRoute(async (req, res) => {
    if (!(await store.get(req.params.id))) return sendPage(res, '/404', 404);
    sendPage(res, '/report');
  })
);

// ─── API: create a report + checkout ─────────────────────────────────────────
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
// Vercel Functions accept request bodies up to 4.5 MB, so uploads are capped just below that.
const MAX_TOTAL_BYTES = Math.floor(4.2 * 1024 * 1024);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_TOTAL_BYTES, files: 2, fields: 10, fieldSize: 20 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    const ok = file.mimetype === 'application/pdf' || name.endsWith('.pdf') || file.mimetype === DOCX || name.endsWith('.docx');
    cb(ok ? null : Object.assign(new Error('Please upload a PDF or Word (.docx) file.'), { status: 400 }), ok);
  },
});

function sniff(file) {
  const b = file.buffer;
  if (b.length > 4 && b.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && (file.originalname || '').toLowerCase().endsWith('.docx')) return DOCX;
  return null;
}

const limiterOpts = { standardHeaders: 'draft-8', legacyHeaders: false };
const checkoutLimiter = rateLimit({ ...limiterOpts, windowMs: 15 * 60 * 1000, limit: 12, message: { error: 'Too many attempts. Please wait a few minutes and try again.' } });

app.post(
  '/api/checkout',
  checkoutLimiter,
  upload.fields([{ name: 'contract', maxCount: 1 }, { name: 'supporting', maxCount: 1 }]),
  asyncRoute(async (req, res) => {
    const contract = req.files?.contract?.[0];
    if (!contract) return res.status(400).json({ error: 'Please upload your contract.' });
    if (req.body.consent !== 'yes') return res.status(400).json({ error: 'Please tick the box to confirm you want your report straight away.' });

    let parsed;
    try { parsed = JSON.parse(req.body.answers || '{}'); } catch { parsed = null; }
    const v = validateAnswers(parsed);
    if (!v.ok) return res.status(400).json({ error: v.error });
    const notes = String(req.body.notes || '').trim().slice(0, 1500);

    const files = [];
    for (const [role, f] of [['contract', contract], ['supporting', req.files?.supporting?.[0]]]) {
      if (!f) continue;
      const mime = sniff(f);
      if (!mime) return res.status(400).json({ error: `"${f.originalname}" doesn't look like a valid PDF or Word (.docx) file.` });
      files.push({ role, filename: path.basename(f.originalname || role).slice(0, 120), mime, data: f.buffer });
    }
    if (files.reduce((n, f) => n + f.data.length, 0) > MAX_TOTAL_BYTES) {
      return res.status(400).json({ error: 'Your files are too large together (4 MB maximum). Try uploading just the contract, or re-save the PDF with "Print → Save as PDF" to shrink it.' });
    }

    const check = await preflight(files);
    if (!check.ok) return res.status(400).json({ error: check.error });

    const id = await store.createReport({ answers: v.answers, notes, files });
    const url = await payments.createCheckout(id);
    res.json({ url });
  })
);

// ─── API: report status / result ─────────────────────────────────────────────
const statusLimiter = rateLimit({ ...limiterOpts, windowMs: 15 * 60 * 1000, limit: 600 });

function publicView(row) {
  const base = { status: row.status, ref: row.id.slice(0, 8), createdAt: row.created_at, retentionDays: config.reportRetentionDays };
  if (row.status === 'complete') return { ...base, completedAt: row.completed_at, emailed: Boolean(row.emailed_at), report: JSON.parse(row.report_json) };
  if (row.status === 'failed') return { ...base, canRetry: true };
  return { ...base, emailOnFile: Boolean(row.email) };
}

app.get(
  '/api/reports/:id',
  statusLimiter,
  asyncRoute(async (req, res) => {
    let row = await store.get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Report not found. It may have expired.' });
    res.set('Cache-Control', 'no-store');
    try {
      if (row.status === 'awaiting_payment' && (await payments.syncFromStripe(row))) {
        jobs.start(row.id);
        row = await store.get(row.id);
      } else if (row.status === 'paid') {
        jobs.start(row.id);
      } else if (row.status === 'processing' && Date.now() - row.processing_at > jobs.STALE_MS) {
        if (await store.recoverStale(jobs.STALE_MS)) jobs.start(row.id);
      }
    } catch (err) {
      console.error('[status] sync failed', err.message);
    }
    res.json(publicView(row));
  })
);

app.post(
  '/api/reports/:id/retry',
  rateLimit({ ...limiterOpts, windowMs: 60 * 60 * 1000, limit: 6 }),
  asyncRoute(async (req, res) => {
    const row = await store.get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Report not found.' });
    if (row.status === 'failed' && (await store.resetFailed(row.id))) jobs.start(row.id);
    res.json(publicView(await store.get(row.id)));
  })
);

app.get(
  '/api/reports/:id/pdf',
  statusLimiter,
  asyncRoute(async (req, res) => {
    const row = await store.get(req.params.id);
    if (!row || row.status !== 'complete') return res.status(404).json({ error: 'Report not found.' });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="ir35-risk-report-${row.id.slice(0, 8)}.pdf"`,
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    });
    renderReportPdf(JSON.parse(row.report_json), { id: row.id, generatedAt: row.completed_at }, res);
  })
);

// ─── Local development: fake checkout (never enabled in production) ─────────
if (config.fakePayments) {
  console.warn('⚠  FAKE_PAYMENTS=1 — payments are simulated. Never use this in production.');
  app.get('/dev/fake-checkout', (req, res) => sendPage(res, '/dev/fake-checkout'));
  app.post(
    '/dev/fake-pay',
    express.urlencoded({ extended: false }),
    asyncRoute(async (req, res) => {
      const id = String(req.body.id || '');
      if (await store.markPaid(id, { email: req.body.email || null, amount: config.pricePence })) jobs.start(id);
      res.redirect(303, `/report/${encodeURIComponent(id)}`);
    })
  );
}

// ─── Errors ──────────────────────────────────────────────────────────────────
app.use((req, res) => (req.path.startsWith('/api/') ? res.status(404).json({ error: 'Not found' }) : sendPage(res, '/404', 404)));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'That file is too large (4 MB maximum). Try re-saving it with "Print → Save as PDF" to shrink it.' : 'There was a problem with the upload. Please try again.';
    return res.status(400).json({ error: msg });
  }
  if (err.status === 400) return res.status(400).json({ error: err.message });
  console.error('[error]', req.method, req.path, err);
  if (req.path.startsWith('/api/')) return res.status(500).json({ error: 'Something went wrong on our side. Please try again in a moment.' });
  res.status(500).type('text').send('Something went wrong.');
});

// ─── Start ───────────────────────────────────────────────────────────────────
if (!process.env.IR35_NO_LISTEN) {
  app.listen(config.port, () => {
    console.log(`IR35 Checker listening on ${config.port} → ${config.baseUrl}`);
    console.log(`  Model: ${config.anthropicModel} · Price: ${config.priceLabel} · Email: ${require('./src/email').enabled() ? 'on' : 'off'}`);
    const missing = config.missingForLaunch();
    if (missing.length) console.warn(`  ⚠  Missing settings: ${missing.join(', ')}`);
    if (!config.onVercel) jobs.sweep().catch((e) => console.error('[sweep]', e.message));
  });
}

module.exports = app;
