# AGENTS.md — pCube Sharing Debugger

Strumento locale per vedere come un URL appare quando condiviso su social network (Facebook, Twitter/X, LinkedIn). Estrae og:*, twitter:*, JSON-LD, e genera anteprime CSS realistiche.

## Comandi

- `npm start` — build CSS + avvia il server su `http://127.0.0.1:3333` e apre il browser
- `npm run dev` — server con `--watch` + watcher Tailwind in parallelo; CSS ricompilato automaticamente (`concurrently`)
- `npm run build:css` — ricompila Tailwind (utile dopo modifiche a `src/input.css`)
- Porta personalizzabile con `PORT=4444 npm start`
- Il server ascolta solo su `127.0.0.1` (nessuna esposizione esterna)

## API

- `POST /api/debug` — body: `{ "url": "...", "jsRender": true, "enableJsonLd": true }`
  - `jsRender: true` usa Puppeteer (headless Chromium) per SPA/React/Vue
  - `jsRender: false` (default) fetch HTTP diretto + cheerio (veloce)
  - `enableJsonLd: true` attiva estrazione/validazione JSON-LD (default: `false`)
  - Fallback automatico a Puppeteer se HTTP diretto risponde 4xx (es. cnn.com)
- Response: `{ url, meta, previews, findings[], jsRender, screenshotUrl }`
  - `findings[]` sostituisce i vecchi `warnings[] + flags{} + notes[]`
  - Ogni finding ha `{ severity, category, code, message, field }`

## Architettura

- `server.mjs` — entrypoint Express
- `src/scraper.mjs` — fetch HTTP nativo + decompressione gzip + parsing cheerio
- `src/puppeteer.mjs` — wrapper opzionale per headless Chrome (cookie banner auto‑dismiss)
- `src/previews.mjs` — costruisce dati preview (nessuna logica di validazione)
- `src/opengraph.mjs` — validazione OG + Twitter (tag obbligatori, dimensioni/rapporto immagine, HEAD request, icon/favicon heuristic, coerenza con `<title>`, duplicati)
- `src/jsonld.mjs` — estrazione e validazione JSON-LD: normalizzazione array/@graph, contesto/type, required fields, URL assoluti, date ISO, breadcrumb, Organization, immagini, duplicati
- `src/findings.mjs` — enum Severity/Category, sort utility
- `src/input.css` — sorgente Tailwind v4 (`public/style.css` è generato da questo)
- `public/` — frontend vanilla HTML/CSS/JS (nessun framework frontend)

## Dipendenze notevoli

- `puppeteer` scarica Chromium (~300 MB) al primo `npm install`. Se non serve, rimuoverlo da package.json; JS rendering darà errore con messaggio chiaro
- `open` — apre automaticamente il browser all'avvio del server
- `cheerio` — parsing HTML lato server
- `@tailwindcss/cli` (devDep) — compila `src/input.css` → `public/style.css`
- `concurrently` (devDep) — esegue `node --watch` + Tailwind watcher in parallelo

## Findings pipeline

Tutti i problemi trovati (OG, Twitter, JSON-LD, generali) confluiscono in un unico array `findings[]`,
ordinato per severity: ERROR → WARNING → INFO. Ogni finding ha un codice stabile per filtri/regressioni:

Categorie: `GENERAL`, `OG`, `TWITTER`, `JSONLD`
Severity: `error`, `warning`, `info`

## Warning preventivi

- L'immagine `og:image` di default deve essere ≥ 200×200 px; per risultati ottimali ≥ 1200×630 px
- `og:image` è l'unico tag immagine che Facebook/LinkedIn usano; `twitter:image` è solo per Twitter/X
- Se `og:title` manca, il fallback è il `<title>` HTML
- JSON-LD è opt‑in (checkbox "Controllo JSON-LD" nell'UI), disattivo per default
- Siti che bloccano bot (CNN, ecc.) vengono gestiti con fallback automatico a Puppeteer

