/* Shared report renderer — used in the browser (live reports) and on the server (sample report page). */
(function (root) {
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var LABEL = { RED_FLAG: '✗ Red flag', WARNING: '⚠ Warning', POSITIVE: '✓ Positive' };

  function gauge(score, level) {
    var out = '<div class="gauge" aria-hidden="true">';
    for (var i = 1; i <= 10; i++) out += '<i class="' + (i <= score ? 'on-' + level : '') + '"></i>';
    return out + '</div>';
  }

  function render(r, opts) {
    opts = opts || {};
    var h = '';
    h += '<div class="risk-hero">';
    h += '<div><div class="risk-level risk-' + esc(r.overallRisk) + '">' + esc(r.overallRisk) + ' risk</div>';
    h += '<div class="risk-score">Risk score ' + esc(r.riskScore) + '/10 · confidence ' + esc(String(r.confidence || '').toLowerCase()) + '</div>';
    h += gauge(r.riskScore, r.overallRisk) + '</div>';
    h += '<p class="risk-summary">' + esc(r.summary) + '</p></div>';

    h += '<div class="info-grid">';
    h += '<div class="info-box"><h2>Who decides your status</h2><p>' + esc(r.responsibility) + '</p></div>';
    h += '<div class="info-box"><h2>What we reviewed</h2><p>' + esc(r.documentCoverage) + '</p></div>';
    h += '</div>';

    if (opts.actions) h += opts.actions;

    h += '<section class="report-section"><h2>Factor-by-factor analysis</h2><ol class="factors">';
    (r.keyFactors || []).forEach(function (f) {
      h += '<li class="factor"><div class="factor-head"><h3 class="factor-name">' + esc(f.factor) + '</h3>';
      h += '<span class="badge status-' + esc(f.status) + '">' + (LABEL[f.status] || esc(f.status)) + '</span></div>';
      if (f.clauseReferences && f.clauseReferences.length) h += '<p class="refs">' + f.clauseReferences.map(esc).join(' · ') + '</p>';
      h += '<p class="factor-detail">' + esc(f.detail) + '</p>';
      if (f.contractPosition || f.realityPosition) {
        h += '<div class="positions">';
        if (f.contractPosition) h += '<div class="position"><p class="position-label">Contract says</p><p>' + esc(f.contractPosition) + '</p></div>';
        if (f.realityPosition) h += '<div class="position"><p class="position-label">In practice</p><p>' + esc(f.realityPosition) + '</p></div>';
        h += '</div>';
      }
      if (f.contradiction) h += '<span class="contradiction">⚡ The contract and your working practices point different ways</span>';
      h += '</li>';
    });
    h += '</ol></section>';

    if (r.redFlags && r.redFlags.length) {
      h += '<section class="report-section"><h2>Red flags to address</h2><ul class="flag-list">';
      r.redFlags.forEach(function (t) { h += '<li class="flag flag-bad"><span class="flag-icon t-red">✗</span><span>' + esc(t) + '</span></li>'; });
      h += '</ul></section>';
    }
    if (r.positives && r.positives.length) {
      h += '<section class="report-section"><h2>Positive indicators</h2><ul class="flag-list">';
      r.positives.forEach(function (t) { h += '<li class="flag flag-good"><span class="flag-icon t-green">✓</span><span>' + esc(t) + '</span></li>'; });
      h += '</ul></section>';
    }
    if (r.recommendations && r.recommendations.length) {
      h += '<section class="report-section"><h2>Recommendations before signing</h2><ol class="recs">';
      r.recommendations.forEach(function (x, i) {
        h += '<li class="rec"><div class="rec-title"><span class="rec-num">' + String(i + 1).padStart(2, '0') + ' —</span><span>' + esc(x.title) + '</span></div>';
        if (x.detail) h += '<p class="rec-detail">' + esc(x.detail) + '</p>';
        if (x.suggestedWording) {
          h += '<div class="wording"><p class="wording-label"><span>Suggested wording</span>' + (opts.copy ? '<button type="button" class="copy-btn" data-copy="' + esc(x.suggestedWording) + '">Copy</button>' : '') + '</p><p>' + esc(x.suggestedWording) + '</p></div>';
        }
        h += '</li>';
      });
      h += '</ol></section>';
    }
    if (r.sdsNotes) h += '<section class="report-section"><h2>Status Determination Statement</h2><div class="next-steps"><p>' + esc(r.sdsNotes) + '</p></div></section>';
    h += '<section class="report-section"><h2>Next steps</h2><div class="next-steps"><p>' + esc(r.nextSteps) + '</p></div></section>';
    h += '<div class="report-disclaimer"><p><strong>Important:</strong> this report is an automated, AI-assisted analysis of the documents and answers provided. It is information, not legal or tax advice, and it cannot decide IR35 status — only HMRC or a tribunal can. HMRC can disregard contract terms that don\'t reflect reality. Before relying on it, ask a qualified IR35 specialist or accountant to review your position.</p></div>';
    return h;
  }

  var api = { render: render, esc: esc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.IR35Report = api;
})(this);
