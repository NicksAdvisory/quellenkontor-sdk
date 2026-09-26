# Mindestlohn und Minijob-Grenze immer aktuell halten

Der Mindestlohn ändert sich per Verordnung, die Minijob-Grenze hängt direkt an ihm. Wer beide Werte fest im Code oder in einer Tabelle hinterlegt, muss sie zu jedem Stichtag von Hand nachziehen. Mit Quellenkontor fragst du stattdessen den Wert ab, der an einem Datum gilt.

## Den Wert zu einem Stichtag abfragen

```bash
curl "https://api.quellenkontor.dev/v1/hr/mindestlohn?datum=2027-01-15" \
  -H "Authorization: Bearer $QK_KEY"
```

Die Antwort enthält den Stundenlohn, die Minijob-Grenze, den Gültigkeitszeitraum und die Fundstelle:

```json
{
  "mindestlohn_brutto_stunde": 14.6,
  "minijob_grenze_monat": 633,
  "gueltig_ab": "2027-01-01",
  "gueltig_bis": null,
  "rechtsgrundlage": "Fünfte Mindestlohnanpassungsverordnung vom 5. November 2025 (BGBl. 2025 I Nr. 268), Stufe 2"
}
```

Frag immer mit dem Datum ab, um das es fachlich geht, also dem Abrechnungsmonat, nicht dem heutigen Tag. So rechnet auch eine Korrektur für einen alten Monat mit dem Wert, der damals galt.

## Im Code

```js
import { Quellenkontor } from "@quellenkontor/sdk";

const qk = new Quellenkontor(process.env.QK_KEY);

async function pruefeStundenlohn(stundenlohn, abrechnungsmonat) {
  const ml = await qk.hr.mindestlohn({ datum: abrechnungsmonat });
  if (stundenlohn < ml.mindestlohn_brutto_stunde) {
    return `Unter dem Mindestlohn von ${ml.mindestlohn_brutto_stunde} € (${ml.rechtsgrundlage})`;
  }
  return null;
}
```

## Frühere und künftige Werte

Jede Antwort nennt mit `vorheriger_wert` und `naechster_wert` die Nachbarn. Ist eine Erhöhung schon verkündet, steht sie in `naechster_wert`, bevor sie gilt. Den ganzen Verlauf seit 2015 liefert `/v1/hr/mindestlohn/verlauf`, im SDK `qk.hr.verlauf("mindestlohn")`.

Werte, die noch nicht verkündet sind, gibt es nicht. Fragst du ein Datum ab, für das noch nichts festgelegt ist, stehen die Werte auf `null` und `status` auf `"ausstehend"`, statt einer Schätzung. `letzter_wert` nennt den zuletzt gültigen Betrag, `erwartet` den Stand der Verkündung.

## Automatisch benachrichtigt werden

Ab dem Tarif Pro schickt Quellenkontor einen Webhook, sobald ein Wert neu hinzukommt, sich ändert oder korrigiert wird. Deine Software kann dann selbst reagieren, etwa einen Hinweis an die Lohnbuchhaltung schicken. Einrichtung: [Webhooks](https://quellenkontor.dev/docs/webhooks).

## Weiter

- [Referenz: Mindestlohn](https://quellenkontor.dev/docs/referenz/mindestlohn)
- [Stichtage und Gültigkeit](https://quellenkontor.dev/docs/stichtage)
- Verwandt: `minijob-abgaben` für die Pauschalabgaben des Arbeitgebers, `uebergangsbereich` für Midijobs
