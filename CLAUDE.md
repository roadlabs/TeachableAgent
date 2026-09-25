# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## The app

**Teachable Agent (可训练智能体)** — single-page PWA. The app is one `index.html` (≈785 KB; ~1541 lines) with four libraries inlined: marked, KaTeX (+ auto-render + 20 woff2 fonts as base64), DOMPurify. Plus 3 sibling files for PWA: `manifest.json`, `sw.js`, `icon.svg`.

Three layers wired by SVG bezier "balls" flying between them:
- **用户界面** (UI): chat messages + composer.
- **数据存储** (Data): training cards with `input` / `output` panels.
- **服务接口** (API): OpenAI-compatible `/v1/chat/completions` config.

**All UI copy and code comments are Chinese.** Keep new UI strings and comments in Chinese to match.

## Run / dev

- Open directly: `open index.html` — works via `file://` for everything except PWA features (SW / install).
- Serve for PWA testing: `python3 -m http.server 8000` then visit `http://localhost:8000`. SW requires HTTPS or localhost.
- **Syntax-check** the inline app script. The file has 5 `<script>` blocks (4 libs + 1 app), so the original `sed` recipe no longer works — use line ranges:

  ```sh
  python3 -c "
  with open('index.html') as f: lines = f.readlines()
  start = next(i for i, l in enumerate(lines)
               if l.strip() == '<script>' and lines[i+1].lstrip().startswith(\"'use strict';\"))
  end = next(i for i in range(start, len(lines)) if lines[i].strip() == '</script>')
  open('/tmp/app.js', 'w').writelines(lines[start+1:end])
  " && node --check /tmp/app.js
  ```

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

- `index.html` — app; inlines 4 libs + KaTeX fonts.
- `manifest.json` — name / `display: standalone` / `theme_color: #6366f1` / icons (`any` + `maskable`).
- `sw.js` — cache-first. Versioned by `const CACHE = 'teachable-agent-vN'`. **Bump N on each app release**; the `activate` handler deletes stale caches and `clients.claim()`s.
- `icon.svg` — 512×512; SVG is supported by Chrome 120+ / Safari, no PNG fallback shipped.

All four files must live at the same directory for the SW scope to cover the app.

## Mobile responsive

`@media (max-width: 1100px)` collapses the 3-column workspace into single column with a top tab bar (界面 / 数据 / 接口). Tab switching is `display: none` + `.active-mobile` toggle. `@media (max-width: 480px)` hides tab labels, leaves only emoji. Desktop layout untouched. Connection bezier overlay (`#connectionsOverlay`) is hidden on mobile.

## Gotchas worth knowing

- **DOM / `<script>` ordering.** Elements targeted by `document.getElementById('x').addEventListener(...)` in the app script must already be in the DOM when the script runs. If the script precedes the target element, the first `.addEventListener` on `null` throws and **every subsequent listener also fails silently** (looks like "buttons do nothing"). Always place target DOM *before* the `<script>` that binds it.
- **Sandboxed HTML preview.** ```` ```html ```` blocks become a `sandbox=""` iframe (no `allow-*` tokens — no script, no same-origin, no form submit, no top-nav). DOMPurify sanitizes the source separately; KaTeX scans text nodes after. LLM output never executes JS or escapes the iframe sandbox.
- **Pin is UI-only.** Per-card pin floats cards to the top of the visible list, but the LLM context still uses `state.data.filter().reverse()`. Pinning doesn't anchor to context head. If you want that semantic, change the context build in `handleSend`, not the renderer.
- **Mobile tabs depend on DOM order.** All three `<section class="layer">` stay in the DOM at all viewports — only `display` flips. Switching tabs only toggles classes; the active layer naturally appears at the top because the others are `display: none`.
- **The 5 `<script>` blocks are not all the app.** When grepping for app symbols, exclude lines 905-929 (the 4 library scripts) and the last one starting with `'use strict';`. A naive `sed '/<script>/,/<\/script>/p'` collapses them into one giant string that fails to parse.