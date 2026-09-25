# @quellenkontor/sdk

**English:** Official JavaScript SDK for the [Quellenkontor](https://quellenkontor.dev/en) API: verified German HR reference data (minimum wage, social security ceilings and rates, public holidays by state, notice periods and more), each value with its legal basis, official source and effective date. No dependencies, Node.js 18+. English docs: [quellenkontor.dev/en/docs/sdk-javascript](https://quellenkontor.dev/en/docs/sdk-javascript). Field and parameter names are German, as in the API. A free key: [quellenkontor.dev/en/sign-in](https://quellenkontor.dev/en/sign-in).


Offizielles SDK für die [Quellenkontor](https://quellenkontor.dev)-API: geprüfte HR-Daten für Deutschland mit Quelle, Rechtsgrundlage und Gültigkeit. Mindestlohn, Rechengrößen, Beitragssätze, Sachbezüge, Pfändungsfreigrenzen, Übergangsbereich, Kündigungsfristen, Urlaub, Mutterschutz, Feiertage und Arbeitstage.

Ohne Abhängigkeiten, ab Node.js 18. Das Paket nutzt nur fetch und keine Node-Module.

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
```

Fehler der API kommen als `QuellenkontorFehler` mit `status`, `code` und `parameter`. Bei Netzfehlern und den Status 502, 503 und 504 wiederholt das SDK die Anfrage zweimal.

Kostenloser Schlüssel mit 1.000 Abfragen im Monat: https://quellenkontor.dev/anmelden

Dokumentation: https://quellenkontor.dev/docs/sdk-javascript
