// app/core.js
// 应用基础 —— 常量 / state / localStorage 持久化 / 通用工具（escapeHtml / formatTime / uid）
// 依赖：浏览器 localStorage

// =====================================================================
// Provider presets (all OpenAI-compatible /v1/chat/completions)
// =====================================================================
const PROVIDERS = {
  openai:    { baseUrl: 'https://api.openai.com/v1',   model: 'gpt-4o-mini' },
  deepseek:  { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  moonshot:  { baseUrl: 'https://api.moonshot.cn/v1',  model: 'moonshot-v1-8k' },
  agnes:     { baseUrl: 'https://api.agnes-ai.cn/v1/chat/completions', model: 'agnes-3.0-flash' },
  ollama:    { baseUrl: 'http://localhost:11434/v1',   model: 'llama3.2' },
  lmstudio:  { baseUrl: 'http://localhost:1234/v1',    model: 'local-model' },
  custom:    { baseUrl: '',                              model: '' },
};

const STORAGE_KEYS = {
  settings: 'ta_settings_v1',
  data:     'ta_data_v1',
  chat:     'ta_chat_v1',
};

// =====================================================================
// State
// =====================================================================
let state = {
  settings: { provider: 'agnes', baseUrl: PROVIDERS.agnes.baseUrl, model: PROVIDERS.agnes.model, apiKey: '' },
  data: [],
  chat: [],
};

function loadState() {
  // settings 仍走 localStorage；data / chat 由 initProjects() 从 IndexedDB 加载
  try {
    const s = localStorage.getItem(STORAGE_KEYS.settings);
    if (s) state.settings = { ...state.settings, ...JSON.parse(s) };
  } catch (e) { console.warn('加载设置失败:', e); }
}

// 旧版 localStorage 数据迁移：inputPinned/outputPinned → 单一 pinned 字段
// 仍在用旧版字段的项目初始化时会调用一次
function migrateItemPinning(items) {
  return (items || []).map(it => {
    it.pinned = it.pinned ?? !!(it.inputPinned || it.outputPinned);
    delete it.inputPinned;
    delete it.outputPinned;
    return it;
  });
}
const saveSettings = () => { localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings)); persistCurrentProject(); };
const saveData     = () => { localStorage.setItem(STORAGE_KEYS.data, JSON.stringify(state.data)); persistCurrentProject(); };
const saveChat     = () => { localStorage.setItem(STORAGE_KEYS.chat, JSON.stringify(state.chat)); persistCurrentProject(); };

// =====================================================================
// Utilities
// =====================================================================
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  })[c]);
}
function formatTime(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getMonth()+1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

