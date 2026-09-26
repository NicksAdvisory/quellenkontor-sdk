/**
 * Baut das SDK zweimal: ESM nach dist/ und CommonJS nach dist/cjs/ (mit eigenem package.json, damit
 * Node und TypeScript die Dateien dort als CommonJS lesen). Den Offline-Stand (src/offline-daten.json)
 * schreibt das Skript als eigenes Modul in beide Ordner, das Hauptmodul lädt es erst bei Bedarf.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const paket = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const aus = (...t) => path.join(paket, ...t);
const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");

rmSync(aus("dist"), { recursive: true, force: true });
execFileSync(process.execPath, [tsc, "-p", aus("tsconfig.json")], { stdio: "inherit" });
execFileSync(process.execPath, [tsc, "-p", aus("tsconfig.cjs.json")], { stdio: "inherit" });
writeFileSync(aus("dist/cjs/package.json"), `${JSON.stringify({ type: "commonjs" }, null, 2)}\n`);

// Kompakt statt eingerückt: gleiche Daten, deutlich kleiner
const daten = JSON.stringify(JSON.parse(readFileSync(aus("src/offline-daten.json"), "utf8")));
const kopf = "// Offline-Stand, erzeugt aus src/offline-daten.json. Nicht von Hand ändern.\n";
writeFileSync(aus("dist/offline-daten.js"), `${kopf}export const OFFLINE_DATEN = ${daten};\n`);
writeFileSync(aus("dist/cjs/offline-daten.js"), `"use strict";\n${kopf}exports.OFFLINE_DATEN = ${daten};\n`);
copyFileSync(aus("src/offline-daten.d.ts"), aus("dist/offline-daten.d.ts"));
copyFileSync(aus("src/offline-daten.d.ts"), aus("dist/cjs/offline-daten.d.ts"));
console.log("SDK gebaut: dist/ (ESM) und dist/cjs/ (CommonJS).");
