export const Severity = Object.freeze({
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
});

export const Category = Object.freeze({
  GENERAL: 'GENERAL',
  OG: 'OG',
  TWITTER: 'TWITTER',
  JSONLD: 'JSONLD',
});

export function sortFindings(findings) {
  const order = { error: 0, warning: 1, info: 2 };
  return [...findings].sort((a, b) => order[a.severity] - order[b.severity]);
}
