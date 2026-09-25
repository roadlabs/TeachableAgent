# Teachable Agent · 可训练智能体

A single-page PWA that demonstrates a **three-layer LLM pipeline**: chat UI ↔ training data ↔ API provider, with all state (settings, conversations, training cards) persisted in the browser.

## Features

- 💬 **Any OpenAI-compatible API** — OpenAI / DeepSeek / Moonshot / Agnes / Ollama / LM Studio / custom endpoint
- 📚 **Training data layer** — paired `input` / `output` panels per card; pin to top, drag to reorder, per-panel delete
- 🔌 **Per-project API config** — switch providers on the fly; each project remembers its own model / key / base URL
- 📁 **Multi-project workspace** — bundle any project's data + chat + API config into one IndexedDB record; instant switching
- 📝 **Rich assistant messages** — Markdown + LaTeX (`$...$`, `$$...$$`, `\(...\)`, `\[...\]`) + sanitized HTML; HTML code blocks get a code/preview toggle backed by a sandboxed iframe
- 📱 **Mobile responsive** — single column + tab switcher at ≤1100 px; emoji-only tabs at ≤480 px
- 📦 **Installable PWA** — cache-first service worker, app icon, installable on mobile home screen
- 🇨🇳 UI copy in Chinese (matches the product's design language)

## Quick start

### Just open the file

```sh
open index.html
```

Everything works except PWA features (service worker, install).

### Serve it locally (recommended — needed for PWA)

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Service workers require HTTPS or `localhost`.

### Install as a PWA

- **Chrome / Edge** — click the install icon in the address bar.
- **iOS Safari** — Share → Add to Home Screen.

## Project structure

```
teachable_agent/
├── index.html              # DOM structure
├── styles.css              # All CSS (app + KaTeX + woff2 fonts as base64)
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker (cache-first, versioned)
├── icon.svg                # 512×512 app icon
├── vendor/
│   ├── marked.min.js       # Markdown parser
│   ├── katex.min.js        # Math renderer
│   ├── auto-render.min.js  # KaTeX DOM scanner
│   └── dompurify.min.js    # HTML sanitizer
└── app/                    # In-house modules (no build, globals)
    ├── core.js             # constants, state, localStorage, utils
    ├── idb.js              # IndexedDB wrapper
    ├── svg.js              # SVG animations + fly bubbles + glow
    ├── api.js              # callLLM, testConnection
    ├── markdown.js         # Rich render pipeline
    ├── projects.js         # Project CRUD + modal
    ├── render.js           # All renderXxx + data interactions
    ├── events.js           # All addEventListener bindings
    └── main.js             # handleSend + init flow
```

## Architecture

Three layers wired by SVG bezier "balls" flying between them:

- **用户界面 (UI layer)** — chat messages + composer
- **数据存储 (Data layer)** — training cards with `input` / `output` panels
- **服务接口 (API layer)** — OpenAI-compatible `/v1/chat/completions` config

**Persistence split:**

- `localStorage` — settings mirror + current project id (keys: `ta_settings_v1`, `ta_current_project_v1`)
- IndexedDB — project records (db `TeachableAgent` v1, store `projects`); each project stores `{ id, name, data, chat, settings }`

**Script load order** (top-down in `index.html`):

1. `vendor/*` (4 files) — exposes `marked`, `katex`, `renderMathInElement`, `DOMPurify`
2. `app/core.js` — state + utils
3. `app/idb.js` — IndexedDB
4. `app/svg.js`, `app/api.js`, `app/markdown.js` — feature modules
5. `app/projects.js`, `app/render.js` — depends on above
6. `app/events.js`, `app/main.js` — wiring + init

## Development

```sh
# Syntax-check all JS
for f in app/*.js vendor/*.min.js; do node --check "$f"; done

# On every release: bump the SW cache version (in sw.js):
const CACHE = 'teachable-agent-vN';
# Bump N, list all files in ASSETS, push.
```

## Tech stack

- **Vanilla JS** — no framework, no build step, no bundler. 13 `<script>` tags loaded in dependency order.
- **Vendor libraries** — marked (Markdown), KaTeX (LaTeX), DOMPurify (HTML sanitizer).
- **Browser APIs** — localStorage, IndexedDB, Service Worker, Web App Manifest.

## License

MIT — see [`LICENSE`](./LICENSE).