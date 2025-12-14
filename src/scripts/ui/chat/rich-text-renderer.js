/**
 * Rich text renderer (safe, no raw HTML injection)
 * - Supports fenced code blocks (```lang ... ```)
 * - For HTML code blocks containing <body>...</body>, render sandboxed iframe preview (ST 酒馆助手风格)
 */

const escapeText = (s) => String(s ?? '');

const splitFencedCodeBlocks = (text) => {
    const src = String(text ?? '');
    const out = [];
    const re = /```([^\n`]*)\r?\n([\s\S]*?)```/g;
    let last = 0;
    let m;
    while ((m = re.exec(src))) {
        if (m.index > last) {
            out.push({ type: 'text', text: src.slice(last, m.index) });
        }
        out.push({ type: 'code', lang: String(m[1] || '').trim().toLowerCase(), code: String(m[2] || '') });
        last = re.lastIndex;
    }
    if (last < src.length) out.push({ type: 'text', text: src.slice(last) });
    return out;
};

const copyToClipboard = async (text) => {
    const s = String(text ?? '');
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(s);
            return true;
        }
    } catch {}
    try {
        const ta = document.createElement('textarea');
        ta.value = s;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '0';
        ta.setAttribute('readonly', 'true');
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
    } catch {
        return false;
    }
};

const buildIframeSrcDoc = (htmlBodyOrDocument, { iframeId, needsVhHandling } = {}) => {
    const content = String(htmlBodyOrDocument ?? '');
    const hasHtml = /<html[\s>]/i.test(content);
    const doc = hasHtml
        ? content
        : `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${content}</body></html>`;

    // Base style: avoid overflowing the phone width; keep layout modern and readable
    const baseStyle = `
<style id="__chatapp_base">
  html, body { margin:0; padding:0; max-width:100% !important; overflow-x:hidden !important; box-sizing:border-box; }
  body { padding: 8px; background: transparent; transform-origin: top left; overflow-x:hidden !important; }
  *, *::before, *::after { box-sizing: border-box; max-width: 100% !important; }
  img, video, canvas, svg { max-width: 100%; height: auto; }
  table { max-width: 100%; display:block; overflow:auto; border-collapse: collapse; }
  pre { max-width: 100%; overflow:auto; white-space: pre-wrap; overflow-wrap: anywhere; }
  code, pre { word-break: break-word; overflow-wrap: anywhere; }
</style>`;

    // Resize observer + postMessage to parent + auto-fit width
    const bridge = `
<script>
(() => {
  const id = ${JSON.stringify(String(iframeId || ''))};
  let lastH = 0;

  const post = () => {
    try {
      const rect = document.body ? document.body.getBoundingClientRect() : null;
      const h = Math.ceil(Math.max(120, rect ? rect.height : 0));
      if (h && h !== lastH) {
        lastH = h;
        parent.postMessage({ type: 'chatapp:iframe-resize', id, height: h }, '*');
      }
    } catch {}
  };

  const fitToWidth = () => {
    try {
      const docEl = document.documentElement;
      const body = document.body;
      if (!docEl || !body) return;
      // reset
      body.style.transform = '';
      body.style.width = '';
      docEl.style.overflowX = 'hidden';

      // Prefer making content responsive via CSS, then scale down to fit phone width (avoid long horizontal scroll).
      const clientW = Math.max(1, docEl.clientWidth || 1);
      const scrollW = Math.max(body.scrollWidth || 0, docEl.scrollWidth || 0);
      if (scrollW <= clientW + 2) {
        post();
        return;
      }

      let scale = clientW / scrollW;
      const minScale = 0.55;
      scale = Math.max(minScale, Math.min(1, scale));
      body.style.transformOrigin = 'top left';
      body.style.transform = 'scale(' + scale + ')';
      body.style.width = (100 / scale) + '%';

      docEl.style.overflowX = 'hidden';
      post();
    } catch {}
  };

  const start = () => {
    fitToWidth();
    post();
    try {
      const ro = new ResizeObserver(() => { fitToWidth(); });
      ro.observe(document.documentElement);
      if (document.body) ro.observe(document.body);
    } catch {
      setInterval(() => { fitToWidth(); }, 500);
    }
    window.addEventListener('load', () => setTimeout(() => { fitToWidth(); }, 0));
    window.addEventListener('resize', () => setTimeout(() => { fitToWidth(); }, 0));
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
</script>`;

    // If user content uses 100vh, provide a stable CSS var like ST does
    const vh = needsVhHandling ? `<style>:root{--viewport-height:${window.innerHeight}px;}</style>` : '';
    const viewportAdjust = needsVhHandling
        ? `<script>
window.addEventListener('message', (e) => {
  if (e && e.data && e.data.type === 'chatapp:updateViewportHeight' && typeof e.data.height === 'number') {
    document.documentElement.style.setProperty('--viewport-height', e.data.height + 'px');
  }
});
</script>`
        : '';

    // Inject base style + scripts
    if (/<\/body>/i.test(doc)) {
        // Try to put style inside <head> if present, otherwise before </body>
        if (/<\/head>/i.test(doc)) {
            const withHead = doc.replace(/<\/head>/i, `${baseStyle}${vh}</head>`);
            return withHead.replace(/<\/body>/i, `${viewportAdjust}${bridge}</body>`);
        }
        return doc.replace(/<\/body>/i, `${baseStyle}${vh}${viewportAdjust}${bridge}</body>`);
    }
    return `${baseStyle}${vh}${viewportAdjust}${doc}${bridge}`;
};

const processAllVhUnits = (htmlContent) => {
    const viewportHeight = window.innerHeight;
    let processed = String(htmlContent ?? '');

    processed = processed.replace(
        /((?:document\.body\.style\.minHeight|\.style\.minHeight|setProperty\s*\(\s*['"]min-height['"])\s*[=,]\s*['"`])([^'"`]*?)(['"`])/g,
        (match, prefix, value, suffix) => {
            if (String(value || '').includes('vh')) {
                const convertedValue = String(value).replace(/(\d+(?:\.\d+)?)vh/g, (num) => {
                    const numValue = parseFloat(num);
                    if (numValue === 100) return `var(--viewport-height, ${viewportHeight}px)`;
                    return `calc(var(--viewport-height, ${viewportHeight}px) * ${numValue / 100})`;
                });
                return prefix + convertedValue + suffix;
            }
            return match;
        }
    );

    processed = processed.replace(/min-height:\s*([^;]*vh[^;]*);/g, (expression) => {
        const processedExpression = String(expression).replace(/(\d+(?:\.\d+)?)vh/g, (num) => {
            const numValue = parseFloat(num);
            if (numValue === 100) return `var(--viewport-height, ${viewportHeight}px)`;
            return `calc(var(--viewport-height, ${viewportHeight}px) * ${numValue / 100})`;
        });
        return `${processedExpression};`;
    });

    processed = processed.replace(
        /style\s*=\s*["']([^"']*min-height:\s*[^"']*vh[^"']*?)["']/gi,
        (match, styleContent) => {
            const processedStyleContent = String(styleContent).replace(/min-height:\s*([^;]*vh[^;]*)/g, (expression) => {
                const processedExpression = String(expression).replace(/(\d+(?:\.\d+)?)vh/g, (num) => {
                    const numValue = parseFloat(num);
                    if (numValue === 100) return `var(--viewport-height, ${viewportHeight}px)`;
                    return `calc(var(--viewport-height, ${viewportHeight}px) * ${numValue / 100})`;
                });
                return processedExpression;
            });
            return match.replace(styleContent, processedStyleContent);
        }
    );

    return processed;
};

const makeCodeBlock = ({ lang, code, messageId }) => {
    const wrap = document.createElement('div');
    wrap.className = 'chat-codeblock';
    wrap.style.cssText = 'border:1px solid rgba(0,0,0,0.10); border-radius:12px; overflow:hidden; margin:8px 0; background:#0b1220;';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 10px; background:rgba(255,255,255,0.06); color:#e2e8f0;';
    const left = document.createElement('div');
    left.style.cssText = 'font-size:12px; font-weight:700; opacity:0.95;';
    left.textContent = lang ? lang : 'code';
    const right = document.createElement('div');
    right.style.cssText = 'display:flex; gap:8px; align-items:center;';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.textContent = '复制';
    copyBtn.style.cssText = 'padding:6px 10px; border-radius:10px; border:1px solid rgba(148,163,184,0.35); background:transparent; color:#e2e8f0; font-size:12px; cursor:pointer;';
    copyBtn.onclick = async () => {
        const ok = await copyToClipboard(code);
        if (ok) window.toastr?.success?.('已复制');
        else window.toastr?.error?.('复制失败');
    };

    right.appendChild(copyBtn);
    header.appendChild(left);
    header.appendChild(right);
    wrap.appendChild(header);

    const body = document.createElement('div');
    body.style.cssText = 'padding:10px; color:#e2e8f0;';

    const pre = document.createElement('pre');
    pre.style.cssText = 'margin:0; white-space:pre; overflow:auto; max-height:420px; font-size:12px; line-height:1.45;';
    const codeEl = document.createElement('code');
    codeEl.textContent = escapeText(code);
    pre.appendChild(codeEl);

    body.appendChild(pre);
    wrap.appendChild(body);

    // HTML preview (ST 酒馆助手：包含 <body> 且 </body> 才自动渲染)
    const looksLikeHtmlDoc = /<body[\s>]/i.test(code) && /<\/body>/i.test(code);
    const isHtmlLang = lang === 'html' || lang === 'htm';
    const looksLikeHtmlSnippet = /<\/(style|div|details|main|section|article|table|ul|ol|p|span|pre|code)>/i.test(code) ||
        /<style[\s>]/i.test(code) ||
        /<details[\s>]/i.test(code) ||
        /<div[\s>]/i.test(code);
    if (looksLikeHtmlDoc || isHtmlLang) {
        const previewBtn = document.createElement('button');
        previewBtn.type = 'button';
        previewBtn.textContent = '预览';
        previewBtn.style.cssText = 'padding:6px 10px; border-radius:10px; border:1px solid rgba(148,163,184,0.35); background:transparent; color:#e2e8f0; font-size:12px; cursor:pointer;';
        const codeBtn = document.createElement('button');
        codeBtn.type = 'button';
        codeBtn.textContent = '代码';
        codeBtn.style.cssText = 'padding:6px 10px; border-radius:10px; border:1px solid rgba(148,163,184,0.35); background:transparent; color:#e2e8f0; font-size:12px; cursor:pointer;';
        right.insertBefore(previewBtn, copyBtn);
        right.insertBefore(codeBtn, copyBtn);

        const previewWrap = document.createElement('div');
        previewWrap.style.cssText = 'background:#fff; border-top:1px solid rgba(0,0,0,0.08); display:none;';
        const iframe = document.createElement('iframe');
        const iframeId = `msg-${String(messageId || 'x')}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
        iframe.dataset.iframeId = iframeId;
        iframe.style.cssText = 'width:100%; border:0; display:block; height:240px;';
        iframe.loading = 'lazy';
        iframe.setAttribute('sandbox', 'allow-scripts'); // no same-origin

        let html = code;
        const hasMinVh = /min-height:\s*[^;]*vh/i.test(html);
        const hasJsVhUsage = /\d+vh/.test(html);
        const needsVhHandling = hasMinVh || hasJsVhUsage;
        if (needsVhHandling) html = processAllVhUnits(html);
        iframe.srcdoc = buildIframeSrcDoc(html, { iframeId, needsVhHandling });
        previewWrap.appendChild(iframe);

        wrap.insertBefore(previewWrap, body);

        const setMode = (mode) => {
            const isPreview = mode === 'preview';
            previewWrap.style.display = isPreview ? 'block' : 'none';
            body.style.display = isPreview ? 'none' : 'block';
            previewBtn.style.background = isPreview ? 'rgba(255,255,255,0.12)' : 'transparent';
            codeBtn.style.background = isPreview ? 'transparent' : 'rgba(255,255,255,0.12)';
            // notify iframe about viewport height changes (for vh handling)
            if (isPreview && needsVhHandling) {
                try {
                    iframe.contentWindow?.postMessage({ type: 'chatapp:updateViewportHeight', height: window.innerHeight }, '*');
                } catch {}
            }
        };

        previewBtn.onclick = () => setMode('preview');
        codeBtn.onclick = () => setMode('code');

        // Default: match ST 酒馆助手体验（渲染后不展示原始代码块）
        // 若确实需要看源码，可手动点「代码」。
        if (looksLikeHtmlDoc || (isHtmlLang && looksLikeHtmlSnippet)) {
            setMode('preview');
        } else {
            setMode('code');
        }
    }

    return wrap;
};

export const setupIframeResizeListener = () => {
    if (window.__chatappIframeResizeListenerInstalled) return;
    window.__chatappIframeResizeListenerInstalled = true;

    window.addEventListener('message', (e) => {
        const data = e?.data;
        if (!data || typeof data !== 'object') return;
        if (data.type !== 'chatapp:iframe-resize') return;
        const id = String(data.id || '');
        const height = Number(data.height);
        if (!id || !Number.isFinite(height)) return;
        const esc = (CSS && typeof CSS.escape === 'function') ? CSS.escape : (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
        const iframe = document.querySelector(`iframe[data-iframe-id="${esc(id)}"]`);
        if (!iframe) return;
        const clamped = Math.max(120, Math.min(height + 4, 2000));
        iframe.style.height = `${clamped}px`;
    });
};

export const renderRichText = (containerEl, text, { messageId } = {}) => {
    if (!containerEl) return;
    containerEl.innerHTML = '';

    const rawText = String(text ?? '');
    // 酒馆助手/正则常见用法：
    // - 直接把可渲染的 HTML 片段塞进消息（例如把 <thinking> 替换为 <style>+<details>）
    // 我们保持默认安全文本渲染，但对“明显是 HTML 的整段消息”提供 iframe 渲染（沙盒）
    const trimmed = rawText.trim();
    const wholeLooksLikeHtml = (
        trimmed.startsWith('<') &&
        (/<style[\s>]/i.test(trimmed) || /<details[\s>]/i.test(trimmed) || /<div[\s>]/i.test(trimmed) || /<body[\s>]/i.test(trimmed)) &&
        /<\/[a-z][a-z0-9]*\s*>/i.test(trimmed)
    );
    const parts = (/```/.test(rawText) ? splitFencedCodeBlocks(rawText)
        : wholeLooksLikeHtml
            ? [{ type: 'code', lang: 'html', code: trimmed }]
            : [{ type: 'text', text: rawText }]);
    parts.forEach((p) => {
        if (p.type === 'code') {
            containerEl.appendChild(makeCodeBlock({ lang: p.lang, code: p.code, messageId }));
            return;
        }

        // Plain text: preserve newlines safely
        const chunk = String(p.text || '');
        const lines = chunk.split(/\n/);
        lines.forEach((line, idx) => {
            const span = document.createElement('span');
            span.textContent = escapeText(line);
            containerEl.appendChild(span);
            if (idx !== lines.length - 1) containerEl.appendChild(document.createElement('br'));
        });
    });
};
