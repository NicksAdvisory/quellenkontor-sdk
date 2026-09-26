# Änderungen @quellenkontor/sdk

## 0.1.2 (25.09.2026)

- Veröffentlicht jetzt wirklich die Ratenbremse (`maxProSekunde`) und das Warten bei 429 `zu_schnell`: 0.1.1 enthielt den Stand vor diesen Änderungen. `prepublishOnly` baut und testet vor jeder Veröffentlichung.
- ESM und CommonJS: `require("@quellenkontor/sdk")` funktioniert, mit eigenen Typen für beide Wege.
- Offline-Stand auch nach 502, 503, 504 im letzten Versuch, nicht nur bei Netzfehlern.
- 408 und 500 werden wiederholt; `Retry-After` wird auch als HTTP-Datum gelesen und gilt als Mindestpause.
- Offline-Stand als eigener Einstieg `@quellenkontor/sdk/offline`, erst bei Bedarf geladen, schmaler Typ statt 356 KB Literaltyp, `sideEffects: false`.
- Offline-Stichtag bei `mindestausbildungsverguetung` ist der Ausbildungsbeginn (`beginn`), wie in der API. Weitere Angleichungen an die API: `jahr` zählt ab 1. Januar, ein abgelaufenes `gueltig_bis` liefert keinen Wert mehr, `von` im Verlauf wirkt auf das Ende einer Stufe.
- Offline-Antworten tragen `hinweise`, ab 30 Tagen Alter mit Warnung (`offlineWarnungTage`).
- `AbortSignal` je Aufruf (`{ signal }`), bricht auch Wartezeiten und Wiederholungen ab.
- Zwischenspeicher mit Obergrenze (`cacheMaxEintraege`, Standard 500).
- `verlauf()` typisiert je Datensatz.
- Englische Aliasse: `baseUrl`, `retries`, `maxPerSecond`, `cacheMaxEntries`, `offlineMaxAgeDays`, `QuellenkontorError`, `request()`, `clearCache()`.
- Sprechender Fehler `kein_fetch` statt TypeError, wenn `fetch` fehlt.
- Tests mit `node:test` gegen einen lokalen Server.

## 0.1.1 (25.09.2026)

- Freikontingent in der README auf 500 Abfragen korrigiert. Die Ratenbremse stand im Quelltext, fehlte aber im veröffentlichten Paket (siehe 0.1.2).

## 0.1.0

- Erste Version.
