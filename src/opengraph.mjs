import { Severity, Category } from './findings.mjs';

function isAbsoluteUrl(s) {
  return /^https?:\/\//i.test(String(s || ''));
}

function f(severity, code, msg, field) {
  return { severity, category: Category.OG, code, message: msg, field };
}

function tw(severity, code, msg, field) {
  return { severity, category: Category.TWITTER, code, message: msg, field };
}

function g(severity, code, msg, field) {
  return { severity, category: Category.GENERAL, code, message: msg, field };
}

/**
 * Sync OG validation. Returns { findings: Finding[] }.
 */
export function validateOpenGraph(meta) {
  const { og, twitter, general, all = [] } = meta;
  const findings = [];

  // ── Required tags ───────────────────────────────

  if (!og.title) {
    findings.push(f(Severity.ERROR, 'OG_TITLE_MISSING', 'og:title assente — Facebook/LinkedIn richiedono questo tag'));
  }
  if (!og.type) {
    findings.push(f(Severity.INFO, 'OG_TYPE_MISSING', 'og:type assente — sarà usato il default "website"'));
  }
  if (!og.image && !twitter.image) {
    findings.push(f(Severity.ERROR, 'OG_IMAGE_MISSING', 'og:image assente — nessuna immagine di anteprima su Facebook/LinkedIn'));
  } else if (og.image && !isAbsoluteUrl(og.image)) {
    findings.push(f(Severity.ERROR, 'OG_IMAGE_RELATIVE_URL', 'og:image è un URL relativo — i crawler social lo ignoreranno'));
  }
  if (!og.url) {
    findings.push(f(Severity.WARNING, 'OG_URL_MISSING', 'og:url assente — i crawler useranno l\'URL richiesto, che potrebbe non essere il canonico'));
  } else if (!isAbsoluteUrl(og.url)) {
    findings.push(f(Severity.WARNING, 'OG_URL_RELATIVE_URL', 'og:url è un URL relativo — i crawler potrebbero rifiutarlo'));
  }

  // ── og:image depth checks (sync, from meta) ─────

  if (og.image && isAbsoluteUrl(og.image)) {
    const iw = parseInt(og['image:width'], 10) || 0;
    const ih = parseInt(og['image:height'], 10) || 0;

    if (!iw || !ih) {
      findings.push(f(Severity.INFO, 'OG_IMAGE_DIMENSIONS_NOT_DECLARED',
        'og:image:width / og:image:height non dichiarati — il crawler deve scaricare l\'immagine per misurarla, rallentando la generazione dell\'anteprima'));
    }

    if (iw > 0 && ih > 0) {
      if (iw < 200 || ih < 200) {
        findings.push(f(Severity.ERROR, 'OG_IMAGE_TOO_SMALL',
          `og:image troppo piccola (${iw}×${ih}px) — minimo 200×200px richiesto per qualsiasi preview`));
      }
      if (iw >= 200 && iw < 1200) {
        findings.push(f(Severity.WARNING, 'OG_IMAGE_BELOW_RECOMMENDED',
          `og:image larghezza ${iw}px — sotto i 1200px raccomandati per anteprime piene su Facebook/LinkedIn`));
      }
      const ratio = iw / ih;
      if (ratio < 1.7 || ratio > 2.1) {
        findings.push(f(Severity.INFO, 'OG_IMAGE_BAD_ASPECT_RATIO',
          `og:image aspect ratio ${ratio.toFixed(2)}:1 — lontano dall'ideale 1.91:1, Facebook potrebbe ritagliare male`));
      }
    }

    // Format check
    const ext = (og.image.split('?')[0].split('#')[0].split('.').pop() || '').toLowerCase();
    if (ext === 'webp') {
      findings.push(f(Severity.INFO, 'OG_IMAGE_WEBP_FORMAT',
        'og:image è in formato WebP — crawler datati potrebbero non supportarlo; usare jpg/png come fallback'));
    } else if (ext && !['jpg', 'jpeg', 'png', 'gif'].includes(ext)) {
      findings.push(f(Severity.INFO, 'OG_IMAGE_UNSUPPORTED_FORMAT',
        `og:image formato ".${ext}" — i crawler social supportano solo jpg/png/gif/webp`));
    }
  }

  // ── Content coherence ───────────────────────────

  if (og.title && general.title && og.title !== general.title) {
    findings.push(g(Severity.INFO, 'TITLE_OG_TITLE_MISMATCH',
      '<title> e og:title differiscono — intenzionale? Verificare la coerenza', 'title'));
  }

  if (og.description) {
    if (og.description.length > 300) {
      findings.push(f(Severity.INFO, 'OG_DESCRIPTION_TOO_LONG',
        `og:description è ${og.description.length} caratteri — Facebook tronca oltre ~300`));
    }
    if (og.description.length > 200) {
      findings.push(f(Severity.INFO, 'OG_DESCRIPTION_TOO_LONG_LINKEDIN',
        `og:description è ${og.description.length} caratteri — LinkedIn tronca oltre ~200`));
    }
    if (/^(test|placeholder|sample|description|descrizione|lorem ipsum|og description|meta description)$/i.test(og.description.trim())) {
      findings.push(f(Severity.WARNING, 'OG_TITLE_DESCRIPTION_PLACEHOLDER',
        'og:description sembra un placeholder — sostituire con contenuto reale'));
    }
  }

  // ── Secondary tags ──────────────────────────────

  if (!og.site_name) {
    findings.push(f(Severity.INFO, 'OG_SITE_NAME_MISSING',
      'og:site_name assente — i crawler mostreranno il dominio nudo invece del nome del brand'));
  }
  if (!og.locale) {
    findings.push(f(Severity.INFO, 'OG_LOCALE_MISSING',
      'og:locale assente — Facebook assume en_US come default'));
  }
  if (og.type === 'article') {
    if (!og['article:published_time']) {
      findings.push(f(Severity.WARNING, 'OG_ARTICLE_FIELDS_MISSING',
        'og:type è "article" ma article:published_time è assente'));
    }
    if (!og['article:author']) {
      findings.push(f(Severity.INFO, 'OG_ARTICLE_FIELDS_MISSING',
        'og:type è "article" ma article:author è assente'));
    }
  }

  // ── og:url vs canonical ─────────────────────────

  if (og.url && general.canonical && og.url !== general.canonical) {
    findings.push(f(Severity.WARNING, 'CANONICAL_OG_URL_MISMATCH',
      `og:url differisce dal canonical: og:url="${og.url}" vs canonical="${general.canonical}"`, 'og:url'));
  }

  // ── Twitter tags ────────────────────────────────

  if (!twitter.title) {
    findings.push(tw(Severity.INFO, 'TWITTER_TITLE_MISSING', 'twitter:title assente — Twitter userà og:title come fallback'));
  }
  if (!twitter.card) {
    findings.push(tw(Severity.WARNING, 'TWITTER_CARD_MISSING', 'twitter:card assente — Twitter userà i tag Open Graph come fallback'));
  }
  if (!twitter.image && og.image) {
    findings.push(tw(Severity.INFO, 'TWITTER_IMAGE_MISSING', 'twitter:image assente — Twitter userà og:image come fallback'));
  } else if (og.image && twitter.image && og.image !== twitter.image) {
    findings.push(tw(Severity.INFO, 'TWITTER_IMAGE_MISSING', 'twitter:image e og:image puntano a URL diversi — verificare la coerenza', 'twitter:image'));
  }
  if (og.image && !twitter.image) {
    const iw = parseInt(og['image:width'], 10) || 0;
    const ih = parseInt(og['image:height'], 10) || 0;
    if (iw > 0 && (iw < 300 || ih < 157)) {
      findings.push(tw(Severity.WARNING, 'TWITTER_IMAGE_BELOW_MINIMUM',
        `og:image (usata da Twitter come fallback) è ${iw}×${ih}px — sotto il minimo 300×157 per summary_large_image`));
    }
  }

  // ── Duplicate OG tags ───────────────────────────

  const ogCounts = {};
  for (const item of all) {
    if (item.property && item.property.startsWith('og:')) {
      ogCounts[item.property] = (ogCounts[item.property] || 0) + 1;
    }
  }
  for (const [key, count] of Object.entries(ogCounts)) {
    if (count > 1) {
      findings.push(f(Severity.ERROR, 'OG_DUPLICATE_TAG',
        `Tag OG duplicato "${key}" trovato ${count}× — conflitto tra plugin SEO?`, key));
    }
    if (findings.length > 30) break;
  }

  return { findings };
}

/**
 * Async: HEAD request on og:image. Returns { findings: Finding[] }.
 */
export async function validateOgImage(ogImage) {
  const findings = [];
  if (!ogImage || !isAbsoluteUrl(ogImage)) return { findings };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(ogImage, { method: 'HEAD', signal: controller.signal, redirect: 'follow' });
    clearTimeout(timeout);

    if (!res.ok) {
      findings.push(f(Severity.ERROR, 'OG_IMAGE_UNREACHABLE',
        `og:image ha risposto HTTP ${res.status} — i crawler potrebbero non riuscire a scaricarla`, 'og:image'));
      return { findings };
    }

    const type = (res.headers.get('content-type') || '').toLowerCase();
    const len = res.headers.get('content-length');

    if (type && !type.startsWith('image/')) {
      findings.push(f(Severity.ERROR, 'OG_IMAGE_WRONG_CONTENT_TYPE',
        `og:image Content-Type è "${type}" — ci si aspetta un\'immagine`));
    }

    // Heuristic: URL patterns that suggest tiny icons
    const low = ogImage.toLowerCase();
    if (/icon|favicon|apple|touch|precomposed|mask-icon|\d{1,3}x\d{1,3}|[-_]\d{2,4}[-_.]/.test(low.split('?')[0].split('#')[0])) {
      findings.push(f(Severity.WARNING, 'OG_IMAGE_LOOKS_LIKE_ICON',
        'og:image ha pattern da icona/favicon/apple-touch — probabilmente troppo piccola per preview social', 'og:image'));
      return { findings };
    }

    if (len) {
      const bytes = parseInt(len, 10);
      const mb = bytes / (1024 * 1024);
      if (mb > 8) {
        findings.push(f(Severity.WARNING, 'OG_IMAGE_TOO_LARGE',
          `og:image è ${mb.toFixed(1)}MB — supera il limite Facebook di 8MB`));
      } else if (mb > 1) {
        findings.push(f(Severity.INFO, 'OG_IMAGE_TOO_LARGE',
          `og:image è ${mb.toFixed(1)}MB — file grande rallenta la generazione dell'anteprima`));
      }
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      findings.push(f(Severity.WARNING, 'OG_IMAGE_UNREACHABLE',
        'og:image HEAD request timeout — immagine potrebbe non essere raggiungibile'));
    } else {
      findings.push(f(Severity.WARNING, 'OG_IMAGE_UNREACHABLE',
        `og:image fetch fallito: ${e.message}`));
    }
  }

  return { findings };
}
