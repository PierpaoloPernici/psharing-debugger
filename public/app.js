const form = document.getElementById('debug-form');
const urlInput = document.getElementById('url-input');
const pasteBtn = document.getElementById('paste-btn');
const jsToggle = document.getElementById('js-toggle');

pasteBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      urlInput.value = text;
      urlInput.focus();
    }
  } catch {
    // fallback: permesso negato o clipboard API non supportata
  }
});
const loading = document.getElementById('loading');
const results = document.getElementById('results');
const errorSection = document.getElementById('error');
const warningsEl = document.getElementById('warnings');
const rawDataTbody = document.querySelector('#raw-data tbody');
const reportBtn = document.getElementById('report-btn');
let lastReport = null;

const previewCards = {
  facebook: document.querySelector('.card-facebook'),
  twitter: document.querySelector('.card-twitter'),
  linkedin: document.querySelector('.card-linkedin'),
};

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  let url = urlInput.value.trim();
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  hide(errorSection, results);
  show(loading);

  try {
    const res = await fetch('/api/debug', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, jsRender: jsToggle.checked }),
    });

    const data = await res.json();

    if (!res.ok) {
      showError(data.error || 'Errore sconosciuto');
      return;
    }

    renderFindings(data.findings || []);
    renderSiteInfo(data.url, data.meta.general, data.jsRender);
    renderScreenshot(data.screenshotUrl);
    renderPreviews(data.previews, data.meta.general.favicon);
    renderRawData(data.meta);
    lastReport = buildReport(data);
    reportBtn.disabled = false;
    if (window.lucide) lucide.createIcons();
    show(results);
  } catch (err) {
    lastReport = null;
    reportBtn.disabled = true;
    showError('Errore di connessione al server.');
  } finally {
    hide(loading);
  }
});

function renderSiteInfo(url, general, jsRender) {
  const el = document.getElementById('site-info');
  const faviconImg = document.getElementById('favicon-img');
  const faviconFallback = document.getElementById('favicon-fallback');
  const domain = document.getElementById('site-domain');
  const metaText = document.getElementById('site-meta-text');
  const modeBadge = document.getElementById('mode-badge');

  el.classList.remove('hidden');

  if (general.favicon && !general.favicon.startsWith('data:')) {
    faviconImg.src = general.favicon;
    faviconImg.classList.remove('hidden');
    faviconFallback.classList.add('hidden');
  } else {
    faviconImg.classList.add('hidden');
    faviconFallback.classList.remove('hidden');
  }

  try {
    domain.textContent = new URL(url).hostname;
  } catch {
    domain.textContent = url;
  }

  const parts = [];
  if (general.title) parts.push(general.title);
  metaText.textContent = parts.join(' · ');

  if (jsRender) {
    modeBadge.className = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
    modeBadge.textContent = 'JS rendered';
    modeBadge.classList.remove('hidden');
  } else {
    modeBadge.className = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
    modeBadge.textContent = 'HTML statico';
    modeBadge.classList.remove('hidden');
  }
}

function renderScreenshot(screenshotUrl) {
  const el = document.getElementById('screenshot-wrap');
  const img = document.getElementById('screenshot-img');
  if (!screenshotUrl) { el.classList.add('hidden'); return; }
  img.src = screenshotUrl;
  el.classList.remove('hidden');
}

function renderPreviews(previews, favicon) {
  renderFacebook(previews.facebook);
  renderTwitter(previews.twitter);
  renderLinkedin(previews.linkedin, favicon);
}

function renderFacebook(fb) {
  const img = fb.image
    ? `<div class="fb-img"><img src="${escapeHtml(fb.image)}" alt="" loading="lazy"></div>`
    : `<div class="fb-img"><span class="text-xs text-slate-400">Nessuna immagine</span></div>`;

  previewCards.facebook.innerHTML = `
    ${img}
    <div class="fb-body">
      <div class="fb-domain">${escapeHtml(fb.siteName)}</div>
      <div class="fb-title">${escapeHtml(fb.title) || 'Nessun titolo'}</div>
      <div class="fb-desc">${escapeHtml(fb.description)}</div>
    </div>
  `;
}

function renderTwitter(tw) {
  const img = tw.image
    ? `<div class="tw-img"><img src="${escapeHtml(tw.image)}" alt="" loading="lazy"></div>`
    : `<div class="tw-img"><span class="text-xs text-slate-400">Nessuna immagine</span></div>`;

  previewCards.twitter.innerHTML = `
    ${img}
    <div class="tw-body">
      <div class="tw-title">${escapeHtml(tw.title) || 'Nessun titolo'}</div>
      <div class="tw-desc">${escapeHtml(tw.description)}</div>
      <div class="tw-site">${escapeHtml(tw.site)}</div>
    </div>
  `;
}

function renderLinkedin(li, favicon) {
  const img = li.image
    ? `<div class="li-img"><img src="${escapeHtml(li.image)}" alt="" loading="lazy"></div>`
    : `<div class="li-img"><span class="text-xs text-slate-400">Nessuna immagine</span></div>`;

  const faviconEl = favicon
    ? `<img src="${escapeHtml(favicon)}" class="li-favicon" alt="" onerror="this.classList.add('hidden')">`
    : '';

  previewCards.linkedin.innerHTML = `
    ${img}
    <div class="li-body">
      <div class="li-source">${faviconEl}${escapeHtml(li.siteName || '')}</div>
      <div class="li-title">${escapeHtml(li.title) || 'Nessun titolo'}</div>
      <div class="li-desc">${escapeHtml(li.description)}</div>
      <div class="li-domain">${escapeHtml(li.url || '')}</div>
    </div>
  `;
}

const severityConfig = {
  error:   { border: 'border-red-200 dark:border-red-800', bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-800 dark:text-red-200', icon: 'octagon-alert', iconColor: 'text-red-500' },
  warning: { border: 'border-amber-200 dark:border-amber-700', bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-800 dark:text-amber-200', icon: 'triangle-alert', iconColor: 'text-amber-500' },
  info:    { border: 'border-blue-200 dark:border-blue-800', bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-800 dark:text-blue-200', icon: 'info', iconColor: 'text-blue-500' },
};

function renderFindings(findings) {
  if (!findings || !findings.length) {
    warningsEl.innerHTML = '';
    return;
  }

  const grouped = findings.length > 3;

  const alertHtml = findings.map((f) => {
    const c = severityConfig[f.severity] || severityConfig.info;
    return `<div class="flex items-start gap-2.5 rounded-xl border ${c.border} ${c.bg} px-4 py-3 text-sm ${c.text}">
      <i data-lucide="${c.icon}" class="w-4 h-4 mt-0.5 shrink-0 ${c.iconColor}"></i>
      <span>${escapeHtml(f.message)}</span>
    </div>`;
  }).join('');

  if (grouped) {
    warningsEl.innerHTML = `
      <details class="group rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden shadow-sm">
        <summary class="flex items-center gap-2 px-5 py-3 text-sm font-semibold text-slate-600 dark:text-slate-300 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors select-none marker:content-none list-none">
          <i data-lucide="chevron-right" class="w-4 h-4 transition-transform group-open:rotate-90 text-slate-400"></i>
          Findings (${findings.length})
          <span class="ml-auto text-xs text-slate-400 dark:text-slate-500 font-normal">clicca per espandere</span>
        </summary>
        <div class="p-4 space-y-2 border-t border-slate-100 dark:border-slate-700/50">
          ${alertHtml}
        </div>
      </details>`;
  } else {
    warningsEl.innerHTML = `<div class="space-y-2">${alertHtml}</div>`;
  }
}

function renderRawData(meta) {
  const rows = [];

  if (meta.general) {
    for (const [k, v] of Object.entries(meta.general)) {
      if (v) rows.push({ property: k, value: String(v) });
    }
  }

  for (const group of ['og', 'twitter']) {
    if (!meta[group]) continue;
    for (const [k, v] of Object.entries(meta[group])) {
      if (v) rows.push({ property: `${group}:${k}`, value: String(v) });
    }
  }

  if (meta.jsonld && meta.jsonld.length) {
    for (const block of meta.jsonld) {
      const status = block.status;
      const typeLabel = block.type || (status === 'parse_error' ? 'parse error' : status === 'empty' ? 'empty' : 'unknown');
      const prefix = `@${typeLabel}`;
      const data = block.data || {};

      // Non-ok blocks: just show the raw content
      if (status !== 'ok') {
        rows.push({ property: `ld+json:${typeLabel} [${status}]`, value: data._raw || status });
        continue;
      }

      const keys = Object.keys(data).filter((k) => !k.startsWith('@'));

      // Context
      if (block.context) {
        rows.push({ property: `${prefix} @context`, value: block.context });
      }

      // Data fields
      for (const k of keys) {
        const v = data[k];
        if (v == null || v === '') continue;
        if (typeof v === 'object') {
          rows.push({ property: `${prefix} ${k}`, value: JSON.stringify(v) });
        } else {
          rows.push({ property: `${prefix} ${k}`, value: String(v) });
        }
      }

      // Empty extra fields
      if (!block.context && !keys.length) {
        rows.push({ property: `ld+json:${typeLabel}`, value: JSON.stringify(data) });
      }
    }
  }

  rawDataTbody.innerHTML = rows.map((r) => {
    const val = String(r.value);
    const truncated = val.length > 200;
    const display = truncated ? val.slice(0, 200) + '…' : val;
    return `<tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
      <td class="px-5 py-2.5 font-mono text-xs text-indigo-600 dark:text-indigo-400 align-top whitespace-nowrap">${escapeHtml(r.property)}</td>
      <td class="px-5 py-2.5 text-xs text-slate-600 dark:text-slate-400 max-w-[40ch]">
        <div class="flex items-start gap-1 min-w-0">
          <span class="truncate"${truncated ? ` title="${escapeHtml(val.slice(0, 300))}"` : ''}>${escapeHtml(display)}</span>
          ${truncated ? `<button data-copy="${escapeHtml(val)}" class="shrink-0 text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 cursor-pointer leading-none" title="Copia"><i data-lucide="copy" class="w-3 h-3"></i></button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
}

rawDataTbody.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return;
  navigator.clipboard.writeText(btn.dataset.copy).then(() => {
    btn.innerHTML = '<span class="text-xs text-green-600">OK</span>';
    setTimeout(() => { btn.innerHTML = '<i data-lucide="copy" class="w-3 h-3"></i>'; }, 1500);
  }).catch(() => {});
});

reportBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  if (!lastReport) return;
  try {
    await navigator.clipboard.writeText(lastReport);
    reportBtn.classList.add('text-green-600', 'dark:text-green-400');
    reportBtn.querySelector('.report-label').textContent = 'Copiato!';
    setTimeout(() => {
      reportBtn.classList.remove('text-green-600', 'dark:text-green-400');
      reportBtn.querySelector('.report-label').textContent = 'Report';
    }, 1500);
  } catch {}
});

function buildReport(data) {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const meta = data.meta || {};
  const general = meta.general || {};
  const og = meta.og || {};
  const twitter = meta.twitter || {};
  const jsonld = meta.jsonld || [];
  const mode = data.jsRender ? 'JS rendered' : 'HTML statico';

  let lines = [];

  // Header
  lines.push('# pCube Sharing Debugger — Report');
  lines.push('');
  lines.push(`**URL:** ${data.url}`);
  if (general.canonical && general.canonical !== data.url) {
    lines.push(`**Canonical:** ${general.canonical}`);
  }
  lines.push(`**Analisi:** ${mode}`);
  lines.push(`**Data:** ${now}`);

  // Findings section
  const findings = data.findings || [];
  if (findings.length) {
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## Findings');
    lines.push('');
    for (const f of findings) {
      const pfx = f.severity === 'error' ? '🔴' : f.severity === 'warning' ? '⚠️' : 'ℹ️';
      lines.push(`- ${pfx} [${f.category}] ${f.message}`);
      if (f.field) lines.push(`  (campo: ${f.field})`);
    }
  }

  // Metadata
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Metadati');
  lines.push('');

  // General
  const generalLines = formatMetaKV(general);
  if (generalLines.length) {
    lines.push('### General');
    lines.push('');
    lines.push(...generalLines);
    lines.push('');
  }

  // Open Graph
  const ogLines = formatMetaKV(og, 'og:');
  if (ogLines.length) {
    lines.push('### Open Graph');
    lines.push('');
    lines.push(...ogLines);
    lines.push('');
  }

  // Twitter
  const twitterLines = formatMetaKV(twitter, 'twitter:');
  if (twitterLines.length) {
    lines.push('### Twitter');
    lines.push('');
    lines.push(...twitterLines);
    lines.push('');
  }

  // JSON-LD
  if (jsonld.length) {
    lines.push('### JSON-LD');
    lines.push('');
    for (const block of jsonld) {
      const t = block.type || (block.status === 'parse_error' ? 'parse error' : block.status === 'empty' ? 'empty' : 'unknown');
      lines.push(`#### ${t}${block.status !== 'ok' ? ` [${block.status}]` : ''}`);
      lines.push('');
      if (block.context) lines.push(`- @context: ${block.context}`);

      if (block.status === 'ok') {
        const keys = Object.keys(block.data || {}).filter((k) => !k.startsWith('@'));
        for (const k of keys) {
          const v = block.data[k];
          const val = smartTruncate(v, 120);
          lines.push(`- ${k}: ${val}`);
        }
      } else if (block.data._raw) {
        lines.push(`- raw: ${block.data._raw}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

function smartTruncate(v, max) {
  if (typeof v === 'object' && v !== null) {
    if (Array.isArray(v)) return `[...${v.length} items]`;
    const keys = Object.keys(v).slice(0, 6);
    const more = Object.keys(v).length > 6 ? ', …' : '';
    return `{${keys.join(', ')}${more}}`;
  }
  const s = String(v);
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function formatMetaKV(obj, prefix = '') {
  if (!obj) return [];
  return Object.entries(obj)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `- ${prefix}${k}: ${v}`);
}

function showError(msg) {
  errorSection.querySelector('.error-msg').textContent = msg;
  show(errorSection);
}

function show(el) { el.classList.remove('hidden'); }
function hide(...els) { els.forEach((el) => el.classList.add('hidden')); }

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str || '');
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return str.replace(/[&<>"']/g, (c) => map[c]);
}

/* ── Theme ──────────────────────────────────────── */

const THEME_KEY = 'pcube-theme';
const html = document.documentElement;

function getSystemDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(theme) {
  if (theme === 'dark') html.classList.add('dark');
  else if (theme === 'light') html.classList.remove('dark');
  else if (getSystemDark()) html.classList.add('dark');
  else html.classList.remove('dark');
}

function updateThemeUI(active) {
  document.querySelectorAll('[data-theme]').forEach((btn) => {
    const on = btn.dataset.theme === active;
    btn.classList.toggle('bg-indigo-100', on);
    btn.classList.toggle('text-indigo-700', on);
    btn.classList.toggle('dark:bg-indigo-900/40', on);
    btn.classList.toggle('dark:text-indigo-300', on);
  });
}

const saved = localStorage.getItem(THEME_KEY) || 'system';
updateThemeUI(saved);

document.querySelectorAll('[data-theme]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const t = btn.dataset.theme;
    localStorage.setItem(THEME_KEY, t);
    applyTheme(t);
    updateThemeUI(t);
  });
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  const cur = localStorage.getItem(THEME_KEY) || 'system';
  if (cur === 'system') applyTheme('system');
});

if (window.lucide) lucide.createIcons();
