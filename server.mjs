import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { scrape } from './src/scraper.mjs';
import { scrapeWithBrowser } from './src/puppeteer.mjs';
import { buildPreviews } from './src/previews.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3333;
const HOST = process.env.HOST || '127.0.0.1';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/debug', async (req, res) => {
  const { url, jsRender = false } = req.body || {};

  if (!url) {
    return res.status(400).json({ error: 'URL richiesta' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    if (!parsedUrl.protocol.startsWith('http')) throw new Error();
  } catch {
    return res.status(400).json({ error: 'URL non valida. Inserisci un indirizzo completo (es. https://example.com)' });
  }

  try {
    const result = jsRender
      ? await scrapeWithBrowser(parsedUrl.href)
      : await scrape(parsedUrl.href);

    const { previews, warnings } = buildPreviews(result.meta);

    res.json({
      url: result.finalUrl,
      meta: result.meta,
      previews,
      warnings,
      jsRender: result.jsRender,
      screenshotUrl: result.screenshotUrl || null,
    });
  } catch (err) {
    res.status(502).json({ error: `Errore nel recupero della pagina: ${err.message}` });
  }
});

app.listen(PORT, HOST, () => {
  const address = `http://${HOST}:${PORT}`;
  console.log(`\n  pCube Sharing Debugger — ${address}\n`);

  if (HOST === '127.0.0.1') {
    import('open').then(({ default: open }) => {
      open(address).catch(() => {});
    }).catch(() => {});
  }
});
