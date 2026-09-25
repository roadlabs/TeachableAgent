# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## The app

**Teachable Agent (可训练智能体)** — single-page PWA. Source is split into HTML + CSS + a `vendor/` directory (third-party libs) + an `app/` directory (in-house modules, organized by feature) + three PWA assets.

### File layout

```
index.html              ~6 KB   DOM structure only
styles.css            ~390 KB   All CSS (app + KaTeX CSS + 20 woff2 fonts base64)
vendor/
  marked.min.js        ~39 KB   markdown parser
  katex.min.js        ~276 KB   math renderer
  auto-render.min.js  ~3.5 KB   KaTeX DOM scanner
  dompurify.min.js     ~22 KB   HTML sanitizer (renamed from purify.min.js)
app/
  core.js         ~3 KB   constants / state / localStorage save-load / utils (escapeHtml, formatTime, uid)
  idb.js          ~2 KB   IndexedDB wrapper (openDb, dbAllProjects, dbPutProject, dbDeleteProject)
  svg.js          ~7 KB   SVG paths + balls + flyText + glow filters
  api.js          ~2 KB   callLLM + testConnection
  markdown.js     ~2 KB   renderAssistantHtml + decodeHtmlEntities + enhanceHtmlCodeBlocks
  projects.js     ~7 KB   project CRUD + modal + initProjects
  render.js      ~10 KB   renderSettings/Chat/Data/DataItem + appendOutputToItem + attachDataInteractions
  events.js       ~5 KB   all addEventListener bindings
  main.js         ~6 KB   handleSend + composer + init flow
manifest.json            —    PWA manifest
sw.js                    —    service worker (cache-first, versioned)
icon.svg                 —    512×512 app icon
```

**Script load order** (in `index.html`, top-down — global-vars approach, no ES modules):

1. `vendor/marked.min.js` → exposes `marked`
2. `vendor/katex.min.js` → exposes `katex`
3. `vendor/auto-render.min.js` → exposes `renderMathInElement` (depends on `katex`)
4. `vendor/dompurify.min.js` → exposes `DOMPurify`
5. `app/core.js` → state + utils (no deps on vendor)
6. `app/idb.js` (no deps)
7. `app/svg.js` (no deps)
8. `app/api.js` (uses `state.settings`)
9. `app/markdown.js` (uses marked, DOMPurify, escapeHtml)
10. `app/projects.js` (uses core, idb, renderProjectList from render)
11. `app/render.js` (uses core, markdown)
12. `app/events.js` (wires everything — loads after all feature modules)
13. `app/main.js` (handleSend + init — loads last)

Three layers wired by SVG bezier "balls" flying between them:
- **用户界面** (UI): chat messages + composer.
- **数据存储** (Data): training cards with `input` / `output` panels.
- **服务接口** (API): OpenAI-compatible `/v1/chat/completions` config.

**All UI copy and code comments are Chinese.** Keep new UI strings and comments in Chinese to match.

## Run / dev

- Open directly: `open index.html` — works via `file://` for everything except PWA features (SW / install).
- Serve for PWA testing: `python3 -m http.server 8000` then visit `http://localhost:8000`. SW requires HTTPS or localhost.
- **Syntax-check** all app modules: `for f in app/*.js; do node --check "$f"; done`.
- No build / lint / test tooling. This **is** a git repo with remote `https://github.com/roadlabs/TeachableAgent.git`.

## Persistence model

Two stores, three roles:

| Store | Keys | Holds |
|---|---|---|
| `localStorage` | `ta_settings_v1` | provider / baseUrl / model / apiKey (legacy mirror; IDB is source of truth per project) |
| `localStorage` | `ta_current_project_v1` | which project is loaded |
| `localStorage` | `ta_data_v1` / `ta_chat_v1` | mirror of the *current* project's data/chat (set on every save; IDB is canonical) |
| **IndexedDB** `TeachableAgent` v1 / store `projects` | project id (uuid) | full project records: `{ id, name, createdAt, updatedAt, data, chat, settings }` |

**One project = one full snapshot of all three layers** (data + chat + API settings). Switching projects swaps all three at once.

**Migration on first load** (in `initProjects()`): if IDB has no projects but localStorage has data/chat, wrap into a default "默认项目" and write to IDB. Pre-existing IDB projects missing the `settings` field get backfilled once with current `state.settings`.

## Save chain

Every mutation flows through three save functions that each:
1. Write to `localStorage` (legacy mirror).
2. Call `persistCurrentProject()` — 200 ms debounced `dbPutProject` of `{ id, name, data, chat, settings, ... }`.

`flushCurrentProject()` is awaited at the **start** of `switchProject` / `createProject` / `deleteProject` to drain the debounce before swapping state — otherwise pending keystrokes get lost.

`switchProject` also restores `state.settings` and calls `renderSettings()` so the API form's four fields reflect the new project's config.

## In-flight request invariant

`handleSend()` is one `await`-chained UI → Data → API → Data → UI pipeline that captures DOM targets via `querySelector` mid-flight.

- `busy` flag is set at start of `handleSend`, cleared on every exit path.
- While `busy`: drag/drop, panel delete, pin toggle, project switch/delete, re-send are **all no-op** (existing pattern — never bypass it).
- **`renderData()` during a request breaks the animation flow** because captured DOM nodes get orphaned. `appendOutputToItem()` patches a single pending card in place instead; the caller re-triggers the reveal animation after the ball lands.

## PWA file layout

- `index.html` — DOM structure only.
- `styles.css` — all CSS (app + KaTeX).
- `vendor/*.min.js` — 4 third-party libraries.
- `app/*.js` — 9 in-house modules (see load order in **Run / dev**).
- `manifest.json` — name / `display: standalone` / `theme_color: #6366f1` / icons (`any` + `maskable`).
- `sw.js` — cache-first. Versioned by `const CACHE = 'teachable-agent-vN'` (currently v3). **Bump N on each app release**; the `activate` handler deletes stale caches and `clients.claim()`s. `ASSETS` lists every file the app needs to load offline (4 vendor + 9 app + index.html + styles.css + manifest.json + icon.svg = 19 entries).
- `icon.svg` — 512×512; SVG is supported by Chrome 120+ / Safari, no PNG fallback shipped.

All files must live at the project root for the SW scope (default `./`) to cover them.

## Mobile responsive

`@media (max-width: 1100px)` collapses the 3-column workspace into single column with a top tab bar (界面 / 数据 / 接口). Tab switching is `display: none` + `.active-mobile` toggle. `@media (max-width: 480px)` hides tab labels, leaves only emoji. Desktop layout untouched. Connection bezier overlay (`#connectionsOverlay`) is hidden on mobile.

## Gotchas worth knowing

- **DOM / `<script>` ordering.** Elements targeted by `document.getElementById('x').addEventListener(...)` in the app script must already be in the DOM when the script runs. If the script precedes the target element, the first `.addEventListener` on `null` throws and **every subsequent listener also fails silently** (looks like "buttons do nothing"). Always place target DOM *before* the `<script>` that binds it.
- **Sandboxed HTML preview.** ```` ```html ```` blocks become a `sandbox=""` iframe (no `allow-*` tokens — no script, no same-origin, no form submit, no top-nav). DOMPurify sanitizes the source separately; KaTeX scans text nodes after. LLM output never executes JS or escapes the iframe sandbox.
- **Pin is UI-only.** Per-card pin floats cards to the top of the visible list, but the LLM context still uses `state.data.filter().reverse()`. Pinning doesn't anchor to context head. If you want that semantic, change the context build in `handleSend`, not the renderer.
- **Mobile tabs depend on DOM order.** All three `<section class="layer">` stay in the DOM at all viewports — only `display` flips. Switching tabs only toggles classes; the active layer naturally appears at the top because the others are `display: none`.
- **The 13 `<script>` tags in `index.html` must load in the order listed under "Script load order".** Each app module relies on globals exposed by the previous one (no ES modules, no bundler — plain script-tag globals). Reordering or removing a tag breaks init silently (e.g., `initProjects is not defined`). The vendor block must come first; the app block loads in dependency order; `events.js` and `main.js` go last.