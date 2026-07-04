# TODO — pCube Sharing Debugger

## Risolti

- [x] `rejectUnauthorized` condizionale (src/scraper.mjs) — `true` in produzione, `false` in dev
- [x] Puppeteer riutilizza un'unica istanza browser (src/puppeteer.mjs) — `getBrowser()` + `closeBrowser()` allo shutdown
- [x] `npm run dev` usa `concurrently` — signal handling pulito per `Ctrl+C`
- [x] `public/style.css` generato e ignorato da `.gitignore`
- [x] UI: layout card Facebook (spazio bianco) + differenziazione Twitter/LinkedIn
- [x] UI: palette header (gradiente minimale coerente col tema)
- [x] UI: badge modalità analisi (HTML statico / JS rendered)
- [x] UI: warning + flag badge per discrepanze metadata
- [x] UI: raggruppamento warning (collassabile se > 3)
- [x] UI: troncamento URL in tabella + tasto copia
- [x] UI: tasto "Report" (copia Markdown in clipboard)
- [x] UI: rimozione barra blu LinkedIn
- [x] Cookie banner dismiss in Puppeteer
- [x] User-agent browser reale per Puppeteer
- [x] Page load: `domcontentloaded` + delay instead of `networkidle2`
- [x] Findings pipeline: severity taxonomy (error/warning/info), unified `findings[]` in API response
- [x] OG: modulo dedicato (src/opengraph.mjs) con validazione tag obbligatori, immagine, coerenza
- [x] OG: image HEAD request (reachability, size, content-type) + icon/favicon heuristic
- [x] OG: og:url vs canonical cross-check
- [x] Twitter findings (TWITTER_CARD_MISSING, TWITTER_IMAGE_MISSING, TWITTER_TITLE_MISSING)
- [x] JSON-LD: modulo dedicato (src/jsonld.mjs) con validazione tipi, URL, date, BreadcrumbList
- [x] JSON-LD: flatten `@graph`, detection duplicati, tipi deprecati, organizzazione, immagini
- [x] JSON-LD: all findings in joint pipeline, no inline warnings in blocks
- [x] Report: unified findings section (ERROR→WARNING→INFO), structured JSON-LD key listing
