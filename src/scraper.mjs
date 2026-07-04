import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import * as zlib from 'node:zlib';
import * as cheerio from 'cheerio';
import { parseJsonLd } from './jsonld.mjs';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

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
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,it;q=0.8',
          'Accept-Encoding': 'gzip, deflate',
          'Upgrade-Insecure-Requests': '1',
          'Cache-Control': 'max-age=0',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          Connection: 'keep-alive',
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
          reject(Object.assign(new Error(`HTTP ${res.statusCode}`), { httpStatus: res.statusCode }));
          return;
        }

        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          let body = Buffer.concat(chunks);
          const encoding = res.headers['content-encoding'];
          if (encoding === 'gzip') {
            body = zlib.gunzipSync(body);
          } else if (encoding === 'deflate') {
            body = zlib.inflateSync(body);
          }
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

export async function scrape(url, ua, enableJsonLd = false) {
  const { body, finalUrl } = await fetchUrl(url, ua);
  return { ...parseHtml(body, finalUrl, enableJsonLd), jsRender: false };
}

export function parseHtml(html, pageUrl, enableJsonLd = false) {
  const $ = cheerio.load(html);

  const all = [];
  const og = {};
  const twitter = {};
  const general = {};
  const { blocks: jsonld, findings: jldFindings } = enableJsonLd ? parseJsonLd($) : { blocks: [], findings: [] };

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
    meta: { og, twitter, general, jsonld, jldFindings, all },
    finalUrl: pageUrl,
  };
}
