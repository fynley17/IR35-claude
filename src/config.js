'use strict';
require('dotenv').config({ quiet: true });

const env = process.env;
const isProd = env.NODE_ENV === 'production';

function str(name, fallback = '') {
  const v = env[name];
  return v === undefined || v === null ? fallback : String(v).trim();
}

function int(name, fallback) {
  const n = parseInt(env[name], 10);
  return Number.isFinite(n) ? n : fallback;
}

const pricePence = int('REPORT_PRICE_PENCE', 900);

const config = {
  isProd,
  port: int('PORT', 3000),
  baseUrl: str('BASE_URL', 'http://localhost:3000').replace(/\/+$/, ''),
  dataDir: str('DATA_DIR', require('path').join(__dirname, '..', 'data')), // local development only
  // Neon on Vercel may add a custom prefix (e.g. Database_DATABASE_URL), so accept those too.
  databaseUrl:
    str('DATABASE_URL') ||
    str('POSTGRES_URL') ||
    str('Database_DATABASE_URL') ||
    str('Database_POSTGRES_URL') ||
    String(Object.entries(env).find(([k, v]) => /(^|_)DATABASE_URL$/.test(k) && !/UNPOOLED/.test(k) && v)?.[1] || '').trim(),
  cronSecret: str('CRON_SECRET'),
  onVercel: Boolean(env.VERCEL),

  // Payments
  stripeSecretKey: str('STRIPE_SECRET_KEY'),
  stripeWebhookSecret: str('STRIPE_WEBHOOK_SECRET'),
  stripeInvoices: str('STRIPE_INVOICES') === 'true',
  pricePence,
  priceLabel: '£' + (pricePence % 100 === 0 ? String(pricePence / 100) : (pricePence / 100).toFixed(2)),

  // AI
  anthropicApiKey: str('ANTHROPIC_API_KEY'),
  anthropicModel: str('ANTHROPIC_MODEL', 'claude-sonnet-4-6'),

  // Email (optional — Resend)
  resendApiKey: str('RESEND_API_KEY'),
  emailFrom: str('EMAIL_FROM'),

  // Retention
  reportRetentionDays: int('REPORT_RETENTION_DAYS', 30),
  unpaidRetentionHours: int('UNPAID_RETENTION_HOURS', 24),

  // Analytics (optional — Plausible)
  plausibleDomain: str('PLAUSIBLE_DOMAIN'),

  // Business / legal details shown on the site
  business: {
    tradingName: str('BUSINESS_TRADING_NAME', 'IR35 Checker'),
    legalName: str('BUSINESS_LEGAL_NAME'),
    companyNumber: str('BUSINESS_COMPANY_NUMBER'),
    address: str('BUSINESS_ADDRESS'),
    contactEmail: str('CONTACT_EMAIL'),
    icoNumber: str('ICO_REGISTRATION_NUMBER'),
    vatNumber: str('VAT_NUMBER'),
    founderName: str('FOUNDER_NAME'),
    reviewerName: str('CONTENT_REVIEWER_NAME'),
    reviewerCredentials: str('CONTENT_REVIEWER_CREDENTIALS'),
  },

  // Local development only — never honoured in production
  fakePayments: !isProd && str('FAKE_PAYMENTS') === '1',
  fakeAi: !isProd && str('FAKE_AI') === '1',
};

config.missingForLaunch = () => {
  const missing = [];
  if (!config.stripeSecretKey && !config.fakePayments) missing.push('STRIPE_SECRET_KEY');
  if (!config.stripeWebhookSecret && !config.fakePayments) missing.push('STRIPE_WEBHOOK_SECRET');
  if (!config.anthropicApiKey && !config.fakeAi) missing.push('ANTHROPIC_API_KEY');
  if (isProd && !config.databaseUrl) missing.push('DATABASE_URL');
  if (isProd && !config.cronSecret) missing.push('CRON_SECRET');
  if (!config.business.contactEmail) missing.push('CONTACT_EMAIL');
  if (!config.business.legalName) missing.push('BUSINESS_LEGAL_NAME');
  if (!config.business.address) missing.push('BUSINESS_ADDRESS');
  if (isProd && config.baseUrl.startsWith('http://')) missing.push('BASE_URL (must be https in production)');
  return missing;
};

module.exports = config;
