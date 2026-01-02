/**
 * Debug panel - show config status on screen for Android debugging
 */

import { appSettings } from '../storage/app-settings.js';

export class DebugPanel {
    constructor() {
        this.panel = null;
        this.logs = [];
        this.maxLogs = 30;
        this.isVisible = false;
        this.autoHideTimer = null;
        this.toggleBtn = null;
        this.enabled = false;
        this.seenMessages = new Set();
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
            overflow-y: auto;
            z-index: 30000;
            display: none;
            border-top: 2px solid #00ff00;
        `;

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
        this.panel.style.display = 'block';
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
        if (!this.panel) return;

        this.panel.innerHTML = this.logs.map(log =>
            `<div style="color: ${log.color}; margin-bottom: 2px;">${log.prefix} [${log.timestamp}] ${log.message}</div>`
        ).join('');

        this.scrollToBottom();
    }

    scrollToBottom() {
        if (this.panel) {
            this.panel.scrollTop = this.panel.scrollHeight;
        }
    }

    clear() {
        this.logs = [];
        this.seenMessages.clear();
        if (this.panel) {
            this.panel.innerHTML = '';
        }
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
