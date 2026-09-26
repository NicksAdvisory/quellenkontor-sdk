# @quellenkontor/sdk

**English:** Official JavaScript SDK for the [Quellenkontor](https://quellenkontor.dev/en) API: verified German HR reference data (minimum wage, social security ceilings and rates, public holidays by state, notice periods and more), each value with its legal basis, official source and effective date. No dependencies, Node.js 18+, ESM and CommonJS. English docs: [quellenkontor.dev/en/docs/sdk-javascript](https://quellenkontor.dev/en/docs/sdk-javascript). Field and parameter names are German, as in the API; options and the error class also have English names (see [English summary](#english-summary)). A free key: [quellenkontor.dev/en/sign-in](https://quellenkontor.dev/en/sign-in).

Offizielles SDK für die [Quellenkontor](https://quellenkontor.dev)-API: geprüfte HR-Daten für Deutschland mit Quelle, Rechtsgrundlage und Gültigkeit. Mindestlohn, Rechengrößen, Beitragssätze, Sachbezüge, Pfändungsfreigrenzen, Übergangsbereich, Kündigungsfristen, Urlaub, Mutterschutz, Feiertage, Arbeitstage und weitere, insgesamt 23 Datensätze.

Ohne Abhängigkeiten, ab Node.js 18, auch im Browser und in Edge-Laufzeiten. Das Paket nutzt nur `fetch` und keine Node-Module.

```bash
npm install @quellenkontor/sdk
```

```js
import { Quellenkontor } from "@quellenkontor/sdk";

const qk = new Quellenkontor(process.env.QK_KEY);

const ml = await qk.hr.mindestlohn({ datum: "2027-01-15" });
console.log(ml.mindestlohn_brutto_stunde, ml.minijob_grenze_monat); // 14.6 633

const frist = await qk.hr.kuendigungsfrist({ eintritt: "2017-03-01", zugang: "2026-11-10" });
console.log(frist.ende); // "2027-02-28"

const verlauf = await qk.hr.verlauf("mindestlohn");
console.log(verlauf.verlauf[0].mindestlohn_brutto_stunde); // typisiert je Datensatz
```

CommonJS geht genauso:

```js
const { Quellenkontor } = require("@quellenkontor/sdk");
```

## Optionen

`new Quellenkontor(apiKey?, optionen?)` oder `new Quellenkontor(optionen)`. Jede Option hat einen deutschen und, wo es ihn gibt, einen englischen Namen; beide gelten.

| Option | Englisch | Standard | Bedeutung |
|---|---|---|---|
| `apiKey` | `apiKey` | `QK_KEY` aus der Umgebung | API-Schlüssel |
| `basisUrl` | `baseUrl` | `https://api.quellenkontor.dev/v1` | Adresse der API |
| `timeoutMs` | `timeoutMs` | `15000` | Zeitlimit je Versuch in Millisekunden |
| `wiederholungen` | `retries` | `2` | Wiederholungen bei Netzfehlern und 408, 500, 502, 503, 504 |
| `maxProSekunde` | `maxPerSecond` | `8` | Höchstens so viele Anfragen je Sekunde und Instanz, `0` schaltet die Bremse ab |
| `cache` | `cache` | `true` | Zwischenspeicher im Speicher dieser Instanz mit ETag und If-None-Match |
| `cacheTtlMs` | `cacheTtlMs` | `300000` | So lange kommt eine Antwort ohne neue Anfrage aus dem Speicher |
| `cacheMaxEintraege` | `cacheMaxEntries` | `500` | Höchstzahl gemerkter Antworten, die am längsten ungenutzte fällt heraus |
| `offline` | `offline` | `true` | Offline-Stand nutzen, wenn die API nicht erreichbar ist |
| `offlineWarnungTage` | `offlineMaxAgeDays` | `30` | Ab diesem Alter trägt eine Offline-Antwort einen Hinweis in `hinweise` |
| `fetch` | `fetch` | `globalThis.fetch` | Eigene fetch-Funktion, etwa für Tests oder einen Proxy |

Je Aufruf lässt sich ein `AbortSignal` mitgeben; es bricht Anfrage, Wartezeiten und Wiederholungen sofort ab (Fehlercode `abgebrochen`):

```js
const c = new AbortController();
setTimeout(() => c.abort(), 2000);
await qk.hr.mindestlohn({ datum: "2027-01-15" }, { signal: c.signal });
```

## Wiederholungen und Wartezeiten

| Antwort | Verhalten des SDK |
|---|---|
| Netzfehler oder Zeitlimit | bis zu `wiederholungen` Mal erneut, Pause 300 ms, dann 600 ms, 1200 ms; danach Offline-Stand oder Fehler `netzwerk` |
| 408, 500, 502, 503, 504 | wie Netzfehler, ein `Retry-After` gilt als Mindestpause; danach Offline-Stand oder der Fehler der API |
| 429 `zu_schnell` | `Retry-After` abwarten (Sekunden oder HTTP-Datum, höchstens 30 s), bis zu 5 Mal, zählt nicht als Wiederholung |
| 429 `kontingent_erreicht` | kein neuer Versuch, Fehler |
| 403 mit `x-vercel-mitigated` | Fehler `ausgebremst`: langsamer abfragen und später erneut versuchen |
| 304 | die gemerkte Antwort gilt weiter und kostet kein Kontingent |
| andere 4xx | sofort Fehler mit Code und Parameter der API |

## Offline-Stand

Der Verlauf aller 15 Tabellen-Datensätze liegt im Paket. Ist die API nach allen Wiederholungen nicht erreichbar oder antwortet mit 5xx, beantwortet das SDK Abfragen dieser Datensätze aus dem Offline-Stand: die Antwort trägt `offline: true`, `datenstand` und einen Satz in `hinweise`, aber kein `zitat`, `vorheriger_wert` oder `naechster_wert`. Rechner wie `kuendigungsfrist` oder `dienstwagen` bleiben ohne Verbindung ein Fehler.

Die Mindestausbildungsvergütung richtet sich auch offline nach dem Ausbildungsbeginn (`beginn`), nicht nach dem heutigen Tag. Der Offline-Stand wird erst geladen, wenn er gebraucht wird; Bundler legen ihn in einen eigenen Teil. Direkt lesen lässt er sich über `import { OFFLINE_DATEN } from "@quellenkontor/sdk/offline"`, ohne die API zu fragen über `qk.offlineAntwort("/hr/mindestlohn", { datum: "2026-01-01" })`.

## Fehler

Fehler kommen als `QuellenkontorFehler` (englisch `QuellenkontorError`, dieselbe Klasse) mit `status`, `code` und `parameter`. Die Codes sind stabil: die der API (etwa `schluessel_fehlt`, `schluessel_ungueltig`, `kontingent_erreicht`, `zu_schnell`, `parameter_fehlt`, `ungueltiger_parameter`, `kein_wert`) und die des SDK:

| Code | Status | Bedeutung |
|---|---|---|
| `netzwerk` | 0 | keine Verbindung nach allen Wiederholungen |
| `abgebrochen` | 0 | das `AbortSignal` hat ausgelöst |
| `kein_wert_offline` | 0 | der Offline-Stand hat für den Stichtag keinen Wert |
| `kein_fetch` | 0 | keine fetch-Funktion vorhanden (Node.js älter als 18) |
| `ausgebremst` | 403 | Schutzschicht vor der API |

## Umgebung

| Variable | Bedeutung |
|---|---|
| `QK_KEY` | API-Schlüssel, wenn `apiKey` fehlt |

Ohne Schlüssel liefert die API `mindestlohn`, `feiertage` und `rechengroessen` als Sandbox (50 Abfragen am Tag je Adresse). Kostenloser Schlüssel mit 500 Abfragen im Monat: https://quellenkontor.dev/anmelden

## English summary

English aliases: options `baseUrl`, `retries`, `maxPerSecond`, `cacheMaxEntries`, `offlineMaxAgeDays`; error class `QuellenkontorError`; methods `request()` and `clearCache()`. Error `code` values stay the same in both languages. Retries: network errors and 408/500/502/503/504 are retried `retries` times with backoff (Retry-After is honoured), 429 `zu_schnell` waits for Retry-After up to 5 times, 429 `kontingent_erreicht` fails at once. When the API stays unreachable, table datasets are answered from the bundled offline snapshot (`offline: true`).

Dokumentation: https://quellenkontor.dev/docs/sdk-javascript · Änderungen: [CHANGELOG.md](./CHANGELOG.md)
