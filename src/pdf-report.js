'use strict';
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const config = require('./config');

const FONT_DIR = path.join(__dirname, '..', 'public', 'fonts');
const FONTS = {
  regular: path.join(FONT_DIR, 'geist-sans-latin-400-normal.woff2'),
  medium: path.join(FONT_DIR, 'geist-sans-latin-600-normal.woff2'),
};

const COLOURS = { RED_FLAG: '#B03A2E', WARNING: '#B9650F', POSITIVE: '#1E8449', HIGH: '#B03A2E', MEDIUM: '#B9650F', LOW: '#1E8449' };
const LABELS = { RED_FLAG: 'RED FLAG', WARNING: 'WARNING', POSITIVE: 'POSITIVE' };
const INK = '#1A1A1A';
const MUTED = '#5F5F5A';
const RULE = '#DDDAD4';

function registerFonts(doc) {
  try {
    if (Object.values(FONTS).every((f) => fs.existsSync(f))) {
      doc.registerFont('body', FONTS.regular);
      doc.registerFont('bold', FONTS.medium);
      doc.registerFont('serif', FONTS.medium); // headings (TrueType woff2 serif doesn't render reliably in all PDF viewers)
      return;
    }
  } catch (e) {
    console.warn('[pdf] custom fonts unavailable, using Helvetica:', e.message);
  }
  doc.registerFont('body', 'Helvetica');
  doc.registerFont('bold', 'Helvetica-Bold');
  doc.registerFont('serif', 'Helvetica-Bold');
}

function renderReportPdf(report, { id, generatedAt }, stream) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 56, bottom: 64, left: 56, right: 56 }, bufferPages: true, info: { Title: 'IR35 Contract Risk Report', Author: config.business.tradingName } });
  registerFonts(doc);
  doc.pipe(stream);
  const width = doc.page.width - 112;

  const heading = (text) => {
    if (doc.y > doc.page.height - 140) doc.addPage();
    doc.moveDown(0.9);
    doc.font('bold').fontSize(9).fillColor('#C0703F').text(text.toUpperCase(), { characterSpacing: 1.2 });
    const y = doc.y + 3;
    doc.moveTo(56, y).lineTo(56 + width, y).lineWidth(0.6).strokeColor(RULE).stroke();
    doc.moveDown(0.6);
  };
  const para = (text, opts = {}) => {
    if (!text) return;
    doc.font(opts.bold ? 'bold' : 'body').fontSize(opts.size || 10).fillColor(opts.colour || INK).text(text, { lineGap: 2.5, ...opts });
  };

  // Title block
  doc.font('serif').fontSize(22).fillColor(INK).text('IR35 Contract Risk Report');
  doc.moveDown(0.2);
  const date = new Date(generatedAt || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  para(`${config.business.tradingName}  ·  Generated ${date}  ·  Ref ${String(id).slice(0, 8)}`, { size: 8.5, colour: MUTED });

  // Risk box
  doc.moveDown(1);
  const boxTop = doc.y;
  const riskColour = COLOURS[report.overallRisk] || INK;
  doc.font('serif').fontSize(24).fillColor(riskColour).text(`${report.overallRisk} RISK`, 72, boxTop + 16);
  doc.font('body').fontSize(9.5).fillColor(MUTED).text(`Risk score ${report.riskScore}/10  ·  Confidence: ${report.confidence.toLowerCase()}`, 72, doc.y + 2);
  doc.moveDown(0.6);
  doc.font('body').fontSize(10.5).fillColor(INK).text(report.summary, 72, doc.y, { width: width - 32, lineGap: 2.5 });
  const boxBottom = doc.y + 16;
  doc.rect(56, boxTop, width, boxBottom - boxTop).lineWidth(1).strokeColor(riskColour).stroke();
  doc.x = 56;
  doc.y = boxBottom + 6;

  heading('Who decides your status');
  para(report.responsibility);
  if (report.documentCoverage) {
    doc.moveDown(0.5);
    para('What we reviewed: ' + report.documentCoverage, { size: 9, colour: MUTED });
  }

  heading('Factor-by-factor analysis');
  for (const f of report.keyFactors) {
    if (doc.y > doc.page.height - 170) doc.addPage();
    const c = COLOURS[f.status] || INK;
    doc.font('bold').fontSize(10.5).fillColor(INK).text(f.factor, { continued: true });
    doc.font('bold').fontSize(8).fillColor(c).text(`   ${LABELS[f.status] || f.status}`);
    if (f.clauseReferences?.length) para(f.clauseReferences.join('  ·  '), { size: 8.5, colour: MUTED });
    doc.moveDown(0.25);
    para(f.detail, { size: 9.5 });
    if (f.contractPosition) { doc.moveDown(0.25); para('Contract says: ' + f.contractPosition, { size: 9, colour: MUTED }); }
    if (f.realityPosition) { doc.moveDown(0.15); para('In practice: ' + f.realityPosition, { size: 9, colour: MUTED }); }
    if (f.contradiction) { doc.moveDown(0.15); para('Contradiction: the contract and your working practices point in different directions.', { size: 9, colour: COLOURS.RED_FLAG }); }
    doc.moveDown(0.8);
  }

  const bullets = (title, items, colour) => {
    if (!items?.length) return;
    heading(title);
    items.forEach((t) => {
      if (doc.y > doc.page.height - 100) doc.addPage();
      const y = doc.y;
      doc.circle(60, y + 5.5, 2).fill(colour);
      doc.font('body').fontSize(9.5).fillColor(INK).text(t, 70, y, { width: width - 14, lineGap: 2 });
      doc.x = 56;
      doc.moveDown(0.35);
    });
  };
  bullets('Red flags to address', report.redFlags, COLOURS.RED_FLAG);
  bullets('Positive indicators', report.positives, COLOURS.POSITIVE);

  if (report.recommendations?.length) {
    heading('Recommendations before signing');
    report.recommendations.forEach((r, i) => {
      if (doc.y > doc.page.height - 150) doc.addPage();
      para(`${i + 1}. ${r.title}`, { bold: true, size: 10 });
      if (r.detail) para(r.detail, { size: 9.5, indent: 12 });
      if (r.suggestedWording) {
        doc.moveDown(0.3);
        const top = doc.y;
        doc.font('body').fontSize(9).fillColor(INK).text(`Suggested wording: “${r.suggestedWording}”`, 70, top + 6, { width: width - 28, lineGap: 2 });
        const bottom = doc.y + 6;
        doc.save().rect(56, top, 3, bottom - top).fill('#C0703F').restore();
        doc.x = 56;
        doc.y = bottom;
      }
      doc.moveDown(0.6);
    });
  }

  if (report.sdsNotes) { heading('Status Determination Statement'); para(report.sdsNotes); }
  heading('Next steps');
  para(report.nextSteps);

  doc.moveDown(1.5);
  para(
    'Important: this report is an automated, AI-assisted analysis of the documents and answers you provided. It is for information only and is not legal or tax advice. IR35 status depends on the whole picture, including working practices, and only HMRC or a tribunal can decide it. Before relying on it, ask a qualified IR35 specialist or accountant to review your position.',
    { size: 8, colour: MUTED }
  );

  // Footer on every page
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('body').fontSize(7.5).fillColor(MUTED)
      .text(`${config.business.tradingName} · Not legal or tax advice · Page ${i + 1} of ${range.count}`, 56, doc.page.height - 36, { width, align: 'center' });
    doc.page.margins.bottom = bottom;
  }
  doc.end();
}

module.exports = { renderReportPdf };
