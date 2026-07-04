export function buildPreviews(meta) {
  const { og, twitter, general } = meta;

  const title = og.title || twitter.title || general.title || '';
  const description = og.description || twitter.description || general.description || '';
  const image = og.image || twitter.image || '';
  const siteName = og.site_name || '';
  const url = og.url || general.canonical || '';
  const imageW = parseInt(og['image:width'], 10) || 0;
  const imageH = parseInt(og['image:height'], 10) || 0;
  const domain = url ? new URL(url).hostname : '';

  const warnings = [];
  const flags = {};

  if (!og.title && !twitter.title) {
    warnings.push('Nessun og:title o twitter:title definito.');
  } else if (!og.title) {
    warnings.push('og:title mancante — Twitter/X usa un fallback.');
    flags.fallbackOgTitle = true;
  } else if (general.title && og.title !== general.title) {
    flags.titleMismatch = true;
  }

  if (!og.description && !twitter.description) {
    warnings.push('Nessuna descrizione (og:description / twitter:description / meta description).');
  }

  if (!og.image && !twitter.image) {
    warnings.push('Nessuna immagine (og:image / twitter:image).');
  } else if (imageW > 0 || imageH > 0) {
    if (imageW < 200) warnings.push(`og:image troppo stretta (${imageW}px). Minimo 200px.`);
    if (imageH < 200) warnings.push(`og:image troppo bassa (${imageH}px). Minimo 200px.`);
    if (imageW < 600) warnings.push(`Per risultati ottimali, og:image dovrebbe essere ≥ 600px di larghezza.`);
  }

  if (!og.image && twitter.image) {
    warnings.push('twitter:image presente ma og:image mancante — Facebook/LinkedIn useranno solo og:image.');
  }

  if (!twitter.card) {
    flags.missingTwitterCard = true;
  }

  if (!twitter.image && og.image) {
    flags.twitterFallsBackToOg = true;
  }

  const previews = {
    facebook: {
      title,
      description: description || 'Nessuna descrizione',
      image,
      siteName: siteName || domain,
      url: url,
    },
    twitter: {
      card: twitter.card || 'summary_large_image',
      title,
      description: description || 'Nessuna descrizione',
      image,
      site: twitter.site || domain,
    },
    linkedin: {
      title,
      description: description || 'Nessuna descrizione',
      image,
      siteName: siteName || domain,
      url: url,
    },
  };

  return { previews, warnings, flags };
}
