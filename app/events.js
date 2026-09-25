// app/events.js
// 所有 addEventListener 注册（API 层 / 聊天 / 数据 / 项目模态框 / 移动端 tab / HTML 预览 tab）
// 依赖：上面所有模块

// =====================================================================
// Event handlers
// =====================================================================

// Provider 选择
document.getElementById('provider').addEventListener('change', e => {
  const v = e.target.value;
  state.settings.provider = v;
  if (v !== 'custom') {
    state.settings.baseUrl = PROVIDERS[v].baseUrl;
    state.settings.model   = PROVIDERS[v].model;
  }
  saveSettings();
  renderSettings();
});

// API 输入
['baseUrl','modelName','apiKey'].forEach(id => {
  document.getElementById(id).addEventListener('input', e => {
    const key = id === 'baseUrl' ? 'baseUrl' : id === 'modelName' ? 'model' : 'apiKey';
    state.settings[key] = e.target.value;
    saveSettings();
  });
});

// API Key 显示切换
document.getElementById('toggleKeyBtn').addEventListener('click', () => {
  const input = document.getElementById('apiKey');
  input.type = input.type === 'password' ? 'text' : 'password';
});

// 测试连接
document.getElementById('testConnBtn').addEventListener('click', testConnection);

// HTML 代码块预览 tab 切换（事件委托，只绑一次）
document.getElementById('messages').addEventListener('click', e => {
  const tab = e.target.closest('.html-preview-tab');
  if (!tab) return;
  const widget = tab.closest('.html-preview');
  if (!widget) return;
  widget.setAttribute('data-state', tab.dataset.view);
  widget.querySelectorAll('.html-preview-tab').forEach(t => {
    t.classList.toggle('active', t === tab);
  });
});

// ============ 移动端 tab 切换（≤1100px 生效） ============
document.getElementById('mobileTabs').addEventListener('click', e => {
  const tab = e.target.closest('.mobile-tab');
  if (!tab) return;
  const targetId = tab.dataset.target;
  document.querySelectorAll('.mobile-tab').forEach(t => {
    t.classList.toggle('active', t === tab);
  });
  document.querySelectorAll('.layer').forEach(l => {
    l.classList.toggle('active-mobile', l.id === targetId);
  });
  // 切换后把 workspace 滚到视口顶部，避免被 tab 自身覆盖
  const ws = document.querySelector('.workspace');
  if (ws) {
    const rect = ws.getBoundingClientRect();
    if (rect.top < 0) ws.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

// ============ 项目管理 事件 ============
document.getElementById('projectBtn').addEventListener('click', openProjectModal);
document.getElementById('closeProjectModal').addEventListener('click', closeProjectModal);
document.getElementById('projectModalBackdrop').addEventListener('click', closeProjectModal);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !document.getElementById('projectModal').hidden) closeProjectModal();
});

document.getElementById('createProjectBtn').addEventListener('click', async () => {
  const input = document.getElementById('newProjectName');
  const name  = input.value.trim() || `项目 ${new Date().toLocaleString('zh-CN')}`;
  input.value = '';
  await createProject(name);
  await renderProjectList();
});

// 项目列表操作 —— 委托到 #projectList
document.getElementById('projectList').addEventListener('click', async e => {
  const btn = e.target.closest('button[data-open], button[data-rename], button[data-delete]');
  if (!btn) return;
  const id = btn.dataset.open || btn.dataset.rename || btn.dataset.delete;
  if (btn.dataset.open) {
    await switchProject(id);
    await renderProjectList();
  } else if (btn.dataset.rename) {
    const projects = await dbAllProjects();
    const p = projects.find(it => it.id === id);
    const newName = prompt('重命名项目', p?.name || '');
    if (newName != null && newName.trim()) {
      await renameProject(id, newName);
      await renderProjectList();
    }
  } else if (btn.dataset.delete) {
    const projects = await dbAllProjects();
    const p = projects.find(it => it.id === id);
    if (!confirm(`删除项目「${p?.name || ''}」？此操作不可撤销。`)) return;
    await deleteProject(id);
    await renderProjectList();
  }
});

// 清空对话
document.getElementById('clearChatBtn').addEventListener('click', () => {
  if (!confirm('清空当前对话历史？')) return;
  state.chat = [];
  saveChat();
  renderChat();
});

// 清空数据（保留已置顶卡片）
document.getElementById('clearDataBtn').addEventListener('click', () => {
  const total        = state.data.length;
  const pinnedCount  = state.data.filter(it => it.pinned).length;
  const unpinnedCount = total - pinnedCount;
  if (total === 0)        { alert('暂无数据'); return; }
  if (pinnedCount === total) { alert('全部数据都已置顶，无需清空'); return; }
  if (!confirm(`清空 ${unpinnedCount} 条非置顶数据（保留 ${pinnedCount} 条置顶数据）？此操作不可撤销。`)) return;
  state.data = state.data.filter(it => it.pinned);
  saveData();
  renderData();
});

// 数据层排序方向切换（busy 守卫：飞行中切会破坏动画目标）
document.getElementById('sortBtn').addEventListener('click', () => {
  if (busy) return;
  sortDescending = !sortDescending;
  saveSort();
  updateSortButton();
  renderData();
});

// 导出数据
document.getElementById('exportDataBtn').addEventListener('click', () => {
  if (state.data.length === 0) { alert('暂无数据可导出'); return; }
  const json = JSON.stringify(state.data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `teachable-agent-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// 发送消息 — 五段串联数据流：UI → Data → API → Data → UI
