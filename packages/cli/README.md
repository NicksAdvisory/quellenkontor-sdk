# @quellenkontor/cli

**English:** Command line for the [Quellenkontor](https://quellenkontor.dev/en) API: query verified German HR reference data in the terminal and export it as a table, JSON or CSV, each value with its legal basis, official source and effective date. Node.js 18.3+. English docs: [quellenkontor.dev/en/docs/cli](https://quellenkontor.dev/en/docs/cli). Exit codes: 0 ok, 1 other error, 2 usage error, 3 missing or invalid key, 4 quota or rate limit (429), 5 network or server unreachable.

Kommandozeile für die [Quellenkontor](https://quellenkontor.dev)-API: geprüfte HR-Daten für Deutschland im Terminal abfragen und als Tabelle, JSON oder CSV ausgeben. Jeder Wert kommt mit Quelle, Rechtsgrundlage und Gültigkeit.

Ab Node.js 18.3.

```bash
npm install -g @quellenkontor/cli
qk mindestlohn --datum 2027-01-15
```

Ohne Installation:

```bash
npx @quellenkontor/cli mindestlohn --datum 2027-01-15
```

`mindestlohn`, `feiertage` und `rechengroessen` gehen ohne Schlüssel (Sandbox, 50 Abfragen am Tag je Adresse). Für alle 23 Datensätze einmal `qk login` oder die Umgebungsvariable `QK_KEY`.

## Beispiele

```bash
qk kuendigungsfrist --eintritt 2017-03-01 --zugang 2026-11-10 --probezeit
qk arbeitstage --von 2027-01-01 --bis 2027-01-31 --land HE
qk feiertage --jahr 2027 --land HE --format csv --trennzeichen semikolon > feiertage.csv
qk mindestausbildungsverguetung --beginn 2025-08-01 --ausbildungsjahr 2
qk mindestlohn verlauf --json
qk mindestlohn --help          # Parameter dieses Datensatzes
qk datensaetze --format csv
```

## Befehle und Optionen

| Aufruf | Bedeutung |
|---|---|
| `qk <datensatz> [--parameter wert ...]` | Abfrage, Parameter mit Bindestrichen (`--arbeitstage-pro-woche 5`) |
| `qk <datensatz> verlauf [--von] [--bis] [--bestandteil]` | Verlauf einer Tabelle |
| `qk <datensatz> --help` | Parameter, Werte und Beispiele aus dem Katalog der API |
| `qk datensaetze`, `qk status` | Katalog und Prüfstand, auch als JSON oder CSV |
| `qk batch` | eine Abfrage je Zeile von stdin, Ausgabe als JSON-Zeilen |
| `qk login` | Schlüssel speichern, verdeckte Eingabe; `qk login --key-stdin < datei` |
| `qk logout` | gespeicherten Schlüssel entfernen |
| `qk completion bash\|zsh\|fish` | Tab-Ergänzung, etwa `source <(qk completion bash)` |
| `qk version` | Version von CLI und SDK, Offline-Stand |
| `-h`, `--help`, `-V`, `--version` | Hilfe, nur die Versionsnummer |

| Option | Bedeutung |
|---|---|
| `--format tabelle\|json\|csv` | Ausgabe, Standard `tabelle`; `--json` ist die Kurzform |
| `--trennzeichen komma\|semikolon` | nur mit CSV; `semikolon` schreibt Dezimalkommas und ein BOM für ein deutsches Excel |
| `--no-offline` | ohne Verbindung Fehler statt Offline-Stand |
| `-p`, `--param name=wert` | Parameter, den diese Version noch nicht kennt |

Ja/Nein-Parameter gehen ohne Wert (`--probezeit` heißt `--probezeit true`), negative Zahlen mit Gleichheitszeichen (`--zuzahlung-monat=-50`). Jeder Parameter darf nur einmal vorkommen. Die Tabelle kürzt lange Zellen nur im Terminal und markiert das mit …; in eine Datei oder Pipe geht alles vollständig.

## Batch

```bash
printf 'mindestlohn --datum 2026-01-01\nfeiertage --jahr 2027 --land BY\n' | qk batch
```

Jede Zeile ergibt eine JSON-Zeile mit `zeile`, `eingabe` und `antwort` oder `fehler`. Leere Zeilen und Zeilen mit `#` zählen nicht. Alle Abfragen laufen in einem Prozess mit gemeinsamem Zwischenspeicher und Bremse. Der Exit-Code ist der des ersten Fehlers.

## Exit-Codes

| Code | Bedeutung |
|---|---|
| 0 | ok, auch bei einer Antwort aus dem Offline-Stand (mit Warnung auf stderr) |
| 1 | sonstiger Fehler |
| 2 | Aufruffehler: unbekannter Befehl, unbekannte oder doppelte Option, ungültiger Parameter, kein Wert für den Stichtag |
| 3 | Schlüssel fehlt oder ist ungültig (401) |
| 4 | Kontingent erreicht oder zu schnell (429), Schutzschicht der API |
| 5 | Netz oder Server nicht erreichbar (auch 5xx nach allen Wiederholungen) |

Fehler stehen auf stderr, bei `--format json` oder `--json` als `{"fehler": {"status", "code", "nachricht", "parameter"}}`.

## Offline

Ist die API nicht erreichbar, beantwortet die CLI Tabellen-Datensätze aus dem Offline-Stand des SDK, auch als CSV, und schreibt einen Hinweis mit dem Datenstand auf stderr. Rechner wie `kuendigungsfrist` brauchen eine Verbindung. Mit `--no-offline` endet ein Aufruf ohne Verbindung mit Exit-Code 5.

## Wiederholungen

Netzfehler und die Status 408, 500, 502, 503, 504 wiederholt die CLI zweimal mit Pause (Retry-After zählt), bei 429 `zu_schnell` wartet sie die Zeit aus Retry-After ab. Einzelheiten stehen in der README von [@quellenkontor/sdk](https://www.npmjs.com/package/@quellenkontor/sdk).

## Schlüssel und Umgebung

`qk login` speichert den Schlüssel unter Linux und macOS in `~/.config/quellenkontor/config.json` (oder unter `XDG_CONFIG_HOME`), unter Windows in `%APPDATA%\quellenkontor\config.json`. Datei und Ordner sind nur für dich lesbar (600 und 700); unter Windows schützt nur dein Benutzerprofil die Datei, auf geteilten Rechnern ist `QK_KEY` der bessere Weg. `qk logout` entfernt den Schlüssel von diesem Rechner, im Konto bleibt er gültig, bis du ihn dort sperrst.

| Variable | Bedeutung |
|---|---|
| `QK_KEY` | API-Schlüssel, hat Vorrang vor `qk login`; auf Servern und in CI der bessere Weg |
| `QK_BASIS_URL` | andere API-Adresse, etwa für Tests |
| `QK_CONFIG_DIR` | anderer Ordner für die Schlüsseldatei |
| `QK_KEIN_UPDATE_HINWEIS` | `1` schaltet den Hinweis auf neue Versionen ab (auch `NO_UPDATE_NOTIFIER`, in CI ohnehin aus) |

Der Hinweis auf neue Versionen fragt höchstens einmal am Tag `registry.npmjs.org` und erscheint nur im Terminal.

Kostenloser Schlüssel mit 500 Abfragen im Monat: https://quellenkontor.dev/anmelden

Dokumentation: https://quellenkontor.dev/docs/cli · Änderungen: [CHANGELOG.md](./CHANGELOG.md)
