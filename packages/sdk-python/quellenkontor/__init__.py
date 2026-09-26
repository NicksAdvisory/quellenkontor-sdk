"""Offizielles SDK für die Quellenkontor-API.

Geprüfte HR-Daten für Deutschland mit Quelle, Rechtsgrundlage und Gültigkeit.
Ohne Abhängigkeiten, ab Python 3.9. Asynchron mit ``pip install "quellenkontor[async]"``.

    import os
    from quellenkontor import Quellenkontor

    qk = Quellenkontor(api_key=os.environ["QK_KEY"])
    ml = qk.hr.mindestlohn(datum="2027-01-15")
    print(ml["mindestlohn_brutto_stunde"])  # 14.6
"""
from __future__ import annotations

import http.client
import json
import socket
import time
import urllib.error
import urllib.request
from typing import TYPE_CHECKING, Any, Dict, Mapping, Optional

from ._kern import (
    MIT_VERLAUF,
    STANDARD_BASIS,
    STANDARD_CACHE_TTL,
    WIEDERHOLBAR,
    QuellenkontorError,
    QuellenkontorFehler,
    _Basis,
    offline_daten,
    retry_after_sekunden,
)
from ._version import __version__
from .typen import (
    Arbeitstage,
    Ausgleichsabgabe,
    Beitragssaetze,
    Dienstwagen,
    Feiertage,
    Komponenten,
    Kuendigungsfrist,
    Mindestausbildungsverguetung,
    Mindestlohn,
    MinijobAbgaben,
    Mutterschutz,
    Pausen,
    Pfaendungsfreigrenzen,
    Rechengroessen,
    Regelaltersgrenze,
    Sachbezugswerte,
    SfnZuschlaege,
    Uebergangsbereich,
    Urlaubsanspruch,
    Verlauf,
)

if TYPE_CHECKING:  # pragma: no cover
    from .aio import AsyncQuellenkontor

__all__ = [
    "Quellenkontor", "AsyncQuellenkontor", "QuellenkontorFehler", "QuellenkontorError", "MIT_VERLAUF",
    "STANDARD_BASIS", "offline_daten", "retry_after_sekunden", "__version__",
]

#: Netzfehler, die auf Python 3.9 nicht alle unter TimeoutError fallen (socket.timeout, Verbindungsabbrüche)
_NETZFEHLER = (urllib.error.URLError, socket.timeout, TimeoutError, OSError, http.client.HTTPException)


def __getattr__(name: str) -> Any:
    # Der asynchrone Client braucht httpx und wird erst beim Zugriff geladen
    if name == "AsyncQuellenkontor":
        from .aio import AsyncQuellenkontor

        return AsyncQuellenkontor
    raise AttributeError(f"module 'quellenkontor' has no attribute {name!r}")


class _HR:
    """Datensätze unter /hr. Beim asynchronen Client liefert jede Methode ein Awaitable desselben Typs."""

    def __init__(self, client: Any):
        self._c = client

    def mindestlohn(self, datum: Optional[str] = None) -> Mindestlohn:
        return self._c.anfrage("/hr/mindestlohn", {"datum": datum})

    def rechengroessen(self, jahr: Optional[int] = None) -> Rechengroessen:
        return self._c.anfrage("/hr/rechengroessen", {"jahr": jahr})

    def beitragssaetze(self, datum: Optional[str] = None) -> Beitragssaetze:
        return self._c.anfrage("/hr/beitragssaetze", {"datum": datum})

    def sachbezugswerte(self, jahr: Optional[int] = None) -> Sachbezugswerte:
        return self._c.anfrage("/hr/sachbezugswerte", {"jahr": jahr})

    def pfaendungsfreigrenzen(self, datum: Optional[str] = None, unterhaltspflichten: Optional[int] = None, netto: Optional[float] = None) -> Pfaendungsfreigrenzen:
        return self._c.anfrage("/hr/pfaendungsfreigrenzen", {"datum": datum, "unterhaltspflichten": unterhaltspflichten, "netto": netto})

    def uebergangsbereich(self, datum: Optional[str] = None) -> Uebergangsbereich:
        return self._c.anfrage("/hr/uebergangsbereich", {"datum": datum})

    def kuendigungsfrist(self, eintritt: str, zugang: str, seite: Optional[str] = None, probezeit: Optional[bool] = None) -> Kuendigungsfrist:
        return self._c.anfrage("/hr/kuendigungsfrist", {"eintritt": eintritt, "zugang": zugang, "seite": seite, "probezeit": probezeit})

    def urlaubsanspruch(self, arbeitstage_pro_woche: float, jahr: Optional[int] = None, eintritt: Optional[str] = None, austritt: Optional[str] = None) -> Urlaubsanspruch:
        return self._c.anfrage("/hr/urlaubsanspruch", {"arbeitstage_pro_woche": arbeitstage_pro_woche, "jahr": jahr, "eintritt": eintritt, "austritt": austritt})

    def mutterschutz(self, termin: Optional[str] = None, geburt: Optional[str] = None, fall: Optional[str] = None, ssw: Optional[int] = None) -> Mutterschutz:
        return self._c.anfrage("/hr/mutterschutz", {"termin": termin, "geburt": geburt, "fall": fall, "ssw": ssw})

    def feiertage(self, jahr: Optional[int] = None, land: Optional[str] = None) -> Feiertage:
        return self._c.anfrage("/hr/feiertage", {"jahr": jahr, "land": land})

    def arbeitstage(self, von: str, bis: str, land: str, samstag: Optional[bool] = None, regionale: Optional[bool] = None) -> Arbeitstage:
        return self._c.anfrage("/hr/arbeitstage", {"von": von, "bis": bis, "land": land, "samstag": samstag, "regionale": regionale})

    def minijob_abgaben(self, datum: Optional[str] = None, bestandteil: Optional[str] = None) -> MinijobAbgaben:
        return self._c.anfrage("/hr/minijob-abgaben", {"datum": datum, "bestandteil": bestandteil})

    def reisekosten_inland(self, datum: Optional[str] = None, bestandteil: Optional[str] = None) -> Komponenten:
        return self._c.anfrage("/hr/reisekosten-inland", {"datum": datum, "bestandteil": bestandteil})

    def mindestausbildungsverguetung(self, beginn: Optional[str] = None, ausbildungsjahr: Optional[int] = None, bestandteil: Optional[str] = None) -> Mindestausbildungsverguetung:
        """Maßgeblich ist der Ausbildungsbeginn (beginn), auch für das 2. bis 4. Ausbildungsjahr."""
        return self._c.anfrage("/hr/mindestausbildungsverguetung", {"beginn": beginn, "ausbildungsjahr": ausbildungsjahr, "bestandteil": bestandteil})

    def kuenstlersozialabgabe(self, jahr: Optional[int] = None, datum: Optional[str] = None, bestandteil: Optional[str] = None) -> Komponenten:
        return self._c.anfrage("/hr/kuenstlersozialabgabe", {"jahr": jahr, "datum": datum, "bestandteil": bestandteil})

    def steuerfreie_betraege(self, datum: Optional[str] = None, bestandteil: Optional[str] = None) -> Komponenten:
        return self._c.anfrage("/hr/steuerfreie-betraege", {"datum": datum, "bestandteil": bestandteil})

    def sfn_zuschlaege(self, datum: Optional[str] = None, grundlohn_stunde: Optional[float] = None, bestandteil: Optional[str] = None) -> SfnZuschlaege:
        return self._c.anfrage("/hr/sfn-zuschlaege", {"datum": datum, "grundlohn_stunde": grundlohn_stunde, "bestandteil": bestandteil})

    def dienstwagen(self, listenpreis: float, antrieb: Optional[str] = None, anschaffung: Optional[str] = None, entfernung_km: Optional[float] = None,
                    co2_g_km: Optional[float] = None, reichweite_km: Optional[float] = None, batterie_kwh: Optional[float] = None, datum: Optional[str] = None,
                    ueberlassung: Optional[str] = None, fahrten_monat: Optional[int] = None, zuzahlung_monat: Optional[float] = None) -> Dienstwagen:
        return self._c.anfrage("/hr/dienstwagen", {"listenpreis": listenpreis, "antrieb": antrieb, "anschaffung": anschaffung, "ueberlassung": ueberlassung,
                                                   "entfernung_km": entfernung_km, "fahrten_monat": fahrten_monat, "zuzahlung_monat": zuzahlung_monat,
                                                   "co2_g_km": co2_g_km, "reichweite_km": reichweite_km, "batterie_kwh": batterie_kwh, "datum": datum})

    def pflegemindestlohn(self, datum: Optional[str] = None, bestandteil: Optional[str] = None) -> Komponenten:
        return self._c.anfrage("/hr/pflegemindestlohn", {"datum": datum, "bestandteil": bestandteil})

    def ausgleichsabgabe(self, jahr: Optional[int] = None, arbeitsplaetze: Optional[float] = None, besetzt: Optional[float] = None,
                         datum: Optional[str] = None, bestandteil: Optional[str] = None) -> Ausgleichsabgabe:
        return self._c.anfrage("/hr/ausgleichsabgabe", {"jahr": jahr, "datum": datum, "arbeitsplaetze": arbeitsplaetze, "besetzt": besetzt, "bestandteil": bestandteil})

    def einkommensteuer_eckwerte(self, jahr: Optional[int] = None, datum: Optional[str] = None, bestandteil: Optional[str] = None) -> Komponenten:
        return self._c.anfrage("/hr/einkommensteuer-eckwerte", {"jahr": jahr, "datum": datum, "bestandteil": bestandteil})

    def regelaltersgrenze(self, geburtsdatum: Optional[str] = None, vertrauensschutz: Optional[bool] = None, geburtsjahr: Optional[int] = None) -> Regelaltersgrenze:
        """Mit geburtsdatum genau, mit geburtsjahr für den ganzen Jahrgang (Spanne des Rentenbeginns)."""
        return self._c.anfrage("/hr/regelaltersgrenze", {"geburtsdatum": geburtsdatum, "geburtsjahr": geburtsjahr, "vertrauensschutz": vertrauensschutz})

    def pausen(self, arbeitszeit_stunden: float, jugendlich: Optional[bool] = None) -> Pausen:
        return self._c.anfrage("/hr/pausen", {"arbeitszeit_stunden": arbeitszeit_stunden, "jugendlich": jugendlich})

    def verlauf(self, datensatz: str, von: Optional[str] = None, bis: Optional[str] = None, bestandteil: Optional[str] = None) -> Verlauf:
        """Stufen einer Reihe seit 2015, auf Wunsch nur ein Zeitraum oder ein Bestandteil."""
        if datensatz not in MIT_VERLAUF:
            raise ValueError(f"Für {datensatz} gibt es keinen Verlauf.")
        return self._c.anfrage(f"/hr/{datensatz}/verlauf", {"von": von, "bis": bis, "bestandteil": bestandteil})


class Quellenkontor(_Basis):
    """Synchroner Client für die Quellenkontor-API. Ohne api_key wird QK_KEY aus der Umgebung gelesen.

    Threadsicher: Zwischenspeicher und Bremse sind mit einer Sperre geschützt, eine Instanz kann von
    mehreren Threads genutzt werden. Englische Namen der Optionen: ``base_url``, ``retries``,
    ``max_per_second``, ``cache_max_entries``, ``offline_max_age_days``.
    """

    def __init__(self, api_key: Optional[str] = None, basis_url: Optional[str] = None, timeout: float = 15.0,
                 wiederholungen: Optional[int] = None, cache: bool = True, cache_ttl: float = STANDARD_CACHE_TTL,
                 offline: bool = True, max_pro_sekunde: Optional[float] = None, cache_max_eintraege: Optional[int] = None,
                 offline_warnung_tage: Optional[int] = None, **englisch: Any):
        super().__init__(api_key, basis_url, timeout, wiederholungen, cache, cache_ttl, offline, max_pro_sekunde,
                         cache_max_eintraege, offline_warnung_tage, **englisch)
        self.hr = _HR(self)

    def _takt(self) -> None:
        warten = self._takt_wartezeit()
        if warten > 0:
            time.sleep(warten)

    def anfrage(self, pfad: str, werte: Optional[Mapping[str, Any]] = None, format: str = "json") -> Any:
        """Rohe Anfrage an einen Pfad, zum Beispiel "/hr/mindestlohn". Liefert ein dict oder bei format="csv" Text.

        Wiederholt bei Netzfehlern und 408, 500, 502, 503, 504 (Retry-After wird beachtet), wartet bei 429
        zu_schnell und nutzt nach dem letzten Versuch den Offline-Stand, wenn er den Pfad abdeckt.
        """
        werte = dict(werte or {})
        url, bekannt, koepfe = self._vorbereiten(pfad, werte, format)
        if bekannt is not None and bekannt["bis"] > time.monotonic():
            return bekannt["wert"]

        letzter: Optional[BaseException] = None
        gebremst = 0
        versuch = 0
        pause: Optional[float] = None
        while versuch <= self.wiederholungen:
            if versuch:
                time.sleep(max(0.3 * 2 ** (versuch - 1), pause or 0.0))
            pause = None
            versuch += 1
            self._takt()
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers=koepfe), timeout=self.timeout) as antwort:
                    text = antwort.read().decode("utf-8-sig")
                    wert = text if format == "csv" else json.loads(text)
                    self._merken(url, wert, antwort.headers.get("ETag"))
                    return wert
            except urllib.error.HTTPError as e:
                # Unverändert seit der gemerkten ETag: die gecachte Antwort gilt weiter, ohne dass es zählt
                if e.code == 304 and bekannt is not None:
                    self._auffrischen(url, bekannt)
                    return bekannt["wert"]
                try:
                    koerper = e.read()
                except Exception:
                    koerper = b""
                fehler = self._fehler_aus(e.code, koerper)
                # Zu schnell (nicht Kontingent): Retry-After abwarten und dieselbe Anfrage erneut, bis zu 5 Mal
                if e.code == 429 and fehler.code == "zu_schnell" and gebremst < 5:
                    gebremst += 1
                    versuch -= 1
                    warten = retry_after_sekunden(e.headers.get("Retry-After"))
                    time.sleep(1.0 if warten is None else warten)
                    continue
                if e.code == 403 and e.headers.get("x-vercel-mitigated"):
                    raise self._ausgebremst() from None
                if e.code in WIEDERHOLBAR:
                    letzter = fehler
                    pause = retry_after_sekunden(e.headers.get("Retry-After"))
                    continue
                raise fehler from None
            except _NETZFEHLER as e:
                letzter = e
                continue
        return self._nach_allen_versuchen(pfad, werte, format, letzter)

    #: Englischer Name für anfrage
    request = anfrage

    def datensaetze(self) -> Dict[str, Any]:
        """Katalog aller Datensätze (ohne Schlüssel abrufbar)."""
        return self.anfrage("/datensaetze")

    def aenderungen(self) -> Dict[str, Any]:
        """Änderungsprotokoll (ohne Schlüssel abrufbar)."""
        return self.anfrage("/aenderungen")

    def status(self) -> Dict[str, Any]:
        """Prüfstand je Datensatz (ohne Schlüssel abrufbar)."""
        return self.anfrage("/status")
