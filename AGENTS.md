# AGENTS.md — pCube Sharing Debugger

Strumento locale per vedere come un URL appare quando condiviso su social network (Facebook, Twitter/X, LinkedIn). Estrae og:*, twitter:*, JSON-LD, e genera anteprime CSS realistiche.

## Comandi

- `npm start` — build CSS + avvia il server su `http://127.0.0.1:3333` e apre il browser
- `npm run dev` — server con `--watch` + watcher Tailwind in parallelo; CSS ricompilato automaticamente
- `npm run build:css` — ricompila Tailwind (utile dopo modifiche a `src/input.css`)
- Porta personalizzabile con `PORT=4444 npm start`
- Il server ascolta solo su `127.0.0.1` (nessuna esposizione esterna)

## API

- `POST /api/debug` — body: `{ "url": "...", "jsRender": true }`
  - `jsRender: true` usa Puppeteer (headless Chromium) per SPA/React/Vue
  - `jsRender: false` (default) fetch HTTP diretto + cheerio (veloce)

## Architettura

- `server.mjs` — entrypoint Express
- `src/scraper.mjs` — fetch HTTP nativo (nessuna dipendenza extra per il fetch) + parsing cheerio
- `src/puppeteer.mjs` — wrapper opzionale per headless Chrome
- `src/previews.mjs` — costruisce dati preview + warning
- `src/input.css` — sorgente Tailwind v4 (`public/style.css` è generato da questo)
- `public/` — frontend vanilla HTML/CSS/JS (nessun framework frontend)

## Dipendenze notevoli

- `puppeteer` scarica Chromium (~300 MB) al primo `npm install`. Se non serve, rimuoverlo da package.json; JS rendering darà errore con messaggio chiaro
- `open` — apre automaticamente il browser all'avvio del server
- `cheerio` — parsing HTML lato server
- `@tailwindcss/cli` (devDep) — compila `src/input.css` → `public/style.css`

## Warning preventivi

- L'immagine `og:image` di default deve essere ≥ 200×200 px; per risultati ottimali ≥ 600 px di larghezza
- `og:image` è l'unico tag immagine che Facebook/LinkedIn usano; `twitter:image` è solo per Twitter/X
- Se `og:title` manca, il fallback è il `<title>` HTML

