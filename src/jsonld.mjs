import { Severity, Category } from './findings.mjs';

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
  'https://schema.org', 'http://schema.org',
  'https://schema.org/', 'http://schema.org/',
];

const DEPRECATED_TYPES = ['DataCatalog', 'DataDownload'];

function isAbsoluteUrl(s) { return /^https?:\/\//i.test(String(s || '')); }
function isISO8601(s) { return /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})/.test(String(s || '')); }

function isValidContext(ctx) {
  if (!ctx) return false;
  if (typeof ctx === 'string') return SCHEMA_CONTEXTS.some((b) => ctx.startsWith(b));
  if (Array.isArray(ctx)) return ctx.some((c) => typeof c === 'string' && SCHEMA_CONTEXTS.some((b) => c.startsWith(b)));
  if (typeof ctx === 'object') return Object.values(ctx).some((v) => typeof v === 'string' && SCHEMA_CONTEXTS.some((b) => v.startsWith(b)));
  return false;
}

// ── Finding helpers ────────────────

const ERR = (code, msg, field) => ({ severity: Severity.ERROR, category: Category.JSONLD, code, message: msg, field });
const WARN = (code, msg, field) => ({ severity: Severity.WARNING, category: Category.JSONLD, code, message: msg, field });
const INFO = (code, msg, field) => ({ severity: Severity.INFO, category: Category.JSONLD, code, message: msg, field });
const jpfx = (type, sub) => sub ? `ld+json:${type}.${sub}` : `ld+json:${type}`;

// ── Semantic validators ────────────

function validateUrls(data, type, findings) {
  const urlFields = ['url', 'sameAs', 'image', 'thumbnailUrl', 'item'];
  for (const field of urlFields) {
    const val = data[field];
    if (!val) continue;
    const doCheck = (v, i) => {
      if (typeof v === 'string' && !isAbsoluteUrl(v)) {
        const pfx = i != null ? `${field}[${i}]` : field;
        findings.push(WARN('JSONLD_URL_RELATIVE', `${type}: ${pfx} non è un URL assoluto`, jpfx(type, pfx)));
      }
    };
    if (Array.isArray(val)) val.forEach((v, i) => doCheck(v, i));
    else doCheck(val);
  }
  scanNestedUrls(data, type, findings, '');
}

function scanNestedUrls(obj, type, findings, path) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('@')) continue;
    if (typeof v === 'string' && ['url','sameAs','image','thumbnailUrl','item'].includes(k)) {
      if (!isAbsoluteUrl(v))
        findings.push(WARN('JSONLD_URL_RELATIVE', `${type}: ${path}${k} non è un URL assoluto`, jpfx(type, path + k)));
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      scanNestedUrls(v, type, findings, path + k + '.');
    }
  }
}

function validateDates(data, type, findings) {
  for (const field of ['datePublished','dateModified','startDate','endDate','foundingDate']) {
    const v = data[field];
    if (v && typeof v === 'string' && !isISO8601(v))
      findings.push(INFO('JSONLD_DATE_NOT_ISO8601', `${type}: ${field} non in formato ISO 8601`, jpfx(type, field)));
  }
}

function validateOrganization(data, type, findings) {
  const isOrg = ['Organization','Corporation','LocalBusiness'].includes(type) ||
    type.endsWith('Store') || type.endsWith('Restaurant');
  if (!isOrg) return;
  if (data.logo && typeof data.logo === 'object' && data.logo['@type'] === 'ImageObject') {
    if (!data.logo.width && !data.logo.height)
      findings.push(INFO('JSONLD_REQUIRED_FIELD_MISSING', `${type}: logo ImageObject senza dimensioni dichiarate`, jpfx(type, 'logo')));
  }
  if (['LocalBusiness','Store','Restaurant'].some(s => type.endsWith(s))) {
    if (!data.address)
      findings.push(WARN('JSONLD_REQUIRED_FIELD_MISSING', `${type}: address assente`, jpfx(type, 'address')));
    else if (typeof data.address === 'string')
      findings.push(INFO('JSONLD_REQUIRED_FIELD_MISSING', `${type}: address dovrebbe essere un PostalAddress, non una stringa`, jpfx(type, 'address')));
    if (!data.telephone)
      findings.push(INFO('JSONLD_REQUIRED_FIELD_MISSING', `${type}: telephone assente`, jpfx(type, 'telephone')));
  }
}

function validateBreadcrumb(data, type, findings) {
  if (type !== 'BreadcrumbList') return;
  const items = data.itemListElement;
  if (!Array.isArray(items)) {
    findings.push(WARN('JSONLD_BREADCRUMB_ITEM_INCOMPLETE', 'BreadcrumbList: itemListElement non è un array', jpfx(type, 'itemListElement')));
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || item['@type'] !== 'ListItem') continue;
    if (item.position != i + 1)
      findings.push(WARN('JSONLD_BREADCRUMB_ITEM_INCOMPLETE', `BreadcrumbList[${i}]: position dovrebbe essere ${i + 1}`, jpfx(type, `itemListElement[${i}].position`)));
    if (!item.name)
      findings.push(WARN('JSONLD_BREADCRUMB_ITEM_INCOMPLETE', `BreadcrumbList[${i}]: name assente`, jpfx(type, `itemListElement[${i}].name`)));
    const it = item.item;
    if (!it)
      findings.push(WARN('JSONLD_BREADCRUMB_ITEM_INCOMPLETE', `BreadcrumbList[${i}]: item URL assente`, jpfx(type, `itemListElement[${i}].item`)));
    else if (typeof it === 'string' && !isAbsoluteUrl(it))
      findings.push(WARN('JSONLD_URL_RELATIVE', `BreadcrumbList[${i}]: item non è un URL assoluto`, jpfx(type, `itemListElement[${i}].item`)));
  }
}

function validateImage(data, type, findings) {
  if (!data.image) return;
  const check = (img) => {
    if (typeof img === 'object' && img['@type'] === 'ImageObject') {
      const w = parseInt(img.width, 10), h = parseInt(img.height, 10);
      if (w && w < 696) findings.push(INFO('JSONLD_DEPRECATED_TYPE', `${type}: image larghezza ${w}px — almeno 696px raccomandati per rich results`, jpfx(type, 'image')));
      if (h && h < 300) findings.push(INFO('JSONLD_DEPRECATED_TYPE', `${type}: image altezza ${h}px — almeno 300px raccomandati per rich results`, jpfx(type, 'image')));
    }
  };
  (Array.isArray(data.image) ? data.image : [data.image]).forEach(check);
}

function validateDeprecated(data, findings) {
  const types = Array.isArray(data['@type']) ? data['@type'] : [data['@type']];
  for (const t of types) {
    if (DEPRECATED_TYPES.includes(t))
      findings.push(INFO('JSONLD_DEPRECATED_TYPE', `${t} è deprecato — non più eleggibile per rich results`));
  }
}

// ── Block builder ──────────────────

function buildBlock(data) {
  const types = data['@type'];
  const primaryType = Array.isArray(types) ? types[0] : (types || null);
  const ctx = data['@context'] || null;
  const ctxValid = Boolean(ctx && isValidContext(ctx));
  const localFindings = [];

  let status = 'ok';

  if (!primaryType) {
    status = 'no_type';
    localFindings.push(ERR('JSONLD_TYPE_MISSING', 'Blocco JSON-LD senza @type — sarà ignorato da Google', 'ld+json'));
  } else if (!ctxValid && ctx) {
    status = 'unknown_context';
    localFindings.push(WARN('JSONLD_CONTEXT_NOT_SCHEMAORG', `${primaryType}: @context="${ctx}" non riconducibile a schema.org`, `ld+json`));
  } else if (ctx && typeof ctx === 'string' && /^http:\/\/schema\.org/i.test(ctx)) {
    localFindings.push(WARN('JSONLD_CONTEXT_NOT_SCHEMAORG', `${primaryType}: @context usa http://schema.org invece di https://schema.org — normalizzare a https`, `ld+json`));
  }

  if (status === 'ok' && primaryType) {
    const req = REQUIRED[primaryType];
    if (req) {
      for (const field of req) {
        if (data[field] == null || data[field] === '')
          localFindings.push(ERR('JSONLD_REQUIRED_FIELD_MISSING', `${primaryType}: campo obbligatorio "${field}" assente`, jpfx(primaryType, field)));
      }
    } else {
      localFindings.push(INFO('JSONLD_TYPE_UNRECOGNIZED', `${primaryType}: tipo non mappato dal validatore (nessuna validazione extra eseguita)`, `ld+json:${primaryType}`));
    }
    validateUrls(data, primaryType, localFindings);
    validateDates(data, primaryType, localFindings);
    validateOrganization(data, primaryType, localFindings);
    validateBreadcrumb(data, primaryType, localFindings);
    validateImage(data, primaryType, localFindings);
    validateDeprecated(data, localFindings);
  }

  const clean = {};
  for (const [k, v] of Object.entries(data)) clean[k] = v;

  return {
    type: primaryType,
    typeAll: Array.isArray(types) ? types : [types].filter(Boolean),
    status,
    context: ctx || null,
    contextValid: ctxValid,
    data: clean,
    localFindings,
  };
}

// ── Node normalizer ────────────────

/**
 * Parse a JSON-LD block into a flat list of leaf nodes.
 * Handles: single object, @graph wrapper, root-level arrays.
 */
function normalizeNodes(parsed, inheritedCtx = null) {
  if (Array.isArray(parsed)) {
    const result = [];
    for (const item of parsed) {
      result.push(...normalizeNodes(item, inheritedCtx));
    }
    return result;
  }
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed['@graph'])) {
    const graphCtx = parsed['@context'] || inheritedCtx;
    return parsed['@graph'].flatMap((child) => normalizeNodes(child, graphCtx));
  }
  if (parsed && typeof parsed === 'object') {
    if (inheritedCtx && !parsed['@context']) {
      parsed = { ...parsed, '@context': inheritedCtx };
    }
    return [parsed];
  }
  return [];
}

// ── Extraction ─────────────────────

export function parseJsonLd($) {
  const blocks = [];
  const findings = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = ($(el).text() || '').trim();
    const scriptIdx = blocks.length;
    if (!raw) {
      blocks.push({ type: null, typeAll: [], status: 'empty', context: null, contextValid: false, data: { _raw: '' } });
      findings.push(INFO('JSONLD_PARSE_ERROR', 'Blocco JSON-LD vuoto — presente ma senza contenuto', `script[${scriptIdx}]`));
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      const nodes = normalizeNodes(parsed);
      for (let ni = 0; ni < nodes.length; ni++) {
        const node = nodes[ni];
        const nodeIdx = nodes.length === 1 ? null : ni;
        const block = buildBlock(node);
        block._prefix = nodeIdx != null ? `ld+json[${scriptIdx}][${nodeIdx}]` : `ld+json[${scriptIdx}]`;
        blocks.push(block);
      }
    } catch (e) {
      blocks.push({ type: null, typeAll: [], status: 'parse_error', context: null, contextValid: false, data: { _raw: raw.slice(0, 300) } });
      findings.push(ERR('JSONLD_PARSE_ERROR', `Errore di parsing JSON: ${e.message}`, `script[${blocks.length}]`));
    }
  });

  // Emit block findings with indexed field paths
  for (const b of blocks) {
    for (const f of (b.localFindings || [])) {
      if (f.field) {
        f.field = f.field.replace(/^ld\+json[^ .]*/, b._prefix);
      }
      findings.push(f);
    }
    delete b.localFindings;
    delete b._prefix;
  }

  // Post-processing: detect duplicate @type with incompatible structure
  const byType = {};
  for (const b of blocks) {
    if (!b.type) continue;
    if (!byType[b.type]) byType[b.type] = [];
    byType[b.type].push(b);
  }
  for (const [t, instances] of Object.entries(byType)) {
    if (instances.length < 2) continue;
    // Check structural compatibility between first two instances
    const a = instances[0].data, bd = instances[1].data;
    const aKeys = Object.keys(a).filter(k => !k.startsWith('@')).sort().join(',');
    const bKeys = Object.keys(bd).filter(k => !k.startsWith('@')).sort().join(',');
    const details = aKeys !== bKeys ? ` (struttura diversa: keys differiscono)` : ` (dichiarato ${instances.length}×)`;
    findings.push(WARN('JSONLD_DUPLICATE_TYPE',
      `@type "${t}" presente ${instances.length}× in pagina${details} — possibile conflitto tra plugin/generatori`,
      `ld+json:${t}`));
  }

  // No JSON-LD at all
  if (!blocks.length) {
    findings.push(INFO('JSONLD_MISSING', 'Nessun blocco JSON-LD trovato in pagina — Google structured data non presente', 'script[type="application/ld+json"]'));
  }

  return { blocks, findings };
}
