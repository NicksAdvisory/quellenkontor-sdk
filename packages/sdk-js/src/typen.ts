/** Antworttypen der Quellenkontor-API. Feld- und Parameternamen sind deutsch, wie in der API. */

export type Quelle = { titel: string; url: string };
export type Land = "BW" | "BY" | "BE" | "BB" | "HB" | "HH" | "HE" | "MV" | "NI" | "NW" | "RP" | "SL" | "SN" | "ST" | "SH" | "TH";
export type Datensatz =
  | "mindestlohn" | "rechengroessen" | "beitragssaetze" | "sachbezugswerte" | "pfaendungsfreigrenzen"
  | "uebergangsbereich" | "kuendigungsfrist" | "urlaubsanspruch" | "mutterschutz" | "feiertage" | "arbeitstage"
  | KomponentenDatensatz | "regelaltersgrenze" | "pausen" | "dienstwagen";

/** Datensätze aus Bestandteilen mit eigenem Gültig-ab: Abgaben, Freibeträge, Pauschalen, Zuschläge */
export type KomponentenDatensatz =
  | "minijob-abgaben" | "reisekosten-inland" | "mindestausbildungsverguetung" | "kuenstlersozialabgabe" | "steuerfreie-betraege"
  | "sfn-zuschlaege" | "pflegemindestlohn" | "ausgleichsabgabe" | "einkommensteuer-eckwerte";

/** Felder, die jede Antwort hat */
/**
 * Felder, die jede Antwort hat. Antworten aus dem Offline-Stand tragen zusätzlich offline: true und
 * datenstand, dafür fehlen lizenz, stand und die berechneten Zusatzfelder (zitat, vorheriger_wert, naechster_wert).
 */
type Basis = OfflineMerkmale & { hinweise: string[]; lizenz: string; stand: string; /** Fertiger Satz zum Zitieren */ zitat?: string };
/** Rechner nennen alle Normen, nach denen sie rechnen */
type RechnerBasis = Basis & { rechtsgrundlage: string; quelle: Quelle; quellen: Quelle[] };
type Gueltig = Basis & { gueltig_ab: string; gueltig_bis: string | null; rechtsgrundlage: string; quelle: Quelle };
/** Einheiten der Bestandteile */
export type Einheit = "euro" | "euro_stunde" | "euro_tag" | "euro_monat" | "euro_jahr" | "euro_km" | "euro_uebernachtung" | "prozent" | "prozent_listenpreis" | "tage" | "anzahl" | "fahrten" | "arbeitsplaetze" | "km";

export type Mindestlohn = Gueltig & {
  datensatz: "mindestlohn"; datum: string; mindestlohn_brutto_stunde: number; minijob_grenze_monat: number;
  minijob_rechtsgrundlage: string; minijob_quelle: Quelle;
  vorheriger_wert: { gueltig_ab: string; mindestlohn_brutto_stunde: number; minijob_grenze_monat: number | null } | null;
  naechster_wert: { gueltig_ab: string; mindestlohn_brutto_stunde: number; minijob_grenze_monat: number | null } | null;
};
export type Rechengroessen = Gueltig & {
  datensatz: "rechengroessen"; jahr: number; rechtskreise_einheitlich: boolean;
  bbg_kv_monat: number; bbg_kv_jahr: number; bbg_rv_west_monat: number; bbg_rv_west_jahr: number; bbg_rv_ost_monat: number; bbg_rv_ost_jahr: number;
  bbg_knappschaft_west_monat: number; bbg_knappschaft_west_jahr: number; bbg_knappschaft_ost_monat: number; bbg_knappschaft_ost_jahr: number;
  jaeg_allgemein_jahr: number; jaeg_besonders_jahr: number;
  bezugsgroesse_west_monat: number; bezugsgroesse_west_jahr: number; bezugsgroesse_ost_monat: number; bezugsgroesse_ost_jahr: number;
};
export type Beitragsbestandteil = Omit<Gueltig, "lizenz" | "stand"> & { id: string; name: string; satz_prozent: number; arbeitgeber_prozent: number; arbeitnehmer_prozent: number };
export type Beitragssaetze = Basis & { datensatz: "beitragssaetze"; datum: string; vorlaeufig: boolean; saetze: Record<string, number>; werte: Record<string, number>; bestandteile: (Beitragsbestandteil & { einheit: "prozent"; wert: number; naechster_wert: { gueltig_ab: string; wert: number } | null })[] };
export type Sachbezugswerte = Gueltig & {
  datensatz: "sachbezugswerte"; jahr: number; verpflegung_monat: number; fruehstueck_monat: number; mittagessen_monat: number; abendessen_monat: number;
  fruehstueck_tag: number; mittag_abend_tag: number; unterkunft_monat: number; unterkunft_tag: number; hinweise: string[];
};
export type Pfaendungsfreigrenzen = Gueltig & {
  datensatz: "pfaendungsfreigrenzen"; datum: string; grundbetrag_monat: number; erhoehung_erste_person_monat: number; erhoehung_weitere_person_monat: number;
  voll_pfaendbar_ab_monat: number; unterhaltspflichten: number | null; unterhaltspflichten_beruecksichtigt?: number | null; freibetrag_monat: number | null; netto_monat: number | null; pfaendbarer_betrag_monat: number | null;
};
export type Uebergangsbereich = Gueltig & {
  datensatz: "uebergangsbereich"; datum: string; bezeichnung: string; untergrenze_monat: number; obergrenze_monat: number; faktor_f: number | null;
  faktor_f_rechtsgrundlage: string | null; faktor_f_quelle: Quelle | null; faktor_f_definition: string; formel?: object;
};
export type Kuendigungsfrist = RechnerBasis & {
  datensatz: "kuendigungsfrist"; eintritt: string; zugang: string; seite: "arbeitgeber" | "arbeitnehmer"; probezeit: boolean;
  betriebszugehoerigkeit_jahre: number; frist: string; frist_code: string; fristende: string; ende: string;
};
export type Urlaubsanspruch = RechnerBasis & {
  datensatz: "urlaubsanspruch"; arbeitstage_pro_woche: number; anspruch_tage_jahr: number; formel: string;
  jahr?: number; anspruch_tage_im_jahr?: number; teilurlaub?: boolean; teilurlaub_fall?: "a" | "b" | "c"; volle_monate?: number; anspruch_ungerundet?: number;
};
export type Mutterschutz = RechnerBasis & {
  datensatz: "mutterschutz"; termin: string | null; geburt: string | null; fall: string; beginn: string | null; ende: string | null;
  wochen_nach_entbindung: number; verlaengerung_tage: number; dauer_tage: number; ssw?: number;
};
export type Feiertag = { datum: string; id: string; name: string; wochentag: string; regional: boolean; regional_hinweis: string | null; sonntag: boolean };
export type Feiertage = RechnerBasis & {
  datensatz: "feiertage"; jahr: number; land: Land | null; land_name?: string; anzahl: number; anzahl_landesweit_montag_bis_freitag?: number;
  feiertage: (Feiertag & { laender?: Land[]; laender_regional?: Land[]; bundesweit?: boolean })[];
};
export type Arbeitstage = RechnerBasis & {
  datensatz: "arbeitstage"; von: string; bis: string; land: Land; land_name: string; samstag_als_arbeitstag: boolean; regionale_feiertage_abgezogen: boolean;
  kalendertage: number; arbeitstage: number; feiertage_an_arbeitstagen: { datum: string; name: string; regional: boolean }[];
};

export type Komponente = {
  id: string; name: string; gruppe: string | null;
  /** Nur bei steuerfreien Beträgen: Art des Betrags und wer ihn nutzt */
  art?: "freibetrag" | "freigrenze" | "pauschbetrag" | "hoechstbetrag" | "satz"; wirkung?: "steuerfreie_arbeitgeberleistung" | "pauschalierung_arbeitgeber" | "werbungskosten_arbeitnehmer" | "nebentaetigkeit";
  einheit: Einheit;
  /** null, solange ein angekündigter Wert noch nicht festgesetzt ist (status ausstehend) */
  wert: number | null;
  gueltig_ab: string; gueltig_bis: string | null; rechtsgrundlage: string; quelle: Quelle; hinweis: string | null;
  naechster_wert: { gueltig_ab: string; wert: number } | null;
  status?: "ausstehend"; erwartet?: string;
};
/** Anderer Name für Komponente, wie in Doku und Antwort (Feld bestandteile) */
export type Bestandteil = Komponente;
export type Komponenten<D extends string = KomponentenDatensatz> = {
  datensatz: D; datum?: string; jahr?: number; vorlaeufig: boolean;
  /** Kurzform: Bestandteil und Wert am Stichtag, null solange ein angekündigter Wert fehlt */
  werte: Record<string, number | null>;
  bestandteile: Komponente[]; regeln: string[];
} & Basis;
export type Mindestausbildungsverguetung = Komponenten<"mindestausbildungsverguetung"> & { beginn: string; ausbildungsjahr: number | null; mindestverguetung_monat: number | null };
export type Ausgleichsabgabe = Komponenten<"ausgleichsabgabe"> & {
  arbeitsplaetze: number | null; besetzt: number | null; pflichtplaetze: number | null; pflichtplatz_monate: number | null; beschaeftigungsquote_prozent: number | null;
  unbesetzt: number | null; unbesetzt_monate: number | null; stufe: string | null; betrag_monat: number | null; abgabe_jahr: number | null;
};
export type MinijobAbgaben = Komponenten<"minijob-abgaben"> & { summen: { gewerblich_prozent: number | null; privathaushalt_prozent: number | null } };
export type SfnZuschlaege = Komponenten<"sfn-zuschlaege"> & {
  grundlohn_stunde: number | null;
  betraege_stunde: Record<string, { steuerfrei: number; beitragsfrei: number }> | null;
  /** Nachtarbeit an Sonn- und Feiertagen: addierte Sätze */
  kombinationen: Record<string, { satz_prozent: number; steuerfrei: number | null; beitragsfrei: number | null }>;
  /** Satz des Tages, wenn datum auf 24.12., 25.12., 26.12., 31.12. oder 1.5. fällt */
  sondertag: { name: string; bestandteil: string; satz_prozent: number; ab_14_uhr: boolean; steuerfrei: number | null; beitragsfrei: number | null } | null;
};
export type Dienstwagen = RechnerBasis & {
  datensatz: "dienstwagen"; datum: string; antrieb: "verbrenner" | "elektro" | "hybrid"; anschaffung: string | null; ueberlassung: string | null; listenpreis: number;
  minderung: { id: string; anteil_listenpreis: number; rechtsgrundlage: string; quelle: Quelle; hinweis: string | null } | null;
  batterie_abzug: number; bemessungsgrundlage: number; privatnutzung_monat: number; entfernung_km: number | null;
  co2_g_km: number | null; reichweite_km: number | null; batterie_kwh: number | null;
  fahrten_wohnung_monat: number | null; fahrten_monat: number | null; fahrten_wohnung_monat_einzel: number | null;
  arbeitsweg_methode: "pauschal" | "einzelbewertung" | null; zuzahlung_monat: number;
  geldwerter_vorteil_monat: number; regeln: string[];
};
export type Regelaltersgrenze = RechnerBasis & {
  datensatz: "regelaltersgrenze"; geburtsdatum: string | null; geburtsjahr: number; vertrauensschutz: boolean;
  regelaltersgrenze_jahre: number; regelaltersgrenze_monate: number; anhebung_monate: number; erreicht_am: string | null; rentenbeginn: string | null;
  /** Nur bei Abfrage mit geburtsjahr */
  rentenbeginn_spanne?: { von: string; bis: string };
};
export type Pausen = RechnerBasis & {
  datensatz: "pausen"; arbeitszeit_stunden: number; jugendlich: boolean; pause_minuten: number; anwesenheit_stunden: number;
  hoechstens_ohne_pause_stunden: number; mindestdauer_abschnitt_minuten: number; hoechstarbeitszeit_tag_stunden: number;
  hoechstarbeitszeit_tag_ausnahme_stunden: number; ruhezeit_stunden: number; warnungen: string[];
};

/** Felder, die eine Antwort aus dem Offline-Stand zusätzlich trägt */
export type OfflineMerkmale = {
  /** true, wenn die Antwort aus dem mitgelieferten Offline-Stand kommt, weil die API nicht erreichbar war */
  offline?: true;
  /** Datenstand des Offline-Stands, etwa "2026-09-24.16" */
  datenstand?: string;
};

/** Quellenangabe einer Verlaufszeile */
type VerlaufQuelle = { rechtsgrundlage: string; quelle_url: string | null; hinweis?: string | null };

/** Zeile eines Datensatzes aus Bestandteilen im Verlauf */
export type BestandteilZeile = VerlaufQuelle & {
  bestandteil: string; name: string; gruppe: string | null; einheit: Einheit;
  art?: Komponente["art"]; wirkung?: Komponente["wirkung"];
  gueltig_ab: string; gueltig_bis: string | null;
  /** null, solange ein angekündigter Wert noch nicht festgesetzt ist */
  wert: number | null;
};

/** Zeilentyp des Verlaufs je Datensatz */
export type VerlaufZeilen = {
  mindestlohn: VerlaufQuelle & { gueltig_ab: string; mindestlohn_brutto_stunde: number; minijob_grenze_monat: number | null };
  rechengroessen: VerlaufQuelle & {
    jahr: number;
    bbg_kv_monat: number; bbg_kv_jahr: number; bbg_pv_monat?: number; bbg_pv_jahr?: number;
    bbg_rv_west_monat: number; bbg_rv_west_jahr: number; bbg_rv_ost_monat: number; bbg_rv_ost_jahr: number;
    bbg_knappschaft_west_monat: number; bbg_knappschaft_west_jahr: number; bbg_knappschaft_ost_monat: number; bbg_knappschaft_ost_jahr: number;
    jaeg_allgemein_jahr: number; jaeg_besonders_jahr: number;
    bezugsgroesse_west_monat: number; bezugsgroesse_west_jahr: number; bezugsgroesse_ost_monat: number; bezugsgroesse_ost_jahr: number;
  };
  beitragssaetze: VerlaufQuelle & { bestandteil: string; name: string; gueltig_ab: string; satz_prozent: number; arbeitgeber_prozent: number; arbeitnehmer_prozent: number };
  sachbezugswerte: VerlaufQuelle & {
    jahr: number; verpflegung_monat: number; fruehstueck_monat: number; mittagessen_monat: number; abendessen_monat: number;
    fruehstueck_tag: number; mittag_abend_tag: number; unterkunft_monat: number; unterkunft_tag: number;
  };
  pfaendungsfreigrenzen: VerlaufQuelle & {
    gueltig_ab: string; grundbetrag_monat: number; erhoehung_erste_person_monat: number; erhoehung_weitere_person_monat: number; voll_pfaendbar_ab_monat: number;
  };
  uebergangsbereich: VerlaufQuelle & {
    gueltig_ab: string; untergrenze_monat: number; obergrenze_monat: number; faktor_f: number | null;
    faktor_f_rechtsgrundlage?: string | null; faktor_f_quelle_url?: string | null;
  };
} & { [K in KomponentenDatensatz]: BestandteilZeile };

/** Datensätze mit Verlauf */
export type VerlaufDatensatz = keyof VerlaufZeilen;

/** Antwort von /hr/<datensatz>/verlauf */
export type Verlauf<D extends VerlaufDatensatz = VerlaufDatensatz> = OfflineMerkmale & {
  datensatz: D; anzahl: number; verlauf: VerlaufZeilen[D][];
  /** Hinweise, etwa bei einer Antwort aus dem Offline-Stand */
  hinweise?: string[];
};
