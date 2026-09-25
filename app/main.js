// app/main.js
// handleSend（五段串联数据流：UI→Data→API→Data→UI）+ 启动流程 + 自动高度
// 依赖：上面所有模块

async function handleSend(text) {
  if (busy) return;   // 请求进行中：拖拽/删除/重复发送均 no-op
  const inputEl = document.getElementById('userInput');
  const sendBtn = document.getElementById('sendBtn');
  if (!text) return;
  if (!state.settings.baseUrl || !state.settings.model) {
    alert('请先在右侧配置 API（至少 Base URL 和 Model 必填）');
    return;
  }
  busy = true;

  // 0. 用户消息入栈
  state.chat.push({ role: 'user', content: text, timestamp: Date.now() });
  saveChat();
  renderChat();

  inputEl.value = '';
  autoResizeTextarea();
  inputEl.disabled = true;
  sendBtn.disabled = true;

  const SEG = 650;    // 单段小球/气泡飞行时长
  const GAP = 200;
  const REQ  = '#fbbf24';
  const RESP = '#10b981';

  // 1. UI → Data （黄球 + input 文本气泡，并行飞向数据层）
  // 先创建 pending 卡片，但用 flying-in 类藏起来，作为气泡落点
  const pendingId = uid();
  state.data.unshift({
    id: pendingId,
    input: text,
    output: null,
    outputTimestamp: null,
    timestamp: Date.now(),
    status: 'pending',
  });
  saveData();
  renderData(null, null, [pendingId]);
  const dataCard = document.querySelector(`.data-item[data-id="${pendingId}"]`);

  await Promise.all([
    emitBall('conn1Group', 'path1', REQ, SEG, 'active-req'),
    flyText(inputEl, dataCard, text, 'input', SEG),
  ]);
  // 气泡落地 → 卡片现身 + 紫色脉冲
  dataCard.classList.remove('flying-in');
  dataCard.classList.add('input-new');
  await sleep(GAP);

  // 2. Data → API （黄球，不需要文本气泡）
  await emitBall('conn2Group', 'path2', REQ, SEG, 'active-req');

  // 3. 真正调用 API —— 等待状态在 API 层呈现（脉动徽章 + 连接线流光）
  state.chat.push({ role: 'thinking' });
  renderChat();

  const waitingEl = document.getElementById('apiWaiting');
  waitingEl.hidden = false;
  waitingEl.textContent = '等待响应…';
  document.getElementById('path2').classList.add('active-resp');

  let response;
  try {
    // 进入 LLM 上下文的卡片：
    //   - 有 output       → user/assistant 成对
    //   - 仅 input（如 output 被删除）→ 单独作为一条 user 消息
    //   - status === 'pending'（请求进行中）→ 排除，当前消息会单独追加
    const history = state.data
      .filter(item => item.status !== 'pending')
      .reverse()
      .flatMap(item => {
        const msgs = [{ role: 'user', content: item.input }];
        if (item.output != null) msgs.push({ role: 'assistant', content: item.output });
        return msgs;
      });
    const apiMessages = [...history, { role: 'user', content: text }];
    response = await callLLM(apiMessages);
  } catch (err) {
    state.chat = state.chat.filter(m => m.role !== 'thinking');
    state.chat.push({ role: 'error', content: err.message, timestamp: Date.now() });
    saveChat();
    renderChat();
    inputEl.disabled = false;
    sendBtn.disabled = false;
    inputEl.focus();
    // 恢复 API 层状态
    document.getElementById('path2').classList.remove('active-resp');
    waitingEl.hidden = true;
    busy = false;
    return;
  }

  // 清除 thinking
  state.chat = state.chat.filter(m => m.role !== 'thinking');
  document.getElementById('path2').classList.remove('active-resp');
  waitingEl.hidden = true;

  // 4. API → Data （绿球 + output 文本气泡，反向并行）
  // 先填好 output 块（绿脉冲只由 output-new 类触发），再让气泡从 API 层飞入
  const idx = state.data.findIndex(it => it.id === pendingId);
  if (idx >= 0) {
    state.data[idx].output = response;
    state.data[idx].outputTimestamp = Date.now();
    state.data[idx].status = 'complete';
    saveData();
    appendOutputToItem(pendingId);
  }
  const apiLayerEl = document.getElementById('apiLayer');
  const outputBlock = document.querySelector(`.data-item[data-id="${pendingId}"] .output-block`);
  await Promise.all([
    emitBall('conn2Group', 'path2', RESP, SEG, 'active-resp', true),
    flyText(apiLayerEl, outputBlock, response, 'output', SEG),
  ]);
  // 气泡落地 → 绿脉冲动画（先移除再重加 output-new，强制重放 outputReveal）
  const card = document.querySelector(`.data-item[data-id="${pendingId}"]`);
  card.classList.remove('output-new');
  void card.offsetWidth;
  card.classList.add('output-new');
  await sleep(GAP);

  // 5. Data → UI （绿球 + output 文本气泡，反向并行飞回聊天区）
  // 先把助手消息预渲染但藏起来
  state.chat.push({ role: 'assistant', content: response, timestamp: Date.now() });
  saveChat();
  renderChat();
  const messagesEl = document.getElementById('messages');
  messagesEl.scrollTop = messagesEl.scrollHeight;
  const assistantBubbles = messagesEl.querySelectorAll('.msg.assistant');
  const targetBubble = assistantBubbles[assistantBubbles.length - 1];
  targetBubble.classList.add('flying-in');

  const updatedOutput = document.querySelector(`.data-item[data-id="${pendingId}"] .output-block`);
  await Promise.all([
    emitBall('conn1Group', 'path1', RESP, SEG, 'active-resp', true),
    flyText(updatedOutput, targetBubble, response, 'output', SEG),
  ]);
  // 气泡落地 → 助手消息弹出
  targetBubble.classList.remove('flying-in');
  targetBubble.classList.add('landing');

  inputEl.disabled = false;
  sendBtn.disabled = false;
  inputEl.focus();
  busy = false;
}

document.getElementById('composer').addEventListener('submit', e => {
  e.preventDefault();
  const text = document.getElementById('userInput').value.trim();
  handleSend(text);
});

// 输入框 Enter 发送 / 自动高度
function autoResizeTextarea() {
  const ta = document.getElementById('userInput');
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
}
document.getElementById('userInput').addEventListener('input', autoResizeTextarea);
document.getElementById('userInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    document.getElementById('composer').requestSubmit();
  }
});

// =====================================================================
// Init
// =====================================================================
loadState();
renderSettings();

// 异步：从 IndexedDB 加载当前项目（settings 走 localStorage 是同步的，
// data/chat 走 IDB 是异步的，必须先 await 再渲染）
(async () => {
  await initProjects();
  renderChat();
  renderData();
})();

// 等 layout 稳定再算路径
requestAnimationFrame(() => {
  updateConnectionPaths();
  autoResizeTextarea();
});
window.addEventListener('resize', updateConnectionPaths);

// PWA：注册 service worker（缓存 app shell，离线可用；localhost / HTTPS 才生效）
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW 注册失败:', e));
  });
}

// 如果没有 API key，温和提示
if (!state.settings.apiKey) {
  console.info('提示：在右侧填入 API Key 后即可开始聊天');
}
