# Feiertage und Arbeitstage je Bundesland

Welche Tage Feiertage sind, regelt jedes Bundesland selbst. Hessen hatte 2026 zehn gesetzliche Feiertage, Bayern hat mehr, einige gelten nur in bestimmten Gemeinden. Für Schichtplanung, Urlaubsanträge und anteiliges Gehalt brauchst du deshalb die Feiertage des Standorts, nicht die des Firmensitzes.

## Feiertage eines Jahres

```bash
curl "https://api.quellenkontor.dev/v1/hr/feiertage?jahr=2026&land=HE"
```

```json
{
  "jahr": 2026,
  "land": "HE",
  "land_name": "Hessen",
  "anzahl": 10,
  "anzahl_landesweit_montag_bis_freitag": 8,
  "feiertage": [
    { "datum": "2026-01-01", "name": "Neujahr", "wochentag": "Donnerstag", "regional": false }
  ]
}
```

Diese Abfrage klappt auch ohne Schlüssel in der Sandbox. Das Land gibst du als Kürzel an (`HE`, `BY`, `NW` …), der Name geht auch. Abgedeckt sind die Jahre 2015 bis 2035.

## Als CSV für die Tabellenkalkulation

```bash
npx @quellenkontor/cli feiertage --jahr 2027 --land HE --format csv > feiertage.csv
```

## Arbeitstage zwischen zwei Daten

Der Rechner `arbeitstage` zählt Montag bis Freitag und zieht die Feiertage des Landes ab:

```bash
curl "https://api.quellenkontor.dev/v1/hr/arbeitstage?von=2027-01-01&bis=2027-01-31&land=HE" \
  -H "Authorization: Bearer $QK_KEY"
```

Die Antwort nennt `arbeitstage`, `kalendertage` und die abgezogenen Feiertage. Mit `samstag=true` zählen Samstage mit (Werktage), mit `regionale=true` werden auch regionale Feiertage abgezogen.

```python
import os
from quellenkontor import Quellenkontor

qk = Quellenkontor(api_key=os.environ["QK_KEY"])

t = qk.hr.arbeitstage(von="2027-01-01", bis="2027-01-31", land="HE")
print(t["arbeitstage"])
```

Heiligabend und Silvester sind keine gesetzlichen Feiertage und werden als Arbeitstage gezählt. Ob im Betrieb frei ist, regelt der Arbeits- oder Tarifvertrag.

## Weiter

- [Anwendungsfall Schichtplanung](https://quellenkontor.dev/anwendungsfaelle/feiertage-schichtplanung)
- [Anwendungsfall anteiliges Gehalt](https://quellenkontor.dev/anwendungsfaelle/anteiliges-gehalt-berechnen)
- [Referenz: Feiertage](https://quellenkontor.dev/docs/referenz/feiertage)
