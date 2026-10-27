'use strict';
const config = require('./config');
const store = require('./db');

let stripe = null;
function client() {
  if (!stripe) {
    const Stripe = require('stripe');
    stripe = new Stripe(config.stripeSecretKey);
  }
  return stripe;
}

const PAID_STATUSES = new Set(['paid', 'no_payment_required']); // no_payment_required = 100% promo code

async function createCheckout(reportId) {
  if (config.fakePayments) {
    await store.setStripeSession(reportId, 'fake_' + reportId);
    return `${config.baseUrl}/dev/fake-checkout?id=${encodeURIComponent(reportId)}`;
  }
  const session = await client().checkout.sessions.create({
    mode: 'payment',
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    line_items: [
      {
        price_data: {
          currency: 'gbp',
          unit_amount: config.pricePence,
          product_data: {
            name: 'IR35 Contract Risk Report',
            description: 'AI-assisted clause-by-clause IR35 risk report with negotiation recommendations and PDF download.',
          },
        },
        quantity: 1,
      },
    ],
    ...(config.stripeInvoices ? { invoice_creation: { enabled: true } } : {}),
    client_reference_id: reportId,
    metadata: { reportId },
    payment_intent_data: { metadata: { reportId } },
    success_url: `${config.baseUrl}/report/${reportId}`,
    cancel_url: `${config.baseUrl}/check?cancelled=1`,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 2,
  });
  await store.setStripeSession(reportId, session.id);
  return session.url;
}

/** Mark a report paid if this Stripe session genuinely belongs to it and is paid. Returns true if newly paid. */
async function applyPaidSession(session) {
  const reportId = session?.metadata?.reportId;
  if (!reportId) return false;
  const row = await store.get(reportId);
  if (!row || row.stripe_session_id !== session.id) return false; // payment must belong to this report
  if (!PAID_STATUSES.has(session.payment_status)) return false;
  return store.markPaid(reportId, {
    email: session.customer_details?.email || session.customer_email || null,
    amount: session.amount_total ?? null,
  });
}

/** Ask Stripe directly (used when the customer lands before the webhook arrives). */
async function syncFromStripe(row) {
  if (config.fakePayments || !row.stripe_session_id || row.status !== 'awaiting_payment') return false;
  const session = await client().checkout.sessions.retrieve(row.stripe_session_id);
  return await applyPaidSession(session);
}

function constructWebhookEvent(rawBody, signature) {
  return client().webhooks.constructEvent(rawBody, signature, config.stripeWebhookSecret);
}

module.exports = { createCheckout, applyPaidSession, syncFromStripe, constructWebhookEvent };
