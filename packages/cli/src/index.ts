#!/usr/bin/env node
/**
 * qk: Kommandozeile für die Quellenkontor-API.
 *
 *   qk login
 *   qk mindestlohn --datum 2027-01-15
 *   qk feiertage --jahr 2027 --land HE --format csv > feiertage.csv
  qk dienstwagen --listenpreis 58900 --antrieb elektro --anschaffung 2025-09-01 --entfernung-km 18
  qk regelaltersgrenze --geburtsdatum 1961-08-15
 *   qk mindestlohn verlauf --format csv
 */
import { mkdir, readFile, rm, writeFile, chmod } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { Quellenkontor, QuellenkontorFehler, VERSION } from "@quellenkontor/sdk";

const ORDNER = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "quellenkontor");
const DATEI = join(ORDNER, "config.json");

const DATENSAETZE = [
  "mindestlohn", "rechengroessen", "beitragssaetze", "sachbezugswerte", "pfaendungsfreigrenzen",
  "uebergangsbereich", "kuendigungsfrist", "urlaubsanspruch", "mutterschutz", "feiertage", "arbeitstage",
  "minijob-abgaben", "reisekosten-inland", "mindestausbildungsverguetung", "kuenstlersozialabgabe", "steuerfreie-betraege",
  "sfn-zuschlaege", "pflegemindestlohn", "ausgleichsabgabe", "einkommensteuer-eckwerte", "regelaltersgrenze", "pausen", "dienstwagen",
];
const MIT_VERLAUF = [
  "mindestlohn", "rechengroessen", "beitragssaetze", "sachbezugswerte", "pfaendungsfreigrenzen", "uebergangsbereich",
  "minijob-abgaben", "reisekosten-inland", "mindestausbildungsverguetung", "kuenstlersozialabgabe", "steuerfreie-betraege",
  "sfn-zuschlaege", "pflegemindestlohn", "ausgleichsabgabe", "einkommensteuer-eckwerte",
];

const HILFE = `qk ${VERSION}: geprüfte HR-Daten im Terminal

Aufruf:
  qk <datensatz> [--parameter wert ...] [--format tabelle|json|csv]
  qk <datensatz> verlauf [--von JJJJ-MM-TT] [--bis JJJJ-MM-TT] [--bestandteil id] [--format tabelle|json|csv]
  qk datensaetze            alle Datensätze mit Parametern
  qk status                 letzte Prüfung und erwartete Änderung je Datensatz
  qk login                  Schlüssel speichern (alternativ Umgebungsvariable QK_KEY)
  qk logout                 gespeicherten Schlüssel von diesem Rechner entfernen
  qk hilfe                  diese Hilfe (auch qk --help)
  qk version                installierte Version (auch qk --version)

Beispiele:
  qk mindestlohn --datum 2027-01-15
  qk kuendigungsfrist --eintritt 2017-03-01 --zugang 2026-11-10
  qk arbeitstage --von 2027-01-01 --bis 2027-01-31 --land HE
  qk mindestlohn verlauf --von 2022-01-01 --bis 2022-12-31
  qk regelaltersgrenze --geburtsjahr 1962
  qk feiertage --jahr 2027 --land HE --format csv > feiertage.csv

Parameter schreibst du mit Bindestrichen: --arbeitstage-pro-woche 5.
In der Tabelle steht null, wenn es für den Stichtag keinen Wert gibt.
Doku: https://quellenkontor.dev/docs/cli
`;

async function gespeicherterSchluessel(): Promise<string | undefined> {
  try {
    return (JSON.parse(await readFile(DATEI, "utf8")) as { key?: string }).key;
  } catch {
    return undefined;
  }
}

function argumente(liste: string[]) {
  const positionen: string[] = [];
  const optionen: Record<string, string> = {};
  for (let i = 0; i < liste.length; i++) {
    const a = liste[i];
    if (a.startsWith("--")) {
      const [name, wert] = a.slice(2).split("=", 2);
      const naechster = liste[i + 1];
      if (wert !== undefined) optionen[name] = wert;
      else if (naechster !== undefined && !naechster.startsWith("--")) { optionen[name] = naechster; i++; }
      else optionen[name] = "true";
    } else positionen.push(a);
  }
  return { positionen, optionen };
}

function zelle(v: unknown): string {
  // null heißt: für diesen Stichtag gibt es keinen Wert (wie in der JSON-Antwort)
  if (v === null || v === undefined) return "null";
  if (typeof v === "object") return Array.isArray(v) ? v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ") : JSON.stringify(v);
  return String(v);
}

function tabelle(o: Record<string, unknown>): string {
  // Listen (Feiertage, Verlauf, Bestandteile) als Tabelle, sonst Feld und Wert
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
  const breite = Math.max(...paare.map(([k]) => k.length));
  const zeilen = paare.map(([k, v]) => `${k.padEnd(breite)}  ${v}`);
  if (liste && liste.length) {
    const spalten = Object.keys(liste[0]).filter((s) => !["quelle", "quelle_url", "regional_hinweis"].includes(s));
    const w = spalten.map((s) => Math.min(48, Math.max(s.length, ...liste.map((z) => zelle(z[s]).length))));
    zeilen.push("", spalten.map((s, i) => s.padEnd(w[i])).join("  "));
    for (const z of liste) zeilen.push(spalten.map((s, i) => zelle(z[s]).slice(0, 48).padEnd(w[i])).join("  "));
  }
  return zeilen.join("\n");
}

async function login() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const key = (await rl.question("API-Schlüssel (beginnt mit qk_live_): ")).trim();
  rl.close();
  if (!key.startsWith("qk_live_")) {
    console.error("Das sieht nicht nach einem Schlüssel aus. Einen Schlüssel erzeugst du unter https://quellenkontor.dev/konto");
    process.exit(1);
  }
  await mkdir(ORDNER, { recursive: true });
  await writeFile(DATEI, JSON.stringify({ key }, null, 2));
  await chmod(DATEI, 0o600);
  console.log(`Gespeichert in ${DATEI}.`);
}

async function main() {
  const { positionen, optionen } = argumente(process.argv.slice(2));
  const befehl = positionen[0];
  if (!befehl || befehl === "hilfe" || optionen.help || optionen.hilfe) { console.log(HILFE); return; }
  if (befehl === "version" || optionen.version) { console.log(VERSION); return; }
  if (befehl === "login") return login();
  if (befehl === "logout") { await rm(DATEI, { force: true }); console.log("Schlüssel von diesem Rechner entfernt. Im Konto bleibt er gültig, bis du ihn dort sperrst."); return; }

  const format = (optionen.format ?? "tabelle") as "tabelle" | "json" | "csv";
  delete optionen.format;
  if (!["tabelle", "json", "csv"].includes(format)) throw new Error("--format muss tabelle, json oder csv sein.");

  const key = process.env.QK_KEY ?? (await gespeicherterSchluessel());
  const qk = new Quellenkontor({ apiKey: key, basisUrl: process.env.QK_BASIS_URL });

  if (befehl === "datensaetze") {
    const d = await qk.datensaetze();
    if (format === "json") { console.log(JSON.stringify(d, null, 2)); return; }
    for (const x of d.datensaetze as unknown as { id: string; name: string; parameter: { name: string; pflicht: boolean }[] }[]) {
      console.log(`${x.id.padEnd(22)} ${x.name}\n${"".padEnd(22)} ${x.parameter.map((p) => `--${p.name.replace(/_/g, "-")}${p.pflicht ? "*" : ""}`).join(" ")}`);
    }
    return;
  }
  if (befehl === "status") {
    const s = await qk.status();
    if (format === "json") { console.log(JSON.stringify(s, null, 2)); return; }
    for (const x of s.datensaetze) console.log(`${x.id.padEnd(30)} geprüft ${x.zuletzt_geprueft ?? "?"}  ${x.erwartet ?? ""}`);
    return;
  }
  if (!DATENSAETZE.includes(befehl)) throw new Error(`Unbekannter Befehl: ${befehl}. Alle Befehle: qk hilfe`);
  if (!key) throw new Error("Kein Schlüssel. Führe qk login aus oder setze die Umgebungsvariable QK_KEY.");

  const verlauf = positionen[1] === "verlauf";
  if (verlauf && !MIT_VERLAUF.includes(befehl)) throw new Error(`Für ${befehl} gibt es keinen Verlauf.`);
  // Überzählige Argumente nicht still übergehen, sonst rechnet qk mit dem heutigen Tag
  const erlaubt = verlauf ? 2 : 1;
  if (positionen.length > erlaubt) {
    throw new Error(`Unbekanntes Argument ${positionen[erlaubt]}. Parameter schreibst du als Option, zum Beispiel --datum 2026-12-24.`);
  }
  const pfad = `/hr/${befehl}${verlauf ? "/verlauf" : ""}`;
  const werte = Object.fromEntries(Object.entries(optionen).map(([k, v]) => [k.replace(/-/g, "_"), v]));

  if (format === "csv") {
    const text = await qk.anfrage<string>(pfad, werte, "csv");
    // Semikolon heißt Excel mit deutschen Einstellungen: Ohne BOM zeigt Excel die Umlaute falsch
    process.stdout.write((werte.trennzeichen === "semikolon" ? "\uFEFF" : "") + text);
    return;
  }
  const antwort = await qk.anfrage<Record<string, unknown>>(pfad, werte);
  console.log(format === "json" ? JSON.stringify(antwort, null, 2) : tabelle(antwort));
}

main().catch((e) => {
  if (e instanceof QuellenkontorFehler) {
    // Parameter so nennen, wie man sie in der CLI schreibt: grundlohn_stunde als --grundlohn-stunde
    const nachricht = e.parameter ? e.message.split(e.parameter).join(`--${e.parameter.replace(/_/g, "-")}`) : e.message;
    console.error(`Fehler ${e.status} (${e.code}): ${nachricht}`);
  }
  else console.error(`Fehler: ${(e as Error).message}`);
  process.exit(1);
});
