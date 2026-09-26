/**
 * Offline-Stand als eigener Einstieg: import { OFFLINE_DATEN } from "@quellenkontor/sdk/offline".
 * Das Hauptpaket lädt ihn erst, wenn die API nicht erreichbar ist, Bundler legen ihn in einen eigenen Teil.
 */
export { OFFLINE_DATEN } from "./offline-daten.js";
export type { OfflineStand, OfflineZeile } from "./offline-daten.js";
