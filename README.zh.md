# Teachable Agent · 可训练智能体

一个单页 PWA，演示**三层联动**的 LLM 流水线：聊天界面 ↔ 训练数据 ↔ API 配置，所有状态（设置、对话、训练数据）持久化在浏览器本地。

[English version](./README.md)

## 特性

- 💬 **对接任意 OpenAI 兼容 API** —— 支持 OpenAI / DeepSeek / Moonshot / Agnes / Ollama / LM Studio / 自定义端点
- 📚 **数据层** —— 训练数据以卡片形式呈现，每张卡片含 `input` / `output` 两个面板；可置顶、可拖拽排序、可单面板删除
- 🔌 **多 Provider API 配置** —— 切换 Provider 时自动套用该 Provider 的默认 baseUrl / model；每个项目独立保存自己的 API 配置
- 📁 **多项目工作区** —— 把「数据 + 聊天 + API 配置」打包成一条 IndexedDB 记录保存；项目间瞬时切换，互不污染
- 📝 **助手消息富渲染** —— Markdown + LaTeX（`$...$` / `$$...$$` / `\(...\)` / `\[...\]`）+ 经过 DOMPurify 消毒的 HTML；HTML 代码块额外提供「代码 / 预览」切换，预览用最严格沙箱 iframe 渲染
- 📱 **移动端响应式** —— ≤1100 px 自动切单列 + 顶部 tab 切换；≤480 px tab 只显示 emoji
- 📦 **可安装 PWA** —— cache-first service worker 离线可用；带应用图标；可装到手机主屏
- 🇨🇳 全中文 UI（符合产品定位）

## 快速开始

### 直接打开

```sh
open index.html
```

PWA 功能（service worker、安装）外的所有功能都可用。

### 起本地服务（推荐 —— PWA 功能必需）

```sh
python3 -m http.server 8000
# 浏览器打开 http://localhost:8000
```

Service worker 要求 HTTPS 或 localhost。

### 安装为 PWA

- **Chrome / Edge** —— 地址栏右侧点击「安装」图标
- **iOS Safari** —— 分享 → 添加到主屏幕

## 项目结构

```
teachable_agent/
├── index.html              # DOM 结构
├── styles.css              # 所有 CSS（应用 + KaTeX + 字体 base64）
├── manifest.json           # PWA 清单
├── sw.js                   # Service worker（cache-first、版本化）
├── icon.svg                # 512×512 应用图标
├── vendor/
│   ├── marked.min.js       # Markdown 解析
│   ├── katex.min.js        # 数学公式渲染
│   ├── auto-render.min.js  # KaTeX DOM 扫描
│   └── dompurify.min.js    # HTML 消毒
└── app/                    # 自研模块（无构建，全局变量）
    ├── core.js             # 常量 / state / localStorage / 通用工具
    ├── idb.js              # IndexedDB 封装
    ├── svg.js              # SVG 连接线 / 飞气泡 / 发光滤镜
    ├── api.js              # callLLM / testConnection
    ├── markdown.js         # 富文本渲染管线
    ├── projects.js         # 项目 CRUD + 模态框
    ├── render.js           # 所有 renderXxx + 数据交互
    ├── events.js           # 所有 addEventListener 注册
    └── main.js             # handleSend + 启动流程
```

## 架构

三层之间用 SVG 贝塞尔曲线 + 滚动小球动画连接：

- **用户界面（UI 层）** —— 聊天消息 + 输入框
- **数据存储（数据层）** —— 训练卡片，每个卡片含 input / output 面板
- **服务接口（API 层）** —— OpenAI 兼容的 `/v1/chat/completions` 配置

**持久化分工：**

- `localStorage` —— 设置镜像 + 当前项目 id（键名 `ta_settings_v1` / `ta_current_project_v1`）
- IndexedDB —— 项目记录（db `TeachableAgent` v1，store `projects`）；每条记录存 `{ id, name, data, chat, settings }`

**脚本加载顺序**（index.html 自上而下）：

1. `vendor/*`（4 个文件）—— 暴露 `marked` / `katex` / `renderMathInElement` / `DOMPurify`
2. `app/core.js` —— state + utils
3. `app/idb.js` —— IndexedDB
4. `app/svg.js` / `app/api.js` / `app/markdown.js` —— 功能模块
5. `app/projects.js` / `app/render.js` —— 依赖上面
6. `app/events.js` / `app/main.js` —— 接线 + 启动

## 开发

```sh
# 语法检查所有 JS
for f in app/*.js vendor/*.min.js; do node --check "$f"; done

# 每次发版要 bump sw.js 里的缓存版本号：
const CACHE = 'teachable-agent-vN';
# 改 N、补 ASSETS 列表、提交。
```

## 技术栈

- **原生 JS** —— 无框架、无构建、无打包；13 个 `<script>` 标签按依赖顺序加载
- **第三方库** —— marked（Markdown）、KaTeX（数学公式）、DOMPurify（HTML 消毒）
- **浏览器 API** —— localStorage、IndexedDB、Service Worker、Web App Manifest

## 许可证

MIT —— 见 [`LICENSE`](./LICENSE)。