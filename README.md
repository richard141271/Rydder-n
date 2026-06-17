# Rydder'n

Ekstremt enkel PWA for rask registrering av objekter under lageropprydding.

## Funksjoner

- Ta bilde med mobilkamera
- Velg kategori
- Velg handling
- Autolagring rett etter valgt handling (GitHub er hovedlagring)
- Automatisk forsok pa a apne kamera igjen for neste objekt
- Synlig avslutt-knapp i registreringsflyten
- Aktivt prosjekt for alle objekter (lagres i GitHub)
- Egen modul for verdisetting av objekter uten verdi
- Prosjektkostnader med rapport for verdi, kostnad og netto (generert fra GitHub-data)
- Se oversikt, filtrering og statistikk
- Skriv ut rapport eller lagre som PDF via nettleseren
- Offline-stotte via service worker
- Klar for hosting pa GitHub Pages

## Teknologi

- HTML
- CSS
- JavaScript
- GitHub API (Device Flow OAuth)
- IndexedDB (kun cache og offline-kø)
- Service Worker
- Web App Manifest

## Filstruktur

- `index.html`: appskall og hovedvisninger
- `styles.css`: mobil-forst design med store knapper
- `app.js`: UI-logikk, hurtigregistrering, prosjekt, kostnader og rapport
- `config.js`: GitHub-konfigurasjon (owner/repo/branch + clientId)
- `githubAuth.js`: Device Flow innlogging
- `githubStorageProvider.js`: GitHub som lagringsprovider
- `offlineDb.js`: lokal cache og offline-kø (midlertidig)
- `storageProvider.js`: provider-grensesnitt (for senere Supabase)
- `sw.js`: enkel caching av appskallet
- `manifest.json`: PWA-konfigurasjon

## Videreutvikling

Kodebasen er holdt enkel, men er strukturert slik at senere versjoner kan fa:

- verdifelt
- AI-bildegjenkjenning
- tale til tekst
- CSV- eller Excel-eksport
- sky-synkronisering
- integrasjon i Eiendomsappen

## GitHub-innlogging (Device Flow)

Appen bruker GitHub Device Flow og trenger en OAuth App Client ID.

1. Lag en GitHub OAuth App
2. Kopier Client ID
3. Lim inn i `config.js` under `github.clientId`

Appen lagrer ikke token i kildekoden.

## GitHub Pages

1. Push innholdet til `main`
2. Aktiver GitHub Pages fra repoets root pa `main`
3. Aapne den publiserte URL-en pa mobil
