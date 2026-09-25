// app/projects.js
// 项目 CRUD + 模态框 + 启动迁移（initProjects）
// 依赖：core.js（state/uid/saveX）、idb.js、render.js（renderProjectList）

// 当前项目状态
let currentProjectId   = null;
let currentProjectMeta = null; // { id, name, createdAt, updatedAt }

// 防抖写入 IDB —— 200ms 内连续变更合并为一次 put
let _saveProjectTimer = null;
function persistCurrentProject() {
  if (!currentProjectId) return;
  clearTimeout(_saveProjectTimer);
  _saveProjectTimer = setTimeout(() => {
    _saveProjectTimer = null;
    flushCurrentProject().catch(e => console.warn('保存项目失败:', e));
  }, 200);
}
async function flushCurrentProject() {
  if (!currentProjectId) return;
  if (_saveProjectTimer) { clearTimeout(_saveProjectTimer); _saveProjectTimer = null; }
  await dbPutProject({
    id: currentProjectId,
    name: currentProjectMeta.name,
    createdAt: currentProjectMeta.createdAt,
    updatedAt: Date.now(),
    data: state.data,
    chat: state.chat,
    settings: state.settings,
  });
  currentProjectMeta.updatedAt = Date.now();
}

function updateProjectIndicator() {
  const el = document.getElementById('projectName');
  if (el) el.textContent = currentProjectMeta?.name || '默认项目';
}

async function createProject(name) {
  const id  = uid();
  const now = Date.now();
  // 新项目继承当前 API 配置 —— 用户可在 API 层修改
  const projSettings = { ...state.settings };
  await dbPutProject({
    id, name, createdAt: now, updatedAt: now,
    data: [], chat: [], settings: projSettings,
  });
  currentProjectId   = id;
  currentProjectMeta = { id, name, createdAt: now, updatedAt: now };
  state.data     = [];
  state.chat     = [];
  state.settings = projSettings;
  localStorage.setItem('ta_current_project_v1', id);
  saveData(); saveChat(); saveSettings();
  renderSettings();   // API 表单字段刷新
  renderChat();
  renderData();
  updateProjectIndicator();
}

async function switchProject(id) {
  if (id === currentProjectId || busy) return;
  // 切走前 flush 当前未保存的变更（包括 settings）
  await flushCurrentProject();
  const projects = await dbAllProjects();
  const p = projects.find(it => it.id === id);
  if (!p) return;
  currentProjectId   = p.id;
  currentProjectMeta = { id: p.id, name: p.name, createdAt: p.createdAt, updatedAt: p.updatedAt };
  state.data     = p.data     || [];
  state.chat     = p.chat     || [];
  state.settings = p.settings || { ...state.settings };   // 旧记录无 settings 时兜底
  localStorage.setItem('ta_current_project_v1', p.id);
  saveData(); saveChat(); saveSettings();
  renderSettings();   // API 表单字段刷新（关键：Provider / Base URL / Model / Key 全部跟着项目走）
  renderChat();
  renderData();
  updateProjectIndicator();
}

async function renameProject(id, newName) {
  const trimmed = newName.trim();
  if (!trimmed) return;
  const projects = await dbAllProjects();
  const p = projects.find(it => it.id === id);
  if (!p) return;
  p.name = trimmed;
  p.updatedAt = Date.now();
  await dbPutProject(p);
  if (id === currentProjectId) {
    currentProjectMeta.name = trimmed;
    updateProjectIndicator();
  }
}

async function deleteProject(id) {
  if (busy) return;
  await dbDeleteProject(id);
  if (id === currentProjectId) {
    const remaining = await dbAllProjects();
    if (remaining.length > 0) {
      await switchProject(remaining[0].id);
    } else {
      await createProject('默认项目');
    }
  }
}

async function renderProjectList() {
  const list = document.getElementById('projectList');
  if (!list) return;
  const projects = (await dbAllProjects()).sort((a, b) => b.updatedAt - a.updatedAt);
  if (projects.length === 0) {
    list.innerHTML = '<li class="empty-state" style="padding:20px">暂无项目。上面输入名称后点「新建」创建。</li>';
    return;
  }
  list.innerHTML = projects.map(p => {
    const active = p.id === currentProjectId;
    const dataCount = (p.data || []).length;
    const chatCount = (p.chat || []).filter(m => m.role !== 'thinking').length;
    const s = p.settings || {};
    const providerLabel = ({
      openai:'OpenAI', deepseek:'DeepSeek', moonshot:'Moonshot',
      agnes:'Agnes', ollama:'Ollama', lmstudio:'LMStudio', custom:'自定义',
    })[s.provider] || s.provider || '(未配置)';
    const configLine = `${providerLabel} · ${s.model || '(无模型)'}`;
    return `
      <li class="project-item${active ? ' active' : ''}" data-pid="${p.id}">
        <div class="project-info">
          <div class="project-name">${escapeHtml(p.name)}${active ? ' <span style="font-size:11px;color:#6366f1">(当前)</span>' : ''}</div>
          <div class="project-meta">${dataCount} 条卡片 · ${chatCount} 条消息 · ${escapeHtml(configLine)}<br>更新于 ${formatTime(p.updatedAt)}</div>
        </div>
        <div class="project-actions">
          <button class="ghost-btn" data-open="${p.id}">${active ? '已打开' : '打开'}</button>
          <button class="ghost-btn" data-rename="${p.id}">重命名</button>
          <button class="ghost-btn danger" data-delete="${p.id}">删除</button>
        </div>
      </li>
    `;
  }).join('');
}

async function openProjectModal() {
  await renderProjectList();
  document.getElementById('projectModal').hidden = false;
}
function closeProjectModal() {
  document.getElementById('projectModal').hidden = true;
}

async function initProjects() {
  try {
    await openDb();
    let projects = await dbAllProjects();

    // 迁移：localStorage 里有旧数据但 IDB 空 → 包成默认项目一次性导入
    if (projects.length === 0) {
      const lsData     = JSON.parse(localStorage.getItem(STORAGE_KEYS.data)     || '[]');
      const lsChat     = JSON.parse(localStorage.getItem(STORAGE_KEYS.chat)     || '[]');
      const lsSettings = JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) || 'null');
      const migrated   = migrateItemPinning(lsData);
      const now = Date.now();
      await dbPutProject({
        id: uid(), name: '默认项目', createdAt: now, updatedAt: now,
        data: migrated, chat: lsChat,
        settings: lsSettings || { ...state.settings },
      });
      projects = await dbAllProjects();
    } else {
      // 迁移：旧版本已存在的项目记录可能缺 settings 字段（之前 settings 是全局的），
      // 一次性回填并写回 IDB
      let dirty = false;
      for (const p of projects) {
        if (!p.settings) {
          p.settings = { ...state.settings };
          p.updatedAt = Date.now();
          dirty = true;
        }
      }
      if (dirty) {
        for (const p of projects) await dbPutProject(p);
      }
    }

    // 选回上次打开的项目，否则第一个
    const savedId = localStorage.getItem('ta_current_project_v1');
    const target  = projects.find(it => it.id === savedId) || projects[0];
    currentProjectId   = target.id;
    currentProjectMeta = { id: target.id, name: target.name, createdAt: target.createdAt, updatedAt: target.updatedAt };
    state.data     = target.data     || [];
    state.chat     = target.chat     || [];
    state.settings = target.settings || { ...state.settings };
    localStorage.setItem('ta_current_project_v1', target.id);
    saveData(); saveChat(); saveSettings();
  } catch (e) {
    console.warn('项目初始化失败:', e);
  }
  updateProjectIndicator();
}

