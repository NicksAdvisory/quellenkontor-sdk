"""Offizielles SDK für die Quellenkontor-API.

Geprüfte HR-Daten für Deutschland mit Quelle, Rechtsgrundlage und Gültigkeit.
Ohne Abhängigkeiten, ab Python 3.9.

    import os
    from quellenkontor import Quellenkontor

    qk = Quellenkontor(api_key=os.environ["QK_KEY"])
    ml = qk.hr.mindestlohn(datum="2027-01-15")
    print(ml["mindestlohn_brutto_stunde"])  # 14.6
"""
from __future__ import annotations

import datetime
import importlib.resources
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional

__all__ = ["Quellenkontor", "QuellenkontorFehler", "__version__"]
__version__ = "0.1.0"

STANDARD_BASIS = "https://api.quellenkontor.dev/v1"
STANDARD_CACHE_TTL = 300.0  # Sekunden, wie der Standard von 5 Minuten im JavaScript-SDK
MIT_VERLAUF = {
    "mindestlohn", "rechengroessen", "beitragssaetze", "sachbezugswerte", "pfaendungsfreigrenzen", "uebergangsbereich",
    "minijob-abgaben", "reisekosten-inland", "mindestausbildungsverguetung", "kuenstlersozialabgabe", "steuerfreie-betraege",
    "sfn-zuschlaege", "pflegemindestlohn", "ausgleichsabgabe", "einkommensteuer-eckwerte",
}


class QuellenkontorFehler(Exception):
    """Fehler der API mit HTTP-Status, maschinenlesbarem Code und betroffenem Parameter."""

    def __init__(self, nachricht: str, status: int, code: str, parameter: Optional[str] = None):
        super().__init__(nachricht)
        self.status = status
        self.code = code
        self.parameter = parameter


def _wert(v: Any) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    return str(v)


# --------------------------------------------------------------------------------------------------
# Offline-Stand: Verlauf der Tabellen-Datensätze, mitgeliefert in offline_daten.json (siehe
# scripts/offline-snapshot.mjs in der App). Genutzt als Fallback, wenn die API nach allen
# Wiederholungen nicht erreichbar ist (Quellenkontor(..., offline=True), Standard an).

_OFFLINE_DATEN: Optional[Dict[str, Any]] = None
_PFAD_MUSTER = re.compile(r"^/hr/([a-z0-9-]+)(/verlauf)?$")


def _offline_daten() -> Dict[str, Any]:
    global _OFFLINE_DATEN
    if _OFFLINE_DATEN is None:
        with importlib.resources.files(__package__).joinpath("offline_daten.json").open("r", encoding="utf-8") as f:
            _OFFLINE_DATEN = json.load(f)
    return _OFFLINE_DATEN


def _beginn_von(z: Dict[str, Any]) -> str:
    """Beginn einer Verlaufszeile: gueltig_ab, sonst der 1. Januar des Feldes jahr (wie lib/verlauf.ts serverseitig)."""
    gueltig_ab = z.get("gueltig_ab")
    return gueltig_ab if isinstance(gueltig_ab, str) else f"{z['jahr']}-01-01"


def _aktuelle_zeilen(zeilen: List[Dict[str, Any]], ziel_datum: str) -> List[Dict[str, Any]]:
    """Je Gruppe (bestandteil, sonst eine gemeinsame Gruppe) die jüngste Zeile, deren Beginn nicht nach ziel_datum liegt."""
    gruppen: Dict[str, List[Dict[str, Any]]] = {}
    for z in zeilen:
        g = z.get("bestandteil") if isinstance(z.get("bestandteil"), str) else ""
        gruppen.setdefault(g, []).append(z)
    aus: List[Dict[str, Any]] = []
    for liste in gruppen.values():
        passend = sorted((z for z in liste if _beginn_von(z) <= ziel_datum), key=_beginn_von)
        if passend:
            aus.append(passend[-1])
    return aus


def _verlauf_offline(zeilen: List[Dict[str, Any]], werte: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Verlauf offline filtern: von und bis wirken auf gueltig_ab selbst, einfacher als live (siehe Doku)."""
    bestandteil = werte.get("bestandteil")
    von = werte.get("von")
    bis = werte.get("bis")

    def passt(z: Dict[str, Any]) -> bool:
        if bestandteil is not None and z.get("bestandteil") != bestandteil:
            return False
        beginn = _beginn_von(z)
        if von is not None and beginn < von:
            return False
        if bis is not None and beginn > bis:
            return False
        return True

    return [z for z in zeilen if passt(z)]


def _offline_abfrage(pfad: str, werte: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Offline-Antwort für einen Pfad, oder None, wenn der Pfad kein Tabellen-Datensatz mit Verlauf ist."""
    treffer_pfad = _PFAD_MUSTER.match(pfad)
    if not treffer_pfad:
        return None
    datensatz_id, ist_verlauf = treffer_pfad.group(1), treffer_pfad.group(2) is not None
    daten = _offline_daten()
    zeilen = daten["datensaetze"].get(datensatz_id)
    if zeilen is None:
        return None
    datenstand = daten["datenstand"]

    if ist_verlauf:
        gefiltert = _verlauf_offline(zeilen, werte)
        return {"datensatz": datensatz_id, "anzahl": len(gefiltert), "verlauf": gefiltert, "offline": True, "datenstand": datenstand}

    if werte.get("datum") is not None:
        ziel_datum = werte["datum"]
    elif werte.get("jahr") is not None:
        ziel_datum = f"{werte['jahr']}-12-31"
    else:
        ziel_datum = datetime.date.today().isoformat()
    treffer = _aktuelle_zeilen(zeilen, ziel_datum)
    if not treffer:
        raise QuellenkontorFehler(
            f"Für diesen Stichtag gibt es im Offline-Stand ({datenstand}) noch keinen Wert von {datensatz_id}. "
            "Sobald die API wieder erreichbar ist, liefert sie den amtlichen Stand.",
            0, "kein_wert_offline",
        )
    basis: Dict[str, Any] = {"datensatz": datensatz_id, "offline": True, "datenstand": datenstand}
    if werte.get("datum") is not None:
        basis["datum"] = ziel_datum
    if werte.get("jahr") is not None:
        basis["jahr"] = werte["jahr"]
    if not any(isinstance(z.get("bestandteil"), str) for z in treffer):
        return {**basis, **treffer[0]}
    return {**basis, "werte": {z["bestandteil"]: z.get("wert") for z in treffer}, "bestandteile": treffer}


class _HR:
    def __init__(self, client: "Quellenkontor"):
        self._c = client

    def mindestlohn(self, datum: Optional[str] = None) -> Dict[str, Any]:
        return self._c.anfrage("/hr/mindestlohn", {"datum": datum})

    def rechengroessen(self, jahr: Optional[int] = None) -> Dict[str, Any]:
        return self._c.anfrage("/hr/rechengroessen", {"jahr": jahr})

    def beitragssaetze(self, datum: Optional[str] = None) -> Dict[str, Any]:
        return self._c.anfrage("/hr/beitragssaetze", {"datum": datum})

    def sachbezugswerte(self, jahr: Optional[int] = None) -> Dict[str, Any]:
        return self._c.anfrage("/hr/sachbezugswerte", {"jahr": jahr})

    def pfaendungsfreigrenzen(self, datum: Optional[str] = None, unterhaltspflichten: Optional[int] = None, netto: Optional[float] = None) -> Dict[str, Any]:
        return self._c.anfrage("/hr/pfaendungsfreigrenzen", {"datum": datum, "unterhaltspflichten": unterhaltspflichten, "netto": netto})

    def uebergangsbereich(self, datum: Optional[str] = None) -> Dict[str, Any]:
        return self._c.anfrage("/hr/uebergangsbereich", {"datum": datum})

    def kuendigungsfrist(self, eintritt: str, zugang: str, seite: Optional[str] = None, probezeit: Optional[bool] = None) -> Dict[str, Any]:
        return self._c.anfrage("/hr/kuendigungsfrist", {"eintritt": eintritt, "zugang": zugang, "seite": seite, "probezeit": probezeit})

    def urlaubsanspruch(self, arbeitstage_pro_woche: float, jahr: Optional[int] = None, eintritt: Optional[str] = None, austritt: Optional[str] = None) -> Dict[str, Any]:
        return self._c.anfrage("/hr/urlaubsanspruch", {"arbeitstage_pro_woche": arbeitstage_pro_woche, "jahr": jahr, "eintritt": eintritt, "austritt": austritt})

    def mutterschutz(self, termin: Optional[str] = None, geburt: Optional[str] = None, fall: Optional[str] = None, ssw: Optional[int] = None) -> Dict[str, Any]:
        return self._c.anfrage("/hr/mutterschutz", {"termin": termin, "geburt": geburt, "fall": fall, "ssw": ssw})

    def feiertage(self, jahr: Optional[int] = None, land: Optional[str] = None) -> Dict[str, Any]:
        return self._c.anfrage("/hr/feiertage", {"jahr": jahr, "land": land})

    def arbeitstage(self, von: str, bis: str, land: str, samstag: Optional[bool] = None, regionale: Optional[bool] = None) -> Dict[str, Any]:
        return self._c.anfrage("/hr/arbeitstage", {"von": von, "bis": bis, "land": land, "samstag": samstag, "regionale": regionale})

    def minijob_abgaben(self, datum: Optional[str] = None, bestandteil: Optional[str] = None) -> Dict[str, Any]:
        return self._c.anfrage("/hr/minijob-abgaben", {"datum": datum, "bestandteil": bestandteil})

    def reisekosten_inland(self, datum: Optional[str] = None, bestandteil: Optional[str] = None) -> Dict[str, Any]:
        return self._c.anfrage("/hr/reisekosten-inland", {"datum": datum, "bestandteil": bestandteil})

    def mindestausbildungsverguetung(self, beginn: Optional[str] = None, ausbildungsjahr: Optional[int] = None, bestandteil: Optional[str] = None) -> Dict[str, Any]:
        return self._c.anfrage("/hr/mindestausbildungsverguetung", {"beginn": beginn, "ausbildungsjahr": ausbildungsjahr, "bestandteil": bestandteil})

    def kuenstlersozialabgabe(self, jahr: Optional[int] = None, datum: Optional[str] = None, bestandteil: Optional[str] = None) -> Dict[str, Any]:
        return self._c.anfrage("/hr/kuenstlersozialabgabe", {"jahr": jahr, "datum": datum, "bestandteil": bestandteil})

    def steuerfreie_betraege(self, datum: Optional[str] = None, bestandteil: Optional[str] = None) -> Dict[str, Any]:
        return self._c.anfrage("/hr/steuerfreie-betraege", {"datum": datum, "bestandteil": bestandteil})

    def sfn_zuschlaege(self, datum: Optional[str] = None, grundlohn_stunde: Optional[float] = None, bestandteil: Optional[str] = None) -> Dict[str, Any]:
        return self._c.anfrage("/hr/sfn-zuschlaege", {"datum": datum, "grundlohn_stunde": grundlohn_stunde, "bestandteil": bestandteil})

    def dienstwagen(self, listenpreis: float, antrieb: Optional[str] = None, anschaffung: Optional[str] = None, entfernung_km: Optional[float] = None,
                    co2_g_km: Optional[float] = None, reichweite_km: Optional[float] = None, batterie_kwh: Optional[float] = None, datum: Optional[str] = None,
                    ueberlassung: Optional[str] = None, fahrten_monat: Optional[int] = None, zuzahlung_monat: Optional[float] = None) -> Dict[str, Any]:
        return self._c.anfrage("/hr/dienstwagen", {"listenpreis": listenpreis, "antrieb": antrieb, "anschaffung": anschaffung, "ueberlassung": ueberlassung,
                                                   "entfernung_km": entfernung_km, "fahrten_monat": fahrten_monat, "zuzahlung_monat": zuzahlung_monat,
                                                   "co2_g_km": co2_g_km, "reichweite_km": reichweite_km, "batterie_kwh": batterie_kwh, "datum": datum})

    def pflegemindestlohn(self, datum: Optional[str] = None, bestandteil: Optional[str] = None) -> Dict[str, Any]:
        return self._c.anfrage("/hr/pflegemindestlohn", {"datum": datum, "bestandteil": bestandteil})

    def ausgleichsabgabe(self, jahr: Optional[int] = None, arbeitsplaetze: Optional[float] = None, besetzt: Optional[float] = None,
                         datum: Optional[str] = None, bestandteil: Optional[str] = None) -> Dict[str, Any]:
        return self._c.anfrage("/hr/ausgleichsabgabe", {"jahr": jahr, "datum": datum, "arbeitsplaetze": arbeitsplaetze, "besetzt": besetzt, "bestandteil": bestandteil})

    def einkommensteuer_eckwerte(self, jahr: Optional[int] = None, datum: Optional[str] = None, bestandteil: Optional[str] = None) -> Dict[str, Any]:
        return self._c.anfrage("/hr/einkommensteuer-eckwerte", {"jahr": jahr, "datum": datum, "bestandteil": bestandteil})

    def regelaltersgrenze(self, geburtsdatum: Optional[str] = None, vertrauensschutz: Optional[bool] = None, geburtsjahr: Optional[int] = None) -> Dict[str, Any]:
        """Mit geburtsdatum genau, mit geburtsjahr für den ganzen Jahrgang (Spanne des Rentenbeginns)."""
        return self._c.anfrage("/hr/regelaltersgrenze", {"geburtsdatum": geburtsdatum, "geburtsjahr": geburtsjahr, "vertrauensschutz": vertrauensschutz})

    def pausen(self, arbeitszeit_stunden: float, jugendlich: Optional[bool] = None) -> Dict[str, Any]:
        return self._c.anfrage("/hr/pausen", {"arbeitszeit_stunden": arbeitszeit_stunden, "jugendlich": jugendlich})

    def verlauf(self, datensatz: str, von: Optional[str] = None, bis: Optional[str] = None, bestandteil: Optional[str] = None) -> Dict[str, Any]:
        """Stufen einer Reihe seit 2015, auf Wunsch nur ein Zeitraum oder ein Bestandteil."""
        if datensatz not in MIT_VERLAUF:
            raise ValueError(f"Für {datensatz} gibt es keinen Verlauf.")
        return self._c.anfrage(f"/hr/{datensatz}/verlauf", {"von": von, "bis": bis, "bestandteil": bestandteil})


class Quellenkontor:
    """Client für die Quellenkontor-API. Ohne api_key wird QK_KEY aus der Umgebung gelesen."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        basis_url: str = STANDARD_BASIS,
        timeout: float = 15.0,
        wiederholungen: int = 2,
        cache: bool = True,
        cache_ttl: float = STANDARD_CACHE_TTL,
        offline: bool = True,
    ):
        self.api_key = api_key or os.environ.get("QK_KEY")
        self.basis_url = basis_url.rstrip("/")
        self.timeout = timeout
        self.wiederholungen = wiederholungen
        # Zwischenspeicher im Speicher dieser Instanz: eine unveränderte Antwort kommt ohne erneute
        # Anfrage zurück, danach nutzt anfrage() If-None-Match mit der gemerkten ETag (304 kostet kein
        # Kontingent). cache_ttl in Sekunden, Standard 5 Minuten.
        self.cache = cache
        self.cache_ttl = cache_ttl
        self._cache: Dict[str, Dict[str, Any]] = {}
        # Offline-Stand nutzen, wenn die API nach allen Wiederholungen nicht erreichbar ist: nur für
        # Tabellen-Datensätze mit Verlauf und nur format="json", siehe _offline_abfrage.
        self.offline = offline
        self.hr = _HR(self)

    def cache_leeren(self) -> None:
        """Leert den Zwischenspeicher, etwa nach einem bekannten neuen Wert (Webhook)."""
        self._cache.clear()

    def anfrage(self, pfad: str, werte: Dict[str, Any], format: str = "json") -> Any:
        """Rohe Anfrage an einen Pfad, zum Beispiel "/hr/mindestlohn". Liefert ein dict oder bei format="csv" Text."""
        parameter = {k: _wert(v) for k, v in werte.items() if v is not None}
        if format == "csv":
            parameter["format"] = "csv"
        url = self.basis_url + pfad + ("?" + urllib.parse.urlencode(parameter) if parameter else "")

        bekannt = self._cache.get(url) if self.cache else None
        if bekannt is not None and bekannt["bis"] > time.monotonic():
            return bekannt["wert"]

        koepfe = {"Accept": "text/csv" if format == "csv" else "application/json", "User-Agent": f"quellenkontor-sdk-python/{__version__}"}
        if self.api_key:
            koepfe["Authorization"] = f"Bearer {self.api_key}"
        if bekannt is not None and bekannt.get("etag"):
            koepfe["If-None-Match"] = bekannt["etag"]

        letzter: Optional[Exception] = None
        for versuch in range(self.wiederholungen + 1):
            if versuch:
                time.sleep(0.3 * 2 ** (versuch - 1))
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers=koepfe), timeout=self.timeout) as antwort:
                    text = antwort.read().decode("utf-8-sig")
                    wert = text if format == "csv" else json.loads(text)
                    if self.cache:
                        self._cache[url] = {"wert": wert, "etag": antwort.headers.get("ETag"), "bis": time.monotonic() + self.cache_ttl}
                    return wert
            except urllib.error.HTTPError as e:
                # Unverändert seit der gemerkten ETag: die gecachte Antwort gilt weiter, ohne dass es zählt
                if e.code == 304 and bekannt is not None:
                    if self.cache:
                        bekannt["bis"] = time.monotonic() + self.cache_ttl
                        self._cache[url] = bekannt
                    return bekannt["wert"]
                if e.code in (502, 503, 504) and versuch < self.wiederholungen:
                    continue
                try:
                    fehler = json.loads(e.read().decode("utf-8")).get("fehler", {})
                except Exception:
                    fehler = {}
                raise QuellenkontorFehler(fehler.get("nachricht", f"HTTP {e.code}"), e.code, fehler.get("code", "unbekannt"), fehler.get("parameter")) from None
            except (urllib.error.URLError, TimeoutError) as e:
                letzter = e
                continue
        # Nach allen Wiederholungen nicht erreichbar: mit dem Offline-Stand weiterhelfen, wenn er diesen Pfad abdeckt
        if self.offline and format == "json":
            offline_wert = _offline_abfrage(pfad, werte)
            if offline_wert is not None:
                return offline_wert
        raise QuellenkontorFehler(f"Keine Verbindung zur API: {letzter}", 0, "netzwerk")

    def datensaetze(self) -> Dict[str, Any]:
        """Katalog aller Datensätze (ohne Schlüssel abrufbar)."""
        return self.anfrage("/datensaetze", {})

    def aenderungen(self) -> Dict[str, Any]:
        """Änderungsprotokoll (ohne Schlüssel abrufbar)."""
        return self.anfrage("/aenderungen", {})

    def status(self) -> Dict[str, Any]:
        """Prüfstand je Datensatz (ohne Schlüssel abrufbar)."""
        return self.anfrage("/status", {})
