(() => {
  let applied = false;
  let currentId = '';
  let layoutScheduled = false;
  let lastHeight = 0;
  let pressTimer = null;
  let pressActive = false;
  let touchActive = false;
  let touchStartPoint = null;
  const moveThreshold = 12;
  let bypassed = false;

  const getPoint = (ev) => {
    try {
      if (ev && ev.touches && ev.touches.length) {
        const t = ev.touches[0];
        return { x: t.clientX || 0, y: t.clientY || 0 };
      }
      if (ev && ev.changedTouches && ev.changedTouches.length) {
        const t = ev.changedTouches[0];
        return { x: t.clientX || 0, y: t.clientY || 0 };
      }
      const x = (ev && typeof ev.clientX === 'number') ? ev.clientX : 0;
      const y = (ev && typeof ev.clientY === 'number') ? ev.clientY : 0;
      return { x, y };
    } catch {
      return { x: 0, y: 0 };
    }
  };

  const sendPress = (phase, ev) => {
    try {
      const p = getPoint(ev);
      parent.postMessage({ type: 'chatapp:iframe-press', id: currentId, phase, x: p.x, y: p.y }, '*');
    } catch {}
  };

  const clearPress = () => {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    if (pressActive) { sendPress('cancel', { clientX: 0, clientY: 0 }); pressActive = false; }
  };

  const startPress = (ev) => {
    clearPress();
    pressActive = true;
    sendPress('down', ev);
    pressTimer = setTimeout(() => {
      sendPress('longpress', ev);
    }, 520);
  };

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

  const postHeight = () => {
    try {
      const rawH = measureContentHeight();
      const h = Math.ceil(Math.max(120, rawH || 0));
      if (h && h !== lastHeight) {
        lastHeight = h;
        parent.postMessage({ type: 'chatapp:iframe-resize', id: currentId, height: h }, '*');
      }
    } catch {}
  };

  const fitToWidth = () => {
    try {
      const docEl = document.documentElement;
      const body = document.body;
      if (!docEl || !body) return;
      body.style.transform = '';
      body.style.width = '';
      docEl.style.overflowX = 'hidden';

      const clientW = Math.max(1, docEl.clientWidth || 1);
      const scrollW = Math.max(body.scrollWidth || 0, docEl.scrollWidth || 0);
      if (scrollW <= clientW + 2) {
        postHeight();
        return;
      }
      let scale = clientW / scrollW;
      if (scale > 0.98) {
        postHeight();
        return;
      }
      const minScale = 0.55;
      scale = Math.max(minScale, Math.min(1, scale));
      body.style.transformOrigin = 'top left';
      body.style.transform = 'scale(' + scale + ')';
      body.style.width = (100 / scale) + '%';
      docEl.style.overflowX = 'hidden';
      postHeight();
    } catch {}
  };

  const requestLayout = () => {
    if (layoutScheduled) return;
    layoutScheduled = true;
    requestAnimationFrame(() => {
      layoutScheduled = false;
      fitToWidth();
      postHeight();
    });
  };

  const bindBridgeEvents = () => {
    document.addEventListener('pointerdown', (ev) => {
      if (touchActive) return;
      startPress(ev);
    }, { passive: true });
    ['pointerup','pointercancel','pointerleave','pointerout'].forEach((t) => {
      document.addEventListener(t, (ev) => {
        if (!pressActive) return;
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
        sendPress('up', ev);
        pressActive = false;
      }, { passive: true });
    });
    document.addEventListener('touchstart', (ev) => {
      touchActive = true;
      touchStartPoint = getPoint(ev);
      startPress(ev);
    }, { passive: true });
    document.addEventListener('touchmove', (ev) => {
      if (!pressActive || !touchStartPoint) return;
      const p = getPoint(ev);
      const dx = p.x - touchStartPoint.x;
      const dy = p.y - touchStartPoint.y;
      if (dx * dx + dy * dy > moveThreshold * moveThreshold) {
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
        sendPress('cancel', ev);
        pressActive = false;
      }
    }, { passive: true });
    document.addEventListener('touchend', (ev) => {
      if (!pressActive) {
        touchActive = false;
        touchStartPoint = null;
        return;
      }
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      sendPress('up', ev);
      pressActive = false;
      touchStartPoint = null;
      setTimeout(() => { touchActive = false; }, 120);
    }, { passive: true });
    document.addEventListener('touchcancel', (ev) => {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      sendPress('cancel', ev);
      pressActive = false;
      touchStartPoint = null;
      setTimeout(() => { touchActive = false; }, 120);
    }, { passive: true });
    document.addEventListener('contextmenu', (ev) => {
      try { ev.preventDefault(); } catch {}
      sendPress('longpress', ev);
    }, { passive: false });
    document.addEventListener('selectstart', (ev) => {
      try { ev.preventDefault(); } catch {}
    }, { passive: false });
    document.addEventListener('toggle', (ev) => {
      if (ev && ev.target && ev.target.tagName === 'DETAILS') requestLayout();
    }, true);
  };

  const applyDoc = (doc, id, options = {}) => {
    if (applied) return;
    applied = true;
    currentId = String(id || '');
    const allowScripts = Boolean(options.allowScripts);
    if (allowScripts) {
      bypassed = true;
      try {
        const html = String(doc || '');
        document.open();
        document.write(html);
        document.close();
        return;
      } catch (err) {
        try {
          const message = String(err?.message || err || 'host write failed');
          parent.postMessage({ type: 'chatapp:iframe-host-error', id, message }, '*');
        } catch {}
        return;
      }
    }
    try {
      const parser = new DOMParser();
      const parsed = parser.parseFromString(String(doc || ''), 'text/html');
      const scripts = [];
      parsed.querySelectorAll('script').forEach(node => {
        if (allowScripts) scripts.push(node);
        node.remove();
      });
      const headStyles = [];
      parsed.querySelectorAll('style').forEach(node => {
        headStyles.push({ type: 'style', text: node.textContent || '' });
        node.remove();
      });
      parsed.querySelectorAll('link[rel="stylesheet"]').forEach(node => {
        const href = String(node.getAttribute('href') || '').trim();
        const isAbsolute = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href);
        const allowed =
          !isAbsolute ||
          /^(data:|blob:|asset:|tauri:|file:)/i.test(href) ||
          (allowScripts && /^https?:/i.test(href));
        if (href && allowed) headStyles.push({ type: 'link', href });
        node.remove();
      });
      document.body.innerHTML = parsed.body ? parsed.body.innerHTML : String(doc || '');
      const bodyClass = parsed.body?.getAttribute?.('class');
      if (bodyClass) document.body.className = bodyClass;
      const existing = document.head.querySelectorAll('[data-chatapp-style]');
      existing.forEach(node => node.remove());
      headStyles.forEach((item) => {
        if (item.type === 'style') {
          const style = document.createElement('style');
          style.setAttribute('data-chatapp-style', '1');
          style.textContent = item.text;
          document.head.appendChild(style);
        } else if (item.type === 'link') {
          const link = document.createElement('link');
          link.setAttribute('data-chatapp-style', '1');
          link.rel = 'stylesheet';
          link.href = item.href;
          document.head.appendChild(link);
        }
      });
      if (allowScripts && scripts.length) {
        const isAllowedScriptSrc = (src) => {
          if (!src) return false;
          const isAbsolute = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(src);
          if (!isAbsolute) return true;
          return /^(https?:|data:|blob:|asset:|tauri:|file:)/i.test(src);
        };
        scripts.forEach((node) => {
          try {
            const script = document.createElement('script');
            for (const attr of Array.from(node.attributes || [])) {
              if (attr.name === 'src') continue;
              script.setAttribute(attr.name, attr.value);
            }
            const src = String(node.getAttribute('src') || '').trim();
            if (src) {
              if (!isAllowedScriptSrc(src)) return;
              script.src = src;
              if (script.type !== 'module') script.async = false;
            } else {
              script.textContent = node.textContent || '';
            }
            document.body.appendChild(script);
          } catch {}
        });
      }
    } catch (err) {
      try {
        const message = String(err?.message || err || 'host parse failed');
        parent.postMessage({ type: 'chatapp:iframe-host-error', id, message }, '*');
      } catch {}
    }
    try {
      parent.postMessage({ type: 'chatapp:iframe-host-ready', id }, '*');
    } catch {}
    bindBridgeEvents();
    requestLayout();
    [50, 150, 300, 600].forEach((ms) => {
      setTimeout(() => { requestLayout(); }, ms);
    });
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
    window.addEventListener('resize', () => setTimeout(() => { requestLayout(); }, 0));
    window.addEventListener('load', () => setTimeout(() => { requestLayout(); }, 0));
    try {
      parent.postMessage({ type: 'chatapp:iframe-ready', id }, '*');
    } catch {}
  };

  window.addEventListener('message', (e) => {
    const data = e?.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'chatapp:iframe-load') {
      applyDoc(data.doc, data.id, { allowScripts: data.allowScripts });
      return;
    }
    if (bypassed) return;
    if (data.type === 'chatapp:updateViewportHeight' && typeof data.height === 'number') {
      document.documentElement.style.setProperty('--viewport-height', data.height + 'px');
      requestLayout();
      return;
    }
    if (data.type === 'chatapp:ping') {
      try {
        parent.postMessage({ type: 'chatapp:pong', id: currentId }, '*');
      } catch {}
    }
  });
})();
