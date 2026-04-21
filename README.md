# IR35 Checker — MVP

AI-powered IR35 contract risk scanner. Accepts a PDF contract + 10 working practice questions, verifies payment via Stripe, then returns a full clause-by-clause risk report via the Anthropic API.

---

## Tech Stack

- **Backend:** Node.js + Express
- **AI:** Anthropic API (claude-sonnet)
- **Payments:** Stripe Checkout
- **PDF parsing:** pdf-parse
- **PDF generation:** PDFKit
- **Hosting:** Railway (recommended) or Render

---

## Project Structure

```
ir35-checker/
├── server.js           ← Main Express server + all API routes
├── package.json
├── .env.example        ← Copy to .env and fill in your keys
└── public/
    ├── index.html      ← Marketing / landing page
    ├── analyze.html    ← PDF upload + 10 questions form
    └── report.html     ← Report display page
```

---

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in:

```env
ANTHROPIC_API_KEY=sk-ant-...
STRIPE_SECRET_KEY=sk_live_...        # Use sk_test_... for testing
STRIPE_WEBHOOK_SECRET=whsec_...
BASE_URL=http://localhost:3000       # Change to your live URL when deployed
REPORT_PRICE_PENCE=900               # 900 = £9.00
PORT=3000
```

### 3. Run locally

```bash
npm run dev       # uses nodemon for auto-restart
# or
npm start
```

Visit http://localhost:3000

---

## Stripe Setup

### Get your API keys
1. Go to https://dashboard.stripe.com/apikeys
2. Copy your **Secret key** → `STRIPE_SECRET_KEY`
3. For testing, use the `sk_test_...` key first

### Set up webhook (for production)
1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://your-domain.com/api/webhook`
3. Select event: `checkout.session.completed`
4. Copy the **Signing secret** → `STRIPE_WEBHOOK_SECRET`

### Testing Stripe locally
Use the Stripe CLI to forward webhooks:
```bash
stripe listen --forward-to localhost:3000/api/webhook
```
Use test card: `4242 4242 4242 4242` · any future date · any CVC

---

## Deploy to Railway (Recommended)

Railway is the fastest way to deploy — free tier works fine to start.

### Steps:

1. Push your code to a GitHub repo
2. Go to https://railway.app → New Project → Deploy from GitHub repo
3. Select your repository
4. Go to your service → Variables tab and add all variables from `.env`
5. Set `BASE_URL` to your Railway-generated URL (e.g. `https://ir35-checker.up.railway.app`)
6. Railway auto-detects Node.js and runs `npm start`

That's it — Railway handles HTTPS automatically.

### Alternative: Render

1. Go to https://render.com → New Web Service
2. Connect your GitHub repo
3. Build command: `npm install`
4. Start command: `node server.js`
5. Add environment variables in the dashboard
6. Deploy

---

## Deploy to Railway with Custom Domain (Optional)

1. In Railway → your service → Settings → Domains
2. Add your custom domain
3. Point your DNS CNAME to the Railway URL
4. Update `BASE_URL` in your environment variables

---

## Anthropic API Setup

1. Go to https://console.anthropic.com
2. Create an API key → `ANTHROPIC_API_KEY`
3. You'll be charged per token. A typical report analysis costs ~£0.02–£0.05

---

## Pricing Configuration

Change the report price by updating `REPORT_PRICE_PENCE` in your `.env`:

```env
REPORT_PRICE_PENCE=900   # £9.00
REPORT_PRICE_PENCE=1500  # £15.00
```

---

## Important Notes

### In-memory session storage
By default, sessions are stored in-memory (JavaScript Maps). This means:
- Sessions are lost if the server restarts
- Fine for MVP — users have 2 hours to complete after upload
- For production scale: replace with Redis or a database

### PDF text extraction
The app uses `pdf-parse` to extract text. This works well for standard PDFs but will fail on scanned documents (images). The app shows a clear error message in this case.

### Data retention
No contract data is stored permanently. Sessions auto-expire after 2 hours. Completed reports are cached in-memory for the session lifetime.

---

## Legal

You must include (and not remove) the disclaimer shown in the app:

> "This report is an AI-powered textual analysis and does not constitute legal or tax advice. IR35 status is determined by actual working practices as well as contractual terms. Always consult a qualified IR35 specialist or accountant before accepting an engagement."

---

## Quick Checklist Before Going Live

- [ ] Copy `.env.example` to `.env` and fill all values
- [ ] Switch Stripe from test keys (`sk_test_`) to live keys (`sk_live_`)
- [ ] Set `BASE_URL` to your live domain
- [ ] Set up Stripe webhook pointing to your live domain
- [ ] Test with a real PDF and Stripe test card before launching
- [ ] Update `BASE_URL` from `localhost` to your deployed URL
