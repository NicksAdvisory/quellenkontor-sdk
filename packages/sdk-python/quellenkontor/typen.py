"""Antworttypen der Quellenkontor-API als TypedDict. Feld- und Parameternamen sind deutsch, wie in der API.

Alle Typen sind ``total=False``: Antworten aus dem Offline-Stand tragen zusätzlich ``offline`` und
``datenstand``, dafür fehlen ``lizenz``, ``stand`` und berechnete Zusatzfelder (``zitat``,
``vorheriger_wert``, ``naechster_wert``).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, TypedDict


class Quelle(TypedDict, total=False):
    titel: str
    url: str


class Basis(TypedDict, total=False):
    datensatz: str
    hinweise: List[str]
    lizenz: str
    stand: str
    zitat: str
    datenstand: str
    #: True, wenn die Antwort aus dem mitgelieferten Offline-Stand kommt
    offline: bool


class Gueltig(Basis, total=False):
    gueltig_ab: str
    gueltig_bis: Optional[str]
    rechtsgrundlage: str
    quelle: Quelle


class RechnerBasis(Basis, total=False):
    rechtsgrundlage: str
    quelle: Quelle
    quellen: List[Quelle]


class Mindestlohn(Gueltig, total=False):
    datum: str
    mindestlohn_brutto_stunde: float
    minijob_grenze_monat: float
    minijob_rechtsgrundlage: str
    minijob_quelle: Quelle
    vorheriger_wert: Optional[Dict[str, Any]]
    naechster_wert: Optional[Dict[str, Any]]


class Rechengroessen(Gueltig, total=False):
    jahr: int
    rechtskreise_einheitlich: bool
    bbg_kv_monat: float
    bbg_kv_jahr: float
    bbg_rv_west_monat: float
    bbg_rv_west_jahr: float
    bbg_rv_ost_monat: float
    bbg_rv_ost_jahr: float
    bbg_knappschaft_west_monat: float
    bbg_knappschaft_west_jahr: float
    bbg_knappschaft_ost_monat: float
    bbg_knappschaft_ost_jahr: float
    jaeg_allgemein_jahr: float
    jaeg_besonders_jahr: float
    bezugsgroesse_west_monat: float
    bezugsgroesse_west_jahr: float
    bezugsgroesse_ost_monat: float
    bezugsgroesse_ost_jahr: float


class Sachbezugswerte(Gueltig, total=False):
    jahr: int
    verpflegung_monat: float
    fruehstueck_monat: float
    mittagessen_monat: float
    abendessen_monat: float
    fruehstueck_tag: float
    mittag_abend_tag: float
    unterkunft_monat: float
    unterkunft_tag: float


class Pfaendungsfreigrenzen(Gueltig, total=False):
    datum: str
    grundbetrag_monat: float
    erhoehung_erste_person_monat: float
    erhoehung_weitere_person_monat: float
    voll_pfaendbar_ab_monat: float
    unterhaltspflichten: Optional[int]
    freibetrag_monat: Optional[float]
    netto_monat: Optional[float]
    pfaendbarer_betrag_monat: Optional[float]


class Uebergangsbereich(Gueltig, total=False):
    datum: str
    bezeichnung: str
    untergrenze_monat: float
    obergrenze_monat: float
    faktor_f: Optional[float]
    faktor_f_rechtsgrundlage: Optional[str]
    faktor_f_quelle: Optional[Quelle]
    faktor_f_definition: str


class Bestandteil(TypedDict, total=False):
    """Bestandteil eines Datensatzes mit eigenem Gültig-ab (Feld bestandteile)."""
    id: str
    name: str
    gruppe: Optional[str]
    art: str
    wirkung: str
    einheit: str
    #: None, solange ein angekündigter Wert noch nicht festgesetzt ist (status ausstehend)
    wert: Optional[float]
    gueltig_ab: str
    gueltig_bis: Optional[str]
    rechtsgrundlage: str
    quelle: Quelle
    hinweis: Optional[str]
    naechster_wert: Optional[Dict[str, Any]]
    status: str
    erwartet: str


class Komponenten(Basis, total=False):
    datum: str
    jahr: int
    vorlaeufig: bool
    werte: Dict[str, Optional[float]]
    bestandteile: List[Bestandteil]
    regeln: List[str]


class Beitragssaetze(Komponenten, total=False):
    saetze: Dict[str, float]


class Mindestausbildungsverguetung(Komponenten, total=False):
    beginn: str
    ausbildungsjahr: Optional[int]
    mindestverguetung_monat: Optional[float]


class Ausgleichsabgabe(Komponenten, total=False):
    arbeitsplaetze: Optional[float]
    besetzt: Optional[float]
    pflichtplaetze: Optional[int]
    pflichtplatz_monate: Optional[int]
    beschaeftigungsquote_prozent: Optional[float]
    unbesetzt: Optional[float]
    unbesetzt_monate: Optional[float]
    stufe: Optional[str]
    betrag_monat: Optional[float]
    abgabe_jahr: Optional[float]


class SfnZuschlaege(Komponenten, total=False):
    grundlohn_stunde: Optional[float]
    betraege_stunde: Optional[Dict[str, Dict[str, float]]]
    kombinationen: Dict[str, Dict[str, Any]]
    sondertag: Optional[Dict[str, Any]]


class MinijobAbgaben(Komponenten, total=False):
    summen: Dict[str, Optional[float]]


class Kuendigungsfrist(RechnerBasis, total=False):
    eintritt: str
    zugang: str
    seite: str
    probezeit: bool
    betriebszugehoerigkeit_jahre: int
    frist: str
    frist_code: str
    fristende: str
    ende: str


class Urlaubsanspruch(RechnerBasis, total=False):
    arbeitstage_pro_woche: float
    anspruch_tage_jahr: float
    formel: str
    jahr: int
    anspruch_tage_im_jahr: float
    teilurlaub: bool
    teilurlaub_fall: str
    volle_monate: int
    anspruch_ungerundet: float


class Mutterschutz(RechnerBasis, total=False):
    termin: Optional[str]
    geburt: Optional[str]
    fall: str
    beginn: Optional[str]
    ende: Optional[str]
    wochen_nach_entbindung: int
    verlaengerung_tage: int
    dauer_tage: int
    ssw: int


class Feiertag(TypedDict, total=False):
    datum: str
    id: str
    name: str
    wochentag: str
    regional: bool
    regional_hinweis: Optional[str]
    sonntag: bool
    laender: List[str]
    laender_regional: List[str]
    bundesweit: bool


class Feiertage(RechnerBasis, total=False):
    jahr: int
    land: Optional[str]
    land_name: str
    anzahl: int
    anzahl_landesweit_montag_bis_freitag: int
    feiertage: List[Feiertag]


class Arbeitstage(RechnerBasis, total=False):
    von: str
    bis: str
    land: str
    land_name: str
    samstag_als_arbeitstag: bool
    regionale_feiertage_abgezogen: bool
    kalendertage: int
    arbeitstage: int
    feiertage_an_arbeitstagen: List[Dict[str, Any]]


class Dienstwagen(RechnerBasis, total=False):
    datum: str
    antrieb: str
    anschaffung: Optional[str]
    ueberlassung: Optional[str]
    listenpreis: float
    minderung: Optional[Dict[str, Any]]
    batterie_abzug: float
    bemessungsgrundlage: float
    privatnutzung_monat: float
    entfernung_km: Optional[float]
    fahrten_monat: Optional[int]
    arbeitsweg_methode: Optional[str]
    zuzahlung_monat: float
    geldwerter_vorteil_monat: float
    regeln: List[str]


class Regelaltersgrenze(RechnerBasis, total=False):
    geburtsdatum: Optional[str]
    geburtsjahr: int
    vertrauensschutz: bool
    regelaltersgrenze_jahre: int
    regelaltersgrenze_monate: int
    anhebung_monate: int
    erreicht_am: Optional[str]
    rentenbeginn: Optional[str]
    rentenbeginn_spanne: Dict[str, str]


class Pausen(RechnerBasis, total=False):
    arbeitszeit_stunden: float
    jugendlich: bool
    pause_minuten: int
    anwesenheit_stunden: float
    hoechstens_ohne_pause_stunden: float
    mindestdauer_abschnitt_minuten: int
    hoechstarbeitszeit_tag_stunden: float
    hoechstarbeitszeit_tag_ausnahme_stunden: float
    ruhezeit_stunden: float
    warnungen: List[str]


class Verlauf(TypedDict, total=False):
    """Antwort von /hr/<datensatz>/verlauf. Die Zeilen haben je Datensatz eigene Felder (siehe README)."""
    datensatz: str
    anzahl: int
    verlauf: List[Dict[str, Any]]
    datenstand: str
    hinweise: List[str]
    offline: bool


class ApiFehlerKoerper(TypedDict, total=False):
    code: str
    nachricht: str
    parameter: str
