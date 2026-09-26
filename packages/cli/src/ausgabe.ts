/** Ausgabe der CLI: Tabelle fürs Terminal und CSV wie die API (für den Offline-Fall und Katalog/Status). */

function zelle(v: unknown): string {
  // null heißt: für diesen Stichtag gibt es keinen Wert (wie in der JSON-Antwort)
  if (v === null || v === undefined) return "null";
  if (typeof v === "object") return Array.isArray(v) ? v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ") : JSON.stringify(v);
  return String(v);
}

/** Kürzt nur im Terminal und immer sichtbar mit Auslassungszeichen */
function kuerzen(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text;
}

/**
 * Antwort als Tabelle: Listen (Feiertage, Verlauf, Bestandteile) als Spalten, sonst Feld und Wert.
 * Im Terminal (tty) werden lange Zellen auf 48 Zeichen gekürzt und mit … markiert, in einer Datei oder
 * Pipe bleibt alles vollständig.
 */
export function tabelle(o: Record<string, unknown>, tty = false, spaltenTerminal?: number): string {
  const listenFeld = ["feiertage", "verlauf", "bestandteile", "feiertage_an_arbeitstagen"].find((k) => Array.isArray(o[k]));
  const liste = listenFeld ? (o[listenFeld] as Record<string, unknown>[]) : undefined;
  // Einfache Werte direkt, Objekte eine Ebene tief (feld.unterfeld), andere Listen als Hinweis
  const paare: [string, string][] = [];
  for (const [k, v] of Object.entries(o)) {
    if (k === listenFeld) continue;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      for (const [uk, uv] of Object.entries(v as Record<string, unknown>)) paare.push([`${k}.${uk}`, zelle(uv)]);
    } else if (Array.isArray(v)) {
      paare.push([k, v.every((x) => typeof x !== "object") ? v.map(String).join(" | ") : `(${v.length} Einträge, siehe --format json)`]);
    } else paare.push([k, zelle(v)]);
  }
  const breite = Math.max(0, ...paare.map(([k]) => k.length));
  const zeilen = paare.map(([k, v]) => `${k.padEnd(breite)}  ${v}`);
  if (liste && liste.length) {
    const max = tty ? 48 : Number.POSITIVE_INFINITY;
    const spalten = [...new Set(liste.flatMap((z) => Object.keys(z)))].filter((s) => !["quelle", "quelle_url", "regional_hinweis"].includes(s));
    const w = spalten.map((s) => Math.min(max, Math.max(s.length, ...liste.map((z) => zelle(z[s]).length))));
    const zeile = (werte: string[]) => {
      const text = werte.map((x, i) => kuerzen(x, max).padEnd(w[i])).join("  ").trimEnd();
      return tty && spaltenTerminal ? kuerzen(text, spaltenTerminal) : text;
    };
    if (zeilen.length) zeilen.push("");
    zeilen.push(zeile(spalten));
    for (const z of liste) zeilen.push(zeile(spalten.map((s) => zelle(z[s]))));
  } else if (liste) {
    zeilen.push("", `(keine Einträge in ${listenFeld})`);
  }
  return zeilen.join("\n");
}

function csvZelle(v: unknown, trenner: string): string {
  if (v === null || v === undefined) return "";
  const s = Array.isArray(v) ? v.join(" ")
    : typeof v === "object" ? JSON.stringify(v)
    : typeof v === "number" && trenner === ";" ? String(v).replace(".", ",")
    : String(v);
  return s.includes(trenner) || /["\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Verschachtelte Objekte werden zu eigenen Spalten (quelle.titel wird quelle_titel), wie in der API */
function flach(z: Record<string, unknown>): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(z)) {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) for (const [uk, uv] of Object.entries(v)) o[`${k}_${uk}`] = uv;
    else o[k] = v;
  }
  return o;
}

/** CSV nach RFC 4180 ohne BOM, bei ";" mit Dezimalkomma wie die API */
export function csvText(roh: Record<string, unknown>[], trenner: "," | ";" = ","): string {
  const zeilen = roh.map(flach);
  const spalten = [...new Set(zeilen.flatMap((z) => Object.keys(z)))];
  return [spalten.join(trenner), ...zeilen.map((z) => spalten.map((s) => csvZelle(z[s], trenner)).join(trenner))].join("\r\n") + "\r\n";
}
