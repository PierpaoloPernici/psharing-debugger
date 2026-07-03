import { parseHtml } from './scraper.mjs';

let puppeteer;

export async function scrapeWithBrowser(url) {
  if (!puppeteer) {
    try {
      puppeteer = (await import('puppeteer')).default;
    } catch {
      throw new Error(
        'Puppeteer non è installato. Esegui "npm install puppeteer" per abilitare il rendering JS.'
      );
    }
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (compatible; SharingDebugger/1.0; +https://github.com/pier/share)'
    );

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.setViewport({ width: 1200, height: 630 });

    const screenshot = await page.screenshot({ type: 'jpeg', quality: 70 });
    const screenshotUrl = `data:image/jpeg;base64,${screenshot.toString('base64')}`;

    const html = await page.content();
    const finalUrl = page.url();

    return { ...parseHtml(html, finalUrl), jsRender: true, screenshotUrl };
  } finally {
    await browser.close();
  }
}
