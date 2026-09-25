// app/api.js
// OpenAI 兼容 /v1/chat/completions 调用 + 测试连接
// 依赖：core.js（state.settings）

// =====================================================================
// API call (OpenAI-compatible)
// =====================================================================
async function callLLM(messages) {
  const { baseUrl, model, apiKey } = state.settings;
  if (!baseUrl) throw new Error('请先在右侧设置 Base URL');
  if (!model)   throw new Error('请先在右侧设置 Model');

  const cleaned = baseUrl.replace(/\/+$/, '');
  const url = cleaned.endsWith('/chat/completions') ? cleaned : cleaned + '/chat/completions';
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages, stream: false }),
  });

  if (!resp.ok) {
    let detail = '';
    try { detail = (await resp.json()).error?.message || ''; } catch (_) {}
    if (!detail) {
      try { detail = await resp.text(); } catch (_) {}
    }
    throw new Error(`HTTP ${resp.status} — ${detail.slice(0, 240) || resp.statusText}`);
  }
  const data = await resp.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('响应中没有 choices[0].message.content');
  return text;
}

async function testConnection() {
  const btn = document.getElementById('testConnBtn');
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = '测试中…';
  try {
    await callLLM([{ role: 'user', content: 'Reply with the single word: pong' }]);
    btn.textContent = '✓ 已连接';
  } catch (e) {
    btn.textContent = e.message.includes('Failed to fetch') ? '✗ CORS/网络错误' : '✗ 失败';
  }
  setTimeout(() => {
    btn.textContent = original;
    btn.disabled = false;
  }, 2000);
}

