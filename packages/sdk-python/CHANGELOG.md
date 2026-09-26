# Änderungen quellenkontor (Python)

## 0.1.1 (25.09.2026)

- Enthält jetzt die Ratenbremse (`max_pro_sekunde`) und das Warten bei 429 `zu_schnell`, die im Wheel 0.1.0 fehlten.
- Lese-Timeouts auf Python 3.9 (`socket.timeout`) und andere Verbindungsfehler (`OSError`) zählen als Netzfehler statt als unbehandelte Ausnahme.
- Offline-Stand auch nach 502, 503, 504 im letzten Versuch; 408 und 500 werden wiederholt; `Retry-After` auch als HTTP-Datum.
- Offline-Stichtag bei `mindestausbildungsverguetung` ist der Ausbildungsbeginn (`beginn`), wie in der API; weitere Angleichungen wie im JavaScript-SDK 0.1.2.
- Offline-Antworten tragen `hinweise`, ab 30 Tagen Alter mit Warnung (`offline_warnung_tage`).
- Threadsicher: Bremse und Zwischenspeicher mit `threading.Lock`; Zwischenspeicher mit Obergrenze (`cache_max_eintraege`, Standard 500).
- Typen: `py.typed`, TypedDict je Antwort in `quellenkontor.typen`.
- Asynchroner Client `quellenkontor.aio.AsyncQuellenkontor` über `pip install "quellenkontor[async]"` (httpx, mit Verbindungspooling).
- Englische Aliasse: `base_url`, `retries`, `max_per_second`, `cache_max_entries`, `offline_max_age_days`, `QuellenkontorError`, `request()`, `clear_cache()`.
- Packaging nach PEP 639 (`license = "MIT"`), Version nur in `quellenkontor/_version.py`, Classifier für Python 3.9 bis 3.13.
- Tests mit pytest gegen `http.server`.

## 0.1.0

- Erste Version.
