# @quellenkontor/cli

**English:** Command line for the [Quellenkontor](https://quellenkontor.dev/en) API: query verified German HR reference data in the terminal and export it as a table, JSON or CSV, each value with its legal basis, official source and effective date. Node.js 18.3+. English docs: [quellenkontor.dev/en/docs/cli](https://quellenkontor.dev/en/docs/cli).


Kommandozeile für die [Quellenkontor](https://quellenkontor.dev)-API: geprüfte HR-Daten für Deutschland im Terminal abfragen und als Tabelle, JSON oder CSV ausgeben. Jeder Wert kommt mit Quelle, Rechtsgrundlage und Gültigkeit.

Ab Node.js 18.3.

```bash
npm install -g @quellenkontor/cli
qk login
qk mindestlohn --datum 2027-01-15
```

Ohne Installation:

```bash
npx @quellenkontor/cli mindestlohn --datum 2027-01-15
```

## Beispiele

```bash
qk kuendigungsfrist --eintritt 2017-03-01 --zugang 2026-11-10
qk arbeitstage --von 2027-01-01 --bis 2027-01-31 --land HE
qk feiertage --jahr 2027 --land HE --format csv > feiertage.csv
qk mindestlohn verlauf --format json
qk datensaetze
```

## Schlüssel

`qk login` speichert den Schlüssel in `~/.config/quellenkontor/config.json`. Die Umgebungsvariable `QK_KEY` hat Vorrang, auf Servern und in CI-Läufen ist das der bessere Weg. `qk logout` entfernt den Schlüssel von diesem Rechner, im Konto bleibt er gültig, bis du ihn dort sperrst.

Kostenloser Schlüssel mit 500 Abfragen im Monat: https://quellenkontor.dev/anmelden

Dokumentation: https://quellenkontor.dev/docs/cli
