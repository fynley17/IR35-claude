require('dotenv').config();
console.log("--- ENV DEBUG ---");
console.log("Stripe Key starts with:", process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.substring(0, 12) : "UNDEFINED");
console.log("-----------------");
const express = require('express');
const multer = require('multer');
const Stripe = require('stripe');
const Anthropic = require('@anthropic-ai/sdk');
const pdfParse = require('pdf-parse');
const PDFDocument = require('pdfkit');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// ─── Init ─────────────────────────────────────────────────────────────────────
const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// In-memory stores (swap for Redis/DB when scaling)
const pendingSessions = new Map();   // sessionId → { contractText, answers, createdAt }
const paidSessions = new Set();      // stripeSessionIds confirmed as paid
const completedReports = new Map();  // sessionId → report JSON

// ─── Middleware ───────────────────────────────────────────────────────────────
// Stripe webhook needs raw body — must be before express.json()
app.post('/api/webhook', express.raw({ type: 'application/json' }), handleWebhook);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are accepted'));
  }
});

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /api/prepare
 * Accepts PDF + answers, stores them, creates a Stripe Checkout session.
 * Returns { url } to redirect the user to Stripe.
 */
app.post('/api/prepare', upload.single('contract'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Please upload a PDF contract.' });

    let answers;
    try {
      answers = JSON.parse(req.body.answers);
    } catch {
      return res.status(400).json({ error: 'Invalid answers payload.' });
    }

    // Extract text from PDF
    const pdfData = await pdfParse(req.file.buffer);
    const contractText = pdfData.text?.trim();
    if (!contractText || contractText.length < 100) {
      return res.status(400).json({ error: 'Could not extract text from your PDF. Please ensure it is not a scanned image.' });
    }

    const sessionId = uuidv4();
    pendingSessions.set(sessionId, {
      contractText,
      answers,
      createdAt: Date.now()
    });

    const price = parseInt(process.env.REPORT_PRICE_PENCE || '900', 10);

    const stripeSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'gbp',
          product_data: {
            name: 'IR35 Contract Risk Report',
            description: 'Instant AI-powered analysis with clause-by-clause risk breakdown and negotiation recommendations.'
          },
          unit_amount: price
        },
        quantity: 1
      }],
      mode: 'payment',
      success_url: `${process.env.BASE_URL}/report.html?s=${sessionId}&cs={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.BASE_URL}/analyze.html?cancelled=1`,
      metadata: { sessionId }
    });

    res.json({ url: stripeSession.url });
  } catch (err) {
    console.error('[/api/prepare]', err);
    res.status(500).json({ error: 'Failed to create payment session. Please try again.' });
  }
});

/**
 * POST /api/analyze
 * Called from report.html after Stripe redirects back.
 * Verifies payment, runs Anthropic analysis, returns report JSON.
 */
app.post('/api/analyze', async (req, res) => {
  try {
    const { sessionId, checkoutSessionId } = req.body;
    if (!sessionId || !checkoutSessionId) {
      return res.status(400).json({ error: 'Missing session identifiers.' });
    }

    // Return cached report if already generated
    if (completedReports.has(sessionId)) {
      return res.json(completedReports.get(sessionId));
    }

    // Verify Stripe payment
    const stripeSession = await stripe.checkout.sessions.retrieve(checkoutSessionId);
    if (stripeSession.payment_status !== 'paid') {
      return res.status(402).json({ error: 'Payment has not been confirmed. Please contact support if you believe this is an error.' });
    }

    const pending = pendingSessions.get(sessionId);
    if (!pending) {
      return res.status(404).json({ error: 'Session expired or not found. Please start a new analysis.' });
    }

    // Run Anthropic analysis
    const prompt = buildPrompt(pending.contractText, pending.answers);

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }]
    });

    const raw = message.content[0].text;
    const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const report = JSON.parse(clean);

    // Cache and clean up
    completedReports.set(sessionId, report);
    pendingSessions.delete(sessionId);

    res.json(report);
  } catch (err) {
    console.error('[/api/analyze]', err);
    res.status(500).json({ error: 'Analysis failed. Please contact support with your session ID.' });
  }
});

/**
 * POST /api/download-report
 * Generates a PDF version of a completed report.
 */
app.post('/api/download-report', (req, res) => {
  try {
    const { sessionId } = req.body;
    const report = completedReports.get(sessionId);
    if (!report) return res.status(404).json({ error: 'Report not found.' });

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="ir35-risk-report.pdf"');
    doc.pipe(res);

    // ── Header ──
    doc.fontSize(22).font('Helvetica-Bold').text('IR35 Contract Risk Report', { align: 'left' });
    doc.moveDown(0.3);
    doc.fontSize(9).font('Helvetica').fillColor('#888888')
      .text(`Generated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`);

    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#e0e0e0');
    doc.moveDown(0.8);

    // ── Disclaimer ──
    doc.fontSize(8).fillColor('#999999').font('Helvetica')
      .text('DISCLAIMER: This report is an AI-powered textual analysis and does not constitute legal or tax advice. IR35 status is determined by actual working practices as well as contractual terms. Always consult a qualified IR35 specialist or accountant before accepting an engagement.', {
        align: 'left'
      });
    doc.moveDown(1);

    // ── Risk Score ──
    const riskColour = report.overallRisk === 'HIGH' ? '#c0392b' : report.overallRisk === 'MEDIUM' ? '#e67e22' : '#27ae60';
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#111111').text('Overall Risk Level');
    doc.moveDown(0.3);
    doc.fontSize(28).font('Helvetica-Bold').fillColor(riskColour).text(`${report.overallRisk}  (${report.riskScore}/10)`);
    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica').fillColor('#333333').text(report.summary);
    doc.moveDown(1.2);

    // ── Key Factors ──
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#111111').text('Clause-by-Clause Analysis');
    doc.moveDown(0.5);

    (report.keyFactors || []).forEach(f => {
      const colour = f.status === 'RED_FLAG' ? '#c0392b' : f.status === 'WARNING' ? '#e67e22' : '#27ae60';
      const label = f.status === 'RED_FLAG' ? '✗ RED FLAG' : f.status === 'WARNING' ? '⚠ WARNING' : '✓ POSITIVE';
      doc.fontSize(10).font('Helvetica-Bold').fillColor(colour).text(`${label} — ${f.factor}`);
      doc.fontSize(9).font('Helvetica').fillColor('#444444').text(f.detail, { indent: 10 });
      if (f.contradiction) {
        doc.fontSize(9).fillColor('#c0392b').text('⚡ Contract vs. reality contradiction detected', { indent: 10 });
      }
      doc.moveDown(0.6);
    });

    // ── Red Flags ──
    if (report.redFlags?.length) {
      doc.moveDown(0.4);
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#111111').text('Red Flags to Address');
      doc.moveDown(0.4);
      report.redFlags.forEach(f => {
        doc.fontSize(9).font('Helvetica').fillColor('#333333').text(`• ${f}`, { indent: 10 });
        doc.moveDown(0.3);
      });
    }

    // ── Recommendations ──
    if (report.recommendations?.length) {
      doc.moveDown(0.4);
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#111111').text('Recommendations Before Signing');
      doc.moveDown(0.4);
      report.recommendations.forEach((r, i) => {
        doc.fontSize(9).font('Helvetica').fillColor('#333333').text(`${i + 1}. ${r}`, { indent: 10 });
        doc.moveDown(0.3);
      });
    }

    // ── Next Steps ──
    doc.moveDown(0.6);
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#111111').text('Next Steps');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor('#333333').text(report.nextSteps);

    // ── Footer ──
    doc.moveDown(2);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#e0e0e0');
    doc.moveDown(0.5);
    doc.fontSize(8).fillColor('#aaaaaa').text('IR35 Checker · This report is for informational purposes only and does not constitute legal or tax advice.');

    doc.end();
  } catch (err) {
    console.error('[/api/download-report]', err);
    res.status(500).json({ error: 'Failed to generate PDF.' });
  }
});

/**
 * POST /api/webhook  (Stripe webhook — defined above before json middleware)
 */
function handleWebhook(req, res) {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    if (session.payment_status === 'paid') {
      paidSessions.add(session.id);
    }
  }

  res.json({ received: true });
}

// ─── Prompt Builder ───────────────────────────────────────────────────────────
function buildPrompt(contractText, answers) {
  const truncated = contractText.length > 8000 ? contractText.substring(0, 8000) + '\n[CONTRACT TRUNCATED FOR LENGTH]' : contractText;

  return `You are an IR35 contract risk analysis engine. Analyse the contract text and working practice answers below.

CRITICAL RULES:
- Return ONLY valid JSON. No preamble, no markdown fences, no explanation.
- Never say "Outside IR35" or "Inside IR35" — only describe risk levels and indicators.
- Be specific: reference actual contract sections/wording where possible.
- Flag contradictions between what the contract says and what the answers reveal.

CONTRACT TEXT:
${truncated}

WORKING PRACTICE REALITY CHECK:
Q1 - Right of Substitution (can you send a qualified substitute?): ${answers.substitution || 'Not answered'}
Q2 - Has substitution been used or tested in practice?: ${answers.substitutionUsed || 'Not answered'}
Q3 - Who controls how you work day-to-day (methods, priorities, schedule)?: ${answers.control || 'Not answered'}
Q4 - Do you use your own equipment and tools?: ${answers.equipment || 'Not answered'}
Q5 - Do you work for multiple clients at the same time?: ${answers.multipleClients || 'Not answered'}
Q6 - Can the client extend or terminate with little notice and no penalty?: ${answers.termination || 'Not answered'}
Q7 - Are you integrated into the client's organisation (team meetings, org chart, internal comms)?: ${answers.integration || 'Not answered'}
Q8 - Do you bear genuine financial risk (e.g. fixed-price work, your own insurance, correcting errors at own cost)?: ${answers.financialRisk || 'Not answered'}
Q9 - Do you control your own hours and work location?: ${answers.autonomy || 'Not answered'}
Q10 - Does the contract guarantee a minimum amount of work or require you to accept all work offered?: ${answers.mutuality || 'Not answered'}

Return exactly this JSON structure:
{
  "overallRisk": "LOW",
  "riskScore": 3,
  "summary": "Plain English 2-3 sentence summary of the overall IR35 risk position.",
  "keyFactors": [
    {
      "factor": "Right of Substitution",
      "status": "POSITIVE",
      "contractPosition": "What the contract says on this factor",
      "realityPosition": "What the working practice answers reveal",
      "contradiction": false,
      "detail": "Explanation of the risk or positive indicator for this factor"
    }
  ],
  "redFlags": [
    "Specific clause or practice that is high risk"
  ],
  "positives": [
    "Specific positive indicator supporting outside-IR35 position"
  ],
  "recommendations": [
    "Actionable thing to negotiate or clarify before signing"
  ],
  "nextSteps": "1-2 sentence recommendation on what the contractor should do next."
}

Analyse all seven IR35 pillars: Right of Substitution, Mutuality of Obligation, Control, Part and Parcel, Financial Risk, Equipment, Exclusivity/Multiple Engagements. Use status values: POSITIVE, WARNING, RED_FLAG. Risk score 1 (very low risk) to 10 (very high risk).`;
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000; // 2 hours
  for (const [key, val] of pendingSessions) {
    if (val.createdAt < cutoff) pendingSessions.delete(key);
  }
}, 30 * 60 * 1000);

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT,'0.0.0.0', () => {
  console.log(`\n✓ IR35 Checker running → http://localhost:${PORT}`);
  console.log(`  Stripe key:    ${process.env.STRIPE_SECRET_KEY ? '✓ set' : '✗ MISSING'}`);
  console.log(`  Anthropic key: ${process.env.ANTHROPIC_API_KEY ? '✓ set' : '✗ MISSING'}`);
  console.log(`  Base URL:      ${process.env.BASE_URL || '✗ MISSING'}\n`);
});


