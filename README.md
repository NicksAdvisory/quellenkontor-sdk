# Quellenkontor

**Amtliche HR-Werte für Deutschland per API, SDK, CLI und MCP. Jeder Wert mit Quelle, Rechtsgrundlage und Gültigkeit.**

Mindestlohn, Beitragsbemessungsgrenzen, Beitragssätze, Sachbezugswerte, Feiertage je Bundesland, Kündigungsfristen und 17 weitere Datensätze. Du fragst mit einem Stichtag ab und bekommst den Wert, der an diesem Tag gilt, samt Fundstelle im Bundesgesetzblatt oder Bundesanzeiger.

[Website](https://quellenkontor.dev) · [Dokumentation](https://quellenkontor.dev/docs) · [Kostenloser Schlüssel](https://quellenkontor.dev/anmelden) · [Guides](guides/) · [English](#english)

---

## Warum es das gibt

Jede HR- und Lohnsoftware in Deutschland pflegt dieselben Werte: zum 1. Januar, zum 1. Juli und immer dann, wenn eine Verordnung erscheint. Meist hängt das an einer Person, einer Tabelle und einem Kalendereintrag. Wird ein Wert zu spät oder falsch eingetragen, rechnet die Abrechnung falsch, und niemand merkt es sofort.

Quellenkontor übernimmt diese Pflege. Jeder Wert wird aus der amtlichen Quelle übernommen, geprüft und mit Gültigkeitszeitraum gespeichert. Künftige Werte kommen erst hinein, wenn sie verkündet sind, nicht schon beim Referentenentwurf. Wie das im Einzelnen läuft, steht im [Prüfverfahren](https://quellenkontor.dev/pruefverfahren).

## So sieht eine Antwort aus

```bash
curl "https://api.quellenkontor.dev/v1/hr/mindestlohn?datum=2027-01-15"
```

```json
{
  "datensatz": "mindestlohn",
  "datum": "2027-01-15",
  "mindestlohn_brutto_stunde": 14.6,
  "minijob_grenze_monat": 633,
  "gueltig_ab": "2027-01-01",
  "gueltig_bis": null,
  "rechtsgrundlage": "Fünfte Mindestlohnanpassungsverordnung vom 5. November 2025 (BGBl. 2025 I Nr. 268), Stufe 2",
  "quelle": {
    "titel": "Fünfte Mindestlohnanpassungsverordnung vom 5. November 2025 (BGBl. 2025 I Nr. 268)",
    "url": "https://www.recht.bund.de/bgbl/1/2025/268/VO.html"
  },
  "vorheriger_wert": {
    "gueltig_ab": "2026-01-01",
    "mindestlohn_brutto_stunde": 13.9,
    "minijob_grenze_monat": 603
  }
}
```

Diese Abfrage funktioniert ohne Schlüssel. Mindestlohn, Feiertage und Rechengrößen antworten in einer Sandbox mit 50 Abfragen am Tag. Die Antwort ist hier gekürzt, die volle Fassung enthält noch Hinweise, Lizenz und einen fertigen Zitiersatz.

## Für wen

| Du baust | Das nimmt dir Quellenkontor ab |
|---|---|
| **Lohn- und Gehaltssoftware** | Rechengrößen, Beitragssätze, Sachbezugswerte und Übergangsbereich zu jedem Stichtag, auch rückwirkend. [Mehr](https://quellenkontor.dev/loesungen/lohnsoftware) |
| **HR-Software** | Feiertage je Bundesland, Arbeitstage, Kündigungsfristen, Urlaubsanspruch und Mutterschutz als fertige Rechner. [Mehr](https://quellenkontor.dev/loesungen/hr-software) |
| **HR-Chatbots und KI-Agenten** | Ein MCP-Server, über den der Agent Werte nachschlägt, statt sie aus dem Gedächtnis zu nennen. [Mehr](https://quellenkontor.dev/loesungen/ki-agenten) |
| **Payroll und Employer of Record** | Deutsche Lohnwerte aus einer Quelle, statt ein Dutzend Behördenseiten zu verfolgen. [Mehr](https://quellenkontor.dev/loesungen/internationale-lohnabrechnung) |

## Guides

Kurze Anleitungen für typische Aufgaben, jeweils mit Code zum Kopieren.

- [Mindestlohn und Minijob-Grenze immer aktuell halten](guides/mindestlohn-aktuell-halten.md)
- [Jahreswechsel in der Lohnabrechnung vorbereiten](guides/jahreswechsel-lohnabrechnung.md)
- [Feiertage und Arbeitstage je Bundesland](guides/feiertage-und-arbeitstage.md)
- [Kündigungsfristen richtig berechnen](guides/kuendigungsfrist-berechnen.md)
- [HR-Werte im KI-Agenten über MCP](guides/hr-werte-im-ki-agenten.md)

Weitere Anwendungsfälle mit Hintergrund stehen auf [quellenkontor.dev/anwendungsfaelle](https://quellenkontor.dev/anwendungsfaelle).

## Die Datensätze

| Bereich | Datensätze |
|---|---|
| **Lohn** | Mindestlohn und Minijob-Grenze, Mindestausbildungsvergütung, Pflegemindestlohn |
| **Sozialversicherung** | Rechengrößen, Beitragssätze, Übergangsbereich (Midijob), Minijob-Abgaben, Künstlersozialabgabe, Ausgleichsabgabe |
| **Steuer** | Sachbezugswerte, steuerfreie Beträge, Reisekosten im Inland, SFN-Zuschläge, Dienstwagen, Einkommensteuer-Eckwerte |
| **Arbeitsrecht und Fristen** | Kündigungsfrist, Urlaubsanspruch, Mutterschutz, Pausenregelung, Regelaltersgrenze, Pfändungsfreigrenzen |
| **Kalender** | Feiertage je Bundesland, Arbeitstage |

Parameter und Felder jedes Datensatzes stehen in der [Referenz](https://quellenkontor.dev/docs/referenz). Die Liste als JSON liefert `https://api.quellenkontor.dev/v1/datensaetze`.

## Loslegen

Dieses Repository enthält die offiziellen Clients. Sie haben keine Abhängigkeiten und sprechen dieselbe API.

| Paket | Installation | Doku |
|---|---|---|
| [JavaScript/TypeScript SDK](packages/sdk-js) | `npm install @quellenkontor/sdk` | [SDK für JavaScript](https://quellenkontor.dev/docs/sdk-javascript) |
| [Python SDK](packages/sdk-python) | `pip install quellenkontor` | [SDK für Python](https://quellenkontor.dev/docs/sdk-python) |
| [CLI](packages/cli) | `npm install -g @quellenkontor/cli` | [Kommandozeile](https://quellenkontor.dev/docs/cli) |
| MCP-Server | `https://mcp.quellenkontor.dev/v1` (Einrichtung im [Guide](guides/hr-werte-im-ki-agenten.md)) | [MCP](https://quellenkontor.dev/docs/mcp) |

```js
import { Quellenkontor } from "@quellenkontor/sdk";

const qk = new Quellenkontor(process.env.QK_KEY);

const frist = await qk.hr.kuendigungsfrist({ eintritt: "2017-03-01", zugang: "2026-11-10" });
console.log(frist.ende); // "2027-02-28"
```

```python
import os
from quellenkontor import Quellenkontor

qk = Quellenkontor(api_key=os.environ["QK_KEY"])

ml = qk.hr.mindestlohn(datum="2027-01-15")
print(ml["mindestlohn_brutto_stunde"])  # 14.6
```

```bash
npx @quellenkontor/cli feiertage --jahr 2027 --land HE --format csv > feiertage.csv
```

Ein kostenloser Schlüssel mit 500 Abfragen im Monat liegt unter [quellenkontor.dev/anmelden](https://quellenkontor.dev/anmelden) bereit. Kein Passwort, keine Kreditkarte. Die Schritte bis zur ersten Abfrage stehen im [Schnellstart](https://quellenkontor.dev/docs/schnellstart).

## Kontakt

Fehler und Wünsche gern als [Issue](https://github.com/NicksAdvisory/quellenkontor-sdk/issues) oder an hello@quellenkontor.dev.

Die Clients in diesem Repository stehen unter MIT-Lizenz. Die Daten liefert die API, die Bedingungen dafür stehen in den [Nutzungsbedingungen](https://quellenkontor.dev/nutzungsbedingungen).

---

## English

**Official German HR reference data via API, SDK, CLI and MCP. Every value comes with its official source, legal basis and effective date.**

Minimum wage, social security ceilings and rates, benefits in kind, public holidays by state, notice periods and 17 more datasets. Query with a reference date and get the value that applies on that day, including the citation in the Federal Law Gazette or Federal Gazette. Field and parameter names are German, as in the API.

- Docs: [quellenkontor.dev/en/docs](https://quellenkontor.dev/en/docs)
- Free key (500 requests a month): [quellenkontor.dev/en/sign-in](https://quellenkontor.dev/en/sign-in)
- Packages: `npm install @quellenkontor/sdk`, `pip install quellenkontor`, `npm install -g @quellenkontor/cli`
