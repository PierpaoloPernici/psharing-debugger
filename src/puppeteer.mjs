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

const COOKIE_HIDE_CSS = `
  #onetrust-banner-sdk, #onetrust-consentSdk, #truste-consent-track,
  #cookie-banner, #cookieBanner, #cookie-notice, #cookieConsent,
  #consent-banner, #consentBanner, #sp_message_container_,
  .cookie-banner, .cc-banner, .cc-window, .cookie-consent,
  .cookie-notice, .cookie-message, .cookie-bar, .cookies-bar,
  .gdpr-banner, .consent-banner, .qc-cmp2-container,
  [class*="cookie-banner" i], [class*="cookie-consent" i],
  [class*="cookie-notice" i], [class*="cc-banner" i],
  [class*="cc-window" i], [data-cookie-banner], [data-consent-banner]
  { display: none !important; }
  /* Unlock scroll that consent dialogs often lock */
  html, body { overflow: auto !important; position: static !important; }
`;

const ACCEPT_TEXTS = [
  'accept all', 'accept', 'agree', 'allow', 'got it', 'ok', 'i agree',
  'agree to all', 'allow all', 'accept & continue', 'continue',
  'accetta', 'accetta tutti', 'accetto', 'accetto tutti', 'ok accetto',
  'aceptar', 'aceptar todo', 'acepto', 'aceptar y continuar',
  'aceitar', 'aceitar todos', 'aceito', 'aceitar e continuar',
  'accepter', 'accepter tout', 'j\'accepte', 'accepter et continuer',
  'akzeptieren', 'alle akzeptieren', 'zustimmen', 'einverstanden',
  'godkänn', 'godkänn alla',
];

export async function scrapeWithBrowser(url) {
  const b = await getBrowser();

  const page = await b.newPage();
  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );

    // Inject CSS to hide known cookie banners as early as possible
    await page.evaluateOnNewDocument((css) => {
      const style = document.createElement('style');
      style.id = 'pcube-cookie-hide';
      style.textContent = css;
      (document.head || document.documentElement).appendChild(style);
      new MutationObserver(() => {
        if (!document.getElementById('pcube-cookie-hide')) {
          (document.head || document.documentElement).appendChild(style.cloneNode(true));
        }
      }).observe(document.documentElement, { childList: true, subtree: true });
    }, COOKIE_HIDE_CSS);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise((r) => setTimeout(r, 2500));
    await page.setViewport({ width: 1200, height: 630 });

    // Best-effort: click accept/reject buttons then strip any leftovers
    await dismissCookieBanners(page);
    await new Promise((r) => setTimeout(r, 600));

    const screenshot = await page.screenshot({ type: 'jpeg', quality: 70 });
    const screenshotUrl = `data:image/jpeg;base64,${screenshot.toString('base64')}`;

    const html = await page.content();
    const finalUrl = page.url();

    return { ...parseHtml(html, finalUrl), jsRender: true, screenshotUrl };
  } finally {
    await page.close();
  }
}

async function dismissCookieBanners(page) {
  await page.evaluate((acceptTexts) => {
    const lower = (s) => (s || '').toLowerCase().trim();

    // Click known consent manager buttons by ID first (safest)
    const knownIds = [
      '#onetrust-accept-btn-handler',
      '#onetrust-reject-all-handler',
      '#onetrust-pc-btn-handler',
      '#truste-consent-button',
      '#truste-consent-required',
      '#CybotCookiebotDialogBodyButtonAccept',
      '#CybotCookiebotDialogBodyButtonDecline',
      '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
      '#cookie_action_close_header',
      '#cookie_action_close_header_reject',
      '.cc-btn.cc-allow',
      '.cc-btn.cc-dismiss',
      '.cc-btn.cc-accept-all',
      '.cc-btn.cc-deny',
    ];
    for (const sel of knownIds) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) {
        try { el.click(); return; } catch {}
      }
    }

    // Then try matching button text — only <button>, never <a>
    const buttons = document.querySelectorAll(
      'button, [role="button"], .cc-btn, #onetrust-accept-btn-handler'
    );
    const skipWords = ['privacy', 'policy', 'informativa', 'cookie policy', 'cookie-policy', 'leg privacy'];
    for (const el of buttons) {
      if (el.offsetParent === null) continue;
      const txt = lower(el.textContent) || lower(el.getAttribute('aria-label')) || lower(el.title);
      if (!txt) continue;
      if (skipWords.some((w) => txt.includes(w))) continue;
      if (acceptTexts.some((t) => txt === t || (t.length > 3 && txt.includes(t)))) {
        try { el.click(); return; } catch {}
      }
    }

    // Fallback: hide banner elements
    const hideSelectors = [
      '#onetrust-banner-sdk', '#onetrust-consentSdk', '#truste-consent-track',
      '[id*="cookie-banner" i]', '[id*="cookieBanner" i]',
      '[id*="cookie-notice" i]', '[id*="cookieConsent" i]',
      '[id="consent-banner"]', '[id="consentBanner"]',
      '[id*="CybotCookiebotDialog" i]',
      '.cookie-banner', '.cc-banner', '.cc-window', '.cookie-consent',
      '.cookie-notice', '.gdpr-banner', '.consent-banner',
      '[class*="cookie-banner" i]', '[class*="cookie-consent" i]',
      '[class*="cc-banner" i]', '[class*="cc-window" i]',
      '[data-cookie-banner]', '[data-consent-banner]',
      '.qc-cmp2-container',
    ];
    for (const sel of hideSelectors) {
      document.querySelectorAll(sel).forEach((el) => el.style.display = 'none');
    }

    document.documentElement.style.overflow = '';
    document.body && (document.body.style.overflow = '');
  }, ACCEPT_TEXTS);
}

export async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}
