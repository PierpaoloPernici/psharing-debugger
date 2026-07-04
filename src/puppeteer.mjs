import { parseHtml } from './scraper.mjs';

let puppeteer;
let browser;

async function getBrowser() {
  if (browser) return browser;

  if (!puppeteer) {
    try {
      puppeteer = (await import('puppeteer')).default;
    } catch {
      throw new Error(
        'Puppeteer non è installato. Esegui "npm install puppeteer" per abilitare il rendering JS.'
      );
    }
  }

  browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  return browser;
}

export async function scrapeWithBrowser(url) {
  const b = await getBrowser();

  const page = await b.newPage();
  try {
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
    await page.close();
  }
}

export async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}
