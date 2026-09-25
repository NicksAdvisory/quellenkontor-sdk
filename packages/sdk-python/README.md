# quellenkontor

**English:** Official Python SDK for the [Quellenkontor](https://quellenkontor.dev/en) API: verified German HR reference data (minimum wage, social security ceilings and rates, public holidays by state, notice periods and more), each value with its legal basis, official source and effective date. No dependencies, Python 3.9+. English docs: [quellenkontor.dev/en/docs/sdk-python](https://quellenkontor.dev/en/docs/sdk-python). Field and parameter names are German, as in the API.


Offizielles Python-SDK für die [Quellenkontor](https://quellenkontor.dev)-API: geprüfte HR-Daten für Deutschland mit Quelle, Rechtsgrundlage und Gültigkeit. Ohne Abhängigkeiten, ab Python 3.9.

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
```

Fehler der API kommen als `QuellenkontorFehler` mit `status`, `code` und `parameter`.

Kostenloser Schlüssel: https://quellenkontor.dev/anmelden · Doku: https://quellenkontor.dev/docs/sdk-python
