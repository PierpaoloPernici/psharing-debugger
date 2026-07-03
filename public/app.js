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

    renderWarnings(data.warnings || []);
    renderSiteInfo(data.url, data.meta.general);
    renderPreviews(data.previews);
    renderRawData(data.meta);
    if (window.lucide) lucide.createIcons();
    show(results);
  } catch (err) {
    showError('Errore di connessione al server.');
  } finally {
    hide(loading);
  }
});

function renderSiteInfo(url, general) {
  const el = document.getElementById('site-info');
  const faviconImg = document.getElementById('favicon-img');
  const faviconFallback = document.getElementById('favicon-fallback');
  const domain = document.getElementById('site-domain');
  const meta = document.getElementById('site-meta');

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
  if (jsToggle.checked) parts.push('JS rendered');
  meta.textContent = parts.join(' · ');
}

function renderPreviews(previews) {
  renderFacebook(previews.facebook);
  renderTwitter(previews.twitter);
  renderLinkedin(previews.linkedin);
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

function renderLinkedin(li) {
  const img = li.image
    ? `<div class="li-img"><img src="${escapeHtml(li.image)}" alt="" loading="lazy"></div>`
    : `<div class="li-img"><span class="text-xs text-slate-400">Nessuna immagine</span></div>`;

  previewCards.linkedin.innerHTML = `
    ${img}
    <div class="li-body">
      <div class="li-title">${escapeHtml(li.title) || 'Nessun titolo'}</div>
      <div class="li-desc">${escapeHtml(li.description)}</div>
      <div class="li-domain">${escapeHtml(li.siteName)}</div>
    </div>
  `;
}

function renderWarnings(warnings) {
  warningsEl.innerHTML = warnings.map((w) =>
    `<div class="flex items-start gap-2.5 rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
      <i data-lucide="triangle-alert" class="w-4 h-4 mt-0.5 shrink-0 text-amber-500"></i>
      <span>${escapeHtml(w)}</span>
    </div>`
  ).join('');
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
    for (const obj of meta.jsonld) {
      rows.push({ property: 'application/ld+json', value: JSON.stringify(obj, null, 2) });
    }
  }

  rawDataTbody.innerHTML = rows.map((r) =>
    `<tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
      <td class="px-5 py-2.5 font-mono text-indigo-600 dark:text-indigo-400 align-top break-all">${escapeHtml(r.property)}</td>
      <td class="px-5 py-2.5 text-slate-600 dark:text-slate-400 break-all">${escapeHtml(String(r.value).slice(0, 500))}</td>
    </tr>`
  ).join('');
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
