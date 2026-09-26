# HR-Werte im KI-Agenten über MCP

Sprachmodelle nennen Mindestlohn, Beitragsbemessungsgrenzen oder Kündigungsfristen oft aus dem Gedächtnis, und dieses Gedächtnis ist ein oder zwei Jahre alt. Im HR-Chatbot führt das zu Antworten, die sicher klingen und falsch sind.

Über den MCP-Server von Quellenkontor schlägt der Agent jeden Wert zum passenden Datum nach und nennt die amtliche Quelle mit Link.

## Einrichten

Adresse des Servers: `https://mcp.quellenkontor.dev/v1`

### Claude Code

```bash
claude mcp add --transport http quellenkontor https://mcp.quellenkontor.dev/v1 \
  --header "Authorization: Bearer $QK_KEY"
```

### Claude Desktop

In `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "quellenkontor": {
      "command": "npx",
      "args": ["mcp-remote", "https://mcp.quellenkontor.dev/v1", "--header", "Authorization:${AUTH_HEADER}"],
      "env": { "AUTH_HEADER": "Bearer qk_live_DEIN_SCHLUESSEL" }
    }
  }
}
```

Anleitungen für weitere Clients stehen in der [MCP-Doku](https://quellenkontor.dev/docs/mcp).

## Was der Agent damit kann

Für jeden Datensatz gibt es ein Werkzeug, etwa `hr_mindestlohn`, `hr_rechengroessen`, `hr_kuendigungsfrist` oder `hr_arbeitstage`. Dazu kommt `hr_verlauf` für die Entwicklung eines Werts über die Jahre. Der Server gibt dem Agenten Regeln mit, unter anderem:

- relative Angaben wie „ab Juli“ in ein Datum umrechnen und dieses Datum nennen
- nachfragen, wenn Angaben wie Bundesland oder Eintrittsdatum fehlen, statt zu raten
- bei `status: "ausstehend"` oder dem Fehler `kein_wert` sagen, dass der Wert noch nicht verkündet ist, statt zu schätzen
- immer die Quelle mit URL nennen

Fragen, die ein Agent damit beantworten kann:

- „Wie hoch ist die Beitragsbemessungsgrenze der Krankenversicherung im Juli 2026?“
- „Mitarbeiterin seit März 2017, Kündigung geht am 10. November zu. Wann endet das Arbeitsverhältnis?“
- „Wie viele Arbeitstage hat der Januar 2027 in Hessen?“

## Grenzen

Quellenkontor gilt nur für Deutschland. Die Rechner wenden die gesetzliche Regel an und ersetzen keine Rechtsberatung. Verträge, Tarifverträge und Betriebsvereinbarungen kennt der Agent über Quellenkontor nicht.

## Weiter

- [Lösung für HR-Chatbots und KI-Agenten](https://quellenkontor.dev/loesungen/ki-agenten)
- [MCP-Doku](https://quellenkontor.dev/docs/mcp)
