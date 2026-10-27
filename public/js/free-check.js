(function () {
  var QUESTIONS = window.IR35_QUESTIONS;
  var form = document.getElementById('free-form');
  var container = document.getElementById('questions');
  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (text) e.textContent = text;
    return e;
  }
  QUESTIONS.forEach(function (q, i) {
    var fs = el('fieldset', { class: 'question' });
    var legend = el('legend');
    legend.appendChild(el('span', { class: 'q-num' }, String(i + 1).padStart(2, '0') + ' —'));
    var t = el('span');
    t.appendChild(el('span', { class: 'q-pillar' }, q.pillar));
    t.appendChild(document.createTextNode(q.text));
    legend.appendChild(t);
    fs.appendChild(legend);
    if (q.hint) fs.appendChild(el('p', { class: 'q-hint' }, q.hint));
    var opts = el('div', { class: 'options' });
    q.options.forEach(function (o) {
      var label = el('label', { class: 'option' });
      label.appendChild(el('input', { type: 'radio', name: q.id, value: o.id }));
      label.appendChild(el('span', null, o.label));
      opts.appendChild(label);
    });
    fs.appendChild(opts);
    container.appendChild(fs);
  });

  var WHO = {
    small: 'Your client is small, so your own limited company is responsible for deciding your IR35 status (Chapter 8 ITEPA 2003) and for any tax if it gets it wrong. A documented contract review is good evidence of reasonable care.',
    mediumLarge: 'Your client is medium or large, so the client must decide your status and give you a Status Determination Statement (SDS) with its reasons. If you disagree, you can challenge it and the client must respond within 45 days.',
    'public': 'Your client is in the public sector, so the client must decide your status and give you a Status Determination Statement (SDS) with its reasons. If you disagree, you can challenge it and the client must respond within 45 days.',
    unsure: 'Find out whether your client is "small": for 2026/27 that means meeting two of turnover up to £15m, balance sheet up to £7.5m, and 50 or fewer employees. If it is small, you decide your status; if not, the client does and must give you an SDS.'
  };

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var answers = {};
    var missing = 0;
    QUESTIONS.forEach(function (q) {
      var c = form.querySelector('input[name="' + q.id + '"]:checked');
      if (c) answers[q.id] = c.value; else missing++;
    });
    var note = document.getElementById('free-missing');
    if (missing) { note.textContent = 'Please answer ' + missing + ' more question' + (missing > 1 ? 's' : '') + '.'; return; }
    note.textContent = '';

    var pillars = {};
    var total = 0, max = 0;
    QUESTIONS.forEach(function (q) {
      var opt = q.options.filter(function (o) { return o.id === answers[q.id]; })[0];
      if (!opt || opt.risk === null) return;
      var p = pillars[q.pillar] || (pillars[q.pillar] = { score: 0, max: 0 });
      p.score += opt.risk; p.max += 3; total += opt.risk; max += 3;
    });
    var score = Math.max(1, Math.min(10, Math.round((total / max) * 9 + 1)));
    var level = score <= 3 ? 'LOW' : score <= 6 ? 'MEDIUM' : 'HIGH';
    var colour = { LOW: 'var(--green)', MEDIUM: 'var(--amber)', HIGH: 'var(--red)' };

    document.getElementById('free-headline').innerHTML = '<span class="risk-' + level + '">' + level.charAt(0) + level.slice(1).toLowerCase() + ' risk</span> — ' + score + '/10';
    document.getElementById('free-summary').textContent =
      level === 'LOW' ? 'Your working practices mostly point away from employment. Make sure your contract says the same thing — contradictions are where HMRC looks first.'
      : level === 'MEDIUM' ? 'Your working practices are mixed. Some factors point towards employment, so the wording of your contract (and whether it matches reality) is likely to decide which way this falls.'
      : 'Several of your working practices point towards employment. Even a well-drafted contract may not help if reality looks like this — it is worth getting your contract and practices reviewed before you sign.';

    var bars = document.getElementById('free-bars');
    bars.innerHTML = '';
    Object.keys(pillars).forEach(function (name) {
      var p = pillars[name];
      var pct = Math.round((p.score / p.max) * 100);
      var lvl = pct <= 33 ? 'LOW' : pct <= 66 ? 'MEDIUM' : 'HIGH';
      var li = el('li');
      li.appendChild(el('span', null, name));
      var bar = el('span', { class: 'bar' });
      var fill = el('span');
      fill.style.width = Math.max(4, pct) + '%';
      fill.style.background = colour[lvl];
      bar.appendChild(fill);
      li.appendChild(bar);
      li.appendChild(el('span', { class: 'badge ' + (lvl === 'LOW' ? 'badge-green' : lvl === 'MEDIUM' ? 'badge-amber' : 'badge-red') }, lvl === 'LOW' ? 'Positive' : lvl === 'MEDIUM' ? 'Warning' : 'Red flag'));
      bars.appendChild(li);
    });
    document.getElementById('free-who').textContent = WHO[answers.clientSize];

    try { sessionStorage.setItem('ir35-answers-v2', JSON.stringify({ answers: answers, notes: '' })); } catch (err) { /* ignore */ }
    var result = document.getElementById('free-result');
    result.classList.remove('hidden');
    result.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (window.plausible) window.plausible('Free check completed', { props: { level: level } });
  });
})();
