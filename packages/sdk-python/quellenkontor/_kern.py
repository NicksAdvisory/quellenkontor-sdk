"""Gemeinsamer Kern für den synchronen und den asynchronen Client: Fehler, Konfiguration,
Zwischenspeicher, Bremse, Retry-After und der Offline-Stand."""
from __future__ import annotations

import datetime
import email.utils
import importlib.resources
import json
import os
import re
import threading
import time
import urllib.parse
from collections import OrderedDict
from typing import Any, Dict, List, Mapping, Optional

from ._version import __version__

STANDARD_BASIS = "https://api.quellenkontor.dev/v1"
STANDARD_CACHE_TTL = 300.0  # Sekunden, wie der Standard von 5 Minuten im JavaScript-SDK
STANDARD_CACHE_MAX = 500
MAX_WARTEN_S = 30.0
#: Status, bei denen das SDK dieselbe Anfrage mit Pause wiederholt
WIEDERHOLBAR = frozenset({408, 500, 502, 503, 504})
MIT_VERLAUF = frozenset({
    "mindestlohn", "rechengroessen", "beitragssaetze", "sachbezugswerte", "pfaendungsfreigrenzen", "uebergangsbereich",
    "minijob-abgaben", "reisekosten-inland", "mindestausbildungsverguetung", "kuenstlersozialabgabe", "steuerfreie-betraege",
    "sfn-zuschlaege", "pflegemindestlohn", "ausgleichsabgabe", "einkommensteuer-eckwerte",
})


class QuellenkontorFehler(Exception):
    """Fehler der API oder des SDK mit HTTP-Status, stabilem Code und betroffenem Parameter.

    Codes des SDK: ``netzwerk`` (keine Verbindung nach allen Wiederholungen), ``kein_wert_offline``
    (Offline-Stand ohne Wert für den Stichtag), ``ausgebremst`` (Schutzschicht vor der API),
    ``kein_httpx`` (asynchroner Client ohne installiertes httpx). Alle anderen Codes kommen von der API.
    """

    def __init__(self, nachricht: str, status: int, code: str, parameter: Optional[str] = None):
        super().__init__(nachricht)
        self.status = status
        self.code = code
        self.parameter = parameter


#: Englischer Name, dieselbe Klasse
QuellenkontorError = QuellenkontorFehler


def _wert(v: Any) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    return str(v)


def retry_after_sekunden(wert: Optional[str], jetzt: Optional[float] = None) -> Optional[float]:
    """Retry-After als Sekunden oder HTTP-Datum (RFC 9110), höchstens 30 Sekunden; None, wenn nicht lesbar."""
    if not wert:
        return None
    text = wert.strip()
    if re.fullmatch(r"\d+(\.\d+)?", text):
        sekunden = float(text)
    else:
        try:
            zeit = email.utils.parsedate_to_datetime(text)
        except (TypeError, ValueError, IndexError):
            return None
        if zeit is None:
            return None
        if zeit.tzinfo is None:
            zeit = zeit.replace(tzinfo=datetime.timezone.utc)
        sekunden = zeit.timestamp() - (time.time() if jetzt is None else jetzt)
    return min(MAX_WARTEN_S, max(0.0, sekunden))


class _Zwischenspeicher:
    """LRU-Speicher mit Obergrenze, threadsicher."""

    def __init__(self, maximum: int):
        self._max = max(1, maximum)
        self._daten: "OrderedDict[str, Dict[str, Any]]" = OrderedDict()
        self._sperre = threading.Lock()

    def holen(self, schluessel: str) -> Optional[Dict[str, Any]]:
        with self._sperre:
            eintrag = self._daten.get(schluessel)
            if eintrag is not None:
                self._daten.move_to_end(schluessel)
            return eintrag

    def setzen(self, schluessel: str, eintrag: Dict[str, Any]) -> None:
        with self._sperre:
            self._daten[schluessel] = eintrag
            self._daten.move_to_end(schluessel)
            while len(self._daten) > self._max:
                self._daten.popitem(last=False)

    def leeren(self) -> None:
        with self._sperre:
            self._daten.clear()

    def __len__(self) -> int:
        return len(self._daten)


# --------------------------------------------------------------------------------------------------
# Offline-Stand: Verlauf der Tabellen-Datensätze, mitgeliefert in offline_daten.json (siehe
# scripts/offline-snapshot.mjs in der App), erst bei Bedarf geladen.

_OFFLINE_DATEN: Optional[Dict[str, Any]] = None
_OFFLINE_SPERRE = threading.Lock()
_PFAD_MUSTER = re.compile(r"^/hr/([a-z0-9-]+)(/verlauf)?$")


def offline_daten() -> Dict[str, Any]:
    """Der mitgelieferte Offline-Stand: datenstand, erzeugt_am und datensaetze (Verlauf je Datensatz)."""
    global _OFFLINE_DATEN
    with _OFFLINE_SPERRE:
        if _OFFLINE_DATEN is None:
            with importlib.resources.files(__package__).joinpath("offline_daten.json").open("r", encoding="utf-8") as f:
                _OFFLINE_DATEN = json.load(f)
        return _OFFLINE_DATEN


def _beginn_von(z: Mapping[str, Any]) -> str:
    """Beginn einer Verlaufszeile: gueltig_ab, sonst der 1. Januar des Feldes jahr (wie lib/verlauf.ts serverseitig)."""
    gueltig_ab = z.get("gueltig_ab")
    return gueltig_ab if isinstance(gueltig_ab, str) else f"{z['jahr']}-01-01"


def _nach_gruppe(zeilen: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
    gruppen: Dict[str, List[Dict[str, Any]]] = {}
    for z in zeilen:
        g = z.get("bestandteil") if isinstance(z.get("bestandteil"), str) else ""
        gruppen.setdefault(g, []).append(z)
    return [sorted(liste, key=_beginn_von) for liste in gruppen.values()]


def _ende_von(z: Mapping[str, Any], naechste: Optional[Mapping[str, Any]]) -> Optional[str]:
    """Ende wie serverseitig: ausdrücklich, bei Jahreswerten der 31.12., sonst Vortag der nächsten Stufe."""
    if isinstance(z.get("gueltig_bis"), str):
        return z["gueltig_bis"]
    if z.get("jahr") is not None:
        return f"{z['jahr']}-12-31"
    if naechste is None:
        return None
    return (datetime.date.fromisoformat(_beginn_von(naechste)) - datetime.timedelta(days=1)).isoformat()


def _aktuelle_zeilen(zeilen: List[Dict[str, Any]], ziel_datum: str) -> List[Dict[str, Any]]:
    """Je Gruppe die jüngste Zeile, die am ziel_datum gilt (Beginn nicht danach, gueltig_bis nicht davor)."""
    aus: List[Dict[str, Any]] = []
    for liste in _nach_gruppe(zeilen):
        passend = [z for z in liste if _beginn_von(z) <= ziel_datum]
        if not passend:
            continue
        letzte = passend[-1]
        if isinstance(letzte.get("gueltig_bis"), str) and letzte["gueltig_bis"] < ziel_datum:
            continue
        aus.append(letzte)
    return aus


def _verlauf_offline(zeilen: List[Dict[str, Any]], werte: Mapping[str, Any]) -> List[Dict[str, Any]]:
    """Verlauf offline filtern wie lib/verlauf.ts: bis wirkt auf den Beginn, von auf das (abgeleitete) Ende."""
    ende: Dict[int, Optional[str]] = {}
    for liste in _nach_gruppe(zeilen):
        for i, z in enumerate(liste):
            ende[id(z)] = _ende_von(z, liste[i + 1] if i + 1 < len(liste) else None)
    bestandteil, von, bis = werte.get("bestandteil"), werte.get("von"), werte.get("bis")

    def passt(z: Dict[str, Any]) -> bool:
        if bestandteil is not None and z.get("bestandteil") != bestandteil:
            return False
        if bis is not None and _beginn_von(z) > bis:
            return False
        if von is not None and (ende.get(id(z)) or "9999-12-31") < von:
            return False
        return True

    return [z for z in zeilen if passt(z)]


def _offline_hinweise(daten: Mapping[str, Any], warn_tage: int) -> List[str]:
    hinweise = [
        f"Antwort aus dem Offline-Stand des SDK (Datenstand {daten['datenstand']}), die API war nicht erreichbar. "
        "Sobald sie wieder antwortet, gilt ihr amtlicher Stand."
    ]
    try:
        erzeugt = datetime.datetime.fromisoformat(str(daten["erzeugt_am"]).replace("Z", "+00:00"))
        alter = (datetime.datetime.now(datetime.timezone.utc) - erzeugt).days
    except (KeyError, ValueError):
        return hinweise
    if alter >= warn_tage:
        hinweise.append(f"Der Offline-Stand ist {alter} Tage alt. Neuere amtliche Werte sind möglich, bitte das SDK aktualisieren.")
    return hinweise


def offline_abfrage(pfad: str, werte: Mapping[str, Any], warn_tage: int = 30) -> Optional[Dict[str, Any]]:
    """Offline-Antwort für einen Pfad, oder None, wenn der Pfad kein Tabellen-Datensatz mit Verlauf ist."""
    treffer_pfad = _PFAD_MUSTER.match(pfad)
    if not treffer_pfad:
        return None
    datensatz_id, ist_verlauf = treffer_pfad.group(1), treffer_pfad.group(2) is not None
    daten = offline_daten()
    zeilen = daten["datensaetze"].get(datensatz_id)
    if zeilen is None:
        return None
    datenstand = daten["datenstand"]
    hinweise = _offline_hinweise(daten, warn_tage)

    if ist_verlauf:
        gefiltert = _verlauf_offline(zeilen, werte)
        return {"datensatz": datensatz_id, "anzahl": len(gefiltert), "verlauf": gefiltert, "offline": True, "datenstand": datenstand, "hinweise": hinweise}

    # Stichtag wie serverseitig: mindestausbildungsverguetung nach Ausbildungsbeginn (Kohorte), nicht nach
    # Abrechnungsdatum; sonst datum, dann jahr (1. Januar wie die API), sonst heute
    mav = datensatz_id == "mindestausbildungsverguetung"
    heute = datetime.date.today().isoformat()
    if mav:
        aj = werte.get("ausbildungsjahr")
        aj = int(aj) if aj is not None else None
        if werte.get("beginn") is None and aj is not None and aj > 1:
            raise QuellenkontorFehler(
                f"Für das {aj}. Ausbildungsjahr brauchst du beginn: Maßgeblich ist der Betrag des Jahres, in dem die "
                "Ausbildung begonnen hat, nicht der des laufenden Jahres.", 400, "parameter_fehlt", "beginn",
            )
        ziel_datum = str(werte["beginn"]) if werte.get("beginn") is not None else heute
        letztes_jahr = max(_beginn_von(z)[:4] for z in zeilen)
        if ziel_datum[:4] > letztes_jahr:
            raise QuellenkontorFehler(
                f"Die Mindestvergütung für einen Ausbildungsbeginn {ziel_datum[:4]} ist im Offline-Stand ({datenstand}) "
                f"noch nicht enthalten. Verfügbar bis Beginnjahr {letztes_jahr}.", 0, "kein_wert_offline", "beginn",
            )
    elif werte.get("datum") is not None:
        ziel_datum = str(werte["datum"])
    elif werte.get("jahr") is not None:
        ziel_datum = f"{werte['jahr']}-01-01"
    else:
        ziel_datum = heute

    treffer = _aktuelle_zeilen(zeilen, ziel_datum)
    if not treffer:
        raise QuellenkontorFehler(
            f"Für diesen Stichtag gibt es im Offline-Stand ({datenstand}) keinen Wert von {datensatz_id}. "
            "Sobald die API wieder erreichbar ist, liefert sie den amtlichen Stand.",
            0, "kein_wert_offline",
        )
    basis: Dict[str, Any] = {"datensatz": datensatz_id, "offline": True, "datenstand": datenstand, "hinweise": hinweise}
    if not mav and werte.get("datum") is not None:
        basis["datum"] = ziel_datum
    if not mav and werte.get("jahr") is not None:
        basis["jahr"] = int(werte["jahr"])
    if not any(isinstance(z.get("bestandteil"), str) for z in treffer):
        return {**basis, **treffer[0]}
    ergebnis: Dict[str, Any] = {**basis, "werte": {z["bestandteil"]: z.get("wert") for z in treffer}, "bestandteile": treffer}
    if mav:
        aj = werte.get("ausbildungsjahr")
        aj = int(aj) if aj is not None else None
        ergebnis.update({
            "beginn": ziel_datum,
            "ausbildungsjahr": aj,
            "mindestverguetung_monat": ergebnis["werte"].get(f"ausbildungsjahr_{aj}") if aj else None,
        })
    return ergebnis


# --------------------------------------------------------------------------------------------------
# Konfiguration und Bausteine, die beide Clients teilen


def _wahl(deutsch: Any, englisch: Any, standard: Any) -> Any:
    if deutsch is not None:
        return deutsch
    if englisch is not None:
        return englisch
    return standard


class _Basis:
    def __init__(
        self,
        api_key: Optional[str] = None,
        basis_url: Optional[str] = None,
        timeout: float = 15.0,
        wiederholungen: Optional[int] = None,
        cache: bool = True,
        cache_ttl: float = STANDARD_CACHE_TTL,
        offline: bool = True,
        max_pro_sekunde: Optional[float] = None,
        cache_max_eintraege: Optional[int] = None,
        offline_warnung_tage: Optional[int] = None,
        *,
        base_url: Optional[str] = None,
        retries: Optional[int] = None,
        max_per_second: Optional[float] = None,
        cache_max_entries: Optional[int] = None,
        offline_max_age_days: Optional[int] = None,
    ):
        self.api_key = api_key or os.environ.get("QK_KEY")
        self.basis_url = str(_wahl(basis_url, base_url, STANDARD_BASIS)).rstrip("/")
        self.timeout = timeout
        self.wiederholungen = max(0, int(_wahl(wiederholungen, retries, 2)))
        # Zwischenspeicher: unveränderte Antwort ohne erneute Anfrage, danach If-None-Match mit der gemerkten
        # ETag (304 kostet kein Kontingent). cache_ttl in Sekunden, höchstens cache_max_eintraege Antworten.
        self.cache = cache
        self.cache_ttl = cache_ttl
        self._cache = _Zwischenspeicher(int(_wahl(cache_max_eintraege, cache_max_entries, STANDARD_CACHE_MAX)))
        # Offline-Stand, wenn die API nach allen Wiederholungen nicht erreichbar ist oder mit 5xx antwortet
        self.offline = offline
        self.offline_warnung_tage = int(_wahl(offline_warnung_tage, offline_max_age_days, 30))
        # Bremse: höchstens so viele Anfragen je Sekunde (API-Grenze 10), 0 schaltet sie ab
        pro_sekunde = float(_wahl(max_pro_sekunde, max_per_second, 8))
        self._abstand = 1.0 / pro_sekunde if pro_sekunde > 0 else 0.0
        self._naechster_start = 0.0
        self._takt_sperre = threading.Lock()

    # Englische Namen für die Attribute
    @property
    def base_url(self) -> str:
        return self.basis_url

    @property
    def retries(self) -> int:
        return self.wiederholungen

    def _takt_wartezeit(self) -> float:
        """Wartezeit bis zum nächsten erlaubten Start, threadsicher reserviert."""
        if not self._abstand:
            return 0.0
        with self._takt_sperre:
            jetzt = time.monotonic()
            start = max(jetzt, self._naechster_start)
            self._naechster_start = start + self._abstand
            return start - jetzt

    def cache_leeren(self) -> None:
        """Leert den Zwischenspeicher, etwa nach einem bekannten neuen Wert (Webhook)."""
        self._cache.leeren()

    clear_cache = cache_leeren

    def offline_antwort(self, pfad: str, werte: Optional[Mapping[str, Any]] = None) -> Optional[Dict[str, Any]]:
        """Antwort aus dem Offline-Stand, ohne die API zu fragen; None, wenn der Pfad keinen Offline-Stand hat."""
        return offline_abfrage(pfad, {k: v for k, v in (werte or {}).items() if v is not None}, self.offline_warnung_tage)

    def _vorbereiten(self, pfad: str, werte: Mapping[str, Any], format: str):
        parameter = {k: _wert(v) for k, v in werte.items() if v is not None}
        if format == "csv":
            parameter["format"] = "csv"
        url = self.basis_url + pfad + ("?" + urllib.parse.urlencode(parameter) if parameter else "")
        bekannt = self._cache.holen(url) if self.cache else None
        koepfe = {"Accept": "text/csv" if format == "csv" else "application/json", "User-Agent": f"quellenkontor-sdk-python/{__version__}"}
        if self.api_key:
            koepfe["Authorization"] = f"Bearer {self.api_key}"
        if bekannt is not None and bekannt.get("etag"):
            koepfe["If-None-Match"] = bekannt["etag"]
        return url, bekannt, koepfe

    def _merken(self, url: str, wert: Any, etag: Optional[str]) -> None:
        if self.cache:
            self._cache.setzen(url, {"wert": wert, "etag": etag, "bis": time.monotonic() + self.cache_ttl})

    def _auffrischen(self, url: str, bekannt: Dict[str, Any]) -> None:
        if self.cache:
            self._cache.setzen(url, {**bekannt, "bis": time.monotonic() + self.cache_ttl})

    @staticmethod
    def _fehler_aus(status: int, koerper: bytes) -> QuellenkontorFehler:
        try:
            fehler = json.loads(koerper.decode("utf-8")).get("fehler", {}) or {}
        except Exception:
            fehler = {}
        return QuellenkontorFehler(fehler.get("nachricht", f"HTTP {status}"), status, fehler.get("code", "unbekannt"), fehler.get("parameter"))

    @staticmethod
    def _ausgebremst() -> QuellenkontorFehler:
        return QuellenkontorFehler(
            "Die Schutzschicht vor der API hat diese Adresse vorübergehend ausgebremst, meist nach sehr vielen Anfragen in "
            "kurzer Zeit. Bitte langsamer abfragen (max_pro_sekunde) und in einigen Minuten erneut versuchen, oder "
            "hello@quellenkontor.dev schreiben.", 403, "ausgebremst",
        )

    def _nach_allen_versuchen(self, pfad: str, werte: Mapping[str, Any], format: str, letzter: Optional[BaseException]) -> Any:
        """Nach allen Wiederholungen: Offline-Stand, sonst der letzte Fehler der API oder ein Netzwerkfehler."""
        if self.offline and format == "json":
            offline_wert = offline_abfrage(pfad, {k: v for k, v in werte.items() if v is not None}, self.offline_warnung_tage)
            if offline_wert is not None:
                return offline_wert
        if isinstance(letzter, QuellenkontorFehler):
            raise letzter
        raise QuellenkontorFehler(f"Keine Verbindung zur API: {letzter}", 0, "netzwerk")
