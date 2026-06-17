# Rydder'n

Ekstremt enkel PWA for rask registrering av objekter under lageropprydding.

## Funksjoner i versjon 1

- Ta bilde med mobilkamera
- Velg kategori
- Velg handling
- Lagre automatisk i IndexedDB
- Se oversikt, filtrering og statistikk
- Skriv ut rapport eller lagre som PDF via nettleseren
- Offline-stotte via service worker
- Klar for hosting pa GitHub Pages

## Teknologi

- HTML
- CSS
- JavaScript
- IndexedDB
- Service Worker
- Web App Manifest

## Filstruktur

- `index.html`: appskall og hovedvisninger
- `styles.css`: mobil-forst design med store knapper
- `app.js`: UI-logikk, flyt, filtrering, statistikk og rapport
- `db.js`: enkel datatilgang for IndexedDB
- `sw.js`: enkel caching av appskallet
- `manifest.json`: PWA-konfigurasjon

## Videreutvikling

Kodebasen er holdt enkel, men er strukturert slik at senere versjoner kan fa:

- verdifelt
- AI-bildegjenkjenning
- tale til tekst
- CSV- eller Excel-eksport
- sky-synkronisering

## GitHub Pages

1. Push innholdet til `main`
2. Aktiver GitHub Pages fra repoets root pa `main`
3. Aapne den publiserte URL-en pa mobil
