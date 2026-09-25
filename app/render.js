// app/render.js
// UI 渲染：renderSettings / renderChat / renderData / renderDataItemHtml
//          + appendOutputToItem / attachDataInteractions
// 依赖：core.js（state/utils）、markdown.js（renderAssistantHtml/enhanceHtmlCodeBlocks）、projects.js（state 引用）

// =====================================================================
// Render
// =====================================================================
function renderSettings() {
  document.getElementById('provider').value  = state.settings.provider;
  document.getElementById('baseUrl').value    = state.settings.baseUrl;
  document.getElementById('modelName').value  = state.settings.model;
  document.getElementById('apiKey').value     = state.settings.apiKey;
}


function renderChat() {
  const container = document.getElementById('messages');
  if (state.chat.length === 0) {
    container.innerHTML = '<div class="empty-state">点击下方输入框开始对话…</div>';
    return;
  }
  container.innerHTML = state.chat.map(m => {
    if (m.role === 'user')      return `<div class="msg user">${escapeHtml(m.content)}</div>`;
    if (m.role === 'assistant') return `<div class="msg assistant">${renderAssistantHtml(m.content)}</div>`;
    if (m.role === 'error')     return `<div class="msg error">⚠️ ${escapeHtml(m.content)}</div>`;
    if (m.role === 'thinking')  return `<div class="msg thinking"><span class="thinking-dot"></span><span class="thinking-dot"></span><span class="thinking-dot"></span></div>`;
    return '';
  }).join('');
  // 助手消息中的公式由 KaTeX auto-render 扫描后渲染
  if (typeof renderMathInElement === 'function') {
    renderMathInElement(container, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$',  right: '$',  display: false },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false },
      ],
      throwOnError: false,
    });
  }
  // ```html 代码块增强：替换为「代码/预览」切换 widget
  enhanceHtmlCodeBlocks(container);
  container.scrollTop = container.scrollHeight;
}

// 渲染整张数据列表
// highlightInputId / highlightOutputId 控制哪条卡片/哪个块需要高亮动画
function renderData(highlightInputId = null, highlightOutputId = null, flyingInIds = []) {
  const list  = document.getElementById('dataList');
  const count = document.getElementById('dataCount');
  count.textContent = state.data.length;
  if (state.data.length === 0) {
    list.innerHTML = '<div class="empty-state">还没有训练数据。开始聊天后会自动累积。<br>🖐 拖拽手柄可排序 · 每个面板 header 上的 📌 可置顶到列表顶部。<br>× 删除单面板。点击右上角「导出」可下载为 JSON。</div>';
    return;
  }
  // 渲染顺序：置顶组优先，按 state.data 原顺序排；非置顶组紧随其后
  const pinned = state.data.filter(it => it.pinned);
  const rest   = state.data.filter(it => !it.pinned);
  const ordered = pinned.concat(rest);
  list.innerHTML = ordered.map(item => renderDataItemHtml(item, highlightInputId, highlightOutputId, flyingInIds)).join('');
  attachDataInteractions();
}

// 单条卡片的 HTML
function renderDataItemHtml(item, hlInputId, hlOutputId, flyingInIds) {
  const classes = ['data-item'];
  if (item.output == null) classes.push('pending');
  if (item.pinned) classes.push('card-pinned');
  if (flyingInIds && flyingInIds.includes(item.id)) classes.push('flying-in');
  if (item.id === hlInputId)  classes.push('input-new');
  if (item.id === hlOutputId) classes.push('output-new');

  const pinClass = item.pinned ? ' is-pinned' : '';
  const pinTitle = item.pinned ? '取消置顶' : '置顶到列表顶部';
  const pinIcon  = item.pinned ? '📌' : '📍';
  const inputBlock = `
    <div class="data-block input-block">
      <div class="data-item-header">
        <span class="data-item-tag tag-input">input</span>
        <span>${formatTime(item.timestamp)}</span>
        <button class="panel-pin${pinClass}" data-pin="1" data-id="${item.id}" title="${pinTitle}">${pinIcon}</button>
        <button class="panel-del" data-del-panel="input" data-id="${item.id}" title="删除整条卡片">×</button>
      </div>
      <div class="data-item-text">${escapeHtml(item.input)}</div>
    </div>
  `;

  // 仅有 input（pending 或 output 被删除）时不渲染 output 面板 —— 等待状态由 API 层动画表达
  const outputBlock = item.output != null ? `
    <div class="data-block output-block">
      <div class="data-item-header">
        <span class="data-item-tag tag-output">output</span>
        <span>${formatTime(item.outputTimestamp ?? item.timestamp)}</span>
        <button class="panel-del" data-del-panel="output" data-id="${item.id}" title="清空 output，仅保留 input">×</button>
      </div>
      <div class="data-item-text">${escapeHtml(item.output)}</div>
    </div>
  ` : '';

  return `
    <div class="${classes.join(' ')}" data-id="${item.id}">
      <div class="card-grip" draggable="true" title="拖拽排序">⠿</div>
      ${inputBlock}
      ${outputBlock}
    </div>
  `;
}

// 数据层交互：面板单独删除 + 拖拽排序
// 用事件委托绑定一次，render 时无需重绑
let dragId = null;
let busy  = false;

function attachDataInteractions() {
  const list = document.getElementById('dataList');
  if (list.dataset.interactionsBound) return;
  list.dataset.interactionsBound = '1';

  // —— 面板删除（input = 删整卡；output = 只清空 output，卡片仍可进入上下文）——
  list.addEventListener('click', e => {
    if (busy) return;

    // 卡片置顶 toggle —— pinned=true 时整张卡片浮到列表顶部
    const pinBtn = e.target.closest('[data-pin]');
    if (pinBtn) {
      const item = state.data.find(it => it.id === pinBtn.dataset.id);
      if (item) {
        item.pinned = !item.pinned;
        saveData();
        renderData();
      }
      return;
    }

    const btn = e.target.closest('[data-del-panel]');
    if (!btn) return;
    const id    = btn.dataset.id;
    const panel = btn.dataset.delPanel;
    if (panel === 'input') {
      state.data = state.data.filter(it => it.id !== id);
    } else if (panel === 'output') {
      const item = state.data.find(it => it.id === id);
      if (item) { item.output = null; item.outputTimestamp = null; }
    }
    saveData();
    renderData();
  });

  // —— 拖拽排序（只允许从 .card-grip 开始拖动）——
  list.addEventListener('dragstart', e => {
    const grip = e.target.closest('.card-grip');
    const card = grip ? grip.closest('.data-item') : null;
    if (!card || busy) { e.preventDefault(); return; }
    dragId = card.dataset.id;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);   // Firefox 需要
    if (card.setDragImage) card.setDragImage(card, 0, 10);
  });

  list.addEventListener('dragover', e => {
    const card = e.target.closest('.data-item');
    if (!card || !dragId) return;
    // 跨组拖拽（置顶 ↔ 非置顶）直接拒绝 —— 保持两组各自的顺序
    const fromItem = state.data.find(it => it.id === dragId);
    const toItem   = state.data.find(it => it.id === card.dataset.id);
    const fromPinned = !!(fromItem && fromItem.pinned);
    const toPinned   = !!(toItem   && toItem.pinned);
    if (fromPinned !== toPinned) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = card.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    list.querySelectorAll('.data-item').forEach(c => {
      c.classList.remove('drop-before', 'drop-after');
    });
    card.classList.add(before ? 'drop-before' : 'drop-after');
  });

  list.addEventListener('drop', e => {
    const card = e.target.closest('.data-item');
    if (!card || !dragId) return;
    e.preventDefault();
    const from = state.data.findIndex(it => it.id === dragId);
    const to   = state.data.findIndex(it => it.id === card.dataset.id);
    if (from < 0 || to < 0) return;
    const movedPinned = !!state.data[from].pinned;
    const rect = card.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    const [moved] = state.data.splice(from, 1);
    let insertAt = to;
    if (from < to) insertAt--;                          // 删除源后目标索引前移
    if (!before) insertAt++;                            // 落在下方 → 插到目标之后
    // 钳位到源卡片所属组（置顶 vs 非置顶），跨组移动会被压回原区域
    let lastPinnedIdx = -1;
    for (let i = state.data.length - 1; i >= 0; i--) {
      if (state.data[i].pinned) { lastPinnedIdx = i; break; }
    }
    if (movedPinned) {
      insertAt = Math.max(0, Math.min(lastPinnedIdx + 1, insertAt));
    } else {
      insertAt = Math.max(lastPinnedIdx + 1, Math.min(state.data.length, insertAt));
    }
    state.data.splice(insertAt, 0, moved);
    dragId = null;
    saveData();
    renderData();
  });

  list.addEventListener('dragend', () => {
    dragId = null;
    list.querySelectorAll('.data-item').forEach(c => {
      c.classList.remove('dragging', 'drop-before', 'drop-after');
    });
  });
}

// 局部更新：给指定 pending 卡片补上 output 块（不重渲染整列，避免其他卡片动画重跑）
function appendOutputToItem(itemId) {
  const item = state.data.find(it => it.id === itemId);
  if (!item) return;
  const target = document.querySelector(`.data-item[data-id="${itemId}"]`);
  if (!target) return;

  const outputHtml = `
    <div class="data-block output-block">
      <div class="data-item-header">
        <span class="data-item-tag tag-output">output</span>
        <span>${formatTime(item.outputTimestamp ?? item.timestamp)}</span>
        <button class="panel-del" data-del-panel="output" data-id="${item.id}" title="清空 output，仅保留 input">×</button>
      </div>
      <div class="data-item-text">${escapeHtml(item.output)}</div>
    </div>
  `;

  // pending 卡片只有 input 面板，output 块直接插到 input 块之后
  // 注意：不在这里加 output-new —— 绿脉冲动画由调用方在小球落地后触发
  const inputBlock = target.querySelector('.input-block');
  inputBlock.insertAdjacentHTML('afterend', outputHtml);
  target.classList.remove('pending');
}

// 把一段文本从 sourceEl 飞到 targetEl（HTML 气泡 + CSS transform）
// type: 'input' | 'output'
