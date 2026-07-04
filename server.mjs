import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { scrape } from './src/scraper.mjs';
import { scrapeWithBrowser, closeBrowser } from './src/puppeteer.mjs';
import { buildPreviews } from './src/previews.mjs';
import { validateOpenGraph, validateOgImage, validateFavicon } from './src/opengraph.mjs';
import { sortFindings } from './src/findings.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3333;
const HOST = process.env.HOST || '127.0.0.1';

// --- Request logger ---
const logDir = path.join(__dirname, 'logs');
const logFile = path.join(logDir, 'requests.log');

// Ensure logs directory exists (fail silently if already there)
try { fs.mkdirSync(logDir, { recursive: true }); } catch {}

function getClientIp(req) {
  // Cloudflare
  const cf = req.headers['cf-connecting-ip'];
  if (cf) return cf;
  // Proxy standard (X-Forwarded-For prende il primo IP della catena)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  // X-Real-IP (Nginx, HAProxy, altri proxy)
  const realIp = req.headers['x-real-ip'];
  if (realIp) return realIp;
  // Fallback a connessione diretta
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function logRequest(req, res, next) {
  const start = Date.now();
  const clientIp = getClientIp(req);
  res.on('finish', () => {
    const duration = Date.now() - start;
    const line = `[${new Date().toISOString()}] ${clientIp} ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms\n`;
    fs.appendFile(logFile, line, (err) => {
      if (err) console.error('Errore scrittura log:', err.message);
    });
  });
  next();
}

app.use(logRequest);
// ---

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/debug', async (req, res) => {
  const { url, jsRender = false, enableJsonLd = false } = req.body || {};

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
    let result;
    if (jsRender) {
      result = await scrapeWithBrowser(parsedUrl.href, enableJsonLd);
    } else {
      try {
        result = await scrape(parsedUrl.href, undefined, enableJsonLd);
      } catch (err) {
        if (err.httpStatus && err.httpStatus >= 400 && err.httpStatus < 500) {
          result = await scrapeWithBrowser(parsedUrl.href, enableJsonLd);
        } else {
          throw err;
        }
      }
    }

    const { previews } = buildPreviews(result.meta);
    const og = validateOpenGraph(result.meta);
    const ogImg = await validateOgImage(result.meta.og.image);
    const fav = await validateFavicon(result.meta.general.favicon);

    const findings = sortFindings([
      ...og.findings,
      ...ogImg.findings,
      ...fav.findings,
      ...(result.meta.jldFindings || []),
    ]);

    res.json({
      url: result.finalUrl,
      meta: result.meta,
      previews,
      findings,
      jsRender: result.jsRender,
      screenshotUrl: result.screenshotUrl || null,
    });
  } catch (err) {
    res.status(502).json({ error: `Errore nel recupero della pagina: ${err.message}` });
  }
});

process.on('SIGINT', async () => { await closeBrowser(); process.exit(0); });
process.on('SIGTERM', async () => { await closeBrowser(); process.exit(0); });

app.listen(PORT, HOST, () => {
  const address = `http://${HOST}:${PORT}`;
  console.log(`\n  pCube Sharing Debugger — ${address}\n`);

  if (HOST === '127.0.0.1') {
    import('open').then(({ default: open }) => {
      open(address).catch(() => {});
    }).catch(() => {});
  }
});
