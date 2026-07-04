export function buildPreviews(meta) {
  const { og, twitter, general } = meta;

  const title = og.title || twitter.title || general.title || '';
  const description = og.description || twitter.description || general.description || '';
  const image = og.image || twitter.image || '';
  const siteName = og.site_name || '';
  const url = og.url || general.canonical || '';
  const domain = url ? new URL(url).hostname : '';

  return {
    previews: {
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
    },
  };
}
