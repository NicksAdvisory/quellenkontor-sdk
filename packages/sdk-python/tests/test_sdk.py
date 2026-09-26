import asyncio
import socket
import threading
import time

import pytest

import quellenkontor
from quellenkontor import Quellenkontor, QuellenkontorError, QuellenkontorFehler, retry_after_sekunden

from conftest import fehler

SCHNELL = {"max_pro_sekunde": 0, "api_key": "qk_live_test"}


def test_version_und_aliasse():
    assert quellenkontor.__version__ == "0.1.1"
    assert QuellenkontorError is QuellenkontorFehler
    qk = Quellenkontor(base_url="http://x/v1/", retries=1, max_per_second=0)
    assert qk.basis_url == "http://x/v1" and qk.wiederholungen == 1 and qk.retries == 1


def test_py_typed_liegt_im_paket():
    import importlib.resources
    assert importlib.resources.files("quellenkontor").joinpath("py.typed").is_file()


def test_429_zu_schnell_wartet_und_wiederholt(server):
    s = server(fehler(429, "zu_schnell", headers={"Retry-After": "1"}), {"body": {"mindestlohn_brutto_stunde": 13.9}})
    qk = Quellenkontor(basis_url=s.basis_url, **SCHNELL)
    start = time.monotonic()
    assert qk.hr.mindestlohn()["mindestlohn_brutto_stunde"] == 13.9
    assert len(s.anfragen) == 2
    assert time.monotonic() - start >= 0.9


def test_429_kontingent_ohne_wiederholung(server):
    s = server(fehler(429, "kontingent_erreicht"))
    with pytest.raises(QuellenkontorFehler) as e:
        Quellenkontor(basis_url=s.basis_url, **SCHNELL).hr.mindestlohn()
    assert e.value.status == 429 and e.value.code == "kontingent_erreicht"
    assert len(s.anfragen) == 1


def test_503_bis_zuletzt_nutzt_offline_stand(server):
    s = server(fehler(503, "wartung"))
    ml = Quellenkontor(basis_url=s.basis_url, wiederholungen=1, **SCHNELL).hr.mindestlohn(datum="2025-06-01")
    assert ml["offline"] is True
    assert ml["mindestlohn_brutto_stunde"] == 12.82
    assert "Offline-Stand" in ml["hinweise"][0]
    assert len(s.anfragen) == 2


def test_503_bei_rechner_wirft_fehler_der_api(server):
    s = server(fehler(503, "wartung"))
    with pytest.raises(QuellenkontorFehler) as e:
        Quellenkontor(basis_url=s.basis_url, wiederholungen=0, **SCHNELL).hr.pausen(arbeitszeit_stunden=7)
    assert e.value.status == 503 and e.value.code == "wartung"


def test_500_und_408_werden_wiederholt(server):
    s = server(fehler(500, "intern"), fehler(408, "zeit"), {"body": {"ok": 1}})
    assert Quellenkontor(basis_url=s.basis_url, **SCHNELL).anfrage("/status") == {"ok": 1}
    assert len(s.anfragen) == 3


def test_304_mit_etag(server):
    s = server({"body": {"wert": 1}, "headers": {"ETag": '"a1"'}}, {"status": 304, "headers": {"ETag": '"a1"'}})
    qk = Quellenkontor(basis_url=s.basis_url, cache_ttl=0, **SCHNELL)
    assert qk.anfrage("/status") == {"wert": 1}
    assert qk.anfrage("/status") == {"wert": 1}
    assert s.anfragen[1]["koepfe"].get("If-None-Match") == '"a1"'


def test_zwischenspeicher_mit_obergrenze(server):
    s = server({"body": {"x": 1}})
    qk = Quellenkontor(basis_url=s.basis_url, cache_max_entries=2, **SCHNELL)
    for pfad in ("/a", "/b", "/a", "/c"):
        qk.anfrage(pfad)
    assert len(s.anfragen) == 3
    qk.anfrage("/b")
    assert len(s.anfragen) == 4


def test_offline_ohne_verbindung(tote_adresse):
    qk = Quellenkontor(basis_url=tote_adresse, wiederholungen=0, **SCHNELL)
    assert qk.hr.mindestlohn(datum="2027-03-01")["mindestlohn_brutto_stunde"] == 14.6
    v = qk.hr.verlauf("mindestlohn", von="2024-06-01", bis="2025-12-31")
    assert [z["gueltig_ab"] for z in v["verlauf"]] == ["2024-01-01", "2025-01-01"]
    with pytest.raises(QuellenkontorFehler) as e:
        qk.hr.pausen(arbeitszeit_stunden=7)
    assert e.value.code == "netzwerk"
    with pytest.raises(QuellenkontorFehler):
        Quellenkontor(basis_url=tote_adresse, wiederholungen=0, offline=False, **SCHNELL).hr.mindestlohn()


def test_offline_mindestausbildungsverguetung_nach_beginn(tote_adresse):
    qk = Quellenkontor(basis_url=tote_adresse, wiederholungen=0, **SCHNELL)
    r = qk.hr.mindestausbildungsverguetung(beginn="2023-08-01", ausbildungsjahr=2)
    assert r["offline"] is True and r["beginn"] == "2023-08-01"
    assert r["mindestverguetung_monat"] == 731.6
    assert r["werte"]["ausbildungsjahr_1"] == 620
    with pytest.raises(QuellenkontorFehler) as e:
        qk.hr.mindestausbildungsverguetung(ausbildungsjahr=3)
    assert e.value.code == "parameter_fehlt" and e.value.parameter == "beginn"
    with pytest.raises(QuellenkontorFehler) as e:
        qk.hr.mindestausbildungsverguetung(beginn="2031-08-01")
    assert e.value.code == "kein_wert_offline"


def test_offline_alterswarnung(tote_adresse):
    r = Quellenkontor(basis_url=tote_adresse, wiederholungen=0, offline_warnung_tage=0, **SCHNELL).hr.mindestlohn()
    assert len(r["hinweise"]) == 2 and "Tage alt" in r["hinweise"][1]


def test_lese_timeout_wird_gefangen(server):
    # Antwortet nie: auf Python 3.9 kommt socket.timeout, das ist kein TimeoutError
    def haengt(handler):
        time.sleep(1.5)

    s = server(haengt)
    qk = Quellenkontor(basis_url=s.basis_url, timeout=0.3, wiederholungen=0, offline=False, **SCHNELL)
    with pytest.raises(QuellenkontorFehler) as e:
        qk.status()
    assert e.value.code == "netzwerk"


def test_retry_after_sekunden_und_datum():
    jetzt = 1790330400.0  # 2026-09-25T10:00:00Z
    assert retry_after_sekunden("2", jetzt) == 2
    assert retry_after_sekunden("Fri, 25 Sep 2026 10:00:05 GMT", jetzt) == pytest.approx(5)
    assert retry_after_sekunden("120", jetzt) == 30
    assert retry_after_sekunden("quatsch", jetzt) is None
    assert retry_after_sekunden(None) is None


def test_threadsicher_mit_bremse(server):
    s = server({"body": {"ok": 1}})
    qk = Quellenkontor(basis_url=s.basis_url, api_key="k", max_pro_sekunde=20, cache=False)
    fehler_liste = []

    def los():
        try:
            qk.anfrage("/status")
        except Exception as e:  # pragma: no cover
            fehler_liste.append(e)

    start = time.monotonic()
    threads = [threading.Thread(target=los) for _ in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert not fehler_liste and len(s.anfragen) == 10
    assert time.monotonic() - start >= 0.4  # 10 Anfragen bei 20 je Sekunde


def test_csv_ohne_bom(server):
    s = server({"csv": "﻿a,b\n1,2\n"})
    assert Quellenkontor(basis_url=s.basis_url, **SCHNELL).anfrage("/hr/feiertage", {}, format="csv") == "a,b\n1,2\n"


def test_schluessel_und_user_agent(server):
    s = server({"body": {}})
    Quellenkontor(basis_url=s.basis_url, **SCHNELL).status()
    assert s.anfragen[0]["koepfe"]["Authorization"] == "Bearer qk_live_test"
    assert s.anfragen[0]["koepfe"]["User-Agent"] == f"quellenkontor-sdk-python/{quellenkontor.__version__}"


httpx = pytest.importorskip("httpx")


def test_async_client(server, tote_adresse):
    from quellenkontor.aio import AsyncQuellenkontor

    s = server(fehler(429, "zu_schnell", headers={"Retry-After": "0"}), fehler(503, "x"), {"body": {"mindestlohn_brutto_stunde": 13.9}})

    async def lauf():
        async with AsyncQuellenkontor(basis_url=s.basis_url, **SCHNELL) as qk:
            ml = await qk.hr.mindestlohn()
            assert ml["mindestlohn_brutto_stunde"] == 13.9
        async with AsyncQuellenkontor(basis_url=tote_adresse, wiederholungen=0, **SCHNELL) as qk:
            r = await qk.hr.mindestausbildungsverguetung(beginn="2023-08-01", ausbildungsjahr=2)
            assert r["offline"] is True and r["mindestverguetung_monat"] == 731.6

    asyncio.run(lauf())
    assert len(s.anfragen) == 3


def test_async_ueber_paket_attribut():
    assert quellenkontor.AsyncQuellenkontor.__name__ == "AsyncQuellenkontor"
