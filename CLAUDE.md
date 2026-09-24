# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## The app

**Teachable Agent (可训练智能体)** — a single-file, zero-dependency HTML app (`index.html`, ~1340 lines) that demonstrates a three-layer LLM pipeline:

- **用户界面** (UI layer): chat messages + composer.
- **数据存储** (Data layer): cards with `input` / `output` panels; doubles as the LLM's conversation context.
- **服务接口** (API layer): OpenAI-compatible `/v1/chat/completions` config (Provider/Base URL/Model/API Key).

Embedded CSS in `<style>`, JS in a single `<script>`. All UI copy and code comments are written in **Chinese** — keep new UI text and comments in Chinese to match.

## Location

Project root: `/Users/roadlabs/MyProjects2026/teachable_agent`. Single working copy (was previously also reachable via two hard-linked paths under `/Volumes/Storage/Labs`; that directory was moved here, so the old paths no longer exist).

## No build / lint / test tooling

- Run/verify by opening in a browser: `open index.html`.
- Syntax-check the inline script without touching the file:
  `sed -n '/<script>/,/<\/script>/p' index.html | sed '1d;$d' > /tmp/x.js && node --check /tmp/x.js`
- This is **not a git repo** — there is no history to fall back on.

## Architecture invariants

- **State**: one `state` object (`settings` / `data` / `chat`), persisted to `localStorage` under `ta_settings_v1` / `ta_data_v1` / `ta_chat_v1` via `saveSettings` / `saveData` / `saveChat`. On any mutation, call the `saveX()` then re-render.
- **Connections overlay**: an SVG (`#connectionsOverlay`) spans the workspace; `updateConnectionPaths()` recomputes the bezier paths on load/resize. `emitBall()` animates balls along a path; `flyText()` flies HTML text bubbles between elements. Both return Promises and are the only places that touch the overlay DOM.
- **Five-stage request pipeline** — `handleSend()` is one async `await`-chained flow: UI→Data (pending card + input flyer) → Data→API → API wait (`#apiWaiting` badge + `active-resp` on path2) → API→Data (`appendOutputToItem` + output flyer) → Data→UI (assistant bubble). It captures animation targets with `querySelector` mid-flight, so **`renderData()` during an in-flight request breaks the flow**. The module-level `busy` flag guards this: it is set at the start of `handleSend`, cleared on every exit path, and drag/drop, panel delete, and re-send all no-op while `busy`.

## Data layer rules

- A card always has an `input` block; the `output` block renders only when `item.output != null`. Input-only cards carry class `pending`.
- **Per-panel delete** (`attachDataInteractions`, event-delegated click on `#dataList`): `data-del-panel="input"` deletes the whole card; `data-del-panel="output"` clears `output`/`outputTimestamp` only (card remains, still enters context).
- **Drag reorder**: native HTML5 DnD on the `.card-grip` handle (the only `draggable` element). Handlers are delegated once on `#dataList` (guarded by `dataset.interactionsBound`) and directly splice `state.data`, so the list order IS the context order. The `drop` handler accounts for the source-index offset after `splice(from, 1)`.
- **LLM context** (built inside `handleSend`): `state.data.filter(item => item.status !== 'pending').reverse().flatMap(...)` — each card contributes `user` (+ `assistant` if output exists). So an output-deleted card becomes a lone user message; in-flight `pending` cards are excluded to avoid duplicating the current message.
- `appendOutputToItem()` patches a single pending card in place (no full re-render) and must NOT add the `output-new` class — the caller re-triggers the reveal after the ball lands.

## API layer notes

- `callLLM()` appends `/chat/completions` unless `baseUrl` already ends with it; needs at least `baseUrl` and `model` set.
- Provider presets live in the `PROVIDERS` map; choosing a non-`custom` provider overwrites baseUrl/model.
- `testConnection()` shows feedback on the button's own text (`测试中…` → `✓ 已连接` / `✗ 失败`), reverting after ~2s. There is no config-status pill anymore — the only API-layer status is the `#apiWaiting` badge shown while a request is in flight.
