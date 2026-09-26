#!/usr/bin/env node
/**
 * qk: Kommandozeile für die Quellenkontor-API.
 *
 *   qk login
 *   qk mindestlohn --datum 2027-01-15
 *   qk feiertage --jahr 2027 --land HE --format csv > feiertage.csv
 *   qk dienstwagen --listenpreis 58900 --antrieb elektro --anschaffung 2025-09-01 --entfernung-km 18
 *   qk mindestlohn verlauf --format csv
 *
 * Exit-Codes: 0 ok, 1 sonstiger Fehler, 2 Aufruffehler, 3 Schlüssel fehlt oder ungültig,
 * 4 Kontingent erreicht oder gebremst (429), 5 Netz oder Server nicht erreichbar.
 */
import { chmod, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { Quellenkontor, QuellenkontorFehler, VERSION as SDK_VERSION, MIT_VERLAUF } from "@quellenkontor/sdk";
import { tabelle, csvText } from "./ausgabe.js";

export const CLI_VERSION = "0.1.2";

const EXIT = { ok: 0, sonstiges: 1, aufruf: 2, schluessel: 3, kontingent: 4, netz: 5 } as const;

/** Fehler im Aufruf selbst (Befehl, Option, Wert): Exit-Code 2 */
class AufrufFehler extends Error {}

const DATENSAETZE = [
  "mindestlohn", "rechengroessen", "beitragssaetze", "sachbezugswerte", "pfaendungsfreigrenzen",
  "uebergangsbereich", "kuendigungsfrist", "urlaubsanspruch", "mutterschutz", "feiertage", "arbeitstage",
  "minijob-abgaben", "reisekosten-inland", "mindestausbildungsverguetung", "kuenstlersozialabgabe", "steuerfreie-betraege",
  "sfn-zuschlaege", "pflegemindestlohn", "ausgleichsabgabe", "einkommensteuer-eckwerte", "regelaltersgrenze", "pausen", "dienstwagen",
];
/** Ohne Schlüssel abrufbar (Sandbox der API, 50 Abfragen am Tag je Adresse) */
const SANDBOX = ["mindestlohn", "feiertage", "rechengroessen"];
const BEFEHLE = ["datensaetze", "status", "login", "logout", "hilfe", "help", "version", "batch", "completion"];

/** Parameter der API in CLI-Schreibweise. Neue Parameter gehen bis zum nächsten Release über --param name=wert. */
const API_PARAMETER = [
  "datum", "beginn", "ausbildungsjahr", "bestandteil", "jahr", "unterhaltspflichten", "netto", "arbeitsplaetze", "besetzt",
  "grundlohn-stunde", "listenpreis", "antrieb", "anschaffung", "ueberlassung", "entfernung-km", "fahrten-monat", "zuzahlung-monat",
  "co2-g-km", "reichweite-km", "batterie-kwh", "eintritt", "zugang", "seite", "probezeit", "arbeitstage-pro-woche", "austritt",
  "termin", "geburt", "fall", "ssw", "land", "von", "bis", "samstag", "regionale", "geburtsdatum", "geburtsjahr",
  "vertrauensschutz", "arbeitszeit-stunden", "jugendlich",
];
/** Ja/Nein-Parameter: --probezeit allein heißt --probezeit true */
const BOOL_PARAMETER = new Set(["probezeit", "samstag", "regionale", "vertrauensschutz", "jugendlich"]);

const OPTIONEN = {
  format: { type: "string" },
  json: { type: "boolean" },
  trennzeichen: { type: "string" },
  "no-offline": { type: "boolean" },
  "key-stdin": { type: "boolean" },
  param: { type: "string", short: "p", multiple: true },
  help: { type: "boolean", short: "h" },
  hilfe: { type: "boolean" },
  version: { type: "boolean", short: "V" },
  ...Object.fromEntries(API_PARAMETER.map((p) => [p, { type: "string", multiple: true }])),
} as const;

const HILFE = `qk ${CLI_VERSION}: geprüfte HR-Daten im Terminal

Aufruf:
  qk <datensatz> [--parameter wert ...] [--format tabelle|json|csv]
  qk <datensatz> verlauf [--von JJJJ-MM-TT] [--bis JJJJ-MM-TT] [--bestandteil id]
  qk <datensatz> --help     Parameter dieses Datensatzes
  qk datensaetze            alle Datensätze mit Parametern
  qk status                 letzte Prüfung und erwartete Änderung je Datensatz
  qk batch                  eine Abfrage je Zeile von stdin, Ausgabe als JSON-Zeilen
  qk login                  Schlüssel speichern (verdeckte Eingabe; oder --key-stdin)
  qk logout                 gespeicherten Schlüssel von diesem Rechner entfernen
  qk completion bash|zsh|fish   Skript für die Tab-Ergänzung
  qk version                Version von CLI und SDK, Offline-Stand
  qk hilfe                  diese Hilfe (auch -h, --help)

Optionen:
  --format tabelle|json|csv   Ausgabe, Standard tabelle (--json ist kurz für --format json)
  --trennzeichen komma|semikolon   Trennzeichen der CSV, semikolon für ein deutsches Excel
  --no-offline                ohne Verbindung Fehler statt Offline-Stand
  -p, --param name=wert       Parameter, den diese Version noch nicht kennt
  -V, --version               nur die Versionsnummer

Beispiele:
  qk mindestlohn --datum 2027-01-15
  qk kuendigungsfrist --eintritt 2017-03-01 --zugang 2026-11-10
  qk arbeitstage --von 2027-01-01 --bis 2027-01-31 --land HE
  qk mindestlohn verlauf --von 2022-01-01 --bis 2022-12-31
  qk feiertage --jahr 2027 --land HE --format csv --trennzeichen semikolon > feiertage.csv

Parameter schreibst du mit Bindestrichen: --arbeitstage-pro-woche 5, negative Zahlen mit =: --zuzahlung-monat=-50.
Ohne Schlüssel frei (Sandbox): ${SANDBOX.join(", ")}. In der Tabelle steht null, wenn es für den Stichtag keinen Wert gibt.

Umgebung:
  QK_KEY          API-Schlüssel, hat Vorrang vor qk login
  QK_BASIS_URL    andere API-Adresse, etwa für Tests
  QK_CONFIG_DIR   anderer Ordner für die Schlüsseldatei
  QK_KEIN_UPDATE_HINWEIS=1   keinen Hinweis auf neue Versionen zeigen

Exit-Codes: 0 ok, 1 sonstiger Fehler, 2 Aufruffehler, 3 Schlüssel fehlt oder ungültig,
4 Kontingent erreicht oder gebremst, 5 Netz oder Server nicht erreichbar.
Doku: https://quellenkontor.dev/docs/cli
`;

// --------------------------------------------------------------------------------------------------
// Schlüsselablage: Linux und macOS unter XDG_CONFIG_HOME oder ~/.config, Windows unter %APPDATA%

function konfigOrdner(): string {
  if (process.env.QK_CONFIG_DIR) return process.env.QK_CONFIG_DIR;
  if (process.platform === "win32") return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "quellenkontor");
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "quellenkontor");
}
const ORDNER = konfigOrdner();
const DATEI = join(ORDNER, "config.json");

async function gespeicherterSchluessel(): Promise<string | undefined> {
  try {
    return (JSON.parse(await readFile(DATEI, "utf8")) as { key?: string }).key;
  } catch {
    return undefined;
  }
}

async function ordnerAnlegen(): Promise<void> {
  await mkdir(ORDNER, { recursive: true, mode: 0o700 });
  // Auch einen schon vorhandenen Ordner nur für den eigenen Nutzer lesbar machen (unter Windows wirkungslos)
  if (process.platform !== "win32") await chmod(ORDNER, 0o700);
}

async function stdinLesen(): Promise<string> {
  let text = "";
  process.stdin.setEncoding("utf8");
  for await (const teil of process.stdin) text += teil;
  return text;
}

/** Eingabe ohne Echo: jedes Zeichen erscheint als *, Rücktaste löscht, Strg+C bricht ab */
function verdeckteEingabe(frage: string): Promise<string> {
  return new Promise((ok, nein) => {
    const ein = process.stdin;
    process.stderr.write(frage);
    ein.setRawMode(true);
    ein.resume();
    ein.setEncoding("utf8");
    let wert = "";
    const ende = () => {
      ein.setRawMode(false);
      ein.pause();
      ein.off("data", weiter);
      process.stderr.write("\n");
    };
    function weiter(text: string) {
      for (const z of text) {
        if (z === "\r" || z === "\n") { ende(); return ok(wert.replace(/\[20[01]~/g, "")); }
        if (z === "\u0003") { ende(); return nein(new AufrufFehler("Abgebrochen.")); }
        if (z === "\u007f" || z === "\b") {
          if (wert) { wert = wert.slice(0, -1); process.stderr.write("\b \b"); }
          continue;
        }
        if (z >= " ") { wert += z; process.stderr.write("*"); }
      }
    }
    ein.on("data", weiter);
  });
}

async function login(keyStdin: boolean): Promise<void> {
  const key = (keyStdin || !process.stdin.isTTY ? await stdinLesen() : await verdeckteEingabe("API-Schlüssel (beginnt mit qk_live_): ")).trim();
  if (!key.startsWith("qk_live_")) {
    throw new AufrufFehler("Das sieht nicht nach einem Schlüssel aus. Einen Schlüssel erzeugst du unter https://quellenkontor.dev/konto");
  }
  await ordnerAnlegen();
  await writeFile(DATEI, JSON.stringify({ key }, null, 2), { mode: 0o600 });
  if (process.platform !== "win32") await chmod(DATEI, 0o600);
  const zusatz = process.platform === "win32"
    ? " Unter Windows schützt nur dein Benutzerprofil die Datei; auf geteilten Rechnern besser die Umgebungsvariable QK_KEY nutzen."
    : "";
  console.error(`Gespeichert in ${DATEI}.${zusatz}`);
}

async function logout(): Promise<void> {
  const vorhanden = await stat(DATEI).then(() => true, () => false);
  if (!vorhanden) {
    console.error(`Auf diesem Rechner ist kein Schlüssel gespeichert (${DATEI}).`);
  } else {
    await rm(DATEI, { force: true });
    console.error("Schlüssel von diesem Rechner entfernt. Im Konto bleibt er gültig, bis du ihn dort sperrst.");
  }
  if (process.env.QK_KEY) console.error("Hinweis: Die Umgebungsvariable QK_KEY ist weiter gesetzt und wird weiter genutzt.");
}

// --------------------------------------------------------------------------------------------------
// Argumente

type Aufruf = {
  positionen: string[];
  werte: Record<string, string>;
  format: "tabelle" | "json" | "csv";
  offline: boolean;
  keyStdin: boolean;
  hilfe: boolean;
  version: boolean;
};

/** Vorbereitung für parseArgs: --probezeit allein wird --probezeit=true, negative Zahlen hängen an ihrer Option */
function vorbereiten(liste: string[]): string[] {
  const aus: string[] = [];
  for (let i = 0; i < liste.length; i++) {
    const a = liste[i];
    const naechster = liste[i + 1];
    if (a === "--") { aus.push(...liste.slice(i)); break; }
    const name = a.startsWith("--") && !a.includes("=") ? a.slice(2) : undefined;
    if (name && BOOL_PARAMETER.has(name) && (naechster === undefined || !/^(true|false|ja|nein|1|0)$/i.test(naechster))) {
      aus.push(`--${name}=true`);
    } else if (name && API_PARAMETER.includes(name) && naechster !== undefined && /^-\d/.test(naechster)) {
      aus.push(`--${name}=${naechster}`);
      i++;
    } else aus.push(a);
  }
  return aus;
}

function argumente(liste: string[]): Aufruf {
  let ergebnis;
  try {
    ergebnis = parseArgs({ args: vorbereiten(liste), options: OPTIONEN, strict: true, allowPositionals: true });
  } catch (e) {
    const fehler = e as { code?: string; message: string };
    const option = /'([^']+)'/.exec(fehler.message)?.[1]?.split(" ")[0];
    if (fehler.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") {
      throw new AufrufFehler(`Unbekannte Option ${option ?? ""}. Die Parameter eines Datensatzes zeigt qk <datensatz> --help, neue Parameter gehen über --param name=wert.`);
    }
    if (fehler.code === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE") {
      throw new AufrufFehler(`Die Option ${option ?? ""} braucht einen Wert, zum Beispiel ${option ?? "--datum"} 2027-01-01.`);
    }
    throw new AufrufFehler(fehler.message);
  }
  const { values: v, positionals } = ergebnis;
  const werte: Record<string, string> = {};
  for (const p of API_PARAMETER) {
    const liste = v[p as keyof typeof v] as string[] | undefined;
    if (!liste) continue;
    if (liste.length > 1) throw new AufrufFehler(`--${p} ist mehrfach angegeben (${liste.join(", ")}). Jeder Parameter geht nur einmal.`);
    werte[p.replace(/-/g, "_")] = liste[0];
  }
  for (const eintrag of (v.param as string[] | undefined) ?? []) {
    const m = /^([a-z0-9_-]+)=(.*)$/i.exec(eintrag);
    if (!m) throw new AufrufFehler(`--param erwartet name=wert, nicht ${eintrag}.`);
    werte[m[1].replace(/-/g, "_")] = m[2];
  }
  if (v.trennzeichen !== undefined) {
    if (!["komma", "semikolon"].includes(v.trennzeichen as string)) throw new AufrufFehler("--trennzeichen muss komma oder semikolon sein.");
    werte.trennzeichen = v.trennzeichen as string;
  }
  const format = (v.json ? "json" : (v.format as string | undefined) ?? "tabelle") as Aufruf["format"];
  if (!["tabelle", "json", "csv"].includes(format)) throw new AufrufFehler("--format muss tabelle, json oder csv sein.");
  if (werte.trennzeichen && format !== "csv") throw new AufrufFehler("--trennzeichen gibt es nur zusammen mit --format csv.");
  return {
    positionen: positionals, werte, format,
    offline: !v["no-offline"], keyStdin: Boolean(v["key-stdin"]),
    hilfe: Boolean(v.help || v.hilfe), version: Boolean(v.version),
  };
}

// --------------------------------------------------------------------------------------------------
// Befehle

function client(offline: boolean): Quellenkontor {
  return new Quellenkontor({ apiKey: schluessel, basisUrl: process.env.QK_BASIS_URL, offline });
}
let schluessel: string | undefined;

type Katalog = Awaited<ReturnType<Quellenkontor["datensaetze"]>>;

async function datensatzHilfe(qk: Quellenkontor, id: string): Promise<string> {
  let katalog: Katalog;
  try {
    katalog = await qk.datensaetze();
  } catch {
    return `Die Parameter von ${id} kommen aus dem Katalog der API, der gerade nicht erreichbar ist. Doku: https://quellenkontor.dev/datensaetze/${id}`;
  }
  const d = katalog.datensaetze.find((x) => x.id === id);
  if (!d) return `Der Katalog kennt ${id} nicht. Alle Datensätze: qk datensaetze`;
  const zeilen = [`qk ${d.id}: ${d.name}`, "", d.beschreibung, "", "Parameter (* Pflicht):"];
  const breite = Math.max(0, ...d.parameter.map((p) => p.name.length + 3));
  for (const p of d.parameter) {
    const extra = [p.werte ? `Werte: ${p.werte.join(", ")}` : "", p.beispiel ? `Beispiel: ${p.beispiel}` : "", p.standard ? `Standard: ${p.standard}` : ""].filter(Boolean).join(". ");
    zeilen.push(`  ${`--${p.name.replace(/_/g, "-")}${p.pflicht ? "*" : ""}`.padEnd(breite)}  ${p.beschreibung}${extra ? ` (${extra})` : ""}`);
  }
  if (d.verlauf) zeilen.push("", `Verlauf: qk ${d.id} verlauf [--von JJJJ-MM-TT] [--bis JJJJ-MM-TT] [--bestandteil id]`);
  zeilen.push(`CSV: ${d.csv ? "ja, mit --format csv" : "nur für den Verlauf"}`, `Doku: ${d.seite}`);
  return zeilen.join("\n");
}

function csvZeilen(rows: Record<string, unknown>[], trennzeichen: string | undefined): string {
  const trenner = trennzeichen === "semikolon" ? ";" : ",";
  return (trenner === ";" ? "﻿" : "") + csvText(rows, trenner);
}

/** Warnung auf stderr, wenn eine Antwort aus dem Offline-Stand kommt */
function offlineWarnung(antwort: { offline?: unknown; datenstand?: unknown }): void {
  if (antwort.offline !== true) return;
  const adresse = process.env.QK_BASIS_URL ? ` unter ${process.env.QK_BASIS_URL} (QK_BASIS_URL)` : "";
  console.error(`Hinweis: API${adresse} nicht erreichbar, Antwort aus dem Offline-Stand ${String(antwort.datenstand)}. Mit --no-offline wäre das ein Fehler.`);
}

async function datensatzAbfrage(qk: Quellenkontor, a: Aufruf): Promise<string> {
  const [befehl, zweites] = a.positionen;
  const verlauf = zweites === "verlauf";
  if (verlauf && !(MIT_VERLAUF as readonly string[]).includes(befehl)) throw new AufrufFehler(`Für ${befehl} gibt es keinen Verlauf.`);
  // Überzählige Argumente nicht still übergehen, sonst rechnet qk mit dem heutigen Tag
  const erlaubt = verlauf ? 2 : 1;
  if (a.positionen.length > erlaubt) {
    throw new AufrufFehler(`Unbekanntes Argument ${a.positionen[erlaubt]}. Parameter schreibst du als Option, zum Beispiel --datum 2026-12-24.`);
  }
  const pfad = `/hr/${befehl}${verlauf ? "/verlauf" : ""}`;

  if (a.format === "csv") {
    try {
      const text = await qk.anfrage<string>(pfad, a.werte, "csv");
      // Semikolon heißt Excel mit deutschen Einstellungen: Ohne BOM zeigt Excel die Umlaute falsch
      return (a.werte.trennzeichen === "semikolon" ? "﻿" : "") + text;
    } catch (e) {
      // Ohne Verbindung: CSV aus dem Offline-Stand, soweit der Datensatz dort eine Liste hat
      if (!a.offline || !(e instanceof QuellenkontorFehler) || !(e.code === "netzwerk" || e.status >= 500)) throw e;
      const { trennzeichen, ...rest } = a.werte;
      const off = await qk.offlineAntwort(pfad, rest);
      const liste = (off?.verlauf ?? off?.bestandteile) as Record<string, unknown>[] | undefined;
      if (!off || !liste) throw e;
      offlineWarnung(off);
      return csvZeilen(liste, trennzeichen);
    }
  }
  const antwort = await qk.anfrage<Record<string, unknown>>(pfad, a.werte);
  offlineWarnung(antwort);
  return a.format === "json" ? JSON.stringify(antwort, null, 2) : tabelle(antwort, Boolean(process.stdout.isTTY), process.stdout.columns);
}

async function katalogAusgabe(qk: Quellenkontor, a: Aufruf): Promise<string> {
  const d = await qk.datensaetze();
  if (a.format === "json") return JSON.stringify(d, null, 2);
  if (a.format === "csv") {
    return csvZeilen(d.datensaetze.map((x) => ({
      id: x.id, name: x.name, art: x.art, kategorie: x.kategorie, verlauf: Boolean(x.verlauf), csv: x.csv,
      parameter: x.parameter.map((p) => `${p.name}${p.pflicht ? "*" : ""}`).join(" "),
    })), a.werte.trennzeichen);
  }
  return d.datensaetze.map((x) => `${x.id.padEnd(30)} ${x.name}\n${"".padEnd(30)} ${x.parameter.map((p) => `--${p.name.replace(/_/g, "-")}${p.pflicht ? "*" : ""}`).join(" ")}`).join("\n");
}

async function statusAusgabe(qk: Quellenkontor, a: Aufruf): Promise<string> {
  const s = await qk.status();
  if (a.format === "json") return JSON.stringify(s, null, 2);
  if (a.format === "csv") return csvZeilen(s.datensaetze as unknown as Record<string, unknown>[], a.werte.trennzeichen);
  return s.datensaetze.map((x) => `${x.id.padEnd(30)} geprüft ${x.zuletzt_geprueft ?? "?"}  ${x.erwartet ?? ""}`.trimEnd()).join("\n");
}

async function versionAusgabe(format: Aufruf["format"]): Promise<string> {
  const { OFFLINE_DATEN } = await import("@quellenkontor/sdk/offline");
  const info = { cli: CLI_VERSION, sdk: SDK_VERSION, offline_datenstand: OFFLINE_DATEN.datenstand, offline_erzeugt_am: OFFLINE_DATEN.erzeugt_am, node: process.versions.node };
  if (format === "json") return JSON.stringify(info, null, 2);
  return `qk ${info.cli}\nSDK ${info.sdk}\nOffline-Stand ${info.offline_datenstand} (erzeugt ${info.offline_erzeugt_am.slice(0, 10)})\nNode.js ${info.node}`;
}

function completion(shell: string | undefined): string {
  const woerter = [...DATENSAETZE, ...BEFEHLE].join(" ");
  const optionen = ["--format", "--json", "--trennzeichen", "--no-offline", "--param", "--help", "--version", ...API_PARAMETER.map((p) => `--${p}`)].join(" ");
  if (shell === "bash") {
    return `# qk: in ~/.bashrc einbinden mit: source <(qk completion bash)
_qk() {
  local aktuell="\${COMP_WORDS[COMP_CWORD]}"
  if [ "$COMP_CWORD" -eq 1 ]; then COMPREPLY=( $(compgen -W "${woerter}" -- "$aktuell") ); return; fi
  if [ "$COMP_CWORD" -eq 2 ] && [[ "$aktuell" != -* ]]; then COMPREPLY=( $(compgen -W "verlauf" -- "$aktuell") ); return; fi
  COMPREPLY=( $(compgen -W "${optionen}" -- "$aktuell") )
}
complete -F _qk qk`;
  }
  if (shell === "zsh") {
    return `# qk: in ~/.zshrc einbinden mit: source <(qk completion zsh)
_qk() {
  if (( CURRENT == 2 )); then compadd -- ${woerter}; return; fi
  if (( CURRENT == 3 )) && [[ "$PREFIX" != -* ]]; then compadd -- verlauf; return; fi
  compadd -- ${optionen}
}
compdef _qk qk`;
  }
  if (shell === "fish") {
    return `# qk: speichern mit: qk completion fish > ~/.config/fish/completions/qk.fish
complete -c qk -f
complete -c qk -n "__fish_is_first_arg" -a "${woerter}"
complete -c qk -n "not __fish_is_first_arg" -a "verlauf"
${API_PARAMETER.concat(["format", "json", "trennzeichen", "no-offline", "param", "help", "version"]).map((p) => `complete -c qk -l ${p}`).join("\n")}`;
  }
  throw new AufrufFehler("qk completion braucht bash, zsh oder fish, zum Beispiel: source <(qk completion bash)");
}

/** Zerlegt eine Zeile wie eine Shell: Leerzeichen trennen, einfache und doppelte Anführungszeichen halten zusammen */
function zerlege(zeile: string): string[] {
  const aus: string[] = [];
  const muster = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = muster.exec(zeile))) aus.push(m[1] ?? m[2] ?? m[3]);
  return aus;
}

/** Eine Abfrage je Zeile von stdin, ein Client für alle (Zwischenspeicher, Bremse); Ausgabe als JSON-Zeilen */
async function batch(offline: boolean): Promise<number> {
  const qk = client(offline);
  const zeilen = (await stdinLesen()).split(/\r?\n/);
  let code: number = EXIT.ok;
  for (const [i, roh] of zeilen.entries()) {
    const zeile = roh.trim();
    if (!zeile || zeile.startsWith("#")) continue;
    try {
      const a = argumente(zerlege(zeile.replace(/^qk\s+/, "")));
      const befehl = a.positionen[0];
      if (!DATENSAETZE.includes(befehl)) throw new AufrufFehler(`In batch gehen nur Datensätze, nicht ${befehl ?? "eine leere Zeile"}.`);
      if (a.format === "csv") throw new AufrufFehler("In batch gibt es nur JSON-Zeilen, --format csv geht hier nicht.");
      const verlauf = a.positionen[1] === "verlauf";
      const antwort = await qk.anfrage<Record<string, unknown>>(`/hr/${befehl}${verlauf ? "/verlauf" : ""}`, a.werte);
      process.stdout.write(`${JSON.stringify({ zeile: i + 1, eingabe: zeile, antwort })}\n`);
    } catch (e) {
      const f = fehlerBeschreibung(e);
      if (code === EXIT.ok) code = f.exit;
      process.stdout.write(`${JSON.stringify({ zeile: i + 1, eingabe: zeile, fehler: f.objekt })}\n`);
    }
  }
  return code;
}

// --------------------------------------------------------------------------------------------------
// Hinweis auf neue Versionen: höchstens einmal am Tag, nur im Terminal, nie in CI

type UpdateStand = { geprueft: number; neueste: string | null };

function neuer(a: string, b: string): boolean {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
}

async function updatePruefung(): Promise<(() => Promise<void>) | undefined> {
  if (!process.stderr.isTTY || process.env.CI || process.env.QK_KEIN_UPDATE_HINWEIS || process.env.NO_UPDATE_NOTIFIER) return undefined;
  const datei = join(ORDNER, "update.json");
  let stand: UpdateStand | undefined;
  try { stand = JSON.parse(await readFile(datei, "utf8")) as UpdateStand; } catch { /* noch nie geprüft */ }
  let abruf: Promise<void> | undefined;
  if (!stand || Date.now() - stand.geprueft > 86_400_000) {
    abruf = fetch("https://registry.npmjs.org/@quellenkontor/cli/latest", { signal: AbortSignal.timeout(1500) })
      .then((r) => r.json() as Promise<{ version?: string }>)
      .then(async (d) => {
        stand = { geprueft: Date.now(), neueste: d.version ?? null };
        await ordnerAnlegen();
        await writeFile(datei, JSON.stringify(stand));
      })
      .catch(() => undefined);
  }
  return async () => {
    await abruf;
    if (stand?.neueste && neuer(stand.neueste, CLI_VERSION)) {
      console.error(`Neue Version von qk: ${stand.neueste} (installiert ${CLI_VERSION}). Aktualisieren: npm install -g @quellenkontor/cli`);
    }
  };
}

// --------------------------------------------------------------------------------------------------
// Fehler und Exit-Codes

function fehlerBeschreibung(e: unknown): { exit: number; text: string; objekt: Record<string, unknown> } {
  if (e instanceof AufrufFehler) {
    return { exit: EXIT.aufruf, text: `Fehler: ${e.message}`, objekt: { status: null, code: "aufruf", nachricht: e.message } };
  }
  if (e instanceof QuellenkontorFehler) {
    // Parameter so nennen, wie man sie in der CLI schreibt: grundlohn_stunde als --grundlohn-stunde
    let nachricht = e.parameter ? e.message.split(e.parameter).join(`--${e.parameter.replace(/_/g, "-")}`) : e.message;
    let exit: number = EXIT.sonstiges;
    if (e.status === 401 || e.code.startsWith("schluessel")) {
      exit = EXIT.schluessel;
      nachricht += " In der CLI: Schlüssel mit qk login speichern oder die Umgebungsvariable QK_KEY setzen.";
    } else if (e.status === 429 || e.code === "ausgebremst") exit = EXIT.kontingent;
    else if (e.status === 0 || e.status >= 500) exit = e.code === "abgebrochen" ? EXIT.sonstiges : EXIT.netz;
    else if (e.status >= 400) exit = EXIT.aufruf;
    return {
      exit,
      text: `Fehler ${e.status} (${e.code}): ${nachricht}`,
      objekt: { status: e.status, code: e.code, nachricht, ...(e.parameter ? { parameter: e.parameter } : {}) },
    };
  }
  const nachricht = (e as Error)?.message ?? String(e);
  return { exit: EXIT.sonstiges, text: `Fehler: ${nachricht}`, objekt: { status: null, code: "intern", nachricht } };
}

async function main(argv: string[]): Promise<number> {
  const jsonGewuenscht = argv.includes("--json") || argv.join(" ").includes("--format json") || argv.includes("--format=json");
  try {
    const a = argumente(argv);
    const befehl = a.positionen[0];
    if (a.version && !befehl) { console.log(CLI_VERSION); return EXIT.ok; }
    if (befehl === "version") { console.log(await versionAusgabe(a.format)); return EXIT.ok; }
    if (!befehl || befehl === "hilfe" || befehl === "help") {
      const ziel = a.positionen[1];
      if (ziel && DATENSAETZE.includes(ziel)) { console.log(await datensatzHilfe(client(true), ziel)); return EXIT.ok; }
      console.log(HILFE);
      return EXIT.ok;
    }
    if (befehl === "completion") { console.log(completion(a.positionen[1])); return EXIT.ok; }
    if (befehl === "login") { await login(a.keyStdin); return EXIT.ok; }
    if (befehl === "logout") { await logout(); return EXIT.ok; }

    schluessel = process.env.QK_KEY || (await gespeicherterSchluessel());
    if (befehl === "batch") return await batch(a.offline);
    if (!DATENSAETZE.includes(befehl) && befehl !== "datensaetze" && befehl !== "status") {
      throw new AufrufFehler(`Unbekannter Befehl: ${befehl}. Alle Befehle: qk hilfe`);
    }
    const qk = client(a.offline);
    if (a.hilfe) {
      console.log(befehl === "datensaetze" || befehl === "status" ? HILFE : await datensatzHilfe(qk, befehl));
      return EXIT.ok;
    }
    const hinweis = await updatePruefung();
    const ausgabe = befehl === "datensaetze" ? await katalogAusgabe(qk, a)
      : befehl === "status" ? await statusAusgabe(qk, a)
      : await datensatzAbfrage(qk, a);
    if (a.format === "csv") process.stdout.write(ausgabe);
    else console.log(ausgabe);
    await hinweis?.();
    return EXIT.ok;
  } catch (e) {
    const f = fehlerBeschreibung(e);
    console.error(jsonGewuenscht ? JSON.stringify({ fehler: f.objekt }) : f.text);
    return f.exit;
  }
}

main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
