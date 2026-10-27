// Run with: npm test  — uses fake payments + fake AI and a throwaway local database.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ir35-test-'));
Object.assign(process.env, { IR35_NO_LISTEN: '1', FAKE_PAYMENTS: '1', FAKE_AI: '1', DATA_DIR: dataDir, BASE_URL: 'http://localhost:0', NODE_ENV: 'test', DATABASE_URL: '', POSTGRES_URL: '' });

let server, base;
before(async () => {
  const app = require('../server');
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

const ANSWERS = { clientSize: 'small', sds: 'na', substitution: 'genuine', substitutionUsed: 'new', control: 'me', autonomy: 'yes', mutuality: 'none', financialRisk: 'significant', integration: 'no', equipment: 'own', multipleClients: 'yes', termination: 'commercial' };

function pdf() {
  const PDFDocument = require('pdfkit');
  return new Promise((resolve) => {
    const doc = new PDFDocument(); const chunks = [];
    doc.on('data', (c) => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.text('CONSULTANCY AGREEMENT. 1. Services. 6. Substitution. '.repeat(20)); doc.end();
  });
}

test('public pages render with one title and no template leftovers', async () => {
  for (const p of ['/', '/check', '/free-ir35-check', '/sample-report', '/guides', '/about', '/contact', '/privacy', '/terms', '/guides/ir35-substitution-clause']) {
    const res = await fetch(base + p);
    assert.equal(res.status, 200, p);
    const html = await res.text();
    assert.equal((html.match(/<title>/g) || []).length, 1, p + ' title count');
    assert.ok(!/\{\{/.test(html), p + ' has unrendered template tags');
    assert.ok(html.includes('rel="canonical"'), p + ' canonical');
  }
});

test('robots, sitemap, redirects and 404', async () => {
  assert.match(await (await fetch(base + '/robots.txt')).text(), /Sitemap:/);
  assert.match(await (await fetch(base + '/sitemap.xml')).text(), /<urlset/);
  const r = await fetch(base + '/analyze.html', { redirect: 'manual' });
  assert.equal(r.status, 301);
  assert.equal((await fetch(base + '/does-not-exist')).status, 404);
  assert.equal((await fetch(base + '/report/notarealid')).status, 404);
});

test('checkout validates input', async () => {
  const fd = new FormData();
  fd.append('contract', new Blob([await pdf()], { type: 'application/pdf' }), 'c.pdf');
  fd.append('answers', JSON.stringify(ANSWERS));
  const res = await fetch(base + '/api/checkout', { method: 'POST', body: fd });
  assert.equal(res.status, 400); // no consent
});

test('full flow: upload → pay → report → PDF', async () => {
  const fd = new FormData();
  fd.append('contract', new Blob([await pdf()], { type: 'application/pdf' }), 'c.pdf');
  fd.append('answers', JSON.stringify(ANSWERS));
  fd.append('consent', 'yes');
  const res = await fetch(base + '/api/checkout', { method: 'POST', body: fd });
  assert.equal(res.status, 200);
  const id = new URL((await res.json()).url).searchParams.get('id');

  let s = await (await fetch(`${base}/api/reports/${id}`)).json();
  assert.equal(s.status, 'awaiting_payment');
  await fetch(base + '/dev/fake-pay', { method: 'POST', body: new URLSearchParams({ id }), redirect: 'manual' });
  for (let i = 0; i < 30 && s.status !== 'complete'; i++) {
    await new Promise((r) => setTimeout(r, 500));
    s = await (await fetch(`${base}/api/reports/${id}`)).json();
  }
  assert.equal(s.status, 'complete');
  assert.ok(s.report.keyFactors.length >= 8);
  const pdfRes = await fetch(`${base}/api/reports/${id}/pdf`);
  assert.equal(pdfRes.headers.get('content-type'), 'application/pdf');
  assert.ok((await pdfRes.arrayBuffer()).byteLength > 5000);
});
