'use strict';
/*
 * Tiny template renderer for the static pages in /views.
 *   {{key}}            HTML-escaped value (dot paths allowed, e.g. business.contactEmail)
 *   {{{key}}}          raw value
 *   {{> partial}}      include views/partials/partial.html
 *   {{#if key}}...{{else}}...{{/if}}   (may be nested)
 * Each page starts with  <!--meta { ...json... } -->  describing title, description, path, etc.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

const VIEWS = path.join(__dirname, '..', 'views');
const PUBLIC = path.join(__dirname, '..', 'public');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function lookup(ctx, key) {
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), ctx);
}

function assetVersion() {
  const h = crypto.createHash('sha1');
  for (const dir of ['css', 'js']) {
    const d = path.join(PUBLIC, dir);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d).sort()) h.update(fs.readFileSync(path.join(d, f)));
  }
  return h.digest('hex').slice(0, 10);
}

function walk(dir, base = '') {
  let out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'partials') continue;
    const rel = path.join(base, entry.name);
    if (entry.isDirectory()) out = out.concat(walk(path.join(dir, entry.name), rel));
    else if (entry.name.endsWith('.html')) out.push(rel);
  }
  return out;
}

function parse(file) {
  const src = fs.readFileSync(path.join(VIEWS, file), 'utf8');
  const m = src.match(/^<!--meta\s+([\s\S]*?)-->\s*/);
  if (!m) throw new Error(`${file} is missing its <!--meta {...} --> header`);
  return { meta: JSON.parse(m[1]), body: src.slice(m[0].length) };
}

function loadPartials() {
  const dir = path.join(VIEWS, 'partials');
  const partials = {};
  for (const f of fs.readdirSync(dir)) partials[f.replace(/\.html$/, '')] = fs.readFileSync(path.join(dir, f), 'utf8');
  return partials;
}

function fill(tpl, ctx, partials, depth = 0) {
  if (depth > 5) throw new Error('Partial nesting too deep');
  let out = tpl.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, name) => {
    if (!(name in partials)) throw new Error(`Unknown partial: ${name}`);
    return fill(partials[name], ctx, partials, depth + 1);
  });
  // Resolve innermost {{#if}} blocks first so nesting works.
  const innermostIf = /\{\{#if\s+([\w.]+)\s*\}\}((?:(?!\{\{#if)[\s\S])*?)\{\{\/if\}\}/g;
  for (let guard = 0; innermostIf.test(out) && guard < 50; guard++) {
    innermostIf.lastIndex = 0;
    out = out.replace(innermostIf, (_, key, body) => {
      const [yes, no = ''] = body.split('{{else}}');
      return lookup(ctx, key) ? yes : no;
    });
    innermostIf.lastIndex = 0;
  }
  out = out.replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_, key) => String(lookup(ctx, key) ?? ''));
  out = out.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => esc(lookup(ctx, key)));
  return out;
}

function organisationSchema() {
  const b = config.business;
  return {
    '@type': 'Organization',
    '@id': `${config.baseUrl}/#organization`,
    name: b.tradingName,
    ...(b.legalName ? { legalName: b.legalName } : {}),
    url: config.baseUrl + '/',
    logo: `${config.baseUrl}/img/logo-512.png`,
    ...(b.contactEmail ? { email: b.contactEmail } : {}),
    ...(b.companyNumber ? { identifier: { '@type': 'PropertyValue', propertyID: 'Companies House number', value: b.companyNumber } } : {}),
    areaServed: 'GB',
  };
}

function buildSchema(meta) {
  const url = config.baseUrl + meta.path;
  const graph = [organisationSchema(), { '@type': 'WebSite', '@id': `${config.baseUrl}/#website`, url: config.baseUrl + '/', name: config.business.tradingName, inLanguage: 'en-GB', publisher: { '@id': `${config.baseUrl}/#organization` } }];
  if (meta.type === 'home') {
    graph.push({
      '@type': 'Product',
      name: 'IR35 Contract Risk Report',
      description: meta.description,
      brand: { '@id': `${config.baseUrl}/#organization` },
      image: `${config.baseUrl}/img/og.png`,
      offers: { '@type': 'Offer', price: (config.pricePence / 100).toFixed(2), priceCurrency: 'GBP', availability: 'https://schema.org/InStock', url: `${config.baseUrl}/check` },
    });
  }
  if (meta.type === 'article') {
    graph.push({
      '@type': 'Article',
      headline: meta.h1 || meta.title,
      description: meta.description,
      mainEntityOfPage: url,
      datePublished: meta.published,
      dateModified: meta.updated || meta.published,
      inLanguage: 'en-GB',
      author: config.business.reviewerName
        ? { '@type': 'Person', name: config.business.reviewerName }
        : { '@id': `${config.baseUrl}/#organization` },
      publisher: { '@id': `${config.baseUrl}/#organization` },
      image: `${config.baseUrl}/img/og.png`,
    });
  }
  if (meta.breadcrumb) {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: meta.breadcrumb.map((b, i) => ({ '@type': 'ListItem', position: i + 1, name: b.name, item: config.baseUrl + b.path })),
    });
  }
  if (meta.faq) {
    graph.push({ '@type': 'FAQPage', mainEntity: meta.faq.map((q) => ({ '@type': 'Question', name: q.q, acceptedAnswer: { '@type': 'Answer', text: q.a } })) });
  }
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
}

function sampleReportHtml() {
  const { normaliseReport } = require('./analysis');
  const { render } = require('../public/js/report-render.js');
  return render(normaliseReport(require('./sample-report')), {
    actions: '<div class="actions"><a class="btn btn-primary" href="/check">Get this for your contract — ' + esc(config.priceLabel) + ' →</a></div>',
  });
}

function build() {
  const partials = loadPartials();
  const sampleHtml = sampleReportHtml();
  const version = assetVersion();
  const pages = new Map();
  const sitemap = [];
  const files = walk(VIEWS);
  const guides = [];
  const parsed = files.map((f) => ({ file: f, ...parse(f) }));
  for (const p of parsed) if (p.meta.type === 'article') guides.push(p.meta);
  guides.sort((a, b) => (a.order || 99) - (b.order || 99));

  for (const { file, meta, body } of parsed) {
    const priceDisplay = config.priceLabel;
    // Meta strings may contain {{price}}; resolve them first.
    const simple = { price: priceDisplay, business: config.business, retentionDays: config.reportRetentionDays, unpaidHours: config.unpaidRetentionHours };
    for (const k of ['title', 'description', 'h1']) if (meta[k]) meta[k] = fill(meta[k], simple, {});
    if (meta.faq) meta.faq = meta.faq.map((q) => ({ q: fill(q.q, simple, {}), a: fill(q.a, simple, {}) }));
    const ctx = {
      meta,
      price: priceDisplay,
      year: new Date().getFullYear(),
      baseUrl: config.baseUrl,
      canonical: config.baseUrl + meta.path,
      robots: meta.noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large',
      schema: meta.noindex ? '' : buildSchema(meta),
      v: version,
      business: config.business,
      retentionDays: config.reportRetentionDays,
      unpaidHours: config.unpaidRetentionHours,
      plausible: config.plausibleDomain,
      sampleReport: sampleHtml,
      guides: guides
        .filter((g) => g.path !== meta.path)
        .map((g) => `<li><a href="${esc(g.path)}">${esc(g.h1 || g.title)}</a></li>`)
        .join(''),
      guideCards: guides
        .map((g) => `<a class="guide-card" href="${esc(g.path)}"><span class="guide-card-title">${esc(g.h1 || g.title)}</span><span class="guide-card-desc">${esc(g.description)}</span></a>`)
        .join(''),
    };
    const html = fill(body, ctx, partials);
    pages.set(meta.path, { html, meta });
    if (!meta.noindex) sitemap.push({ loc: config.baseUrl + meta.path, lastmod: meta.updated || meta.published || null, priority: meta.priority || (meta.path === '/' ? '1.0' : '0.7') });
  }
  return { pages, sitemap, version };
}

module.exports = { build, esc };
