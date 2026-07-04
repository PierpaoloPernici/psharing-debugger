import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import * as cheerio from 'cheerio';
import { parseJsonLd } from './jsonld.mjs';

const USER_AGENT = 'Mozilla/5.0 (compatible; SharingDebugger/1.0; +https://github.com/pier/share)';

function fetchUrl(url, ua = USER_AGENT, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const doFetch = (currentUrl, redirectsLeft) => {
      const parsedUrl = new URL(currentUrl);
      const { hostname, port, pathname, search } = parsedUrl;
      const path = `${pathname || '/'}${search || ''}`;
      const isHttps = currentUrl.startsWith('https');
      const mod = isHttps ? httpsRequest : httpRequest;

      const opts = {
        hostname,
        port: port || (isHttps ? 443 : 80),
        path,
        method: 'GET',
        headers: {
          'User-Agent': ua,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 15000,
        rejectUnauthorized: process.env.NODE_ENV === 'production',
      };

      const req = mod(opts, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && redirectsLeft > 0) {
          const location = res.headers.location;
          if (!location) {
            reject(new Error(`Redirect without Location header`));
            return;
          }
          const nextUrl = location.startsWith('http') ? location : new URL(location, currentUrl).href;
          doFetch(nextUrl, redirectsLeft - 1);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks);
          const contentType = res.headers['content-type'] || '';
          resolve({
            body: body.toString('utf8'),
            contentType,
            finalUrl: currentUrl,
          });
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.end();
    };

    doFetch(url, maxRedirects);
  });
}

export async function scrape(url, ua) {
  const { body, finalUrl } = await fetchUrl(url, ua);
  return { ...parseHtml(body, finalUrl), jsRender: false };
}

export function parseHtml(html, pageUrl) {
  const $ = cheerio.load(html);

  const all = [];
  const og = {};
  const twitter = {};
  const general = {};
  const { blocks: jsonld, warnings: jldWarnings } = parseJsonLd($);

  $('meta').each((_, el) => {
    const property = $(el).attr('property') || $(el).attr('name') || $(el).attr('itemprop') || '';
    const content = $(el).attr('content') || '';
    const itemprop = $(el).attr('itemprop') || '';

    if (!property && !itemprop) return;
    const key = property || itemprop;

    all.push({ property: key, content });

    if (key.startsWith('og:')) {
      og[key.slice(3)] = content;
    } else if (key.startsWith('twitter:')) {
      twitter[key.slice(8)] = content;
    } else if (key === 'description') {
      general.description = content;
    } else if (itemprop && !property) {
      all[all.length - 1].type = 'microdata';
    }
  });

  const titleEl = $('title').first();
  general.title = titleEl.text().trim() || '';

  const canonical = $('link[rel="canonical"]').attr('href');
  if (canonical) general.canonical = canonical;

  const favicon = $('link[rel="icon"]').attr('href') || $('link[rel="shortcut icon"]').attr('href');
  if (favicon) {
    try {
      general.favicon = new URL(favicon, pageUrl).href;
    } catch { }
  }

  if (og.title == null) og.title = general.title;

  return {
    meta: { og, twitter, general, jsonld, jldWarnings, all },
    finalUrl: pageUrl,
  };
}
