# Debug Session: export-buttons
- **Status**: [OPEN]
- **Issue**: `PDF` og `Pages` reagerer ikke på iPhone, og rapportoversikten trenger bedre spacing og visuelt oppsett.
- **Debug Server**: http://192.168.0.35:7777/event
- **Log File**: `.dbg/trae-debug-log-export-buttons.ndjson`

## Reproduction Steps
1. Åpne `Dokumentasjon & Bevis`.
2. Gå til `Rapportoversikt`.
3. Trykk `PDF`.
4. Trykk `Pages`.
5. Observer at ingenting synlig skjer.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | En runtime-feil i eksport/print stopper klikkhandleren før Safari åpner noe | High | Low | Partially confirmed via user report |
| B | `renderDocumentationPrintReport()` eller DOCX-byggingen kaster feil på mobil-dataene | High | Med | Confirmed by broken PDF images and no visible Pages result |
| C | Service worker leverer blandet versjon av filer slik at bindinger og DOM ikke stemmer | Med | Med | Rejected for Safari direct-open test |
| D | Safari blokkerer eller avbryter tunge handlinger uten synlig feil, og vi mangler runtime-logging | Med | Low | Still possible, but secondary |
| E | Rapportoversiktens layout er ikke hovedfeilen, men trenger separat visuell finpuss etter funksjonsfeilen | Low | Low | Confirmed by screenshot spacing issues |

## Log Evidence
- Ingen logger kom tilbake fra debug-serveren under Safari-testen, så mobilsporingen var ikke brukbar i praksis.
- Bruker bekreftet at `PDF` reagerte i Safari, mens `Pages` ikke gjorde noe synlig.
- Skjermbilder viste ødelagte bildeplassholdere i PDF-forhåndsvisning og nederste galleri som ble delt/kuttet.
- Nyere skjermbilder viste at `PDF` nå fungerer nesten helt, men at første innholdsside kunne bli splittet mellom overskrift og hovedinnhold.
- Skjermbilder viste også at dokumentasjonskortene inne i appen brukte feil kortgrid, slik at galleri og tekst la seg oppå hverandre.
- `Pages` viste feilen `Value is not a sequence`, som peker på delings-/filflyten heller enn selve dokumentinnholdet.
- Bruker bekreftet at siste versjon faktisk var lastet, så videre feil var reelle UI-/eksportfeil og ikke cache-forveksling.
- Statisk inspeksjon av DOCX-byggeren viste flere `new Blob(...)`-kall med ren streng som første argument i stedet for en array, noe som matcher WebKit-feilen `Value is not a sequence`.

## Verification Conclusion
- Safari-print med blob-URL-er er ikke stabil nok for denne rapporten.
- PDF-løpet må vente på ferdig genererte og ferdig lastede bilder før `window.print()`.
- Pages-eksporten må gjøres lettere og gi synlig feil/arbeidsstatus.
- PDF-bygg må ikke trigges i bakgrunnen ved vanlig rapportvisning, bare ved faktisk PDF-eksport.
- Pages må falle tilbake til nedlasting hvis Safari ikke godtar direkte deling av DOCX-filen.
- Mobilkortene i rapportoversikten bør være énspaltet på liten skjerm for å unngå at bilde- og tekstblokker kolliderer.
- Rotårsaken til Pages-feilen er ugyldige `Blob`-konstruktører i DOCX-XML-filene, ikke PDF- eller kortlayouten.
