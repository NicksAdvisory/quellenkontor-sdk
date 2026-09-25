# Kündigungsfristen richtig berechnen

Die gesetzliche Kündigungsfrist nach § 622 BGB hängt von der Betriebszugehörigkeit, einer vereinbarten Probezeit und davon ab, wer kündigt. Dazu kommen die Regeln zur Fristberechnung in §§ 187 und 188 BGB. Wer das selbst programmiert, verrechnet sich leicht um einen Tag oder einen Monat.

Der Rechner `kuendigungsfrist` nimmt dir das ab.

## Abfrage

```bash
curl "https://api.quellenkontor.dev/v1/hr/kuendigungsfrist?eintritt=2017-03-01&zugang=2026-11-10" \
  -H "Authorization: Bearer $QK_KEY"
```

| Parameter | Bedeutung |
|---|---|
| `eintritt` | Beginn des Arbeitsverhältnisses (Pflicht) |
| `zugang` | Tag, an dem die Kündigung zugeht (Pflicht) |
| `seite` | `arbeitgeber` (Standard) oder `arbeitnehmer` |
| `probezeit` | `true`, wenn eine Probezeit vereinbart ist |

Die Antwort nennt die volle Betriebszugehörigkeit in Jahren, die Frist in Worten, das Ende der Frist, das Ende des Arbeitsverhältnisses und den genauen Absatz in § 622 BGB.

## Im Code

```js
import { Quellenkontor } from "@quellenkontor/sdk";

const qk = new Quellenkontor(process.env.QK_KEY);

const frist = await qk.hr.kuendigungsfrist({ eintritt: "2017-03-01", zugang: "2026-11-10" });
console.log(frist.ende);            // "2027-02-28"
console.log(frist.rechtsgrundlage); // Absatz und Nummer in § 622 BGB
```

## Was der Rechner nicht weiß

Der Rechner wendet die gesetzliche Regel schematisch an. Abweichende Fristen aus einem Tarifvertrag und längere Fristen aus dem Arbeitsvertrag kennt er nicht, ob eine Kündigung überhaupt wirksam ist, prüft er nicht. Die Grenzen stehen in jeder Antwort unter `hinweise`. Zeig sie in deiner Oberfläche mit an, dann weiß die Person, die das Ergebnis liest, wo sie selbst prüfen muss.

## Im HR-Chatbot

Fragt jemand den Chatbot nach einer Kündigungsfrist, sollte er die API rechnen lassen, statt selbst zu rechnen. Wie du das über MCP einrichtest, steht im Guide [HR-Werte im KI-Agenten](hr-werte-im-ki-agenten.md) und im Anwendungsfall [Kündigungsfristen im HR-Chatbot](https://quellenkontor.dev/anwendungsfaelle/kuendigungsfrist-im-chatbot).

## Weiter

- [Referenz: Kündigungsfrist](https://quellenkontor.dev/docs/referenz/kuendigungsfrist)
- Verwandt: `urlaubsanspruch`, `mutterschutz`
