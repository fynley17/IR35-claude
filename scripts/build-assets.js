// Regenerates the social image and icons in /public. Run with: node scripts/build-assets.js
// Needs Playwright (npx playwright install chromium) — only used at design time, not in production.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const pub = path.join(__dirname, '..', 'public');
const font = (f) => 'data:font/woff2;base64,' + fs.readFileSync(path.join(pub, 'fonts', f)).toString('base64');
const css = `
@font-face{font-family:S;src:url(${font('instrument-serif-latin-400-normal.woff2')})}
@font-face{font-family:SI;src:url(${font('instrument-serif-latin-400-italic.woff2')})}
@font-face{font-family:M;src:url(${font('jetbrains-mono-latin-500-normal.woff2')})}
@font-face{font-family:G;src:url(${font('geist-sans-latin-400-normal.woff2')})}
*{margin:0;box-sizing:border-box}body{background:#080808;color:#F0EDE8}`;

const og = `<html><head><style>${css}
.wrap{width:1200px;height:630px;padding:72px 80px;position:relative;overflow:hidden;
background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:60px 60px}
.tag{font-family:M;font-size:22px;letter-spacing:.15em;color:#E8935A;text-transform:uppercase}
h1{font-family:S;font-weight:400;font-size:104px;line-height:.98;margin-top:34px;letter-spacing:-1px}
em{font-family:SI;color:#E8935A;font-style:normal}
.sub{font-family:G;font-size:30px;color:#A3A39B;margin-top:34px;max-width:560px}
.card{position:absolute;right:80px;bottom:72px;border:1px solid rgba(255,255,255,.15);background:#111;padding:22px 26px;font-family:M;font-size:20px;width:360px}
.row{display:flex;justify-content:space-between;padding:8px 0;color:#A3A39B}.r{color:#ef6b5b}.a{color:#f0a04b}.g{color:#4cc47f}
.badge{color:#f0a04b;border:1px solid rgba(230,126,34,.4);padding:4px 10px;display:inline-block;margin-bottom:10px}
</style></head><body><div class="wrap">
<div class="tag">IR35 contract review · £9 · minutes</div>
<h1>Know your IR35 risk<br/><em>before you sign.</em></h1>
<div class="sub">Clause-by-clause report with suggested wording.</div>
<div class="card"><div class="badge">MEDIUM RISK · 6/10</div>
<div class="row"><span>Substitution</span><span class="a">⚠ Warning</span></div>
<div class="row"><span>Control</span><span class="r">✗ Red flag</span></div>
<div class="row"><span>Equipment</span><span class="g">✓ Positive</span></div></div>
</div></body></html>`;

const icon = (size) => `<html><head><style>${css}body{width:${size}px;height:${size}px}</style></head><body>${fs.readFileSync(path.join(pub, 'favicon.svg'), 'utf8').replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`;

function ico(png32) {
  const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(32, 0); entry.writeUInt8(32, 1); entry.writeUInt8(0, 2); entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4); entry.writeUInt16LE(32, 6); entry.writeUInt32LE(png32.length, 8); entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, png32]);
}

(async () => {
  const browser = await chromium.launch();
  const shot = async (html, w, h, out) => {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const buf = await page.screenshot({ type: 'png', omitBackground: false });
    if (out) fs.writeFileSync(out, buf);
    await page.close();
    return buf;
  };
  fs.mkdirSync(path.join(pub, 'img'), { recursive: true });
  await shot(og, 1200, 630, path.join(pub, 'img', 'og.png'));
  await shot(icon(512), 512, 512, path.join(pub, 'img', 'logo-512.png'));
  await shot(icon(192), 192, 192, path.join(pub, 'img', 'icon-192.png'));
  await shot(icon(180), 180, 180, path.join(pub, 'apple-touch-icon.png'));
  fs.writeFileSync(path.join(pub, 'favicon.ico'), ico(await shot(icon(32), 32, 32)));
  await browser.close();
  console.log('assets written');
})();
