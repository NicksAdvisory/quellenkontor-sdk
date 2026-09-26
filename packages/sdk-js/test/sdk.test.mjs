import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Quellenkontor, QuellenkontorFehler, QuellenkontorError, retryAfterMs, VERSION } from "../dist/index.js";
import { testServer, toteAdresse, fehler } from "./hilfen.mjs";

const schnell = { maxProSekunde: 0, apiKey: "qk_live_test" };

test("CommonJS: require lädt das SDK und den Offline-Einstieg", () => {
  const require = createRequire(import.meta.url);
  const cjs = require("@quellenkontor/sdk");
  assert.equal(typeof cjs.Quellenkontor, "function");
  assert.equal(cjs.VERSION, VERSION);
  assert.equal(cjs.default, cjs.Quellenkontor);
  assert.equal(typeof require("@quellenkontor/sdk/offline").OFFLINE_DATEN.datenstand, "string");
});

test("Englische Aliasse: QuellenkontorError ist dieselbe Klasse", () => {
  assert.equal(QuellenkontorError, QuellenkontorFehler);
  assert.ok(new QuellenkontorError("x", 400, "y") instanceof QuellenkontorFehler);
});

test("429 zu_schnell: wartet Retry-After ab und fragt erneut", async () => {
  const s = await testServer([fehler(429, "zu_schnell", "langsamer", { "retry-after": "1" }), { body: { datensatz: "mindestlohn", mindestlohn_brutto_stunde: 13.9 } }]);
  try {
    const qk = new Quellenkontor({ ...schnell, basisUrl: s.basisUrl });
    const start = Date.now();
    const ml = await qk.hr.mindestlohn();
    assert.equal(ml.mindestlohn_brutto_stunde, 13.9);
    assert.equal(s.anfragen.length, 2);
    assert.ok(Date.now() - start >= 900, "Retry-After von 1 Sekunde abgewartet");
  } finally { await s.schliessen(); }
});

test("429 kontingent_erreicht: kein Wiederholen, Fehler mit stabilem Code", async () => {
  const s = await testServer([fehler(429, "kontingent_erreicht", "Kontingent erreicht")]);
  try {
    const qk = new Quellenkontor({ ...schnell, basisUrl: s.basisUrl });
    await assert.rejects(qk.hr.mindestlohn(), (e) => e instanceof QuellenkontorFehler && e.status === 429 && e.code === "kontingent_erreicht");
    assert.equal(s.anfragen.length, 1);
  } finally { await s.schliessen(); }
});

test("503 bis zum letzten Versuch: Offline-Stand für Tabellen", async () => {
  const s = await testServer([fehler(503, "wartung")]);
  try {
    const qk = new Quellenkontor({ ...schnell, basisUrl: s.basisUrl, retries: 1 });
    const ml = await qk.hr.mindestlohn({ datum: "2025-06-01" });
    assert.equal(ml.offline, true);
    assert.equal(ml.mindestlohn_brutto_stunde, 12.82);
    assert.ok(ml.hinweise[0].includes("Offline-Stand"));
    assert.equal(s.anfragen.length, 2);
  } finally { await s.schliessen(); }
});

test("503 bei einem Rechner: Fehler der API mit Status 503", async () => {
  const s = await testServer([fehler(503, "wartung", "Wartung")]);
  try {
    const qk = new Quellenkontor({ ...schnell, basisUrl: s.basisUrl, wiederholungen: 0 });
    await assert.rejects(qk.hr.kuendigungsfrist({ eintritt: "2020-01-01", zugang: "2026-01-10" }), (e) => e.status === 503 && e.code === "wartung");
  } finally { await s.schliessen(); }
});

test("500 und 408 werden wiederholt", async () => {
  const s = await testServer([fehler(500, "intern"), fehler(408, "zeit"), { body: { ok: 1 } }]);
  try {
    const qk = new Quellenkontor({ ...schnell, basisUrl: s.basisUrl });
    assert.deepEqual(await qk.anfrage("/status"), { ok: 1 });
    assert.equal(s.anfragen.length, 3);
  } finally { await s.schliessen(); }
});

test("304: If-None-Match mit gemerkter ETag, Antwort aus dem Zwischenspeicher", async () => {
  const s = await testServer([{ body: { wert: 1 }, headers: { etag: '"a1"' } }, { status: 304, headers: { etag: '"a1"' } }]);
  try {
    const qk = new Quellenkontor({ ...schnell, basisUrl: s.basisUrl, cacheTtlMs: 0 });
    assert.deepEqual(await qk.anfrage("/status"), { wert: 1 });
    assert.deepEqual(await qk.anfrage("/status"), { wert: 1 });
    assert.equal(s.anfragen[1].headers["if-none-match"], '"a1"');
  } finally { await s.schliessen(); }
});

test("Zwischenspeicher begrenzt: der am längsten ungenutzte Eintrag fällt heraus", async () => {
  const s = await testServer([{ body: { x: 1 } }]);
  try {
    const qk = new Quellenkontor({ ...schnell, basisUrl: s.basisUrl, cacheMaxEntries: 2 });
    await qk.anfrage("/a"); await qk.anfrage("/b"); await qk.anfrage("/a"); await qk.anfrage("/c");
    assert.equal(s.anfragen.length, 3, "/a kam aus dem Speicher");
    await qk.anfrage("/a");
    assert.equal(s.anfragen.length, 3, "/a blieb als zuletzt genutzt erhalten");
    await qk.anfrage("/b");
    assert.equal(s.anfragen.length, 4, "/b war herausgefallen");
  } finally { await s.schliessen(); }
});

test("Offline ohne Verbindung: Tabelle, Verlauf und Rechner", async () => {
  const qk = new Quellenkontor({ ...schnell, basisUrl: await toteAdresse(), wiederholungen: 0 });
  const ml = await qk.hr.mindestlohn({ datum: "2027-03-01" });
  assert.equal(ml.offline, true);
  assert.equal(ml.mindestlohn_brutto_stunde, 14.6);
  const v = await qk.hr.verlauf("mindestlohn", { von: "2024-06-01", bis: "2025-12-31" });
  assert.deepEqual(v.verlauf.map((z) => z.gueltig_ab), ["2024-01-01", "2025-01-01"]);
  await assert.rejects(qk.hr.pausen({ arbeitszeit_stunden: 7 }), (e) => e.code === "netzwerk");
  const aus = new Quellenkontor({ ...schnell, basisUrl: await toteAdresse(), wiederholungen: 0, offline: false });
  await assert.rejects(aus.hr.mindestlohn(), (e) => e.code === "netzwerk");
});

test("Offline: Mindestausbildungsvergütung nach Ausbildungsbeginn, nicht nach heute", async () => {
  const qk = new Quellenkontor({ ...schnell, basisUrl: await toteAdresse(), wiederholungen: 0 });
  const r = await qk.hr.mindestausbildungsverguetung({ beginn: "2023-08-01", ausbildungsjahr: 2 });
  assert.equal(r.offline, true);
  assert.equal(r.beginn, "2023-08-01");
  assert.equal(r.mindestverguetung_monat, 731.6);
  assert.equal(r.werte.ausbildungsjahr_1, 620);
  await assert.rejects(qk.hr.mindestausbildungsverguetung({ ausbildungsjahr: 3 }), (e) => e.code === "parameter_fehlt" && e.parameter === "beginn");
  await assert.rejects(qk.hr.mindestausbildungsverguetung({ beginn: "2031-08-01" }), (e) => e.code === "kein_wert_offline");
});

test("Offline: Alterswarnung, sobald der Stand älter als die Grenze ist", async () => {
  const qk = new Quellenkontor({ ...schnell, basisUrl: await toteAdresse(), wiederholungen: 0, offlineWarnungTage: 0 });
  const r = await qk.hr.mindestlohn();
  assert.equal(r.hinweise.length, 2);
  assert.match(r.hinweise[1], /Tage alt/);
});

test("AbortSignal bricht Wartezeit und Wiederholungen ab", async () => {
  const s = await testServer([fehler(429, "zu_schnell", "x", { "retry-after": "20" })]);
  try {
    const qk = new Quellenkontor({ ...schnell, basisUrl: s.basisUrl });
    const c = new AbortController();
    setTimeout(() => c.abort(), 100);
    const start = Date.now();
    await assert.rejects(qk.hr.mindestlohn({}, { signal: c.signal }), (e) => e.code === "abgebrochen");
    assert.ok(Date.now() - start < 2000);
  } finally { await s.schliessen(); }
});

test("Retry-After als Sekunden und als HTTP-Datum", () => {
  const jetzt = Date.parse("2026-09-25T10:00:00Z");
  assert.equal(retryAfterMs("2", jetzt), 2000);
  assert.equal(retryAfterMs("Fri, 25 Sep 2026 10:00:05 GMT", jetzt), 5000);
  assert.equal(retryAfterMs("120", jetzt), 30000);
  assert.equal(retryAfterMs("quatsch", jetzt), undefined);
  assert.equal(retryAfterMs(null, jetzt), undefined);
});

test("Ohne fetch: sprechender Fehler statt TypeError", () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = undefined;
    assert.throws(() => new Quellenkontor(), (e) => e instanceof QuellenkontorFehler && e.code === "kein_fetch");
  } finally { globalThis.fetch = original; }
});

test("Schlüssel geht als Bearer, User-Agent mit Version", async () => {
  const s = await testServer([{ body: {} }]);
  try {
    await new Quellenkontor({ ...schnell, basisUrl: s.basisUrl }).status();
    assert.equal(s.anfragen[0].headers.authorization, "Bearer qk_live_test");
    assert.equal(s.anfragen[0].headers["user-agent"], `quellenkontor-sdk-js/${VERSION}`);
  } finally { await s.schliessen(); }
});

test("CSV: BOM wird entfernt", async () => {
  const s = await testServer([{ csv: "﻿a,b\n1,2\n" }]);
  try {
    const text = await new Quellenkontor({ ...schnell, basisUrl: s.basisUrl }).anfrage("/hr/feiertage", {}, "csv");
    assert.equal(text, "a,b\n1,2\n");
  } finally { await s.schliessen(); }
});
