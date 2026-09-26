/**
 * Typ des Offline-Stands. Die Daten selbst liegen in offline-daten.json (erzeugt von
 * scripts/offline-snapshot.mjs in der App), der Build (scripts/build.mjs) macht daraus
 * dist/offline-daten.js und dist/cjs/offline-daten.js. Absichtlich ein schmaler Typ statt eines
 * Literaltyps, damit die Typdeklarationen klein bleiben.
 */
export type OfflineZeile = { readonly [feld: string]: unknown };
export type OfflineStand = {
  /** Datenstand der API beim Erzeugen, etwa "2026-09-24.16" */
  readonly datenstand: string;
  /** Zeitpunkt der Erzeugung als ISO-Zeitstempel */
  readonly erzeugt_am: string;
  /** Voller Verlauf je Tabellen-Datensatz */
  readonly datensaetze: { readonly [datensatz: string]: readonly OfflineZeile[] };
};
export declare const OFFLINE_DATEN: OfflineStand;
