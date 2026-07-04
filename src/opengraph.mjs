/**
 * Open Graph tag validation.
 * Checks OG tags against Facebook/LinkedIn requirements.
 */

function isAbsoluteUrl(s) {
  return /^https?:\/\//i.test(String(s || ''));
}

/**
 * @param {object} meta — { og, twitter, general, all }
 * @returns {{ warnings: string[], flags: object, notes: string[] }}
 */
export function validateOpenGraph(meta) {
  const { og, twitter, general, all = [] } = meta;
  const warnings = [];
  const flags = {};
  const notes = [];

  // ── 1. Required tags ────────────────────────────

  if (!og.title) {
    warnings.push('Missing og:title — Facebook/LinkedIn require it for link previews');
  }
  if (!og.type) {
    notes.push('Missing og:type — default will be "website"');
  }
  if (!og.image) {
    warnings.push('Missing og:image — no preview image on Facebook/LinkedIn');
  } else if (!isAbsoluteUrl(og.image)) {
    warnings.push('og:image is a relative URL — social crawlers will ignore it');
  }
  if (!og.url) {
    notes.push('Missing og:url — crawlers may use the wrong canonical URL');
  } else if (!isAbsoluteUrl(og.url)) {
    warnings.push('og:url is a relative URL — crawlers may reject it');
  }

  // ── 2. og:image deep checks ─────────────────────

  if (og.image && isAbsoluteUrl(og.image)) {
    const iw = parseInt(og['image:width'], 10) || 0;
    const ih = parseInt(og['image:height'], 10) || 0;

    if (!iw || !ih) {
      notes.push('og:image:width / og:image:height not set — crawler must download image to measure, slowing preview');
    }

    if (iw > 0 && ih > 0) {
      if (iw < 200 || ih < 200) {
        warnings.push(`og:image too small (${iw}×${ih}px) — min 200×200px required`);
      }
      if (iw < 600) {
        notes.push(`og:image width ${iw}px — recommended ≥ 1200px for full-width Facebook preview`);
      }
      const ratio = iw / ih;
      if (ratio < 1.7 || ratio > 2.1) {
        notes.push(`og:image aspect ratio ${ratio.toFixed(2)}:1 — ideal is ~1.91:1; Facebook may crop awkwardly`);
      }
    }

    // Format check
    const urlPath = og.image.split('?')[0].split('#')[0];
    const ext = (urlPath.split('.').pop() || '').toLowerCase();
    const supported = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
    if (ext && !supported.includes(ext)) {
      notes.push(`og:image format ".${ext}" — social crawlers only support jpg/png/webp/gif. Consider converting`);
    }
    if (ext === 'webp') {
      notes.push('og:image is WebP — older crawlers may not support it; provide a jpg/png fallback');
    }
  }

  // ── 3. Content coherence ────────────────────────

  if (og.title && general.title && og.title !== general.title) {
    flags.titleMismatch = true;
  }

  if (og.description) {
    if (og.description.length > 300) {
      notes.push(`og:description is ${og.description.length} chars — Facebook truncates at ~300`);
    }
    if (og.description.length > 200) {
      notes.push(`og:description is ${og.description.length} chars — LinkedIn truncates at ~200`);
    }
    if (/^(test|placeholder|sample|description|descrizione|lorem ipsum|og description|meta description)$/i.test(og.description.trim())) {
      warnings.push('og:description appears to be a placeholder — replace with actual content for accurate previews');
    }
  } else {
    if (general.description) {
      flags.descriptionFallback = true;
    }
  }

  // ── 4. Secondary tags ───────────────────────────

  if (!og.site_name) {
    notes.push('og:site_name missing — crawlers will show bare domain instead of brand name');
  }
  if (!og.locale) {
    notes.push('og:locale missing — Facebook defaults to en_US');
  }
  if (og.type === 'article') {
    if (!og['article:published_time']) {
      warnings.push('og:type is "article" but article:published_time is missing');
    }
    if (!og['article:author']) {
      notes.push('og:type is "article" but article:author is missing');
    }
  }

  // ── 5. Duplicate OG tags ────────────────────────

  const ogCounts = {};;
  for (const item of all) {
    if (item.property && item.property.startsWith('og:')) {
      const key = item.property;
      ogCounts[key] = (ogCounts[key] || 0) + 1;
    }
  }
  for (const [key, count] of Object.entries(ogCounts)) {
    if (count > 1) {
      warnings.push(`Duplicate OG tag "${key}" found ${count}× — possible SEO plugin conflict`);
    }
    // Prevent explosion of duplicate warnings
    if (warnings.length > 20) break;
  }

  return { warnings, flags, notes };
}

/**
 * Async check: does a HEAD request on og:image to verify reachability,
 * size, and format. Returns warnings/notes to merge into the report.
 */
export async function validateOgImage(ogImage) {
  const warnings = [];
  const notes = [];
  if (!ogImage || !isAbsoluteUrl(ogImage)) return { warnings, notes };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(ogImage, { method: 'HEAD', signal: controller.signal, redirect: 'follow' });
    clearTimeout(timeout);

    if (!res.ok) {
      warnings.push(`og:image returned HTTP ${res.status} — crawlers may fail to fetch it`);
      return { warnings, notes };
    }

    const type = (res.headers.get('content-type') || '').toLowerCase();
    const len = res.headers.get('content-length');

    if (type && !type.startsWith('image/')) {
      warnings.push(`og:image Content-Type is "${type}" — expected an image`);
    }
    if (type && type.includes('webp')) {
      notes.push('og:image is WebP — older crawlers may not support it; provide a jpg/png fallback');
    }

    // Heuristic: URL patterns that suggest tiny icons
    const low = ogImage.toLowerCase();
    if (/icon|favicon|apple|touch|precomposed|mask-icon|\d{1,3}x\d{1,3}|[-_]\d{2,4}[-_.]/.test(low.split('?')[0].split('#')[0])) {
      warnings.push('og:image URL contains icon/favicon/apple-touch/small-size pattern — likely too small for social previews');
      return { warnings, notes };
    }

    if (len) {
      const bytes = parseInt(len, 10);
      const mb = bytes / (1024 * 1024);
      if (mb > 8) {
        warnings.push(`og:image is ${mb.toFixed(1)}MB — exceeds Facebook's 8MB limit`);
      } else if (mb > 1) {
        notes.push(`og:image is ${mb.toFixed(1)}MB — large files slow down preview generation`);
      }
    }

    // If possible, try to read a small chunk to get image dimensions
    // (Requires a GET with Range header — skipped for performance)
  } catch (e) {
    if (e.name === 'AbortError') {
      warnings.push('og:image HEAD request timed out — image may be unreachable');
    } else {
      warnings.push(`og:image fetch failed: ${e.message}`);
    }
  }

  return { warnings, notes };
}
