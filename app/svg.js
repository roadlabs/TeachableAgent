// app/svg.js
// SVG 连接线动画 + 飞气泡（flyText）+ 小球滚动（emitBall）+ 发光滤镜
// 依赖：浏览器 DOM/SVG

function flyText(sourceEl, targetEl, text, type, durMs = 650) {
  return new Promise(resolve => {
    if (!text || !sourceEl || !targetEl) { resolve(); return; }
    const flyer = document.createElement('div');
    flyer.className = 'text-flyer' + (type === 'output' ? ' output' : '');
    flyer.textContent = text.length > 30 ? text.slice(0, 30) + '…' : text;

    const sRect = sourceEl.getBoundingClientRect();
    const tRect = targetEl.getBoundingClientRect();
    const sx = sRect.left + sRect.width  / 2;
    const sy = sRect.top  + sRect.height / 2;
    const ex = tRect.left + tRect.width  / 2;
    const ey = tRect.top  + tRect.height / 2;

    flyer.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%)`;
    document.body.appendChild(flyer);

    requestAnimationFrame(() => {
      const rot = (Math.random() - 0.5) * 10;
      flyer.style.transition = `transform ${durMs}ms cubic-bezier(0.34, 1.2, 0.64, 1), opacity ${Math.round(durMs * 0.7)}ms ease-in`;
      flyer.style.transform = `translate(${ex}px, ${ey}px) translate(-50%, -50%) scale(0.5) rotate(${rot}deg)`;
      flyer.style.opacity = '0';
    });

    setTimeout(() => {
      if (flyer.parentNode) flyer.parentNode.removeChild(flyer);
      resolve();
    }, durMs);
  });
}


// =====================================================================
// SVG connection paths
// =====================================================================
function updateConnectionPaths() {
  const overlay = document.getElementById('connectionsOverlay');
  const uiLayer   = document.getElementById('uiLayer');
  const dataLayer = document.getElementById('dataLayer');
  const apiLayer  = document.getElementById('apiLayer');
  if (!uiLayer || !dataLayer || !apiLayer) return;

  const ws = document.querySelector('.workspace').getBoundingClientRect();
  const ui   = uiLayer.getBoundingClientRect();
  const data = dataLayer.getBoundingClientRect();
  const api  = apiLayer.getBoundingClientRect();

  // viewBox 覆盖整个 workspace
  overlay.setAttribute('viewBox', `0 0 ${ws.width} ${ws.height}`);

  const yMid = (ui.top + ui.bottom) / 2 - ws.top;

  // Path 1: UI 右边 → Data 左边
  const x1a = ui.right  - ws.left;
  const x1b = data.left - ws.left;
  const c1a = x1a + (x1b - x1a) * 0.5;
  const c1b = x1b - (x1b - x1a) * 0.5;
  document.getElementById('path1').setAttribute('d',
    `M ${x1a} ${yMid} C ${c1a} ${yMid}, ${c1b} ${yMid}, ${x1b} ${yMid}`);

  // Path 2: Data 右边 → API 左边
  const x2a = data.right - ws.left;
  const x2b = api.left   - ws.left;
  const c2a = x2a + (x2b - x2a) * 0.5;
  const c2b = x2b - (x2b - x2a) * 0.5;
  document.getElementById('path2').setAttribute('d',
    `M ${x2a} ${yMid} C ${c2a} ${yMid}, ${c2b} ${yMid}, ${x2b} ${yMid}`);
}

// 在连接线上发射一个滚动小球
// 返回 Promise，在小球到达终点后 resolve
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// 创建/获取 glow 滤镜（按颜色缓存）
function ensureGlowFilter(filterId, color) {
  const overlay = document.getElementById('connectionsOverlay');
  let defs = overlay.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    overlay.insertBefore(defs, overlay.firstChild);
  }
  if (document.getElementById(filterId)) return;

  const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
  filter.setAttribute('id', filterId);
  filter.setAttribute('x', '-100%');
  filter.setAttribute('y', '-100%');
  filter.setAttribute('width', '300%');
  filter.setAttribute('height', '300%');

  const blur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
  blur.setAttribute('stdDeviation', '3.5');
  blur.setAttribute('result', 'blur');

  const flood = document.createElementNS('http://www.w3.org/2000/svg', 'feFlood');
  flood.setAttribute('flood-color', color);
  flood.setAttribute('flood-opacity', '0.85');
  flood.setAttribute('result', 'c');

  const composite = document.createElementNS('http://www.w3.org/2000/svg', 'feComposite');
  composite.setAttribute('in', 'c');
  composite.setAttribute('in2', 'blur');
  composite.setAttribute('operator', 'in');
  composite.setAttribute('result', 'glow');

  const merge = document.createElementNS('http://www.w3.org/2000/svg', 'feMerge');
  const m1 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
  m1.setAttribute('in', 'glow');
  const m2 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
  m2.setAttribute('in', 'SourceGraphic');
  merge.appendChild(m1);
  merge.appendChild(m2);

  filter.appendChild(blur);
  filter.appendChild(flood);
  filter.appendChild(composite);
  filter.appendChild(merge);
  defs.appendChild(filter);
}

// 沿线发射一个滚动小球
// reverse=true 时沿路径反向滚动（用于"回程"动画）
function emitBall(groupId, pathId, color, durMs, activeClass, reverse = false) {
  return new Promise(resolve => {
    const group = document.getElementById(groupId);
    const path  = document.getElementById(pathId);
    const NS    = 'http://www.w3.org/2000/svg';

    const filterId = 'glow-' + color.replace(/[^a-z0-9]/gi, '');
    ensureGlowFilter(filterId, color);

    const ball = document.createElementNS(NS, 'circle');
    ball.setAttribute('class', 'ball');
    ball.setAttribute('r', '9');
    ball.setAttribute('fill', color);
    ball.setAttribute('opacity', '0');
    ball.setAttribute('filter', 'url(#' + filterId + ')');

    const motion = document.createElementNS(NS, 'animateMotion');
    motion.setAttribute('dur', durMs + 'ms');
    motion.setAttribute('fill', 'freeze');
    motion.setAttribute('calcMode', 'linear');
    if (reverse) {
      motion.setAttribute('keyPoints', '1;0');
      motion.setAttribute('keyTimes', '0;1');
    }
    const mpath = document.createElementNS(NS, 'mpath');
    mpath.setAttributeNS('http://www.w3.org/1999/xlink', 'href', '#' + pathId);
    motion.appendChild(mpath);

    const fade = document.createElementNS(NS, 'animate');
    fade.setAttribute('attributeName', 'opacity');
    fade.setAttribute('values', '0;1;1;0');
    fade.setAttribute('keyTimes', '0;0.1;0.9;1');
    fade.setAttribute('dur', durMs + 'ms');
    fade.setAttribute('fill', 'freeze');

    ball.appendChild(motion);
    ball.appendChild(fade);
    group.appendChild(ball);

    if (activeClass) path.classList.add(activeClass);

    const cleanup = () => {
      if (activeClass) path.classList.remove(activeClass);
      if (ball.parentNode) ball.parentNode.removeChild(ball);
      resolve();
    };
    // 用 setTimeout 兜底；SMIL 的 endEvent 偶发不可靠
    setTimeout(cleanup, durMs);
  });
}

