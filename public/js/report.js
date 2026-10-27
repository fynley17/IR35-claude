(function () {
  var id = location.pathname.split('/').filter(Boolean).pop();
  var $ = function (x) { return document.getElementById(x); };
  var started = Date.now();
  var timer = null;
  var failures = 0;

  function show(name) {
    ['loading', 'error', 'report'].forEach(function (s) { $('state-' + s).classList.toggle('hidden', s !== name); });
  }

  function steps(status) {
    var order = ['ls-pay', 'ls-read', 'ls-compare', 'ls-write'];
    var active = 0;
    if (status === 'paid' || status === 'processing') {
      var secs = (Date.now() - started) / 1000;
      active = secs < 25 ? 1 : secs < 60 ? 2 : 3;
    }
    order.forEach(function (s, i) {
      var el = $(s);
      el.classList.toggle('done', i < active);
      el.classList.toggle('active', i === active);
    });
  }

  function poll(delay) {
    clearTimeout(timer);
    timer = setTimeout(check, delay);
  }

  function check() {
    fetch('/api/reports/' + encodeURIComponent(id), { cache: 'no-store' })
      .then(function (res) {
        return res.json().then(function (d) { if (!res.ok) throw Object.assign(new Error(d.error || 'Error'), { status: res.status }); return d; });
      })
      .then(function (d) {
        failures = 0;
        $('error-ref').textContent = d.ref || '—';
        var link = $('support-link');
        if (link) link.href = link.href.split('?')[0] + '?subject=' + encodeURIComponent('IR35 report ' + (d.ref || ''));
        if (d.status === 'complete') return showReport(d);
        if (d.status === 'failed') {
          show('error');
          $('error-title').textContent = 'We couldn\'t finish your report';
          $('error-msg').textContent = 'Something went wrong while analysing your contract. You can try again now — you won\'t be charged twice.';
          $('retry-btn').classList.remove('hidden');
          return;
        }
        show('loading');
        if (d.status === 'awaiting_payment') {
          $('loading-title').textContent = 'Confirming your payment…';
          if (Date.now() - started > 120000) {
            $('loading-sub').textContent = 'We haven\'t received confirmation from Stripe yet. If you completed payment, keep this page open — it can take a few minutes. If you cancelled, nothing has been charged.';
          }
        } else {
          $('loading-title').textContent = 'Analysing your contract…';
          if (d.emailOnFile) $('email-note').classList.remove('hidden');
          if (Date.now() - started > 240000) $('loading-sub').textContent = 'This one is taking longer than usual. Keep this page open, or come back to this link later.';
        }
        steps(d.status);
        poll(Date.now() - started > 180000 ? 8000 : 3000);
      })
      .catch(function (err) {
        if (err.status === 404) {
          show('error');
          $('error-title').textContent = 'Report not found';
          $('error-msg').textContent = 'This link is invalid or the report has expired. Reports are kept for 30 days.';
          return;
        }
        failures++;
        poll(Math.min(30000, 3000 * failures)); // network blip — keep trying
      });
  }

  function showReport(d) {
    var r = d.report;
    document.title = r.overallRisk + ' IR35 risk (' + r.riskScore + '/10) — Your report | IR35 Checker';
    var date = new Date(d.completedAt || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    var expires = new Date((d.createdAt || Date.now()) + d.retentionDays * 86400000).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    $('report-meta').textContent = 'Generated ' + date + ' · Ref ' + d.ref + ' · Available until ' + expires;
    var actions =
      '<div class="actions">' +
      '<a class="btn btn-primary" href="/api/reports/' + encodeURIComponent(id) + '/pdf">Download PDF →</a>' +
      '<button type="button" class="btn btn-ghost" id="print-btn">Print</button>' +
      '<button type="button" class="btn btn-ghost" id="copy-link">Copy link</button>' +
      '<a class="btn btn-ghost" href="/check">Check another contract</a>' +
      '</div>';
    $('report-body').innerHTML = window.IR35Report.render(r, { actions: actions, copy: true });
    show('report');
    $('print-btn').addEventListener('click', function () { window.print(); });
    $('copy-link').addEventListener('click', function (e) { copy(location.href, e.target, 'Link copied'); });
    document.querySelectorAll('.copy-btn').forEach(function (b) {
      b.addEventListener('click', function () { copy(b.getAttribute('data-copy'), b, 'Copied'); });
    });
    try { sessionStorage.removeItem('ir35-answers-v2'); } catch (e) { /* ignore */ }
  }

  function copy(text, btn, done) {
    var original = btn.textContent;
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
      .then(function () { btn.textContent = done; })
      .catch(function () { btn.textContent = 'Copy failed'; })
      .then(function () { setTimeout(function () { btn.textContent = original; }, 1800); });
  }

  $('retry-btn').addEventListener('click', function () {
    $('retry-btn').classList.add('hidden');
    started = Date.now();
    show('loading');
    fetch('/api/reports/' + encodeURIComponent(id) + '/retry', { method: 'POST' }).then(function () { poll(1000); }, function () { poll(3000); });
  });

  steps('awaiting_payment');
  check();
})();
