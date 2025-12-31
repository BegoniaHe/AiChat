import { appSettings } from '../storage/app-settings.js';

export class GeneralSettingsPanel {
  constructor() {
    this.element = null;
    this.overlayElement = null;
    this.debugToggle = null;
    this.typingDotsToggle = null;
    this.richIframeScriptsToggle = null;
    this.creativeHistoryInput = null;
    this.creativeWideToggle = null;
  }

  show() {
    if (!this.element) {
      this.createUI();
    }
    const settings = appSettings.get();
    if (this.debugToggle) {
      this.debugToggle.checked = Boolean(settings.showDebugToggle);
    }
    if (this.typingDotsToggle) {
      this.typingDotsToggle.checked = settings.typingDotsEnabled !== false;
    }
    if (this.richIframeScriptsToggle) {
      this.richIframeScriptsToggle.checked = Boolean(settings.allowRichIframeScripts);
    }
    if (this.creativeHistoryInput) {
      const n = Number(settings.creativeHistoryMax);
      this.creativeHistoryInput.value = String(Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 3);
    }
    if (this.creativeWideToggle) {
      this.creativeWideToggle.checked = Boolean(settings.creativeWideBubble);
    }
    this.applyTypingDotsSetting(settings.typingDotsEnabled !== false);
    this.applyCreativeWideSetting(Boolean(settings.creativeWideBubble));
    this.element.style.display = 'block';
    this.overlayElement.style.display = 'block';
  }

  hide() {
    if (this.element) this.element.style.display = 'none';
    if (this.overlayElement) this.overlayElement.style.display = 'none';
  }

  applyTypingDotsSetting(enabled) {
    if (!document?.body) return;
    if (enabled) {
      delete document.body.dataset.typingDots;
    } else {
      document.body.dataset.typingDots = 'off';
    }
  }

  applyCreativeWideSetting(enabled) {
    if (!document?.body) return;
    if (enabled) {
      document.body.dataset.creativeWide = 'on';
    } else {
      delete document.body.dataset.creativeWide;
    }
  }

  createUI() {
    this.overlayElement = document.createElement('div');
    this.overlayElement.id = 'general-settings-overlay';
    this.overlayElement.style.cssText = `
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 20000;
    `;
    this.overlayElement.onclick = () => this.hide();

    this.element = document.createElement('div');
    this.element.id = 'general-settings-panel';
    this.element.innerHTML = `
      <div style="padding: 18px 20px; background: white; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                  width: 92vw; max-width: 420px; max-height: calc(100vh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 20px); overflow-y: auto;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px;">
          <h2 style="margin: 0; color: #0f172a; font-size: 18px;">通用设定</h2>
          <button id="general-settings-close" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:#0f172a;">×</button>
        </div>
        <div style="color:#64748b; font-size:12px; margin-bottom:16px;">界面与调试相关</div>

        <div style="margin-bottom: 16px;">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
            <input type="checkbox" id="general-debug-toggle" style="width: 18px; height: 18px;">
            <span style="font-weight: 700;">显示 Debug 按钮</span>
          </label>
          <small style="color: #666; margin-left: 26px;">右下角调试按钮，默认隐藏</small>
        </div>

        <div style="margin-bottom: 16px;">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
            <input type="checkbox" id="general-typing-dots" style="width: 18px; height: 18px;">
            <span style="font-weight: 700;">流式小点动画</span>
          </label>
          <small style="color: #666; margin-left: 26px;">关闭后保留静态小点</small>
        </div>

        <div style="margin-bottom: 16px;">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
            <input type="checkbox" id="general-rich-iframe-scripts" style="width: 18px; height: 18px;">
            <span style="font-weight: 700;">富文本 iframe 执行脚本</span>
          </label>
          <small style="color: #666; margin-left: 26px;">高风险：脚本可访问同源数据并加载外部资源，仅信任来源启用</small>
        </div>

        <div style="margin-bottom: 16px;">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
            <input type="checkbox" id="general-creative-wide" style="width: 18px; height: 18px;">
            <span style="font-weight: 700;">创意写作气泡加宽</span>
          </label>
          <small style="color: #666; margin-left: 26px;">仅影响创意写作的回复气泡</small>
        </div>

        <div style="margin-bottom: 16px;">
          <label style="display: flex; align-items: center; gap: 8px;">
            <span style="font-weight: 700;">创意写作注入条数</span>
          </label>
          <div style="margin-top: 6px; display:flex; align-items:center; gap:8px;">
            <input type="number" id="general-creative-history" min="0" step="1"
                   style="width: 120px; padding: 6px 8px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px;">
            <span style="color:#64748b; font-size:12px;">chat_history 中保留的创意写作回复数量</span>
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <button id="general-settings-done" style="padding: 8px 14px; border-radius: 8px; border: 1px solid #e2e8f0;
                                                   background: #f8fafc; cursor: pointer; font-size: 14px; color: #475569;">
            完成
          </button>
        </div>
      </div>
    `;
    this.element.style.cssText = `
      display: none;
      position: fixed;
      top: calc(env(safe-area-inset-top, 0px) + 12px);
      left: 50%;
      transform: translateX(-50%);
      z-index: 21000;
    `;
    this.element.onclick = (e) => e.stopPropagation();

    this.debugToggle = this.element.querySelector('#general-debug-toggle');
    this.typingDotsToggle = this.element.querySelector('#general-typing-dots');
    this.richIframeScriptsToggle = this.element.querySelector('#general-rich-iframe-scripts');
    this.creativeHistoryInput = this.element.querySelector('#general-creative-history');
    this.creativeWideToggle = this.element.querySelector('#general-creative-wide');
    this.debugToggle?.addEventListener('change', async (e) => {
      const enabled = Boolean(e?.target?.checked);
      const settings = appSettings.update({ showDebugToggle: enabled });
      try {
        const { getDebugPanel } = await import('./debug-panel.js');
        const panel = getDebugPanel();
        panel.setEnabled(Boolean(settings.showDebugToggle));
      } catch {}
    });
    this.typingDotsToggle?.addEventListener('change', (e) => {
      const enabled = Boolean(e?.target?.checked);
      const settings = appSettings.update({ typingDotsEnabled: enabled });
      this.applyTypingDotsSetting(settings.typingDotsEnabled !== false);
    });
    this.richIframeScriptsToggle?.addEventListener('change', (e) => {
      const target = e?.target;
      const enabled = Boolean(target?.checked);
      if (enabled) {
        const ok = confirm(
          '启用后，富文本 iframe 将执行其中的脚本并放宽安全限制，脚本可能访问同源数据、加载外部资源，导致敏感信息泄露或设置被篡改。仅在信任来源时启用。确定继续吗？',
        );
        if (!ok) {
          if (target) target.checked = false;
          return;
        }
      }
      appSettings.update({ allowRichIframeScripts: enabled });
    });
    this.creativeWideToggle?.addEventListener('change', (e) => {
      const enabled = Boolean(e?.target?.checked);
      const settings = appSettings.update({ creativeWideBubble: enabled });
      this.applyCreativeWideSetting(Boolean(settings.creativeWideBubble));
    });
    this.creativeHistoryInput?.addEventListener('input', (e) => {
      const raw = e?.target?.value;
      const n = Math.trunc(Number(raw));
      const safe = Number.isFinite(n) ? Math.max(0, n) : 3;
      if (e?.target) e.target.value = String(safe);
      appSettings.update({ creativeHistoryMax: safe });
    });

    this.element.querySelector('#general-settings-close')?.addEventListener('click', () => this.hide());
    this.element.querySelector('#general-settings-done')?.addEventListener('click', () => this.hide());

    document.body.appendChild(this.overlayElement);
    document.body.appendChild(this.element);
  }
}
