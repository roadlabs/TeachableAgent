// app/idb.js
// IndexedDB 封装（db: TeachableAgent v1, store: projects）

// =====================================================================
// 项目管理 —— IndexedDB
//   项目 = { id, name, createdAt, updatedAt, data, chat }
//   settings 不属于项目，保留在 localStorage 跨项目共享
//   当前项目 id 存 localStorage (ta_current_project_v1)
// =====================================================================
const IDB_NAME    = 'TeachableAgent';
const IDB_VERSION = 1;
const IDB_STORE   = 'projects';

let _dbPromise = null;
function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains(IDB_STORE)) {
        d.createObjectStore(IDB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
  return _dbPromise;
}
async function dbAllProjects() {
  const d = await openDb();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  });
}
async function dbPutProject(p) {
  const d = await openDb();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(p);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}
async function dbDeleteProject(id) {
  const d = await openDb();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

