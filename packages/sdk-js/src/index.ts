/**
 * Offizielles SDK für die Quellenkontor-API: geprüfte HR-Daten für Deutschland mit Quelle und Gültigkeit.
 * Keine Abhängigkeiten, ab Node.js 18. Nutzt nur fetch und keine Node-Module.
 *
 *   import { Quellenkontor } from "@quellenkontor/sdk";
 *   const qk = new Quellenkontor(process.env.QK_KEY);
 *   const ml = await qk.hr.mindestlohn({ datum: "2027-01-15" });
 */

import { OFFLINE_DATEN } from "./offline-daten.js";

export const VERSION = "0.1.0";
const STANDARD_BASIS = "https://api.quellenkontor.dev/v1";

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
type Basis = { hinweise: string[]; lizenz: string; stand: string; /** Fertiger Satz zum Zitieren */ zitat?: string };
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

export class QuellenkontorFehler extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly parameter?: string,
  ) {
    super(message);
    this.name = "QuellenkontorFehler";
  }
}

export type Optionen = {
  /** API-Schlüssel. Ohne Angabe wird QK_KEY aus der Umgebung gelesen. */
  apiKey?: string;
  basisUrl?: string;
  /** Zeitlimit je Anfrage in Millisekunden, Standard 15000 */
  timeoutMs?: number;
  /** Wiederholungen bei Netzfehlern und Status 502, 503, 504, Standard 2 */
  wiederholungen?: number;
  fetch?: typeof fetch;
  /**
   * Zwischenspeicher im Speicher dieser Instanz: eine unveränderte Antwort kommt ohne erneute Anfrage
   * zurück, danach nutzt das SDK If-None-Match mit der gemerkten ETag, damit ein Treffer (304) kein
   * Kontingent kostet. Standard an.
   */
  cache?: boolean;
  /** Wie lange eine Antwort ohne erneute Anfrage aus dem Zwischenspeicher kommt, in Millisekunden. Standard 5 Minuten. */
  cacheTtlMs?: number;
  /**
   * Offline-Stand nutzen, wenn die API nach allen Wiederholungen nicht erreichbar ist: der Verlauf der
   * Tabellen-Datensätze liegt im Paket (siehe offline-daten.ts), Rechner wie kuendigungsfrist oder
   * dienstwagen haben keinen Verlauf und bleiben ohne Verbindung ein Netzwerkfehler. Antworten aus dem
   * Offline-Stand tragen offline: true und den Datenstand des Pakets, nicht den der amtlichen Quelle,
   * und ohne die berechneten Zusatzfelder (zitat, vorheriger_wert, naechster_wert). Standard an.
   */
  offline?: boolean;
};

type Werte = Record<string, string | number | boolean | undefined | null>;

function umgebung(name: string): string | undefined {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return g.process?.env?.[name];
}

const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

type OfflineZeile = Record<string, unknown>;
const OFFLINE_DATENSAETZE = OFFLINE_DATEN.datensaetze as unknown as Record<string, OfflineZeile[]>;

/** Beginn einer Verlaufszeile: gueltig_ab, sonst der 1. Januar des Feldes jahr (wie lib/verlauf.ts serverseitig) */
function beginnVon(z: OfflineZeile): string {
  return typeof z.gueltig_ab === "string" ? z.gueltig_ab : `${z.jahr}-01-01`;
}

/**
 * Je Gruppe (bestandteil, sonst eine gemeinsame Gruppe) die jüngste Zeile, deren Beginn nicht nach
 * zielDatum liegt: dieselbe Stufe, die auch die API für diesen Stichtag zurückgeben würde.
 */
function aktuelleZeilen(zeilen: readonly OfflineZeile[], zielDatum: string): OfflineZeile[] {
  const gruppen = new Map<string, OfflineZeile[]>();
  for (const z of zeilen) {
    const g = typeof z.bestandteil === "string" ? z.bestandteil : "";
    gruppen.set(g, [...(gruppen.get(g) ?? []), z]);
  }
  const aus: OfflineZeile[] = [];
  for (const liste of gruppen.values()) {
    const passend = liste.filter((z) => beginnVon(z) <= zielDatum).sort((a, b) => beginnVon(a).localeCompare(beginnVon(b)));
    if (passend.length) aus.push(passend[passend.length - 1]);
  }
  return aus;
}

/**
 * Verlauf offline filtern: von und bis wirken auf gueltig_ab (bei Jahrestabellen den 1. Januar) selbst,
 * ohne das inferierte gueltig_bis der API (lib/verlauf.ts). Einfacher als live, für die genaue Filterung
 * am Rand eines Zeitraums zählt die Antwort der erreichbaren API.
 */
function verlaufOffline(zeilen: readonly OfflineZeile[], werte: Werte): OfflineZeile[] {
  return zeilen.filter((z) => {
    if (typeof werte.bestandteil === "string" && z.bestandteil !== werte.bestandteil) return false;
    const beginn = beginnVon(z);
    if (typeof werte.von === "string" && beginn < werte.von) return false;
    if (typeof werte.bis === "string" && beginn > werte.bis) return false;
    return true;
  });
}

/** Datensatz-Kennung und Art aus dem Pfad /hr/<id> oder /hr/<id>/verlauf */
function pfadTeile(pfad: string): { id: string; verlauf: boolean } | undefined {
  const m = /^\/hr\/([a-z0-9-]+)(\/verlauf)?$/.exec(pfad);
  return m ? { id: m[1], verlauf: Boolean(m[2]) } : undefined;
}

/**
 * Offline-Antwort für einen Pfad aus dem mitgelieferten Stand, oder undefined, wenn der Pfad kein
 * Tabellen-Datensatz mit Verlauf ist (Rechner, Katalog, Änderungsprotokoll: dafür gibt es keinen
 * Offline-Stand). Wirft QuellenkontorFehler mit Code kein_wert_offline, wenn der Stichtag vor der
 * ersten Stufe im Stand liegt.
 */
function offlineAbfrage(pfad: string, werte: Werte): (Record<string, unknown> & { offline: true }) | undefined {
  const teile = pfadTeile(pfad);
  if (!teile) return undefined;
  const zeilen = OFFLINE_DATENSAETZE[teile.id];
  if (!zeilen) return undefined;
  const datenstand = OFFLINE_DATEN.datenstand;

  if (teile.verlauf) {
    const gefiltert = verlaufOffline(zeilen, werte);
    return { datensatz: teile.id, anzahl: gefiltert.length, verlauf: gefiltert, offline: true, datenstand };
  }

  const zielDatum = typeof werte.datum === "string" ? werte.datum : typeof werte.jahr !== "undefined" ? `${werte.jahr}-12-31` : new Date().toISOString().slice(0, 10);
  const treffer = aktuelleZeilen(zeilen, zielDatum);
  if (!treffer.length) {
    throw new QuellenkontorFehler(`Für diesen Stichtag gibt es im Offline-Stand (${datenstand}) noch keinen Wert von ${teile.id}. Sobald die API wieder erreichbar ist, liefert sie den amtlichen Stand.`, 0, "kein_wert_offline");
  }
  const basis: Record<string, unknown> & { offline: true } = {
    datensatz: teile.id, offline: true, datenstand,
    ...("datum" in werte ? { datum: zielDatum } : {}),
    ...("jahr" in werte ? { jahr: werte.jahr } : {}),
  };
  if (!treffer.some((z) => typeof z.bestandteil === "string")) return { ...basis, ...treffer[0] };
  return { ...basis, werte: Object.fromEntries(treffer.map((z) => [z.bestandteil as string, z.wert ?? null])), bestandteile: treffer };
}

type CacheEintrag = { wert: unknown; etag: string | null; bis: number };

export class Quellenkontor {
  private readonly key: string | undefined;
  private readonly basis: string;
  private readonly timeout: number;
  private readonly wiederholungen: number;
  private readonly f: typeof fetch;
  private readonly cacheAktiv: boolean;
  private readonly cacheTtlMs: number;
  private readonly offlineAktiv: boolean;
  private readonly cache = new Map<string, CacheEintrag>();

  constructor(apiKeyOderOptionen?: string | Optionen, optionen: Optionen = {}) {
    const o = typeof apiKeyOderOptionen === "object" ? apiKeyOderOptionen : { ...optionen, apiKey: apiKeyOderOptionen ?? optionen.apiKey };
    this.key = o.apiKey ?? umgebung("QK_KEY");
    this.basis = (o.basisUrl ?? STANDARD_BASIS).replace(/\/$/, "");
    this.timeout = o.timeoutMs ?? 15_000;
    this.wiederholungen = o.wiederholungen ?? 2;
    this.f = o.fetch ?? globalThis.fetch.bind(globalThis);
    this.cacheAktiv = o.cache ?? true;
    this.cacheTtlMs = o.cacheTtlMs ?? 5 * 60_000;
    this.offlineAktiv = o.offline ?? true;
  }

  /** Leert den Zwischenspeicher dieser Instanz, etwa nach einem bekannten neuen Wert (Webhook). */
  cacheLeeren(): void {
    this.cache.clear();
  }

  /** Rohe Anfrage an einen Pfad der API, zum Beispiel "/hr/mindestlohn". Liefert JSON oder, bei format=csv, Text. */
  async anfrage<T = unknown>(pfad: string, werte: Werte = {}, format: "json" | "csv" = "json"): Promise<T> {
    const url = new URL(this.basis + pfad);
    for (const [k, v] of Object.entries(werte)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    if (format === "csv") url.searchParams.set("format", "csv");
    const cacheSchluessel = url.toString();

    // Innerhalb der Gültigkeit (cacheTtlMs) kommt eine Antwort ohne jede Anfrage aus dem Zwischenspeicher
    const bekannt = this.cacheAktiv ? this.cache.get(cacheSchluessel) : undefined;
    if (bekannt && bekannt.bis > Date.now()) return bekannt.wert as T;

    const koepfe: Record<string, string> = { "User-Agent": `quellenkontor-sdk-js/${VERSION}` };
    if (format === "json") koepfe.Accept = "application/json";
    if (this.key) koepfe.Authorization = `Bearer ${this.key}`;
    // Abgelaufen, aber eine ETag von früher bekannt: mit If-None-Match nachfragen, ein Treffer (304) kostet kein Kontingent
    if (bekannt?.etag) koepfe["If-None-Match"] = bekannt.etag;

    let letzterFehler: unknown;
    for (let versuch = 0; versuch <= this.wiederholungen; versuch++) {
      if (versuch > 0) await warte(300 * 2 ** (versuch - 1));
      let res: Response;
      try {
        res = await this.f(url, { headers: koepfe, signal: AbortSignal.timeout(this.timeout) });
      } catch (e) {
        letzterFehler = e;
        continue;
      }
      if ([502, 503, 504].includes(res.status) && versuch < this.wiederholungen) continue;
      // Unverändert seit der gemerkten ETag: die gecachte Antwort gilt weiter, ohne dass es zählt
      if (res.status === 304 && bekannt) {
        if (this.cacheAktiv) this.cache.set(cacheSchluessel, { ...bekannt, bis: Date.now() + this.cacheTtlMs });
        return bekannt.wert as T;
      }
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { fehler?: { code?: string; nachricht?: string; parameter?: string } };
        throw new QuellenkontorFehler(d.fehler?.nachricht ?? `HTTP ${res.status}`, res.status, d.fehler?.code ?? "unbekannt", d.fehler?.parameter);
      }
      // Die API setzt für Excel ein BOM vor die CSV, im Programm stört es nur
      const wert = (format === "csv" ? (await res.text()).replace(/^\uFEFF/, "") : await res.json()) as T;
      if (this.cacheAktiv) this.cache.set(cacheSchluessel, { wert, etag: res.headers.get("etag"), bis: Date.now() + this.cacheTtlMs });
      return wert;
    }
    // Nach allen Wiederholungen nicht erreichbar: mit dem Offline-Stand weiterhelfen, wenn er diesen Pfad abdeckt
    if (this.offlineAktiv && format === "json") {
      const offline = offlineAbfrage(pfad, werte);
      if (offline !== undefined) return offline as T;
    }
    throw new QuellenkontorFehler(`Keine Verbindung zur API: ${String((letzterFehler as Error)?.message ?? letzterFehler)}`, 0, "netzwerk");
  }

  /** Katalog aller Datensätze (ohne Schlüssel abrufbar) */
  datensaetze() {
    return this.anfrage<{ datensaetze: {
      id: Datensatz; name: string; beschreibung: string; kategorie: string; art: "tabelle" | "rechner"; endpunkt: string; verlauf: string | null; mcp_werkzeug: string; csv: boolean;
      parameter: { name: string; typ: "datum" | "jahr" | "ganzzahl" | "zahl" | "text" | "bool"; pflicht: boolean; beschreibung: string; werte: string[] | null; min: number | null; max: number | null; standard: string | null; beispiel: string | null }[];
      quelle: string; aktualisierung: string; abdeckung: string; seite: string;
    }[] }>("/datensaetze");
  }

  /** Prüfstand je Datensatz (ohne Schlüssel abrufbar) */
  status() {
    return this.anfrage<{ stand: string; letzte_aenderung_id: number | null; datensaetze: { id: Datensatz; zuletzt_geprueft: string | null; gesichert_bis: string | null; erwartet: string | null; letzte_aenderung_id: number | null }[] }>("/status");
  }

  /** Änderungsprotokoll (ohne Schlüssel abrufbar) */
  aenderungen() {
    return this.anfrage<{ aenderungen: { id: number; datum: string; datensatz: string | null; art: string; gueltig_ab: string | null; text: string; beleg_url: string | null }[] }>("/aenderungen");
  }

  readonly hr = {
    mindestlohn: (p: { datum?: string } = {}) => this.anfrage<Mindestlohn>("/hr/mindestlohn", p),
    rechengroessen: (p: { jahr?: number } = {}) => this.anfrage<Rechengroessen>("/hr/rechengroessen", p),
    beitragssaetze: (p: { datum?: string } = {}) => this.anfrage<Beitragssaetze>("/hr/beitragssaetze", p),
    sachbezugswerte: (p: { jahr?: number } = {}) => this.anfrage<Sachbezugswerte>("/hr/sachbezugswerte", p),
    pfaendungsfreigrenzen: (p: { datum?: string; unterhaltspflichten?: number; netto?: number } = {}) => this.anfrage<Pfaendungsfreigrenzen>("/hr/pfaendungsfreigrenzen", p),
    uebergangsbereich: (p: { datum?: string } = {}) => this.anfrage<Uebergangsbereich>("/hr/uebergangsbereich", p),
    kuendigungsfrist: (p: { eintritt: string; zugang: string; seite?: "arbeitgeber" | "arbeitnehmer"; probezeit?: boolean }) => this.anfrage<Kuendigungsfrist>("/hr/kuendigungsfrist", p),
    urlaubsanspruch: (p: { arbeitstage_pro_woche: number; jahr?: number; eintritt?: string; austritt?: string }) => this.anfrage<Urlaubsanspruch>("/hr/urlaubsanspruch", p),
    mutterschutz: (p: { termin?: string; geburt?: string; fall?: "standard" | "fruehgeburt" | "mehrlinge" | "behinderung" | "fehlgeburt"; ssw?: number }) => this.anfrage<Mutterschutz>("/hr/mutterschutz", p),
    feiertage: (p: { jahr?: number; land?: Land } = {}) => this.anfrage<Feiertage>("/hr/feiertage", p),
    arbeitstage: (p: { von: string; bis: string; land: Land; samstag?: boolean; regionale?: boolean }) => this.anfrage<Arbeitstage>("/hr/arbeitstage", p),
    minijobAbgaben: (p: { datum?: string; bestandteil?: string } = {}) => this.anfrage<MinijobAbgaben>("/hr/minijob-abgaben", p),
    reisekostenInland: (p: { datum?: string; bestandteil?: string } = {}) => this.anfrage<Komponenten<"reisekosten-inland">>("/hr/reisekosten-inland", p),
    mindestausbildungsverguetung: (p: { beginn?: string; ausbildungsjahr?: 1 | 2 | 3 | 4; bestandteil?: string } = {}) => this.anfrage<Mindestausbildungsverguetung>("/hr/mindestausbildungsverguetung", p),
    kuenstlersozialabgabe: (p: { jahr?: number; datum?: string; bestandteil?: string } = {}) => this.anfrage<Komponenten<"kuenstlersozialabgabe">>("/hr/kuenstlersozialabgabe", p),
    steuerfreieBetraege: (p: { datum?: string; bestandteil?: string } = {}) => this.anfrage<Komponenten<"steuerfreie-betraege">>("/hr/steuerfreie-betraege", p),
    sfnZuschlaege: (p: { datum?: string; grundlohn_stunde?: number; bestandteil?: string } = {}) => this.anfrage<SfnZuschlaege>("/hr/sfn-zuschlaege", p),
    dienstwagen: (p: { listenpreis: number; antrieb?: "verbrenner" | "elektro" | "hybrid"; anschaffung?: string; ueberlassung?: string; entfernung_km?: number; fahrten_monat?: number; zuzahlung_monat?: number; co2_g_km?: number; reichweite_km?: number; batterie_kwh?: number; datum?: string }) => this.anfrage<Dienstwagen>("/hr/dienstwagen", p),
    pflegemindestlohn: (p: { datum?: string; bestandteil?: string } = {}) => this.anfrage<Komponenten<"pflegemindestlohn">>("/hr/pflegemindestlohn", p),
    ausgleichsabgabe: (p: { jahr?: number; datum?: string; arbeitsplaetze?: number; besetzt?: number; bestandteil?: string } = {}) => this.anfrage<Ausgleichsabgabe>("/hr/ausgleichsabgabe", p),
    einkommensteuerEckwerte: (p: { jahr?: number; datum?: string; bestandteil?: string } = {}) => this.anfrage<Komponenten<"einkommensteuer-eckwerte">>("/hr/einkommensteuer-eckwerte", p),
    /** Mit geburtsdatum genau, mit geburtsjahr für den ganzen Jahrgang */
    regelaltersgrenze: (p: { geburtsdatum?: string; geburtsjahr?: number; vertrauensschutz?: boolean }) => this.anfrage<Regelaltersgrenze>("/hr/regelaltersgrenze", p),
    pausen: (p: { arbeitszeit_stunden: number; jugendlich?: boolean }) => this.anfrage<Pausen>("/hr/pausen", p),
    /** Stufen einer Reihe seit 2015, auf Wunsch nur ein Zeitraum oder ein Bestandteil */
    verlauf: (datensatz: "mindestlohn" | "rechengroessen" | "beitragssaetze" | "sachbezugswerte" | "pfaendungsfreigrenzen" | "uebergangsbereich" | KomponentenDatensatz, filter: { von?: string; bis?: string; bestandteil?: string } = {}) =>
      this.anfrage<{ datensatz: string; anzahl: number; verlauf: Record<string, unknown>[] }>(`/hr/${datensatz}/verlauf`, filter),
  };
}

export default Quellenkontor;
