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

const buildIframeSrcDoc = (htmlBodyOrDocument, { iframeId, needsVhHandling, preserveNewlines } = {}) => {
    const content = String(htmlBodyOrDocument ?? '');
    const hasHtml = /<html[\s>]/i.test(content);
    const prewrapStyle = preserveNewlines
        ? `
<style id="__chatapp_prewrap">
  .__chatapp-prewrap,
  .__chatapp-prewrap p,
  .__chatapp-prewrap div,
  .__chatapp-prewrap span,
  .__chatapp-prewrap li {
    white-space: pre-wrap !important;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
</style>`
        : '';

    const addBodyClass = (html, className) => {
        if (!className) return html;
        return String(html).replace(/<body([^>]*)>/i, (match, attrs) => {
            const rawAttrs = String(attrs || '');
            if (/class\s*=/i.test(rawAttrs)) {
                return match.replace(/class\s*=\s*(['"])(.*?)\1/i, (m, q, val) => {
                    const next = String(val || '').trim();
                    const merged = next ? `${next} ${className}` : className;
                    return `class=${q}${merged}${q}`;
                });
            }
            return `<body${rawAttrs} class="${className}">`;
        });
    };

    let doc = '';
    if (hasHtml) {
        doc = preserveNewlines ? addBodyClass(content, '__chatapp-prewrap') : content;
    } else {
        const bodyClass = preserveNewlines ? ' class="__chatapp-prewrap"' : '';
        const wrapped = preserveNewlines ? `<div class="__chatapp-prewrap">${content}</div>` : content;
        doc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body${bodyClass}>${wrapped}</body></html>`;
    }

    // Base style: avoid overflowing the phone width; keep layout modern and readable
    const baseStyle = `
<style id="__chatapp_base">
  html, body { margin:0; padding:0; max-width:100% !important; width:100% !important; min-height:0 !important; height:auto !important; overflow-x:hidden !important; box-sizing:border-box; -webkit-user-select:none; user-select:none; -webkit-touch-callout:none; }
  body { padding: 8px; background: transparent; transform-origin: top left; overflow-x:hidden !important; -webkit-user-select:none; user-select:none; -webkit-touch-callout:none; display:block !important; align-items:flex-start !important; justify-content:flex-start !important; }
  *, *::before, *::after { box-sizing: border-box; max-width: 100% !important; min-width: 0 !important; }
  details, summary { max-width: 100% !important; }
  details[open] { max-height: none !important; overflow: visible !important; }
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
  let pressTimer = null;
  let pressActive = false;

  const measureContentHeight = () => {
    try {
      const body = document.body;
      if (!body) return 0;
      const kids = Array.from(body.children || []);
      if (!kids.length) {
        const rect = body.getBoundingClientRect();
        return rect ? rect.height : 0;
      }
      let minTop = null;
      let maxBottom = null;
      kids.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (!rect || rect.height <= 0) return;
        if (minTop === null || rect.top < minTop) minTop = rect.top;
        if (maxBottom === null || rect.bottom > maxBottom) maxBottom = rect.bottom;
      });
      if (minTop === null || maxBottom === null) {
        const rect = body.getBoundingClientRect();
        return rect ? rect.height : 0;
      }
      const padTop = parseFloat(getComputedStyle(body).paddingTop || '0') || 0;
      const padBottom = parseFloat(getComputedStyle(body).paddingBottom || '0') || 0;
      return Math.max(0, maxBottom - minTop) + padTop + padBottom;
    } catch {
      return 0;
    }
  };

  const post = () => {
    try {
      const rawH = measureContentHeight();
      const h = Math.ceil(Math.max(120, rawH || 0));
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
      if (scale > 0.98) {
        post();
        return;
      }
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
    const stripBodyWhitespace = () => {
      try {
        const body = document.body;
        if (!body) return;
        Array.from(body.childNodes || []).forEach((node) => {
          if (node && node.nodeType === Node.TEXT_NODE && !String(node.textContent || '').trim()) {
            node.remove();
          }
        });
      } catch {}
    };
    const clampOversizedBlocks = () => {
      try {
        const body = document.body;
        const docEl = document.documentElement;
        if (!body || !docEl) return;
        const vh = Math.max(docEl.clientHeight || 0, window.innerHeight || 0);
        if (!vh) return;
        const nodes = body.querySelectorAll('*');
        nodes.forEach((el) => {
          const style = window.getComputedStyle(el);
          const display = String(style.display || '');
          if (display.includes('flex') || display.includes('grid')) {
            const align = String(style.alignItems || '');
            const justify = String(style.justifyContent || '');
            if (align.includes('center')) el.style.alignItems = 'flex-start';
            if (justify.includes('center')) el.style.justifyContent = 'flex-start';
          }
          const minH = parseFloat(style.minHeight || '');
          if (Number.isFinite(minH) && minH >= vh * 0.9) {
            el.style.minHeight = 'auto';
          }
          const h = parseFloat(style.height || '');
          if (Number.isFinite(h) && h >= vh * 0.9) {
            el.style.height = 'auto';
          }
          const maxH = parseFloat(style.maxHeight || '');
          if (Number.isFinite(maxH) && maxH >= vh * 0.9) {
            el.style.maxHeight = 'none';
          }
          const mt = parseFloat(style.marginTop || '');
          const mb = parseFloat(style.marginBottom || '');
          if (Number.isFinite(mt) && mt >= 48) el.style.marginTop = '16px';
          if (Number.isFinite(mb) && mb >= 48) el.style.marginBottom = '16px';
          const pt = parseFloat(style.paddingTop || '');
          const pb = parseFloat(style.paddingBottom || '');
          if (Number.isFinite(pt) && pt >= 64) el.style.paddingTop = '16px';
          if (Number.isFinite(pb) && pb >= 64) el.style.paddingBottom = '16px';
        });
      } catch {}
    };

    // Forward long-press gestures to parent (iframe events don't bubble to outer document)
    const sendPress = (phase, ev) => {
      try {
        const x = (ev && typeof ev.clientX === 'number') ? ev.clientX : 0;
        const y = (ev && typeof ev.clientY === 'number') ? ev.clientY : 0;
        parent.postMessage({ type: 'chatapp:iframe-press', id, phase, x, y }, '*');
      } catch {}
    };
    const clear = () => {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      if (pressActive) { sendPress('cancel', { clientX: 0, clientY: 0 }); pressActive = false; }
    };
    document.addEventListener('pointerdown', (ev) => {
      try { ev.preventDefault(); } catch {}
      clear();
      pressActive = true;
      sendPress('down', ev);
      pressTimer = setTimeout(() => {
        sendPress('longpress', ev);
      }, 520);
    }, { passive: false });
    ['pointerup','pointercancel','pointerleave','pointerout'].forEach((t) => {
      document.addEventListener(t, (ev) => {
        if (!pressActive) return;
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
        sendPress('up', ev);
        pressActive = false;
      }, { passive: true });
    });
    // Some WebViews trigger text selection / native menu via contextmenu on long-press
    document.addEventListener('contextmenu', (ev) => {
      try { ev.preventDefault(); } catch {}
      sendPress('longpress', ev);
    }, { passive: false });
    document.addEventListener('selectstart', (ev) => {
      try { ev.preventDefault(); } catch {}
    }, { passive: false });

    const requestLayout = (() => {
      let rafId = null;
      return () => {
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
          rafId = null;
          stripBodyWhitespace();
          clampOversizedBlocks();
          fitToWidth();
          post();
        });
      };
    })();

    requestLayout();

    document.addEventListener('toggle', (ev) => {
      if (ev && ev.target && ev.target.tagName === 'DETAILS') requestLayout();
    }, true);

    try {
      const ro = new ResizeObserver(() => { requestLayout(); });
      ro.observe(document.documentElement);
      if (document.body) ro.observe(document.body);
    } catch {
      setInterval(() => { requestLayout(); }, 500);
    }
    try {
      const mo = new MutationObserver(() => { requestLayout(); });
      if (document.body) mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    } catch {}
    window.addEventListener('load', () => setTimeout(() => { requestLayout(); }, 0));
    window.addEventListener('resize', () => setTimeout(() => { requestLayout(); }, 0));
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
            const withHead = doc.replace(/<\/head>/i, `${baseStyle}${prewrapStyle}${vh}</head>`);
            return withHead.replace(/<\/body>/i, `${viewportAdjust}${bridge}</body>`);
        }
        return doc.replace(/<\/body>/i, `${baseStyle}${prewrapStyle}${vh}${viewportAdjust}${bridge}</body>`);
    }
    return `${baseStyle}${prewrapStyle}${vh}${viewportAdjust}${doc}${bridge}`;
};

const injectHtmlNewlines = (html) => {
    const raw = String(html ?? '');
    if (!raw.includes('\n')) return raw;
    const protectedRe = /<(style|script)[^>]*>[\s\S]*?<\/\1>/gi;
    const chunks = [];
    let last = 0;
    let m;
    while ((m = protectedRe.exec(raw))) {
        if (m.index > last) chunks.push({ kind: 'text', value: raw.slice(last, m.index) });
        chunks.push({ kind: 'raw', value: m[0] });
        last = protectedRe.lastIndex;
    }
    if (last < raw.length) chunks.push({ kind: 'text', value: raw.slice(last) });
    return chunks
        .map(chunk => {
            if (chunk.kind !== 'text') return chunk.value;
            const parts = String(chunk.value || '').split(/(<[^>]+>)/g);
            return parts.map(part => {
                if (!part) return part;
                if (part.startsWith('<')) return part;
                if (!part.trim()) return part;
                return part.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '<br>');
            }).join('');
        })
        .join('');
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

const makeCodeBlock = ({ lang, code, messageId, preserveHtmlNewlines = false }) => {
    const wrap = document.createElement('div');
    wrap.className = 'chat-codeblock';
    wrap.style.cssText = 'border:1px solid rgba(0,0,0,0.10); border-radius:12px; overflow:hidden; margin:8px 0;';
    // Store payload for long-press menu actions (no inline buttons)
    wrap.__chatappCode = String(code ?? '');
    wrap.__chatappLang = String(lang || '');

    // HTML preview (ST 酒馆助手：包含 <body> 且 </body> 才自动渲染)
    const looksLikeHtmlDoc = /<body[\s>]/i.test(code) && /<\/body>/i.test(code);
    const isHtmlLang = lang === 'html' || lang === 'htm';
    const looksLikeHtmlSnippet = /<\/(style|div|details|main|section|article|table|ul|ol|p|span|pre|code)>/i.test(code) ||
        /<style[\s>]/i.test(code) ||
        /<details[\s>]/i.test(code) ||
        /<div[\s>]/i.test(code);
    if (looksLikeHtmlDoc || isHtmlLang) {
        const previewWrap = document.createElement('div');
        previewWrap.style.cssText = 'background:#fff;';
        const iframe = document.createElement('iframe');
        const iframeId = `msg-${String(messageId || 'x')}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
        iframe.dataset.iframeId = iframeId;
        iframe.dataset.msgId = String(messageId || '');
        iframe.style.cssText = 'width:100%; border:0; display:block; height:240px; background:#fff;';
        iframe.loading = 'lazy';
        iframe.setAttribute('sandbox', 'allow-scripts'); // no same-origin

        let html = preserveHtmlNewlines ? injectHtmlNewlines(code) : code;
        const hasMinVh = /min-height:\s*[^;]*vh/i.test(html);
        const hasJsVhUsage = /\d+vh/.test(html);
        const needsVhHandling = hasMinVh || hasJsVhUsage;
        if (needsVhHandling) html = processAllVhUnits(html);
        iframe.srcdoc = buildIframeSrcDoc(html, { iframeId, needsVhHandling, preserveNewlines: false });
        previewWrap.appendChild(iframe);

        wrap.appendChild(previewWrap);
        // Match ST 酒馆助手体验：渲染后不显示源码（源码/复制转移到长按菜单）

        // notify iframe about viewport height changes (for vh handling)
        if (needsVhHandling) {
            setTimeout(() => {
                try { iframe.contentWindow?.postMessage({ type: 'chatapp:updateViewportHeight', height: window.innerHeight }, '*'); } catch {}
            }, 0);
        }
    }

    // Default code block (mobile wrapped, no horizontal scrolling)
    if (!(looksLikeHtmlDoc || isHtmlLang)) {
        const body = document.createElement('div');
        body.style.cssText = 'padding:10px; color:#e2e8f0; background:#0b1220;';
        const pre = document.createElement('pre');
        pre.style.cssText = 'margin:0; white-space:pre-wrap; overflow-x:hidden; overflow-y:auto; max-height:420px; font-size:12px; line-height:1.45; overflow-wrap:anywhere; word-break:break-word;';
        const codeEl = document.createElement('code');
        codeEl.textContent = escapeText(code);
        pre.appendChild(codeEl);
        body.appendChild(pre);
        wrap.appendChild(body);
    }

    return wrap;
};

export const setupIframeResizeListener = () => {
    if (window.__chatappIframeResizeListenerInstalled) return;
    window.__chatappIframeResizeListenerInstalled = true;

    window.addEventListener('message', (e) => {
        const data = e?.data;
        if (!data || typeof data !== 'object') return;
        const esc = (CSS && typeof CSS.escape === 'function') ? CSS.escape : (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
        if (data.type === 'chatapp:iframe-resize') {
            const id = String(data.id || '');
            const height = Number(data.height);
            if (!id || !Number.isFinite(height)) return;
            const iframe = document.querySelector(`iframe[data-iframe-id="${esc(id)}"]`);
            if (!iframe) return;
            const clamped = Math.max(120, Math.min(height + 4, 2000));
            iframe.style.height = `${clamped}px`;
            return;
        }

        // Forward iframe pointer events to outer UI (for long-press context menu)
        if (data.type === 'chatapp:iframe-press') {
            const id = String(data.id || '');
            const phase = String(data.phase || '');
            const x = Number(data.x);
            const y = Number(data.y);
            if (!id || !phase || !Number.isFinite(x) || !Number.isFinite(y)) return;
            const iframe = document.querySelector(`iframe[data-iframe-id="${esc(id)}"]`);
            if (!iframe) return;
            const rect = iframe.getBoundingClientRect();
            const clientX = rect.left + x;
            const clientY = rect.top + y;
            const msgId = String(iframe.dataset.msgId || '');
            window.dispatchEvent(new CustomEvent('chatapp-iframe-press', {
                detail: { id, phase, clientX, clientY, msgId }
            }));
        }
    });
};

export const renderRichText = (containerEl, text, { messageId, preserveHtmlNewlines = false } = {}) => {
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
    const textWithBreaks = rawText
        .replace(/&lt;br\s*\/?&gt;/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n');
    const hasCodeFence = /```/.test(rawText);
    let parts = (hasCodeFence ? splitFencedCodeBlocks(rawText)
        : wholeLooksLikeHtml
            ? [{ type: 'code', lang: 'html', code: trimmed }]
            : [{ type: 'text', text: textWithBreaks }]);
    if (hasCodeFence) {
        parts = parts.map(p => {
            if (p.type !== 'text') return p;
            const normalized = String(p.text || '')
                .replace(/&lt;br\s*\/?&gt;/gi, '\n')
                .replace(/<br\s*\/?>/gi, '\n');
            return { ...p, text: normalized };
        });
    }
    parts.forEach((p) => {
        if (p.type === 'code') {
            containerEl.appendChild(makeCodeBlock({
                lang: p.lang,
                code: p.code,
                messageId,
                preserveHtmlNewlines,
            }));
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
