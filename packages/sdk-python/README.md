# quellenkontor

**English:** Official Python SDK for the [Quellenkontor](https://quellenkontor.dev/en) API: verified German HR reference data (minimum wage, social security ceilings and rates, public holidays by state, notice periods and more), each value with its legal basis, official source and effective date. No dependencies, Python 3.9+, typed (`py.typed`, TypedDict), thread safe, optional async client via `pip install "quellenkontor[async]"`. English docs: [quellenkontor.dev/en/docs/sdk-python](https://quellenkontor.dev/en/docs/sdk-python). Field and parameter names are German, as in the API; options also have English names (`base_url`, `retries`, `max_per_second`, `cache_max_entries`, `offline_max_age_days`), and the error class is also available as `QuellenkontorError`.

Offizielles Python-SDK für die [Quellenkontor](https://quellenkontor.dev)-API: geprüfte HR-Daten für Deutschland mit Quelle, Rechtsgrundlage und Gültigkeit. Ohne Abhängigkeiten, ab Python 3.9, mit Typen und threadsicher.

```bash
pip install quellenkontor
```

```python
import os
from quellenkontor import Quellenkontor

qk = Quellenkontor(api_key=os.environ["QK_KEY"])

ml = qk.hr.mindestlohn(datum="2027-01-15")
print(ml["mindestlohn_brutto_stunde"], ml["minijob_grenze_monat"])  # 14.6 633

frist = qk.hr.kuendigungsfrist(eintritt="2017-03-01", zugang="2026-11-10")
print(frist["ende"])  # 2027-02-28

azubi = qk.hr.mindestausbildungsverguetung(beginn="2025-08-01", ausbildungsjahr=2)
print(azubi["mindestverguetung_monat"])
```

## Asynchron

```bash
pip install "quellenkontor[async]"
```

```python
import asyncio
from quellenkontor.aio import AsyncQuellenkontor

async def main():
    async with AsyncQuellenkontor() as qk:
        ml = await qk.hr.mindestlohn(datum="2027-01-15")
        print(ml["mindestlohn_brutto_stunde"])

asyncio.run(main())
```

Der asynchrone Client nutzt httpx mit einer offenen Verbindung (Pooling) und hat dieselben Optionen, Wiederholungen, Zwischenspeicher und denselben Offline-Stand. httpx wird nur geladen, wenn du `quellenkontor.aio` importierst.

## Optionen

| Option | Englisch | Standard | Bedeutung |
|---|---|---|---|
| `api_key` | `api_key` | `QK_KEY` aus der Umgebung | API-Schlüssel |
| `basis_url` | `base_url` | `https://api.quellenkontor.dev/v1` | Adresse der API |
| `timeout` | `timeout` | `15.0` | Zeitlimit je Versuch in Sekunden |
| `wiederholungen` | `retries` | `2` | Wiederholungen bei Netzfehlern und 408, 500, 502, 503, 504 |
| `max_pro_sekunde` | `max_per_second` | `8` | Höchstens so viele Anfragen je Sekunde und Instanz, `0` schaltet die Bremse ab |
| `cache` | `cache` | `True` | Zwischenspeicher mit ETag und If-None-Match |
| `cache_ttl` | `cache_ttl` | `300.0` | So lange (Sekunden) kommt eine Antwort ohne neue Anfrage aus dem Speicher |
| `cache_max_eintraege` | `cache_max_entries` | `500` | Höchstzahl gemerkter Antworten, die am längsten ungenutzte fällt heraus |
| `offline` | `offline` | `True` | Offline-Stand nutzen, wenn die API nicht erreichbar ist |
| `offline_warnung_tage` | `offline_max_age_days` | `30` | Ab diesem Alter trägt eine Offline-Antwort einen Hinweis in `hinweise` |

Eine Instanz kann von mehreren Threads genutzt werden: Bremse und Zwischenspeicher sind mit einer Sperre geschützt.

## Wiederholungen und Wartezeiten

| Antwort | Verhalten des SDK |
|---|---|
| Netzfehler oder Zeitlimit (auch `socket.timeout` auf 3.9) | bis zu `wiederholungen` Mal erneut, Pause 0,3 s, dann 0,6 s, 1,2 s; danach Offline-Stand oder Fehler `netzwerk` |
| 408, 500, 502, 503, 504 | wie Netzfehler, ein `Retry-After` gilt als Mindestpause; danach Offline-Stand oder der Fehler der API |
| 429 `zu_schnell` | `Retry-After` abwarten (Sekunden oder HTTP-Datum, höchstens 30 s), bis zu 5 Mal, zählt nicht als Wiederholung |
| 429 `kontingent_erreicht` | kein neuer Versuch, Fehler |
| 403 mit `x-vercel-mitigated` | Fehler `ausgebremst` |
| 304 | die gemerkte Antwort gilt weiter und kostet kein Kontingent |
| andere 4xx | sofort Fehler mit Code und Parameter der API |

## Offline-Stand

Der Verlauf aller 15 Tabellen-Datensätze liegt im Paket (`offline_daten.json`, geladen erst bei Bedarf). Ist die API nach allen Wiederholungen nicht erreichbar oder antwortet mit 5xx, kommt die Antwort aus diesem Stand mit `offline: True`, `datenstand` und einem Satz in `hinweise`. Rechner wie `kuendigungsfrist` bleiben ohne Verbindung ein Fehler. Die Mindestausbildungsvergütung richtet sich auch offline nach dem Ausbildungsbeginn (`beginn`). Ohne API-Aufruf: `qk.offline_antwort("/hr/mindestlohn", {"datum": "2026-01-01"})`.

## Fehler

Fehler kommen als `QuellenkontorFehler` (auch `QuellenkontorError`) mit `status`, `code` und `parameter`. Die Codes sind stabil: die der API (etwa `schluessel_fehlt`, `kontingent_erreicht`, `zu_schnell`, `parameter_fehlt`, `ungueltiger_parameter`, `kein_wert`) und die des SDK: `netzwerk`, `kein_wert_offline`, `ausgebremst`, `kein_httpx` (asynchroner Client ohne httpx).

## Typen

Jede Methode unter `qk.hr` hat einen Rückgabetyp aus `quellenkontor.typen` (TypedDict, `total=False`), etwa `Mindestlohn` oder `Feiertage`. Das Paket liefert `py.typed` mit, mypy und Pyright lesen die Typen direkt.

## Umgebung

| Variable | Bedeutung |
|---|---|
| `QK_KEY` | API-Schlüssel, wenn `api_key` fehlt |

Ohne Schlüssel liefert die API `mindestlohn`, `feiertage` und `rechengroessen` als Sandbox (50 Abfragen am Tag je Adresse). Kostenloser Schlüssel mit 500 Abfragen im Monat: https://quellenkontor.dev/anmelden

## Entwicklung

```bash
python -m pip install -e ".[test]"
python -m pytest
python -m build        # baut Wheel und sdist; nicht mit altem pip oder setup.py bauen
```

Doku: https://quellenkontor.dev/docs/sdk-python · Änderungen: [CHANGELOG.md](./CHANGELOG.md)
