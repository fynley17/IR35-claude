(function () {
  var QUESTIONS = window.IR35_QUESTIONS;
  var MAX_BYTES = 4 * 1024 * 1024;
  var STORE_KEY = 'ir35-answers-v2';
  var form = document.getElementById('check-form');
  var submitBtn = document.getElementById('submit-btn');
  var errorBanner = document.getElementById('error-banner');
  var infoBanner = document.getElementById('info-banner');
  var missingNote = document.getElementById('missing-note');
  var progressNote = document.getElementById('progress-note');
  var consent = document.getElementById('consent');
  var notes = document.getElementById('notes');
  var files = { contract: null, supporting: null };

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (text) e.textContent = text;
    return e;
  }

  // ── Render questions ──────────────────────────────────────────────
  var container = document.getElementById('questions');
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
      var input = el('input', { type: 'radio', name: q.id, value: o.id, required: '' });
      label.appendChild(input);
      label.appendChild(el('span', null, o.label));
      opts.appendChild(label);
    });
    fs.appendChild(opts);
    container.appendChild(fs);
  });

  // Restore answers (e.g. after a cancelled payment or from the free check)
  try {
    var saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || localStorage.getItem(STORE_KEY) || '{}');
    Object.keys(saved.answers || {}).forEach(function (k) {
      var r = form.querySelector('input[name="' + k + '"][value="' + saved.answers[k] + '"]');
      if (r) r.checked = true;
    });
    if (saved.notes) notes.value = saved.notes;
  } catch (e) { /* storage unavailable */ }

  function answers() {
    var out = {};
    QUESTIONS.forEach(function (q) {
      var c = form.querySelector('input[name="' + q.id + '"]:checked');
      if (c) out[q.id] = c.value;
    });
    return out;
  }

  function persist() {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify({ answers: answers(), notes: notes.value })); } catch (e) { /* ignore */ }
  }

  // ── Files ─────────────────────────────────────────────────────────
  function setupZone(role) {
    var input = document.getElementById('file-' + role);
    var zone = document.getElementById('zone-' + role);
    var name = document.getElementById('name-' + role);
    function setFile(f) {
      hide(errorBanner);
      if (!f) return;
      if (!/\.(pdf|docx)$/i.test(f.name)) return showError('Please choose a PDF or Word (.docx) file.');
      if (f.size > MAX_BYTES) return showError('"' + f.name + '" is larger than 4 MB. Try re-saving it with "Print → Save as PDF" to shrink it.');
      files[role] = f;
      zone.classList.add('has-file');
      name.textContent = '✓ ' + f.name + ' (' + Math.max(1, Math.round(f.size / 1024)) + ' KB)';
      name.classList.remove('hidden');
      update();
    }
    input.addEventListener('change', function () { setFile(input.files[0]); });
    zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', function () { zone.classList.remove('drag-over'); });
    zone.addEventListener('drop', function (e) { e.preventDefault(); zone.classList.remove('drag-over'); setFile(e.dataTransfer.files[0]); });
  }
  setupZone('contract');
  setupZone('supporting');

  // ── State ─────────────────────────────────────────────────────────
  function missing() {
    var a = answers();
    var unanswered = QUESTIONS.filter(function (q) { return !a[q.id]; }).length;
    var m = [];
    if (!files.contract) m.push('upload your contract');
    if (unanswered) m.push('answer ' + unanswered + ' more question' + (unanswered > 1 ? 's' : ''));
    if (!consent.checked) m.push('tick the confirmation box');
    return m;
  }

  function update() {
    var m = missing();
    submitBtn.disabled = m.length > 0;
    missingNote.textContent = m.length ? 'To continue: ' + m.join(', ') + '.' : 'Ready when you are.';
  }

  form.addEventListener('change', function () { persist(); update(); });
  notes.addEventListener('input', function () {
    document.getElementById('notes-count').textContent = notes.value.length;
    persist();
  });

  function show(e) { e.classList.remove('hidden'); }
  function hide(e) { e.classList.add('hidden'); }
  function showError(msg) {
    errorBanner.textContent = msg;
    show(errorBanner);
    errorBanner.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  if (new URLSearchParams(location.search).get('cancelled')) {
    infoBanner.textContent = 'Payment cancelled — nothing was charged. Your answers are still here; please re-attach your contract and continue when ready.';
    show(infoBanner);
  }
  update();

  // ── Submit ────────────────────────────────────────────────────────
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    hide(errorBanner);
    var m = missing();
    if (m.length) return showError('Please ' + m.join(', ') + '.');

    var fd = new FormData();
    fd.append('contract', files.contract);
    if (files.supporting) fd.append('supporting', files.supporting);
    fd.append('answers', JSON.stringify(answers()));
    fd.append('notes', notes.value);
    fd.append('consent', 'yes');

    submitBtn.disabled = true;
    submitBtn.textContent = 'Checking your file…';
    progressNote.textContent = 'Making sure we can read your contract before you pay.';
    show(progressNote);

    fetch('/api/checkout', { method: 'POST', body: fd })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok || !data.url) throw new Error(data.error || (res.status === 413 ? 'Your file is too large (4 MB maximum).' : 'Something went wrong. Please try again.'));
          return data;
        });
      })
      .then(function (data) {
        submitBtn.textContent = 'Opening secure payment…';
        if (window.plausible) window.plausible('Checkout started');
        location.href = data.url;
      })
      .catch(function (err) {
        showError(err.message);
        submitBtn.textContent = 'Continue to payment →';
        hide(progressNote);
        update();
      });
  });
})();
