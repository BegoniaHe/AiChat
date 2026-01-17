/**
 * Debug panel - show config status on screen for Android debugging
 */

import { appSettings } from '../storage/app-settings.js';

export class DebugPanel {
    constructor() {
        this.panel = null;
        this.logContainer = null;
        this.controls = null;
        this.logs = [];
        this.maxLogs = 30;
        this.isVisible = false;
        this.autoHideTimer = null;
        this.toggleBtn = null;
        this.enabled = false;
        this.seenMessages = new Set();
        this.smokeBtn = null;
        this.smokeTestRunning = false;
        this.smokeRunId = 0;
        this.memoryModeBtn = null;
        this.memoryInspectBtn = null;
        this.filterInput = null;
        this.filterClearBtn = null;
        this.filterText = '';
        this.memoryInspectorOverlay = null;
        this.memoryInspectorPanel = null;
        this.memoryInspectorMeta = null;
        this.memoryInspectorTokens = null;
        this.memoryInspectorIncluded = null;
        this.memoryInspectorTruncated = null;
        this.memoryInspectorPrompt = null;
        this.memoryInspectorRefresh = null;
    }

    init() {
        if (this.panel) return;

        this.panel = document.createElement('div');
        this.panel.id = 'debug-panel';
        this.panel.style.cssText = `
            position: fixed;
            bottom: calc(60px + env(safe-area-inset-bottom, 0px));
            left: 0;
            right: 0;
            max-height: 250px;
            background: rgba(0, 0, 0, 0.95);
            color: #00ff00;
            font-family: monospace;
            font-size: 10px;
            padding: 8px;
            z-index: 30000;
            display: none;
            border-top: 2px solid #00ff00;
            box-sizing: border-box;
            flex-direction: column;
        `;

        this.controls = document.createElement('div');
        this.controls.style.cssText = `
            display: flex;
            align-items: center;
            gap: 6px;
            padding-bottom: 6px;
            margin-bottom: 6px;
            border-bottom: 1px dashed #00ff00;
        `;

        const smokeBtn = document.createElement('button');
        smokeBtn.type = 'button';
        smokeBtn.textContent = 'DB 烟测';
        smokeBtn.style.cssText = `
            padding: 2px 6px;
            background: rgba(0, 0, 0, 0.8);
            color: #00ff00;
            border: 1px solid #00ff00;
            border-radius: 4px;
            font-size: 10px;
            font-family: monospace;
            cursor: pointer;
        `;
        smokeBtn.onclick = () => this.runMemoryDbSmokeTest();
        this.smokeBtn = smokeBtn;
        this.controls.appendChild(smokeBtn);

        const inspectBtn = document.createElement('button');
        inspectBtn.type = 'button';
        inspectBtn.textContent = '记忆检查器';
        inspectBtn.style.cssText = `
            padding: 2px 6px;
            background: rgba(0, 0, 0, 0.8);
            color: #00ff00;
            border: 1px solid #00ff00;
            border-radius: 4px;
            font-size: 10px;
            font-family: monospace;
            cursor: pointer;
        `;
        inspectBtn.onclick = () => this.showMemoryInspector();
        this.memoryInspectBtn = inspectBtn;
        this.controls.appendChild(inspectBtn);

        const memoryModeBtn = document.createElement('button');
        memoryModeBtn.type = 'button';
        memoryModeBtn.style.cssText = `
            padding: 2px 6px;
            background: rgba(0, 0, 0, 0.8);
            color: #00ff00;
            border: 1px solid #00ff00;
            border-radius: 4px;
            font-size: 10px;
            font-family: monospace;
            cursor: pointer;
        `;
        memoryModeBtn.onclick = () => this.toggleMemoryMode();
        this.memoryModeBtn = memoryModeBtn;
        this.controls.appendChild(memoryModeBtn);

        const filterWrap = document.createElement('div');
        filterWrap.style.cssText = `
            display: flex;
            align-items: center;
            gap: 4px;
            margin-left: auto;
        `;
        const filterInput = document.createElement('input');
        filterInput.type = 'text';
        filterInput.placeholder = '筛选日志...';
        filterInput.style.cssText = `
            width: 120px;
            padding: 2px 6px;
            background: rgba(0, 0, 0, 0.8);
            color: #00ff00;
            border: 1px solid #00ff00;
            border-radius: 4px;
            font-size: 10px;
            font-family: monospace;
            outline: none;
        `;
        const filterClearBtn = document.createElement('button');
        filterClearBtn.type = 'button';
        filterClearBtn.textContent = '×';
        filterClearBtn.style.cssText = `
            padding: 2px 6px;
            background: rgba(0, 0, 0, 0.8);
            color: #00ff00;
            border: 1px solid #00ff00;
            border-radius: 4px;
            font-size: 10px;
            font-family: monospace;
            cursor: pointer;
            opacity: 0.8;
        `;
        filterInput.addEventListener('input', (e) => {
            const val = String(e?.target?.value || '');
            this.filterText = val;
            this.render();
        });
        filterClearBtn.onclick = () => {
            this.filterText = '';
            filterInput.value = '';
            this.render();
            filterInput.focus();
        };
        filterWrap.appendChild(filterInput);
        filterWrap.appendChild(filterClearBtn);
        this.controls.appendChild(filterWrap);
        this.filterInput = filterInput;
        this.filterClearBtn = filterClearBtn;

        this.logContainer = document.createElement('div');
        this.logContainer.style.cssText = `
            flex: 1;
            min-height: 0;
            overflow-y: auto;
        `;

        this.panel.appendChild(this.controls);
        this.panel.appendChild(this.logContainer);

        document.body.appendChild(this.panel);

        // 添加一个小按钮来切换显示
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'debug-toggle';
        toggleBtn.textContent = 'DEBUG';
        toggleBtn.style.cssText = `
            position: fixed;
            bottom: calc(70px + env(safe-area-inset-bottom, 0px));
            right: 10px;
            padding: 4px 8px;
            background: rgba(0, 0, 0, 0.8);
            color: #00ff00;
            border: 1px solid #00ff00;
            border-radius: 4px;
            font-size: 10px;
            z-index: 30001;
            font-family: monospace;
            font-weight: bold;
        `;
        toggleBtn.onclick = () => this.toggle();
        document.body.appendChild(toggleBtn);
        this.toggleBtn = toggleBtn;

        const settings = appSettings.get();
        this.setEnabled(Boolean(settings.showDebugToggle));
        this.updateMemoryModeButton();
        window.addEventListener('app-settings-changed', (ev) => {
            try {
                if (ev?.detail?.key === 'memoryStorageMode') {
                    this.updateMemoryModeButton();
                }
            } catch {}
        });

        // APP启动时自动显示5秒，让用户看到加载日志（仅在启用时）
        this.log('=== APP 启动，调试面板已激活 ===', 'info');
        if (this.enabled) {
            this.show();
            this.autoHideTimer = setTimeout(() => {
                if (this.logs.length < 3) {
                    // 如果日志很少，说明可能没有重要信息，自动隐藏
                    this.hide();
                }
            }, 8000); // 8秒后自动隐藏
        }
    }

    show() {
        if (!this.panel) return;
        this.panel.style.display = 'flex';
        this.isVisible = true;
        this.scrollToBottom();
        // 取消自动隐藏定时器（如果用户手动打开）
        if (this.autoHideTimer) {
            clearTimeout(this.autoHideTimer);
            this.autoHideTimer = null;
        }
    }

    hide() {
        if (!this.panel) return;
        this.panel.style.display = 'none';
        this.isVisible = false;
    }

    setEnabled(enabled) {
        this.enabled = Boolean(enabled);
        if (this.toggleBtn) {
            this.toggleBtn.style.display = this.enabled ? 'block' : 'none';
        }
        if (!this.enabled) {
            this.hide();
            if (this.autoHideTimer) {
                clearTimeout(this.autoHideTimer);
                this.autoHideTimer = null;
            }
        }
    }

    getMemoryMode() {
        const mode = String(appSettings.get().memoryStorageMode || 'table').toLowerCase();
        return mode === 'table' ? 'table' : 'summary';
    }

    updateMemoryModeButton() {
        if (!this.memoryModeBtn) return;
        const mode = this.getMemoryMode();
        this.memoryModeBtn.textContent = mode === 'table' ? '记忆: 表格' : '记忆: 摘要';
    }

    toggleMemoryMode() {
        const current = this.getMemoryMode();
        const next = current === 'table' ? 'summary' : 'table';
        appSettings.update({ memoryStorageMode: next });
        window.dispatchEvent(new CustomEvent('memory-storage-mode-changed', { detail: { mode: next } }));
        window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { key: 'memoryStorageMode', value: next } }));
        this.updateMemoryModeButton();
        this.log(`[记忆模式] 已切换为 ${next === 'table' ? '表格' : '摘要'}`);
    }

    toggle() {
        if (!this.panel) return;
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        const prefix = type === 'error' ? '❌' : type === 'warn' ? '⚠️' : '✓';
        const color = type === 'error' ? '#ff0000' : type === 'warn' ? '#ffaa00' : '#00ff00';
        const key = `${type}|${message}`;
        if (this.seenMessages.has(key)) return;
        this.seenMessages.add(key);

        this.logs.push({ timestamp, message, color, prefix, key });
        if (this.logs.length > this.maxLogs) {
            const removed = this.logs.shift();
            if (removed?.key) this.seenMessages.delete(removed.key);
        }

        this.render();
    }

    render() {
        if (!this.logContainer) return;

        const term = String(this.filterText || '').trim().toLowerCase();
        const list = term
            ? this.logs.filter(log => String(log.message || '').toLowerCase().includes(term))
            : this.logs;

        this.logContainer.innerHTML = list.map(log =>
            `<div style="color: ${log.color}; margin-bottom: 2px;">${log.prefix} [${log.timestamp}] ${log.message}</div>`
        ).join('');

        this.scrollToBottom();
    }

    scrollToBottom() {
        if (this.logContainer) {
            this.logContainer.scrollTop = this.logContainer.scrollHeight;
        }
    }

    clear() {
        this.logs = [];
        this.seenMessages.clear();
        if (this.logContainer) {
            this.logContainer.innerHTML = '';
        }
    }

    async runMemoryDbSmokeTest() {
        if (this.smokeTestRunning) return;
        this.smokeTestRunning = true;
        const runId = ++this.smokeRunId;
        if (this.smokeBtn) {
            this.smokeBtn.disabled = true;
            this.smokeBtn.style.opacity = '0.6';
            this.smokeBtn.style.cursor = 'not-allowed';
        }
        this.log(`[#${runId}] Memory DB 烟测开始`);
        try {
            const store = window.appBridge?.memoryTableStore;
            if (!store || typeof store.getMemories !== 'function') {
                this.log(`[#${runId}] Memory DB 烟测失败：memoryTableStore 未就绪`, 'warn');
                return;
            }
            const scope = String(store.scopeId || '').trim();
            const rows = await store.getMemories({});
            const count = Array.isArray(rows) ? rows.length : 0;
            const label = scope ? `scope=${scope}` : 'scope=default';
            this.log(`[#${runId}] Memory DB 烟测成功：${count} 条 (${label})`);
        } catch (err) {
            const msg = err?.message ? String(err.message) : String(err || '');
            this.log(`[#${runId}] Memory DB 烟测失败：${msg || 'unknown error'}`, 'error');
        } finally {
            this.smokeTestRunning = false;
            if (this.smokeBtn) {
                this.smokeBtn.disabled = false;
                this.smokeBtn.style.opacity = '1';
                this.smokeBtn.style.cursor = 'pointer';
            }
        }
    }

    ensureMemoryInspector() {
        if (this.memoryInspectorOverlay) return;
        const overlay = document.createElement('div');
        overlay.id = 'memory-inspector-overlay';
        overlay.style.cssText = `
            display:none;
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.38);
            z-index: 22050;
            padding: calc(10px + env(safe-area-inset-top, 0px)) 10px calc(10px + env(safe-area-inset-bottom, 0px)) 10px;
            box-sizing: border-box;
        `;
        const panel = document.createElement('div');
        panel.id = 'memory-inspector-panel';
        panel.style.cssText = `
            width: 100%;
            height: 100%;
            background: #fff;
            border-radius: 14px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        `;
        panel.addEventListener('click', e => e.stopPropagation());
        panel.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; padding:12px; background:#f3f4f6; border-bottom:1px solid #e5e7eb;">
                <div style="font-weight:900;">记忆检查器</div>
                <div id="memory-inspector-meta" style="margin-left:auto; font-size:12px; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
                <button id="memory-inspector-refresh" style="border:1px solid #e5e7eb; background:#fff; border-radius:10px; padding:6px 10px;">刷新</button>
                <button id="memory-inspector-copy" style="border:1px solid #e5e7eb; background:#fff; border-radius:10px; padding:6px 10px;">复制</button>
                <button id="memory-inspector-close" style="border:1px solid #e5e7eb; background:#fff; border-radius:10px; padding:6px 10px;">关闭</button>
            </div>
            <div style="flex:1; min-height:0; overflow:auto; -webkit-overflow-scrolling:touch; padding:12px; display:flex; flex-direction:column; gap:12px;">
                <div id="memory-inspector-tokens" style="font-size:12px; color:#475569;"></div>
                <div>
                    <div style="font-weight:700; margin-bottom:6px;">将注入的记忆</div>
                    <div id="memory-inspector-included" style="display:flex; flex-direction:column; gap:6px; font-size:12px;"></div>
                </div>
                <div>
                    <div style="font-weight:700; margin-bottom:6px;">被截断的记忆</div>
                    <div id="memory-inspector-truncated" style="display:flex; flex-direction:column; gap:6px; font-size:12px;"></div>
                </div>
                <div style="flex:1; min-height:120px; display:flex; flex-direction:column; gap:6px;">
                    <div style="font-weight:700;">Prompt 预览</div>
                    <textarea id="memory-inspector-prompt" readonly style="
                        flex:1;
                        min-height: 140px;
                        width:100%;
                        resize:none;
                        border:1px solid rgba(0,0,0,0.10);
                        border-radius:12px;
                        padding:12px;
                        font-size:12px;
                        line-height:1.4;
                        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
                        white-space: pre;
                        box-sizing:border-box;
                        outline:none;
                    "></textarea>
                </div>
            </div>
        `;
        overlay.appendChild(panel);
        overlay.addEventListener('click', () => this.hideMemoryInspector());
        document.body.appendChild(overlay);

        this.memoryInspectorOverlay = overlay;
        this.memoryInspectorPanel = panel;
        this.memoryInspectorMeta = panel.querySelector('#memory-inspector-meta');
        this.memoryInspectorTokens = panel.querySelector('#memory-inspector-tokens');
        this.memoryInspectorIncluded = panel.querySelector('#memory-inspector-included');
        this.memoryInspectorTruncated = panel.querySelector('#memory-inspector-truncated');
        this.memoryInspectorPrompt = panel.querySelector('#memory-inspector-prompt');
        this.memoryInspectorRefresh = panel.querySelector('#memory-inspector-refresh');

        panel.querySelector('#memory-inspector-close')?.addEventListener('click', () => this.hideMemoryInspector());
        panel.querySelector('#memory-inspector-refresh')?.addEventListener('click', () => this.refreshMemoryInspector());
        panel.querySelector('#memory-inspector-copy')?.addEventListener('click', async () => {
            const text = String(this.memoryInspectorPrompt?.value || '');
            if (!text) {
                window.toastr?.warning?.('暂无内容可复制');
                return;
            }
            try {
                await navigator.clipboard.writeText(text);
                window.toastr?.success?.('已复制');
            } catch {
                try {
                    this.memoryInspectorPrompt?.select?.();
                    document.execCommand?.('copy');
                    window.toastr?.success?.('已复制');
                } catch {
                    window.toastr?.error?.('复制失败');
                }
            }
        });
    }

    hideMemoryInspector() {
        if (this.memoryInspectorOverlay) {
            this.memoryInspectorOverlay.style.display = 'none';
        }
    }

    renderMemoryInspector(plan) {
        const metaEl = this.memoryInspectorMeta;
        const tokensEl = this.memoryInspectorTokens;
        const includedEl = this.memoryInspectorIncluded;
        const truncatedEl = this.memoryInspectorTruncated;
        const promptEl = this.memoryInspectorPrompt;
        if (!metaEl || !tokensEl || !includedEl || !truncatedEl || !promptEl) return;

        const clearList = (el) => {
            if (el) el.innerHTML = '';
        };
        const addEmpty = (el, text) => {
            if (!el) return;
            const div = document.createElement('div');
            div.style.cssText = 'color:#94a3b8;';
            div.textContent = text;
            el.appendChild(div);
        };
        const formatTime = (ts) => {
            const num = Number(ts || 0);
            if (!Number.isFinite(num) || num <= 0) return '';
            try {
                return new Date(num).toLocaleString();
            } catch {
                return '';
            }
        };
        const renderItems = (el, list, { dimmed = false, reasonLabel = '' } = {}) => {
            clearList(el);
            if (!Array.isArray(list) || list.length === 0) {
                addEmpty(el, '暂无条目');
                return;
            }
            list.forEach(item => {
                const row = document.createElement('div');
                row.style.cssText = `color:${dimmed ? '#94a3b8' : '#0f172a'}; line-height:1.4;`;
                const flags = [];
                if (item?.isPinned) flags.push('📌');
                if (Number.isFinite(Number(item?.priority)) && Number(item.priority) !== 0) flags.push(`P${Number(item.priority)}`);
                const updated = formatTime(item?.updatedAt);
                if (updated) flags.push(updated);
                const suffix = flags.length ? `（${flags.join(' · ')}）` : '';
                const reason = reasonLabel ? `（${reasonLabel}）` : '';
                row.textContent = `[${item?.tableName || item?.tableId || '记忆'}] ${item?.rowSummary || item?.rowText || ''}${suffix}${reason}`;
                el.appendChild(row);
            });
        };

        const disabledReason = (() => {
            if (!plan || plan.enabled !== true) {
                const reason = String(plan?.reason || '');
                if (reason === 'memory_mode') return '当前记忆模式为摘要，请切换到记忆表格';
                if (reason === 'missing_store') return '记忆表格未就绪';
                if (reason === 'missing_template') return '未找到默认模板';
                if (reason === 'missing_session') return '未找到会话';
                return '记忆检查器暂不可用';
            }
            return '';
        })();

        if (disabledReason) {
            metaEl.textContent = disabledReason;
            tokensEl.textContent = '';
            clearList(includedEl);
            clearList(truncatedEl);
            addEmpty(includedEl, disabledReason);
            addEmpty(truncatedEl, '暂无条目');
            promptEl.value = '';
            return;
        }

        const scopeLabel = plan?.scope === 'group' ? '群聊' : '私聊';
        const metaParts = [];
        if (plan?.targetName) metaParts.push(`${scopeLabel} · ${plan.targetName}`);
        if (plan?.templateName) metaParts.push(plan.templateName);
        if (plan?.position) metaParts.push(`位置:${plan.position}`);
        metaEl.textContent = metaParts.join(' | ');

        const budgetSafety = Number(plan?.tokenBudgetSafety || 0);
        const overhead = Number(plan?.overheadTokens || 0);
        const budget = Number(plan?.tokenBudget || 0);
        const tokenTotal = Number(plan?.tokenTotal || 0);
        const tokenInfo = [
            `Tokens: ${tokenTotal} / ${budget}`,
            budgetSafety ? `安全上限: ${budgetSafety}` : '',
            overhead ? `包裹开销: ${overhead}` : '',
        ].filter(Boolean).join(' · ');
        tokensEl.textContent = tokenInfo;

        const included = Array.isArray(plan?.items) ? plan.items : [];
        const truncated = Array.isArray(plan?.truncated) ? plan.truncated : [];
        const reasonLabelFor = (reason) => {
            if (reason === 'max_rows') return '因条数上限截断';
            if (reason === 'max_tokens') return '因预算截断';
            return '因预算截断';
        };
        renderItems(includedEl, included, { dimmed: false });
        const truncatedWithReason = truncated.map(item => ({
            ...item,
            _reasonLabel: reasonLabelFor(item?.reason),
        }));
        clearList(truncatedEl);
        if (!truncatedWithReason.length) {
            addEmpty(truncatedEl, '暂无条目');
        } else {
            truncatedWithReason.forEach(item => {
                const row = document.createElement('div');
                row.style.cssText = 'color:#94a3b8; line-height:1.4;';
                row.textContent = `[${item?.tableName || item?.tableId || '记忆'}] ${item?.rowSummary || item?.rowText || ''}（${item?._reasonLabel || '因预算截断'}）`;
                truncatedEl.appendChild(row);
            });
        }

        if (included.length === 0 && truncated.length === 0) {
            clearList(includedEl);
            addEmpty(includedEl, '暂无可注入记忆');
        }

        promptEl.value = String(plan?.promptText || '').trim();
    }

    async refreshMemoryInspector() {
        if (!this.memoryInspectorOverlay) return;
        try {
            const metaEl = this.memoryInspectorMeta;
            if (metaEl) metaEl.textContent = '加载中...';
            const plan = await window.appBridge?.getMemoryPromptPlan?.();
            this.renderMemoryInspector(plan);
        } catch (err) {
            const msg = err?.message ? String(err.message) : String(err || '');
            this.renderMemoryInspector({ enabled: false, reason: msg ? 'error' : '' });
            if (this.memoryInspectorMeta) this.memoryInspectorMeta.textContent = `加载失败: ${msg || 'unknown error'}`;
        }
    }

    async showMemoryInspector() {
        this.ensureMemoryInspector();
        if (this.memoryInspectorOverlay) {
            this.memoryInspectorOverlay.style.display = 'block';
        }
        await this.refreshMemoryInspector();
    }

    showConfigStatus(configManager) {
        if (!configManager) return;

        try {
            const activeId = configManager.getActiveProfileId?.();
            const active = configManager.getActiveProfile?.();
            const profiles = configManager.getProfiles?.() || [];

            this.log(`配置总数: ${profiles.length}`);
            this.log(`当前活跃ID: ${activeId ? activeId.slice(0, 20) + '...' : '无'}`);
            this.log(`当前活跃配置: ${active?.name || '无'} (${active?.provider || '无'})`);
            this.log('--- 所有配置（按最后修改时间排序）---');

            profiles.forEach((p, i) => {
                const isCurrent = p.id === activeId;
                const updatedTime = p.updatedAt ? new Date(p.updatedAt).toLocaleString('zh-CN', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                }) : '未知';
                const marker = isCurrent ? ' ← 当前' : '';
                const rank = i === 0 ? ' [最新]' : '';
                this.log(`  ${i + 1}. ${p.name} (${p.provider})${marker}${rank}`, isCurrent ? 'info' : 'info');
                this.log(`     更新: ${updatedTime}`, 'info');
            });
        } catch (err) {
            this.log(`显示配置状态失败: ${err.message}`, 'error');
        }
    }
}

// 全局单例
let debugPanelInstance = null;

export function getDebugPanel() {
    if (!debugPanelInstance) {
        debugPanelInstance = new DebugPanel();
        debugPanelInstance.init();
    }
    return debugPanelInstance;
}
