"""Asynchroner Client auf Basis von httpx: ``pip install "quellenkontor[async]"``.

    import asyncio
    from quellenkontor.aio import AsyncQuellenkontor

    async def main():
        async with AsyncQuellenkontor() as qk:
            ml = await qk.hr.mindestlohn(datum="2027-01-15")
            print(ml["mindestlohn_brutto_stunde"])

    asyncio.run(main())

Gleiche Optionen, Wiederholungen, Zwischenspeicher und Offline-Stand wie der synchrone Client. Eine
Instanz hält eine Verbindung offen (Pooling); am Ende ``await qk.aclose()`` oder ``async with``.
"""
from __future__ import annotations

import asyncio
import json
import time
from typing import Any, Dict, Mapping, Optional

from ._kern import STANDARD_CACHE_TTL, WIEDERHOLBAR, QuellenkontorFehler, _Basis, retry_after_sekunden

try:
    import httpx
except ImportError:  # pragma: no cover - hängt von der Installation ab
    httpx = None  # type: ignore[assignment]

__all__ = ["AsyncQuellenkontor"]


class AsyncQuellenkontor(_Basis):
    """Asynchroner Client. Braucht httpx (Extra ``async``), sonst QuellenkontorFehler mit Code kein_httpx."""

    def __init__(self, api_key: Optional[str] = None, basis_url: Optional[str] = None, timeout: float = 15.0,
                 wiederholungen: Optional[int] = None, cache: bool = True, cache_ttl: float = STANDARD_CACHE_TTL,
                 offline: bool = True, max_pro_sekunde: Optional[float] = None, cache_max_eintraege: Optional[int] = None,
                 offline_warnung_tage: Optional[int] = None, *, http_client: Any = None, **englisch: Any):
        if httpx is None:
            raise QuellenkontorFehler('Der asynchrone Client braucht httpx: pip install "quellenkontor[async]"', 0, "kein_httpx")
        super().__init__(api_key, basis_url, timeout, wiederholungen, cache, cache_ttl, offline, max_pro_sekunde,
                         cache_max_eintraege, offline_warnung_tage, **englisch)
        self._eigener_client = http_client is None
        self._http = http_client or httpx.AsyncClient(timeout=timeout)
        from . import _HR  # hier importiert, damit quellenkontor/__init__ ohne httpx lädt

        #: Datensätze unter /hr; jede Methode liefert ein Awaitable
        self.hr: Any = _HR(self)

    async def __aenter__(self) -> "AsyncQuellenkontor":
        return self

    async def __aexit__(self, *exc: Any) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        """Schließt die Verbindung, wenn der Client sie selbst geöffnet hat."""
        if self._eigener_client:
            await self._http.aclose()

    async def _takt(self) -> None:
        warten = self._takt_wartezeit()
        if warten > 0:
            await asyncio.sleep(warten)

    async def anfrage(self, pfad: str, werte: Optional[Mapping[str, Any]] = None, format: str = "json") -> Any:
        """Rohe Anfrage an einen Pfad, wie beim synchronen Client."""
        werte = dict(werte or {})
        url, bekannt, koepfe = self._vorbereiten(pfad, werte, format)
        if bekannt is not None and bekannt["bis"] > time.monotonic():
            return bekannt["wert"]

        letzter: Optional[BaseException] = None
        gebremst = 0
        versuch = 0
        pause: Optional[float] = None
        while versuch <= self.wiederholungen:
            if versuch:
                await asyncio.sleep(max(0.3 * 2 ** (versuch - 1), pause or 0.0))
            pause = None
            versuch += 1
            await self._takt()
            try:
                antwort = await self._http.get(url, headers=koepfe, timeout=self.timeout)
            except httpx.HTTPError as e:
                letzter = e
                continue
            status = antwort.status_code
            if status == 304 and bekannt is not None:
                self._auffrischen(url, bekannt)
                return bekannt["wert"]
            if 200 <= status < 300:
                text = antwort.content.decode("utf-8-sig")
                wert = text if format == "csv" else json.loads(text)
                self._merken(url, wert, antwort.headers.get("etag"))
                return wert
            fehler = self._fehler_aus(status, antwort.content)
            if status == 429 and fehler.code == "zu_schnell" and gebremst < 5:
                gebremst += 1
                versuch -= 1
                warten = retry_after_sekunden(antwort.headers.get("retry-after"))
                await asyncio.sleep(1.0 if warten is None else warten)
                continue
            if status == 403 and antwort.headers.get("x-vercel-mitigated"):
                raise self._ausgebremst()
            if status in WIEDERHOLBAR:
                letzter = fehler
                pause = retry_after_sekunden(antwort.headers.get("retry-after"))
                continue
            raise fehler
        return self._nach_allen_versuchen(pfad, werte, format, letzter)

    #: Englischer Name für anfrage
    request = anfrage

    async def datensaetze(self) -> Dict[str, Any]:
        """Katalog aller Datensätze (ohne Schlüssel abrufbar)."""
        return await self.anfrage("/datensaetze")

    async def aenderungen(self) -> Dict[str, Any]:
        """Änderungsprotokoll (ohne Schlüssel abrufbar)."""
        return await self.anfrage("/aenderungen")

    async def status(self) -> Dict[str, Any]:
        """Prüfstand je Datensatz (ohne Schlüssel abrufbar)."""
        return await self.anfrage("/status")
