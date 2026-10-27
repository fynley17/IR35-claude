'use strict';
const config = require('./config');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const enabled = () => Boolean(config.resendApiKey && config.emailFrom);

async function send({ to, subject, html, text }) {
  if (!enabled() || !to) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: config.emailFrom,
        to: [to],
        subject,
        html,
        text,
        reply_to: config.business.contactEmail || undefined,
      }),
    });
    if (!res.ok) {
      console.error('[email] send failed', res.status, (await res.text()).slice(0, 300));
      return false;
    }
    return true;
  } catch (err) {
    console.error('[email] send error', err.message);
    return false;
  }
}

function layout(body) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;line-height:1.6">
  <p style="font-size:18px;font-weight:bold;margin:0 0 16px">${esc(config.business.tradingName)}</p>
  ${body}
  <p style="font-size:12px;color:#777;margin-top:32px">This report is an automated, AI-assisted analysis for information only. It is not legal or tax advice.${
    config.business.contactEmail ? ` Questions? Reply to this email or write to ${esc(config.business.contactEmail)}.` : ''
  }</p></div>`;
}

function reportReady(to, id, report) {
  const url = `${config.baseUrl}/report/${id}`;
  return send({
    to,
    subject: `Your IR35 risk report is ready — ${report.overallRisk} risk (${report.riskScore}/10)`,
    html: layout(`<p>Your IR35 risk report is ready.</p>
      <p><strong>Overall: ${esc(report.overallRisk)} risk (${report.riskScore}/10)</strong></p>
      <p>${esc(report.summary)}</p>
      <p><a href="${url}" style="display:inline-block;background:#E8935A;color:#080808;padding:12px 20px;text-decoration:none;font-weight:bold">View your full report</a></p>
      <p style="font-size:13px;color:#555">You can download a PDF from the report page. The link works for ${config.reportRetentionDays} days, after which the report is deleted. Anyone with the link can view it, so share it only with people you trust (for example your accountant).</p>`),
    text: `Your IR35 risk report is ready: ${report.overallRisk} risk (${report.riskScore}/10).\n\n${report.summary}\n\nView it here: ${url}\n\nThe link works for ${config.reportRetentionDays} days.`,
  });
}

function reportFailed(to, id) {
  const url = `${config.baseUrl}/report/${id}`;
  return send({
    to,
    subject: 'We hit a problem generating your IR35 report',
    html: layout(`<p>Sorry — we couldn't generate your IR35 report automatically after several attempts.</p>
      <p>Your reference is <strong>${esc(id.slice(0, 8))}</strong>. ${
        config.business.contactEmail ? `Reply to this email and we'll either fix it or refund you in full.` : `Contact us and we'll either fix it or refund you in full.`
      }</p><p><a href="${url}">Check the report page</a></p>`),
    text: `Sorry — we couldn't generate your IR35 report. Reference ${id.slice(0, 8)}. Reply to this email for a fix or a full refund.`,
  });
}

module.exports = { enabled, reportReady, reportFailed, esc };
