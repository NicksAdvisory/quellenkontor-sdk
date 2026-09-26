# Änderungen @quellenkontor/cli

## 0.1.2 (25.09.2026)

- Sandbox ohne Schlüssel: `qk mindestlohn`, `qk feiertage` und `qk rechengroessen` gehen ohne Anmeldung, bei 401 kommt ein Hinweis auf `qk login`.
- Exit-Codes: 0 ok, 1 sonstiger Fehler, 2 Aufruffehler, 3 Schlüssel, 4 Kontingent oder gebremst, 5 Netz oder Server.
- `-h`, `--help`, `-V`, `--version`; `qk version` zeigt CLI, SDK und Offline-Stand; `qk <datensatz> --help` zeigt die Parameter aus dem Katalog.
- Argumente über `node:util.parseArgs`: doppelte Parameter und unbekannte Optionen sind Fehler, Ja/Nein-Parameter gehen ohne Wert, negative Zahlen gehen, neue Parameter über `--param name=wert`.
- `qk login` mit verdeckter Eingabe und `--key-stdin`; Ordner mit Rechten 700, unter Windows in `%APPDATA%`; `QK_CONFIG_DIR` für einen anderen Ordner.
- Warnung auf stderr, wenn eine Antwort aus dem Offline-Stand kommt; `--no-offline` macht daraus einen Fehler. CSV kommt ohne Verbindung ebenfalls aus dem Offline-Stand.
- `--json` als Kurzform, Fehler bei `--format json` als JSON; `datensaetze` und `status` auch als CSV.
- `qk batch`: eine Abfrage je Zeile von stdin, Ausgabe als JSON-Zeilen.
- `qk completion bash|zsh|fish` und ein Hinweis auf neue Versionen (höchstens einmal am Tag, nie in CI, abschaltbar mit `QK_KEIN_UPDATE_HINWEIS=1`).
- Tabelle kürzt nur im Terminal und sichtbar mit …, leere Antworten ohne Fehler.
- SDK als `^0.1.2`, damit SDK-Fehlerbehebungen ohne neues CLI-Release ankommen; `@types/node` als eigene Entwicklungsabhängigkeit.

## 0.1.1 (25.09.2026)

- Freikontingent in der README auf 500 Abfragen korrigiert, SDK 0.1.1.

## 0.1.0

- Erste Version.
