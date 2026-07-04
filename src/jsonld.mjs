/**
 * JSON-LD extraction and validation.
 * Accepts a cheerio instance ($) and returns structured, typed, validated blocks.
 */

const REQUIRED = {
  WebSite: ['url'],
  Organization: ['name'],
  LocalBusiness: ['name'],
  Corporation: ['name'],
  Person: ['name'],
  Product: ['name'],
  Article: ['headline'],
  NewsArticle: ['headline'],
  BlogPosting: ['headline'],
  BreadcrumbList: ['itemListElement'],
  FAQPage: ['mainEntity'],
  Event: ['startDate'],
  Recipe: ['name'],
  VideoObject: ['name', 'thumbnailUrl'],
};

const SCHEMA_CONTEXTS = [
  'https://schema.org',
  'http://schema.org',
  'https://schema.org/',
  'http://schema.org/',
];

const DEPRECATED_TYPES = ['DataCatalog', 'DataDownload'];

function isAbsoluteUrl(s) {
  if (!s || typeof s !== 'string') return false;
  return /^https?:\/\//i.test(s);
}

function isISO8601(s) {
  if (!s || typeof s !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})/.test(s);
}

function isValidContext(ctx) {
  if (!ctx) return false;
  if (typeof ctx === 'string') {
    return SCHEMA_CONTEXTS.some((base) => ctx.startsWith(base));
  }
  if (Array.isArray(ctx)) {
    return ctx.some((c) => typeof c === 'string' && SCHEMA_CONTEXTS.some((base) => c.startsWith(base)));
  }
  if (typeof ctx === 'object') {
    return Object.values(ctx).some((v) => typeof v === 'string' && SCHEMA_CONTEXTS.some((base) => v.startsWith(base)));
  }
  return false;
}

function validateContext(data, parentContext) {
  const ctx = data['@context'] || parentContext;
  const valid = isValidContext(ctx);
  return { valid, context: ctx || null };
}

function validateRequired(type, data) {
  const warnings = [];
  if (!type) return warnings;
  const req = REQUIRED[type];
  if (!req) return warnings;
  for (const field of req) {
    if (data[field] == null || data[field] === '') {
      warnings.push(`${type}: missing required field "${field}"`);
    }
  }
  return warnings;
}

// ── Semantic validators ───────────────────────────

function validateUrls(data, type, warnings) {
  const urlFields = ['url', 'sameAs', 'image', 'thumbnailUrl', 'item'];
  for (const field of urlFields) {
    const val = data[field];
    if (!val) continue;
    if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) {
        if (typeof val[i] === 'string' && !isAbsoluteUrl(val[i])) {
          warnings.push(`${type}: ${field}[${i}] is not an absolute URL`);
        }
      }
    } else if (typeof val === 'string' && !isAbsoluteUrl(val)) {
      warnings.push(`${type}: ${field} is not an absolute URL`);
    } else if (typeof val === 'object' && val['@type'] === 'ImageObject' && val.url && typeof val.url === 'string' && !isAbsoluteUrl(val.url)) {
      warnings.push(`${type}: ${field}.url is not an absolute URL`);
    }
  }
  // Check nested objects with URLs
  scanNestedUrls(data, type, warnings);
}

function scanNestedUrls(obj, type, warnings, path = '') {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('@')) continue;
    if (typeof v === 'string' && (k === 'url' || k === 'sameAs' || k === 'image' || k === 'thumbnailUrl' || k === 'item')) {
      if (!isAbsoluteUrl(v)) {
        warnings.push(`${type}: ${path}${k} is not an absolute URL`);
      }
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      scanNestedUrls(v, type, warnings, path + k + '.');
    }
  }
}

function validateDates(data, type, warnings) {
  const dateFields = ['datePublished', 'dateModified', 'startDate', 'endDate', 'foundingDate'];
  for (const field of dateFields) {
    const val = data[field];
    if (val && typeof val === 'string' && !isISO8601(val)) {
      warnings.push(`${type}: ${field} is not ISO 8601 format`);
    }
  }
}

function validateOrganization(data, type, warnings) {
  const isOrg = type === 'Organization' || type === 'Corporation' ||
    type === 'LocalBusiness' || type.endsWith('Store') || type.endsWith('Restaurant');
  if (!isOrg) return;

  if (data.logo) {
    if (typeof data.logo === 'string' && !isAbsoluteUrl(data.logo)) {
      warnings.push(`${type}: logo must be an absolute URL`);
    } else if (typeof data.logo === 'object' && data.logo['@type'] === 'ImageObject') {
      if (!data.logo.width && !data.logo.height) {
        warnings.push(`${type}: logo ImageObject missing dimensions`);
      }
    }
  }

  if (type === 'LocalBusiness' || type.endsWith('Store') || type.endsWith('Restaurant')) {
    if (!data.address) {
      warnings.push(`${type}: missing address`);
    } else if (typeof data.address === 'string') {
      warnings.push(`${type}: address should be PostalAddress, not a plain string`);
    }
    if (!data.telephone) {
      warnings.push(`${type}: missing telephone`);
    }
  }
}

function validateBreadcrumb(data, type, warnings) {
  if (type !== 'BreadcrumbList') return;
  const items = data.itemListElement;
  if (!Array.isArray(items)) {
    warnings.push('BreadcrumbList: itemListElement must be an array');
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || item['@type'] !== 'ListItem') continue;
    const idx = i + 1;
    if (item.position != idx) {
      warnings.push(`BreadcrumbList[${i}]: position should be ${idx}, got ${item.position}`);
    }
    if (!item.name) {
      warnings.push(`BreadcrumbList[${i}]: missing name`);
    }
    const it = item.item;
    if (!it) {
      warnings.push(`BreadcrumbList[${i}]: missing item URL`);
    } else if (typeof it === 'string' && !isAbsoluteUrl(it)) {
      warnings.push(`BreadcrumbList[${i}]: item is not an absolute URL`);
    }
  }
}

function validateImage(data, type, warnings) {
  if (!data.image) return;
  const check = (img) => {
    if (typeof img === 'object' && img['@type'] === 'ImageObject') {
      const w = parseInt(img.width, 10);
      const h = parseInt(img.height, 10);
      if (w && w < 696) warnings.push(`${type}: image width ${w}px — min 696px recommended`);
      if (h && h < 300) warnings.push(`${type}: image height ${h}px — min 300px recommended`);
    }
  };
  if (Array.isArray(data.image)) {
    data.image.forEach(check);
  } else {
    check(data.image);
  }
}

function validateDeprecated(data, warnings) {
  const types = data['@type'];
  const all = Array.isArray(types) ? types : (types ? [types] : []);
  for (const t of all) {
    if (DEPRECATED_TYPES.includes(t)) {
      warnings.push(`${t} is deprecated — no longer eligible for rich results`);
    }
  }
}

// ── Block builder ────────────────────────────────

function buildBlock(data, parentContext) {
  const types = data['@type'];
  const primaryType = Array.isArray(types) ? types[0] : (types || null);
  const { valid: ctxValid, context } = validateContext(data, parentContext);
  const warnings = validateRequired(primaryType, data);

  let status = 'ok';
  if (!primaryType) {
    status = 'no_type';
    warnings.push('Missing @type — block will be ignored by Google');
  } else if (!ctxValid && context) {
    status = 'unknown_context';
    warnings.push(`Unknown @context: ${context}`);
  }

  if (status === 'ok') {
    validateUrls(data, primaryType, warnings);
    validateDates(data, primaryType, warnings);
    validateOrganization(data, primaryType, warnings);
    validateBreadcrumb(data, primaryType, warnings);
    validateImage(data, primaryType, warnings);
    validateDeprecated(data, warnings);
  }

  const clean = {};
  for (const [k, v] of Object.entries(data)) {
    clean[k] = v;
  }

  return {
    type: primaryType,
    typeAll: Array.isArray(types) ? types : [types].filter(Boolean),
    status,
    context,
    contextValid: ctxValid,
    warnings,
    data: clean,
  };
}

// ── Extraction ────────────────────────────────────

export function parseJsonLd($) {
  const blocks = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = ($(el).text() || '').trim();

    if (!raw) {
      blocks.push({
        type: null, typeAll: [], status: 'empty',
        context: null, contextValid: false,
        warnings: ['Empty JSON-LD block'], data: { _raw: '' },
      });
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      const flattened = flattenGraph(parsed);
      blocks.push(...flattened);
    } catch (e) {
      blocks.push({
        type: null, typeAll: [], status: 'parse_error',
        context: null, contextValid: false,
        warnings: [`Parse error: ${e.message}`], data: { _raw: raw.slice(0, 300) },
      });
    }
  });

  // Post-processing: detect duplicate @type across blocks
  const typeCount = {};
  for (const b of blocks) {
    if (b.type) {
      typeCount[b.type] = (typeCount[b.type] || 0) + 1;
    }
  }
  for (const [t, c] of Object.entries(typeCount)) {
    if (c > 1) {
      const first = blocks.find((b) => b.type === t);
      if (first) {
        first.warnings.push(`Duplicate @type "${t}": ${c}× — possible plugin conflict`);
      }
    }
  }

  // Collect all block warnings into a flat array
  const warnings = [];
  for (const b of blocks) {
    for (const w of b.warnings) {
      const prefix = b.type ? `[JSON-LD ${b.type}] ` : '[JSON-LD] ';
      warnings.push(prefix + w);
    }
  }

  return { blocks, warnings };
}

function flattenGraph(data) {
  const graph = data['@graph'];
  if (Array.isArray(graph)) {
    return graph.map((item) => {
      const ctx = item['@context'] || data['@context'] || null;
      return buildBlock(item, ctx);
    });
  }
  return [buildBlock(data, null)];
}
