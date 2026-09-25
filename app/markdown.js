// app/markdown.js
// 富文本渲染：marked → DOMPurify → KaTeX auto-render + HTML 代码块预览切换
// 依赖：vendor/marked, vendor/katex, vendor/dompurify, vendor/auto-render

// 助手消息富渲染：markdown → DOMPurify 消毒 → 注入 .msg.assistant
// KaTeX 公式 ($...$ / $$...$$ / \(...\) / \[...\]) 由 renderMathInElement
// 在外层容器上扫描文本节点后渲染；markdown 解析时不要开 breaks:true
// 否则单换行变 <br>，会切断跨行的 $$...$$ 公式定界符
function renderAssistantHtml(text) {
  if (text == null) return '';
  const rawHtml = marked.parse(String(text), { gfm: true });
  return DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } });
}

// HTML 实体反转义 —— marked 把 ```html 块里的 < > 编码成 &lt; &gt;
// 这里反解回来拿到原始 HTML 字符串，供 srcdoc 和预览面板使用
function decodeHtmlEntities(s) {
  const tmp = document.createElement('textarea');
  tmp.innerHTML = s;
  return tmp.value;
}

// HTML 代码块增强：把 <pre><code class="language-html"> 替换为带 tab 切换的
// 「代码 / 预览」widget。预览面板用最严格沙箱的 iframe (sandbox="" 无任何
// allow-*) —— LLM 输出的 <script>、事件处理器、form 提交、跨源请求全部失效
function enhanceHtmlCodeBlocks(container) {
  const blocks = container.querySelectorAll('pre > code.language-html');
  blocks.forEach(codeEl => {
    const pre = codeEl.parentElement;
    const html = decodeHtmlEntities(codeEl.textContent);
    const wrap = document.createElement('div');
    wrap.className = 'html-preview';
    wrap.setAttribute('data-state', 'code');
    wrap.innerHTML = `
      <div class="html-preview-tabs">
        <span class="html-preview-lang">HTML</span>
        <div class="html-preview-tabs-right">
          <button class="html-preview-tab active" data-view="code">代码</button>
          <button class="html-preview-tab" data-view="preview">预览</button>
        </div>
      </div>
      <div class="html-preview-body">
        <pre class="html-source"><code>${escapeHtml(html)}</code></pre>
        <iframe class="html-frame" sandbox srcdoc="${escapeHtml(html)}" loading="lazy"></iframe>
      </div>
    `;
    pre.replaceWith(wrap);
  });
}

