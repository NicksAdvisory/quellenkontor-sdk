/**
 * Offizielles SDK für die Quellenkontor-API: geprüfte HR-Daten für Deutschland mit Quelle und Gültigkeit.
 * Keine Abhängigkeiten, ab Node.js 18. Nutzt nur fetch und keine Node-Module. ESM und CommonJS.
 *
 *   import { Quellenkontor } from "@quellenkontor/sdk";
 *   const qk = new Quellenkontor(process.env.QK_KEY);
 *   const ml = await qk.hr.mindestlohn({ datum: "2027-01-15" });
 */

import type { OfflineStand, OfflineZeile } from "./offline-daten.js";
import type {
  Arbeitstage, Ausgleichsabgabe, Beitragssaetze, Datensatz, Dienstwagen, Feiertage, Komponenten, Kuendigungsfrist, Land,
  MinijobAbgaben, Mindestausbildungsverguetung, Mindestlohn, Mutterschutz, Pausen, Pfaendungsfreigrenzen, Rechengroessen, Regelaltersgrenze,
  Sachbezugswerte, SfnZuschlaege, Uebergangsbereich, Urlaubsanspruch, Verlauf, VerlaufDatensatz,
} from "./typen.js";

export * from "./typen.js";
export type { OfflineStand, OfflineZeile } from "./offline-daten.js";

export const VERSION = "0.1.2";
const STANDARD_BASIS = "https://api.quellenkontor.dev/v1";

/**
 * Fehler der API oder des SDK. `code` ist stabil und maschinenlesbar: die Codes der API (etwa
 * schluessel_fehlt, kontingent_erreicht, zu_schnell, ungueltiger_parameter) und die des SDK:
 * netzwerk (keine Verbindung nach allen Wiederholungen), abgebrochen (AbortSignal ausgelöst),
 * kein_fetch (keine fetch-Funktion vorhanden), kein_wert_offline (Offline-Stand ohne Wert für den Stichtag),
 * ausgebremst (Schutzschicht vor der API).
 */
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
/** Englischer Name für QuellenkontorFehler, dieselbe Klasse: instanceof funktioniert mit beiden Namen. */
export const QuellenkontorError = QuellenkontorFehler;
export type QuellenkontorError = QuellenkontorFehler;

export type Optionen = {
  /** API-Schlüssel. Ohne Angabe wird QK_KEY aus der Umgebung gelesen. */
  apiKey?: string;
  /** Basis-Adresse der API, Standard https://api.quellenkontor.dev/v1 (englisch: baseUrl) */
  basisUrl?: string;
  baseUrl?: string;
  /** Zeitlimit je Versuch in Millisekunden, Standard 15000 */
  timeoutMs?: number;
  /** Wiederholungen bei Netzfehlern und Status 408, 500, 502, 503, 504, Standard 2 (englisch: retries) */
  wiederholungen?: number;
  retries?: number;
  /**
   * Höchstens so viele Anfragen je Sekunde schickt diese Instanz, weitere warten kurz. Standard 8, knapp unter
   * der Grenze der API (10 je Sekunde). Antwortet die API mit 429 zu_schnell, wartet das SDK die Zeit aus
   * Retry-After ab und fragt noch einmal. 0 schaltet die Bremse ab. (englisch: maxPerSecond)
   */
  maxProSekunde?: number;
  maxPerSecond?: number;
  /** Eigene fetch-Funktion, etwa für Tests oder Proxys. Standard globalThis.fetch. */
  fetch?: typeof fetch;
  /**
   * Zwischenspeicher im Speicher dieser Instanz: eine unveränderte Antwort kommt ohne erneute Anfrage
   * zurück, danach nutzt das SDK If-None-Match mit der gemerkten ETag, damit ein Treffer (304) kein
   * Kontingent kostet. Standard an.
   */
  cache?: boolean;
  /** Wie lange eine Antwort ohne erneute Anfrage aus dem Zwischenspeicher kommt, in Millisekunden. Standard 5 Minuten. */
  cacheTtlMs?: number;
  /** Höchstzahl gemerkter Antworten, danach fällt die am längsten ungenutzte heraus. Standard 500. (englisch: cacheMaxEntries) */
  cacheMaxEintraege?: number;
  cacheMaxEntries?: number;
  /**
   * Offline-Stand nutzen, wenn die API nach allen Wiederholungen nicht erreichbar ist oder mit 5xx antwortet:
   * der Verlauf der Tabellen-Datensätze liegt im Paket (Einstieg @quellenkontor/sdk/offline), Rechner wie
   * kuendigungsfrist oder dienstwagen haben keinen Verlauf und bleiben ohne Verbindung ein Fehler. Antworten
   * aus dem Offline-Stand tragen offline: true und den Datenstand des Pakets, nicht den der amtlichen Quelle,
   * und ohne die berechneten Zusatzfelder (zitat, vorheriger_wert, naechster_wert). Standard an.
   */
  offline?: boolean;
  /** Ab diesem Alter in Tagen trägt eine Offline-Antwort einen Hinweis, dass der Stand veraltet sein kann. Standard 30. (englisch: offlineMaxAgeDays) */
  offlineWarnungTage?: number;
  offlineMaxAgeDays?: number;
};
/** Englischer Name für Optionen */
export type Options = Optionen;

/** Optionen je Aufruf */
export type AufrufOptionen = {
  /** Bricht Anfrage, Wartezeiten und Wiederholungen ab, sobald das Signal auslöst (Fehlercode abgebrochen). */
  signal?: AbortSignal;
};
/** Englischer Name für AufrufOptionen */
export type CallOptions = AufrufOptionen;

type Werte = Record<string, string | number | boolean | undefined | null>;

/** Status, bei denen das SDK dieselbe Anfrage mit Pause wiederholt */
const WIEDERHOLBAR = new Set([408, 500, 502, 503, 504]);
/** Längste Wartezeit aus Retry-After, in Sekunden */
const MAX_WARTEN_S = 30;

function umgebung(name: string): string | undefined {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return g.process?.env?.[name];
}

function abgebrochenFehler(signal?: AbortSignal): QuellenkontorFehler {
  const grund = signal?.reason instanceof Error ? `: ${signal.reason.message}` : "";
  return new QuellenkontorFehler(`Anfrage abgebrochen${grund}`, 0, "abgebrochen");
}

/** Wartet ms Millisekunden, bricht mit dem Signal sofort ab */
function warte(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return signal?.aborted ? Promise.reject(abgebrochenFehler(signal)) : Promise.resolve();
  return new Promise((erledigt, fehler) => {
    if (signal?.aborted) return fehler(abgebrochenFehler(signal));
    const beiAbbruch = () => {
      clearTimeout(t);
      fehler(abgebrochenFehler(signal));
    };
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", beiAbbruch);
      erledigt();
    }, ms);
    signal?.addEventListener("abort", beiAbbruch, { once: true });
  });
}

/** Zeitlimit je Versuch und Signal des Nutzers zu einem Signal verbinden (AbortSignal.any, sonst von Hand) */
function verbinde(timeoutMs: number, nutzer?: AbortSignal): AbortSignal {
  const zeit = AbortSignal.timeout(timeoutMs);
  if (!nutzer) return zeit;
  const any = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (typeof any === "function") return any.call(AbortSignal, [nutzer, zeit]);
  const c = new AbortController();
  for (const s of [nutzer, zeit]) {
    if (s.aborted) c.abort(s.reason);
    else s.addEventListener("abort", () => c.abort(s.reason), { once: true });
  }
  return c.signal;
}

/**
 * Retry-After in Millisekunden: Sekunden als Zahl oder ein HTTP-Datum (RFC 9110), höchstens 30 Sekunden.
 * undefined, wenn der Kopf fehlt oder nicht lesbar ist.
 */
export function retryAfterMs(wert: string | null | undefined, jetzt = Date.now()): number | undefined {
  if (!wert) return undefined;
  const text = wert.trim();
  let ms: number;
  if (/^\d+(\.\d+)?$/.test(text)) ms = Number(text) * 1000;
  else {
    const zeit = Date.parse(text);
    if (Number.isNaN(zeit)) return undefined;
    ms = zeit - jetzt;
  }
  return Math.min(MAX_WARTEN_S * 1000, Math.max(0, ms));
}

// --------------------------------------------------------------------------------------------------
// Offline-Stand: erst bei Bedarf geladen (dynamischer Import), damit er nicht in jedem Bundle landet.

let offlineLaden: Promise<OfflineStand> | undefined;
function offlineStand(): Promise<OfflineStand> {
  offlineLaden ??= import("./offline-daten.js").then((m) => m.OFFLINE_DATEN);
  return offlineLaden;
}

/** Beginn einer Verlaufszeile: gueltig_ab, sonst der 1. Januar des Feldes jahr (wie lib/verlauf.ts serverseitig) */
function beginnVon(z: OfflineZeile): string {
  return typeof z.gueltig_ab === "string" ? z.gueltig_ab : `${z.jahr}-01-01`;
}

function plusTage(datum: string, tage: number): string {
  const d = new Date(`${datum}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

function nachGruppe(zeilen: readonly OfflineZeile[]): OfflineZeile[][] {
  const gruppen = new Map<string, OfflineZeile[]>();
  for (const z of zeilen) {
    const g = typeof z.bestandteil === "string" ? z.bestandteil : "";
    gruppen.set(g, [...(gruppen.get(g) ?? []), z]);
  }
  return [...gruppen.values()].map((l) => [...l].sort((a, b) => beginnVon(a).localeCompare(beginnVon(b))));
}

/** Ende einer Zeile wie serverseitig: ausdrücklich, bei Jahreswerten der 31.12., sonst Vortag der nächsten Stufe */
function endeVon(z: OfflineZeile, naechste: OfflineZeile | undefined): string | null {
  if (typeof z.gueltig_bis === "string") return z.gueltig_bis;
  if (z.jahr !== undefined) return `${z.jahr}-12-31`;
  return naechste ? plusTage(beginnVon(naechste), -1) : null;
}

/**
 * Je Gruppe (bestandteil, sonst eine gemeinsame Gruppe) die jüngste Zeile, die am zielDatum gilt: Beginn
 * nicht danach und ein ausdrückliches gueltig_bis nicht davor. Dieselbe Stufe wie in der API.
 */
function aktuelleZeilen(zeilen: readonly OfflineZeile[], zielDatum: string): OfflineZeile[] {
  const aus: OfflineZeile[] = [];
  for (const liste of nachGruppe(zeilen)) {
    const passend = liste.filter((z) => beginnVon(z) <= zielDatum);
    const letzte = passend[passend.length - 1];
    if (!letzte) continue;
    if (typeof letzte.gueltig_bis === "string" && letzte.gueltig_bis < zielDatum) continue;
    aus.push(letzte);
  }
  return aus;
}

/** Verlauf offline filtern wie lib/verlauf.ts: bis wirkt auf den Beginn, von auf das (abgeleitete) Ende */
function verlaufOffline(zeilen: readonly OfflineZeile[], werte: Werte): OfflineZeile[] {
  const ende = new Map<OfflineZeile, string | null>();
  for (const liste of nachGruppe(zeilen)) liste.forEach((z, i) => ende.set(z, endeVon(z, liste[i + 1])));
  return zeilen.filter((z) => {
    if (typeof werte.bestandteil === "string" && z.bestandteil !== werte.bestandteil) return false;
    if (typeof werte.bis === "string" && beginnVon(z) > werte.bis) return false;
    if (typeof werte.von === "string" && (ende.get(z) ?? "9999-12-31") < werte.von) return false;
    return true;
  });
}

/** Datensatz-Kennung und Art aus dem Pfad /hr/<id> oder /hr/<id>/verlauf */
function pfadTeile(pfad: string): { id: string; verlauf: boolean } | undefined {
  const m = /^\/hr\/([a-z0-9-]+)(\/verlauf)?$/.exec(pfad);
  return m ? { id: m[1], verlauf: Boolean(m[2]) } : undefined;
}

function heute(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Hinweise für jede Offline-Antwort, mit Alterswarnung ab warnTage */
function offlineHinweise(stand: OfflineStand, warnTage: number): string[] {
  const hinweise = [`Antwort aus dem Offline-Stand des SDK (Datenstand ${stand.datenstand}), die API war nicht erreichbar. Sobald sie wieder antwortet, gilt ihr amtlicher Stand.`];
  const alterTage = Math.floor((Date.now() - Date.parse(stand.erzeugt_am)) / 86_400_000);
  if (Number.isFinite(alterTage) && alterTage >= warnTage) {
    hinweise.push(`Der Offline-Stand ist ${alterTage} Tage alt. Neuere amtliche Werte sind möglich, bitte das SDK aktualisieren.`);
  }
  return hinweise;
}

/**
 * Offline-Antwort für einen Pfad aus dem mitgelieferten Stand, oder undefined, wenn der Pfad kein
 * Tabellen-Datensatz mit Verlauf ist (Rechner, Katalog, Änderungsprotokoll: dafür gibt es keinen
 * Offline-Stand). Wirft QuellenkontorFehler mit Code kein_wert_offline, wenn der Stichtag vor der
 * ersten Stufe im Stand liegt.
 */
async function offlineAbfrage(pfad: string, werte: Werte, warnTage: number): Promise<(Record<string, unknown> & { offline: true }) | undefined> {
  const teile = pfadTeile(pfad);
  if (!teile) return undefined;
  const stand = await offlineStand();
  const zeilen = stand.datensaetze[teile.id];
  if (!zeilen) return undefined;
  const datenstand = stand.datenstand;
  const hinweise = offlineHinweise(stand, warnTage);

  if (teile.verlauf) {
    const gefiltert = verlaufOffline(zeilen, werte);
    return { datensatz: teile.id, anzahl: gefiltert.length, verlauf: gefiltert, offline: true, datenstand, hinweise };
  }

  // Stichtag wie serverseitig: mindestausbildungsverguetung nach Ausbildungsbeginn (Kohorte), nicht nach
  // Abrechnungsdatum; sonst datum, dann jahr (1. Januar wie die API), sonst heute
  const mav = teile.id === "mindestausbildungsverguetung";
  let zielDatum: string;
  if (mav) {
    const aj = werte.ausbildungsjahr === undefined || werte.ausbildungsjahr === null ? undefined : Number(werte.ausbildungsjahr);
    if (typeof werte.beginn !== "string" && aj !== undefined && aj > 1) {
      throw new QuellenkontorFehler(`Für das ${aj}. Ausbildungsjahr brauchst du beginn: Maßgeblich ist der Betrag des Jahres, in dem die Ausbildung begonnen hat, nicht der des laufenden Jahres.`, 400, "parameter_fehlt", "beginn");
    }
    zielDatum = typeof werte.beginn === "string" ? werte.beginn : heute();
    // Wie die API: für ein Beginnjahr nach der letzten bekannt gemachten Stufe gibt es noch keinen Wert
    const letztesJahr = zeilen.map((z) => beginnVon(z).slice(0, 4)).sort().pop();
    if (letztesJahr && zielDatum.slice(0, 4) > letztesJahr) {
      throw new QuellenkontorFehler(`Die Mindestvergütung für einen Ausbildungsbeginn ${zielDatum.slice(0, 4)} ist im Offline-Stand (${datenstand}) noch nicht enthalten. Verfügbar bis Beginnjahr ${letztesJahr}.`, 0, "kein_wert_offline", "beginn");
    }
  } else if (typeof werte.datum === "string") zielDatum = werte.datum;
  else if (werte.jahr !== undefined && werte.jahr !== null) zielDatum = `${werte.jahr}-01-01`;
  else zielDatum = heute();

  const treffer = aktuelleZeilen(zeilen, zielDatum);
  if (!treffer.length) {
    throw new QuellenkontorFehler(`Für diesen Stichtag gibt es im Offline-Stand (${datenstand}) keinen Wert von ${teile.id}. Sobald die API wieder erreichbar ist, liefert sie den amtlichen Stand.`, 0, "kein_wert_offline");
  }
  const basis: Record<string, unknown> & { offline: true } = {
    datensatz: teile.id, offline: true, datenstand, hinweise,
    ...(!mav && typeof werte.datum === "string" ? { datum: zielDatum } : {}),
    ...(!mav && werte.jahr !== undefined && werte.jahr !== null ? { jahr: Number(werte.jahr) } : {}),
  };
  if (!treffer.some((z) => typeof z.bestandteil === "string")) return { ...basis, ...treffer[0] };
  const ergebnis: Record<string, unknown> & { offline: true } = {
    ...basis,
    werte: Object.fromEntries(treffer.map((z) => [z.bestandteil as string, (z.wert as number | null | undefined) ?? null])),
    bestandteile: treffer,
  };
  if (mav) {
    const aj = werte.ausbildungsjahr === undefined || werte.ausbildungsjahr === null ? null : Number(werte.ausbildungsjahr);
    const w = ergebnis.werte as Record<string, number | null>;
    Object.assign(ergebnis, { beginn: zielDatum, ausbildungsjahr: aj, mindestverguetung_monat: aj ? (w[`ausbildungsjahr_${aj}`] ?? null) : null });
  }
  return ergebnis;
}

type CacheEintrag = { wert: unknown; etag: string | null; bis: number };
type ApiFehlerKoerper = { fehler?: { code?: string; nachricht?: string; parameter?: string } };

async function fehlerAus(res: Response): Promise<QuellenkontorFehler> {
  const d = (await res.json().catch(() => ({}))) as ApiFehlerKoerper;
  return new QuellenkontorFehler(d.fehler?.nachricht ?? `HTTP ${res.status}`, res.status, d.fehler?.code ?? "unbekannt", d.fehler?.parameter);
}

export class Quellenkontor {
  private readonly key: string | undefined;
  private readonly basis: string;
  private readonly timeout: number;
  private readonly wiederholungen: number;
  private readonly f: typeof fetch;
  private readonly cacheAktiv: boolean;
  private readonly cacheTtlMs: number;
  private readonly cacheMax: number;
  private readonly offlineAktiv: boolean;
  private readonly offlineWarnTage: number;
  private readonly cache = new Map<string, CacheEintrag>();
  private readonly abstandMs: number;
  private naechsterStart = 0;

  constructor(apiKeyOderOptionen?: string | Optionen, optionen: Optionen = {}) {
    const o = typeof apiKeyOderOptionen === "object" ? apiKeyOderOptionen : { ...optionen, apiKey: apiKeyOderOptionen ?? optionen.apiKey };
    this.key = o.apiKey ?? umgebung("QK_KEY");
    this.basis = (o.basisUrl ?? o.baseUrl ?? STANDARD_BASIS).replace(/\/$/, "");
    this.timeout = o.timeoutMs ?? 15_000;
    this.wiederholungen = Math.max(0, o.wiederholungen ?? o.retries ?? 2);
    const eigen = o.fetch ?? (globalThis as { fetch?: typeof fetch }).fetch;
    if (typeof eigen !== "function") {
      throw new QuellenkontorFehler("Keine fetch-Funktion gefunden. Das SDK braucht Node.js 18 oder neuer (oder einen Browser); alternativ eine eigene Funktion über die Option fetch übergeben.", 0, "kein_fetch");
    }
    this.f = o.fetch ?? eigen.bind(globalThis);
    this.cacheAktiv = o.cache ?? true;
    this.cacheTtlMs = o.cacheTtlMs ?? 5 * 60_000;
    this.cacheMax = Math.max(1, o.cacheMaxEintraege ?? o.cacheMaxEntries ?? 500);
    this.offlineAktiv = o.offline ?? true;
    this.offlineWarnTage = o.offlineWarnungTage ?? o.offlineMaxAgeDays ?? 30;
    const proSekunde = o.maxProSekunde ?? o.maxPerSecond ?? 8;
    this.abstandMs = proSekunde > 0 ? 1000 / proSekunde : 0;
  }

  /** Verteilt Anfragen gleichmäßig, damit keine Spitzen entstehen */
  private async takt(signal?: AbortSignal): Promise<void> {
    if (!this.abstandMs) return;
    const jetzt = Date.now();
    const start = Math.max(jetzt, this.naechsterStart);
    this.naechsterStart = start + this.abstandMs;
    if (start > jetzt) await warte(start - jetzt, signal);
  }

  private cacheHolen(k: string): CacheEintrag | undefined {
    const e = this.cache.get(k);
    if (e) {
      // Zuletzt genutzt ans Ende: die Map hält die Reihenfolge, vorne steht der älteste Eintrag
      this.cache.delete(k);
      this.cache.set(k, e);
    }
    return e;
  }

  private cacheSetzen(k: string, e: CacheEintrag): void {
    this.cache.delete(k);
    this.cache.set(k, e);
    while (this.cache.size > this.cacheMax) {
      const aeltester = this.cache.keys().next().value;
      if (aeltester === undefined) break;
      this.cache.delete(aeltester);
    }
  }

  /** Leert den Zwischenspeicher dieser Instanz, etwa nach einem bekannten neuen Wert (Webhook). */
  cacheLeeren(): void {
    this.cache.clear();
  }
  /** Englischer Name für cacheLeeren */
  clearCache(): void {
    this.cacheLeeren();
  }

  /**
   * Antwort aus dem mitgelieferten Offline-Stand, ohne die API zu fragen, oder undefined, wenn der Pfad
   * keinen Offline-Stand hat (Rechner, Katalog). Nützlich für eigene Fallbacks, etwa CSV in der CLI.
   */
  offlineAntwort<T = Record<string, unknown>>(pfad: string, werte: Werte = {}): Promise<(T & { offline: true; datenstand: string; hinweise: string[] }) | undefined> {
    return offlineAbfrage(pfad, werte, this.offlineWarnTage) as Promise<(T & { offline: true; datenstand: string; hinweise: string[] }) | undefined>;
  }

  /**
   * Rohe Anfrage an einen Pfad der API, zum Beispiel "/hr/mindestlohn". Liefert JSON oder, bei format=csv, Text.
   * Wiederholt bei Netzfehlern und 408, 500, 502, 503, 504 (mit Pause, Retry-After wird beachtet), wartet bei
   * 429 zu_schnell und nutzt nach dem letzten Versuch den Offline-Stand, wenn er den Pfad abdeckt.
   */
  async anfrage<T = unknown>(pfad: string, werte: Werte = {}, format: "json" | "csv" = "json", aufruf: AufrufOptionen = {}): Promise<T> {
    const { signal } = aufruf;
    if (signal?.aborted) throw abgebrochenFehler(signal);
    const url = new URL(this.basis + pfad);
    for (const [k, v] of Object.entries(werte)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    if (format === "csv") url.searchParams.set("format", "csv");
    const cacheSchluessel = url.toString();

    // Innerhalb der Gültigkeit (cacheTtlMs) kommt eine Antwort ohne jede Anfrage aus dem Zwischenspeicher
    const bekannt = this.cacheAktiv ? this.cacheHolen(cacheSchluessel) : undefined;
    if (bekannt && bekannt.bis > Date.now()) return bekannt.wert as T;

    const koepfe: Record<string, string> = { "User-Agent": `quellenkontor-sdk-js/${VERSION}` };
    koepfe.Accept = format === "csv" ? "text/csv" : "application/json";
    if (this.key) koepfe.Authorization = `Bearer ${this.key}`;
    // Abgelaufen, aber eine ETag von früher bekannt: mit If-None-Match nachfragen, ein Treffer (304) kostet kein Kontingent
    if (bekannt?.etag) koepfe["If-None-Match"] = bekannt.etag;

    let letzterFehler: unknown;
    let gebremst = 0;
    let naechstePauseMs: number | undefined;
    for (let versuch = 0; versuch <= this.wiederholungen; versuch++) {
      if (versuch > 0) await warte(Math.max(300 * 2 ** (versuch - 1), naechstePauseMs ?? 0), signal);
      naechstePauseMs = undefined;
      await this.takt(signal);
      let res: Response;
      try {
        res = await this.f(url, { headers: koepfe, signal: verbinde(this.timeout, signal) });
      } catch (e) {
        if (signal?.aborted) throw abgebrochenFehler(signal);
        letzterFehler = e;
        continue;
      }
      // Zu schnell (nicht Kontingent): Retry-After abwarten und dieselbe Anfrage noch einmal, bis zu 5 Mal
      if (res.status === 429 && gebremst < 5) {
        const d = (await res.clone().json().catch(() => ({}))) as ApiFehlerKoerper;
        if (d.fehler?.code === "zu_schnell") {
          gebremst++;
          versuch--;
          await warte(retryAfterMs(res.headers.get("retry-after")) ?? 1000, signal);
          continue;
        }
      }
      // Vercels Schutzschicht prüft einen Browser: für Programme nicht lösbar, klare Meldung statt HTML
      if (res.status === 403 && res.headers.get("x-vercel-mitigated")) {
        throw new QuellenkontorFehler("Die Schutzschicht vor der API hat diese Adresse vorübergehend ausgebremst, meist nach sehr vielen Anfragen in kurzer Zeit. Bitte langsamer abfragen (maxProSekunde) und in einigen Minuten erneut versuchen, oder hello@quellenkontor.dev schreiben.", 403, "ausgebremst");
      }
      // Vorübergehende Serverfehler: wiederholen; nach dem letzten Versuch zählt die API als nicht erreichbar
      if (WIEDERHOLBAR.has(res.status)) {
        letzterFehler = await fehlerAus(res);
        naechstePauseMs = retryAfterMs(res.headers.get("retry-after"));
        continue;
      }
      // Unverändert seit der gemerkten ETag: die gecachte Antwort gilt weiter, ohne dass es zählt
      if (res.status === 304 && bekannt) {
        if (this.cacheAktiv) this.cacheSetzen(cacheSchluessel, { ...bekannt, bis: Date.now() + this.cacheTtlMs });
        return bekannt.wert as T;
      }
      if (!res.ok) throw await fehlerAus(res);
      // Die API setzt für Excel ein BOM vor die CSV, im Programm stört es nur
      const wert = (format === "csv" ? (await res.text()).replace(/^﻿/, "") : await res.json()) as T;
      if (this.cacheAktiv) this.cacheSetzen(cacheSchluessel, { wert, etag: res.headers.get("etag"), bis: Date.now() + this.cacheTtlMs });
      return wert;
    }
    // Nach allen Wiederholungen nicht erreichbar: mit dem Offline-Stand weiterhelfen, wenn er diesen Pfad abdeckt
    if (this.offlineAktiv && format === "json") {
      const offline = await offlineAbfrage(pfad, werte, this.offlineWarnTage);
      if (offline !== undefined) return offline as T;
    }
    if (letzterFehler instanceof QuellenkontorFehler) throw letzterFehler;
    throw new QuellenkontorFehler(`Keine Verbindung zur API: ${String((letzterFehler as Error)?.message ?? letzterFehler)}`, 0, "netzwerk");
  }

  /** Englischer Name für anfrage */
  request<T = unknown>(pfad: string, werte: Werte = {}, format: "json" | "csv" = "json", aufruf: AufrufOptionen = {}): Promise<T> {
    return this.anfrage<T>(pfad, werte, format, aufruf);
  }

  /** Katalog aller Datensätze (ohne Schlüssel abrufbar) */
  datensaetze(aufruf?: AufrufOptionen) {
    return this.anfrage<{ datensaetze: {
      id: Datensatz; name: string; beschreibung: string; kategorie: string; art: "tabelle" | "rechner"; endpunkt: string; verlauf: string | null; mcp_werkzeug: string; csv: boolean;
      parameter: { name: string; typ: "datum" | "jahr" | "ganzzahl" | "zahl" | "text" | "bool"; pflicht: boolean; beschreibung: string; werte: string[] | null; min: number | null; max: number | null; standard: string | null; beispiel: string | null }[];
      quelle: string; aktualisierung: string; abdeckung: string; seite: string;
    }[] }>("/datensaetze", {}, "json", aufruf);
  }

  /** Prüfstand je Datensatz (ohne Schlüssel abrufbar) */
  status(aufruf?: AufrufOptionen) {
    return this.anfrage<{ stand: string; letzte_aenderung_id: number | null; datensaetze: { id: Datensatz; zuletzt_geprueft: string | null; gesichert_bis: string | null; erwartet: string | null; letzte_aenderung_id: number | null }[] }>("/status", {}, "json", aufruf);
  }

  /** Änderungsprotokoll (ohne Schlüssel abrufbar) */
  aenderungen(aufruf?: AufrufOptionen) {
    return this.anfrage<{ aenderungen: { id: number; datum: string; datensatz: string | null; art: string; gueltig_ab: string | null; text: string; beleg_url: string | null }[] }>("/aenderungen", {}, "json", aufruf);
  }

  readonly hr = {
    mindestlohn: (p: { datum?: string } = {}, a?: AufrufOptionen) => this.anfrage<Mindestlohn>("/hr/mindestlohn", p, "json", a),
    rechengroessen: (p: { jahr?: number } = {}, a?: AufrufOptionen) => this.anfrage<Rechengroessen>("/hr/rechengroessen", p, "json", a),
    beitragssaetze: (p: { datum?: string } = {}, a?: AufrufOptionen) => this.anfrage<Beitragssaetze>("/hr/beitragssaetze", p, "json", a),
    sachbezugswerte: (p: { jahr?: number } = {}, a?: AufrufOptionen) => this.anfrage<Sachbezugswerte>("/hr/sachbezugswerte", p, "json", a),
    pfaendungsfreigrenzen: (p: { datum?: string; unterhaltspflichten?: number; netto?: number } = {}, a?: AufrufOptionen) => this.anfrage<Pfaendungsfreigrenzen>("/hr/pfaendungsfreigrenzen", p, "json", a),
    uebergangsbereich: (p: { datum?: string } = {}, a?: AufrufOptionen) => this.anfrage<Uebergangsbereich>("/hr/uebergangsbereich", p, "json", a),
    kuendigungsfrist: (p: { eintritt: string; zugang: string; seite?: "arbeitgeber" | "arbeitnehmer"; probezeit?: boolean }, a?: AufrufOptionen) => this.anfrage<Kuendigungsfrist>("/hr/kuendigungsfrist", p, "json", a),
    urlaubsanspruch: (p: { arbeitstage_pro_woche: number; jahr?: number; eintritt?: string; austritt?: string }, a?: AufrufOptionen) => this.anfrage<Urlaubsanspruch>("/hr/urlaubsanspruch", p, "json", a),
    mutterschutz: (p: { termin?: string; geburt?: string; fall?: "standard" | "fruehgeburt" | "mehrlinge" | "behinderung" | "fehlgeburt"; ssw?: number }, a?: AufrufOptionen) => this.anfrage<Mutterschutz>("/hr/mutterschutz", p, "json", a),
    feiertage: (p: { jahr?: number; land?: Land } = {}, a?: AufrufOptionen) => this.anfrage<Feiertage>("/hr/feiertage", p, "json", a),
    arbeitstage: (p: { von: string; bis: string; land: Land; samstag?: boolean; regionale?: boolean }, a?: AufrufOptionen) => this.anfrage<Arbeitstage>("/hr/arbeitstage", p, "json", a),
    minijobAbgaben: (p: { datum?: string; bestandteil?: string } = {}, a?: AufrufOptionen) => this.anfrage<MinijobAbgaben>("/hr/minijob-abgaben", p, "json", a),
    reisekostenInland: (p: { datum?: string; bestandteil?: string } = {}, a?: AufrufOptionen) => this.anfrage<Komponenten<"reisekosten-inland">>("/hr/reisekosten-inland", p, "json", a),
    /** Maßgeblich ist der Ausbildungsbeginn (beginn), auch für das 2. bis 4. Ausbildungsjahr */
    mindestausbildungsverguetung: (p: { beginn?: string; ausbildungsjahr?: 1 | 2 | 3 | 4; bestandteil?: string } = {}, a?: AufrufOptionen) => this.anfrage<Mindestausbildungsverguetung>("/hr/mindestausbildungsverguetung", p, "json", a),
    kuenstlersozialabgabe: (p: { jahr?: number; datum?: string; bestandteil?: string } = {}, a?: AufrufOptionen) => this.anfrage<Komponenten<"kuenstlersozialabgabe">>("/hr/kuenstlersozialabgabe", p, "json", a),
    steuerfreieBetraege: (p: { datum?: string; bestandteil?: string } = {}, a?: AufrufOptionen) => this.anfrage<Komponenten<"steuerfreie-betraege">>("/hr/steuerfreie-betraege", p, "json", a),
    sfnZuschlaege: (p: { datum?: string; grundlohn_stunde?: number; bestandteil?: string } = {}, a?: AufrufOptionen) => this.anfrage<SfnZuschlaege>("/hr/sfn-zuschlaege", p, "json", a),
    dienstwagen: (p: { listenpreis: number; antrieb?: "verbrenner" | "elektro" | "hybrid"; anschaffung?: string; ueberlassung?: string; entfernung_km?: number; fahrten_monat?: number; zuzahlung_monat?: number; co2_g_km?: number; reichweite_km?: number; batterie_kwh?: number; datum?: string }, a?: AufrufOptionen) => this.anfrage<Dienstwagen>("/hr/dienstwagen", p, "json", a),
    pflegemindestlohn: (p: { datum?: string; bestandteil?: string } = {}, a?: AufrufOptionen) => this.anfrage<Komponenten<"pflegemindestlohn">>("/hr/pflegemindestlohn", p, "json", a),
    ausgleichsabgabe: (p: { jahr?: number; datum?: string; arbeitsplaetze?: number; besetzt?: number; bestandteil?: string } = {}, a?: AufrufOptionen) => this.anfrage<Ausgleichsabgabe>("/hr/ausgleichsabgabe", p, "json", a),
    einkommensteuerEckwerte: (p: { jahr?: number; datum?: string; bestandteil?: string } = {}, a?: AufrufOptionen) => this.anfrage<Komponenten<"einkommensteuer-eckwerte">>("/hr/einkommensteuer-eckwerte", p, "json", a),
    /** Mit geburtsdatum genau, mit geburtsjahr für den ganzen Jahrgang */
    regelaltersgrenze: (p: { geburtsdatum?: string; geburtsjahr?: number; vertrauensschutz?: boolean }, a?: AufrufOptionen) => this.anfrage<Regelaltersgrenze>("/hr/regelaltersgrenze", p, "json", a),
    pausen: (p: { arbeitszeit_stunden: number; jugendlich?: boolean }, a?: AufrufOptionen) => this.anfrage<Pausen>("/hr/pausen", p, "json", a),
    /** Stufen einer Reihe seit 2015, auf Wunsch nur ein Zeitraum oder ein Bestandteil; Zeilentyp je Datensatz */
    verlauf: <D extends VerlaufDatensatz>(datensatz: D, filter: { von?: string; bis?: string; bestandteil?: string } = {}, a?: AufrufOptionen) =>
      this.anfrage<Verlauf<D>>(`/hr/${datensatz}/verlauf`, filter, "json", a),
  };
}

/** Datensätze mit Verlauf (und damit mit Offline-Stand) */
export const MIT_VERLAUF: readonly VerlaufDatensatz[] = [
  "mindestlohn", "rechengroessen", "beitragssaetze", "sachbezugswerte", "pfaendungsfreigrenzen", "uebergangsbereich",
  "minijob-abgaben", "reisekosten-inland", "mindestausbildungsverguetung", "kuenstlersozialabgabe", "steuerfreie-betraege",
  "sfn-zuschlaege", "pflegemindestlohn", "ausgleichsabgabe", "einkommensteuer-eckwerte",
];

export default Quellenkontor;
