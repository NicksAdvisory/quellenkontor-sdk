# Jahreswechsel in der Lohnabrechnung vorbereiten

Zum 1. Januar ändern sich in der Lohnabrechnung gleich mehrere Werte: Beitragsbemessungsgrenzen, Versicherungspflichtgrenze, Bezugsgröße, Sachbezugswerte, oft auch Beitragssätze und der Mindestlohn. Die Verordnungen erscheinen meist im November. Bis dahin bleibt wenig Zeit, alles einzutragen und zu testen.

Mit Quellenkontor fragst du jeden Wert mit dem Stichtag der Abrechnung ab. Ab dem Tag der Verkündung liefert die API die neuen Werte für Januar, ohne dass du etwas umstellen musst.

## Die wichtigsten Datensätze

| Datensatz | Enthält |
|---|---|
| `rechengroessen` | Beitragsbemessungsgrenzen (KV, PV, RV, Knappschaft), Versicherungspflichtgrenzen, Bezugsgröße |
| `beitragssaetze` | Beitragssätze der Sozialversicherung |
| `sachbezugswerte` | Freie Verpflegung und Unterkunft, Mahlzeiten |
| `uebergangsbereich` | Grenzen und Faktor F für Midijobs |
| `mindestlohn` | Mindestlohn und Minijob-Grenze |
| `einkommensteuer-eckwerte` | Grundfreibetrag und Tarifeckwerte |

## Alle Werte für einen Abrechnungsmonat

```js
import { Quellenkontor } from "@quellenkontor/sdk";

const qk = new Quellenkontor(process.env.QK_KEY);
const datum = "2027-01-31";

const [rg, bs, sb] = await Promise.all([
  qk.hr.rechengroessen({ datum }),
  qk.hr.beitragssaetze({ datum }),
  qk.hr.sachbezugswerte({ datum }),
]);

console.log(rg.bbg_kv_monat, rg.bbg_rv_west_monat, rg.jaeg_allgemein_jahr);
```

Ein Beispiel mit echten Werten für 2026:

```bash
curl "https://api.quellenkontor.dev/v1/hr/rechengroessen?datum=2026-07-01"
```

liefert unter anderem `bbg_kv_monat: 5812.5`, `bbg_rv_west_monat: 8450` und `jaeg_allgemein_jahr: 77400`, dazu die Sozialversicherungsrechengrößen-Verordnung 2026 als Rechtsgrundlage mit Link.

## Vor dem Jahreswechsel testen

Solange die Werte für das neue Jahr noch nicht verkündet sind, antwortet die API für Januar mit `kein_wert`. Das ist gewollt: Deine Software sieht, dass sie noch nicht mit dem neuen Jahr rechnen kann, statt still mit alten Zahlen weiterzurechnen. Sobald die Verordnung verkündet ist, liefert dieselbe Abfrage die neuen Werte.

Mit dem Tarif Pro bekommst du einen [Webhook](https://quellenkontor.dev/docs/webhooks), sobald die neuen Werte eingetragen sind.

## Weiter

- [Lösung für Lohnsoftware](https://quellenkontor.dev/loesungen/lohnsoftware)
- [Anwendungsfall Jahreswechsel](https://quellenkontor.dev/anwendungsfaelle/jahreswechsel-lohnabrechnung)
- [Stichtage und Gültigkeit](https://quellenkontor.dev/docs/stichtage)
