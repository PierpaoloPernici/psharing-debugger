# TODO — pCube Sharing Debugger

## Risolti

- [x] `rejectUnauthorized` condizionale (src/scraper.mjs) — `true` in produzione, `false` in dev
- [x] Puppeteer riutilizza un'unica istanza browser (src/puppeteer.mjs) — `getBrowser()` + `closeBrowser()` allo shutdown
- [x] `npm run dev` usa `concurrently` — signal handling pulito per `Ctrl+C`
- [x] `public/style.css` generato e ignorato da `.gitignore`
