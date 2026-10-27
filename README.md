# IR35 Checker

AI-assisted IR35 contract risk reports for UK contractors — [ir35-checker.com](https://ir35-checker.com).

A contractor uploads their contract (PDF, scanned PDF or Word), answers 12 questions about how they really work, pays £9 via Stripe, and gets a clause-by-clause report with suggested wording, on screen and as a PDF.

## How it works

```
Browser ──upload + answers──▶ /api/checkout ──▶ checks the file can be read (free token count)
                                           └──▶ saves report row + file in Postgres ──▶ Stripe Checkout
Stripe ──webhook──▶ /api/webhook ──▶ marks paid ──▶ generates report in the background (waitUntil)
Report page polls /api/reports/:id ──▶ also confirms payment with Stripe and restarts stuck jobs
Claude (whole document + answers, forced tool output) ──▶ report saved, contract deleted ──▶ email link (optional)
Vercel Cron (daily) ──▶ /api/cron/sweep ──▶ retries anything stuck, deletes unpaid uploads and old reports
```

| Path | What it is |
|---|---|
| `server.js` | Express app (Vercel's Express preset runs it as a function) |
| `src/analysis.js` | IR35 system prompt, report schema, Claude call, pre-payment file check |
| `src/db.js` | Postgres (Neon) in production, embedded PGlite locally |
| `src/jobs.js` | Background report generation and housekeeping |
| `src/payments.js` | Stripe Checkout + webhook handling |
| `src/pdf-report.js` | Downloadable PDF |
| `src/render.js` | Renders `views/*.html` (meta, SEO, structured data, sitemap) |
| `views/` | Pages and guides. Each starts with a `<!--meta {...} -->` block |
| `public/` | CSS, JS, fonts, images — served by Vercel's CDN |

## Going live on Vercel

1. **Database.** Vercel → project → **Storage** → **Create** → **Neon (Postgres)**, region **London (eu-west-2)**, connect it to this project. That adds `DATABASE_URL`. Tables are created automatically.
2. **Environment variables** (Settings → Environment Variables, Production): everything under "Required" and "Business details" in `.env.example`. Generate `CRON_SECRET` with `openssl rand -hex 32`.
3. **Stripe webhook.** Stripe → Developers → Webhooks → endpoint `https://ir35-checker.com/api/webhook`, events `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Put the signing secret in `STRIPE_WEBHOOK_SECRET`. In Stripe settings, turn on **email receipts** for successful payments.
4. **Email (recommended).** Create a [Resend](https://resend.com) account, verify `ir35-checker.com`, set `RESEND_API_KEY` and `EMAIL_FROM`.
5. **Push to `main`.** Vercel builds and deploys. Then test end to end with a Stripe test key on a Preview deployment, or a 100% promo code in live mode.
6. **Search Console.** Submit `https://ir35-checker.com/sitemap.xml`.

`vercel.json` sets the function region to London (`lhr1`), a 300-second limit for report generation, the daily cron and cache headers.

## Local development

```bash
npm install
cp .env.example .env      # fill in, or use the fake modes below
FAKE_PAYMENTS=1 FAKE_AI=1 npm run dev
npm test                  # end-to-end smoke test with fake payments and AI
```

Without `DATABASE_URL`, an embedded Postgres (PGlite) is created in `./data`. `FAKE_PAYMENTS` and `FAKE_AI` are ignored when `NODE_ENV=production`.

## Changing things

- **Price:** `REPORT_PRICE_PENCE`. Also re-run `node scripts/build-assets.js` (the social image shows the price).
- **Pages and guides:** edit or add files in `views/`. A guide needs `"type": "article"` in its meta block to appear in the guide lists, sitemap and Article schema.
- **Questions:** `public/js/questions.js` (shared by the browser, free check and server validation).
- **The analysis:** `SYSTEM_PROMPT` and `REPORT_TOOL` in `src/analysis.js`.

## Limits worth knowing

- Uploads are capped at 4 MB in total because Vercel Functions accept request bodies up to 4.5 MB.
- Rate limiting is per function instance. For stronger protection add a Vercel Firewall rate-limit rule on `/api/checkout`.
- Reports are generated within the 300-second function limit; a report stuck for more than 6 minutes is retried automatically.
