/**
 * Preset panel (SillyTavern-like)
 * - UI uses plain text + form fields (not JSON)
 * - Types:
 *   - sysprompt: { name, content, post_history }
 *   - context: { story_string, story_string_position, story_string_depth, story_string_role, ... }
 *   - instruct: message wrapping / sequences
 *   - openai: generation params + editable prompts (hide marker prompts like chat_history)
 */

import { PresetStore } from '../storage/preset-store.js';
import { LLMClient } from '../api/client.js';
import { logger } from '../utils/logger.js';

const PRESET_TYPES = [
    { id: 'sysprompt', label: '系统提示词' },
    { id: 'context', label: '上下文模板' },
    { id: 'instruct', label: 'Instruct 模板' },
    { id: 'openai', label: '生成参数' },
    { id: 'custom', label: '自定义' },
];

const EXT_PROMPT_TYPES = {
    NONE: -1,
    IN_PROMPT: 0,
    IN_CHAT: 1,
    BEFORE_PROMPT: 2,
};

const EXT_PROMPT_ROLES = {
    SYSTEM: 0,
    USER: 1,
    ASSISTANT: 2,
};

const OPENAI_KNOWN_BLOCKS = {
    main: { label: 'Main Prompt', marker: false },
    nsfw: { label: 'Auxiliary Prompt', marker: false },
    dialogueExamples: { label: 'Chat Examples', marker: true },
    jailbreak: { label: 'Post-History Instructions', marker: false },
    chatHistory: { label: 'Chat History', marker: true },
    worldInfoAfter: { label: 'World Info (after)', marker: true },
    worldInfoBefore: { label: 'World Info (before)', marker: true },
    enhanceDefinitions: { label: 'Enhance Definitions', marker: false },
    charDescription: { label: 'Char Description', marker: true },
    charPersonality: { label: 'Char Personality', marker: true },
    scenario: { label: 'Scenario', marker: true },
    personaDescription: { label: 'Persona Description', marker: true },
};

const roleIdToName = (role) => {
    const r = String(role || '').toLowerCase();
    if (r === 'system' || r === 'user' || r === 'assistant') return r;
    // ST preset uses role string; fallback
    return 'system';
};

const roleNameToId = (name) => {
    const r = String(name || '').toLowerCase();
    if (r === 'user') return EXT_PROMPT_ROLES.USER;
    if (r === 'assistant') return EXT_PROMPT_ROLES.ASSISTANT;
    return EXT_PROMPT_ROLES.SYSTEM;
};

const deepClone = (v) => {
    try {
        return structuredClone(v);
    } catch {
        return JSON.parse(JSON.stringify(v));
    }
};

const getNum = (val, fallback) => {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
};

const getInt = (val, fallback) => {
    const n = Number(val);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

const setValue = (el, val) => { if (el) el.value = (val ?? '').toString(); };

export class PresetPanel {
    constructor() {
        this.store = window.appBridge?.presets || new PresetStore();
        this.element = null;
        this.overlayElement = null;
        this.activeType = 'sysprompt';
        this.statusEl = null;
    }

    getTypeLabel(type) {
        const hit = PRESET_TYPES.find(t => t.id === type);
        return hit?.label || String(type || '');
    }

    async applyBoundConfigIfAny() {
        // 仅对“生成参数/自定义（OpenAI store）”做绑定，以免切换系统提示词等意外更换连接
        const storeType = this.getStoreType();
        if (storeType !== 'openai') return;

        const preset = this.store.getActive('openai') || {};
        const boundId = preset?.boundProfileId;
        if (!boundId) return;

        const cm = window.appBridge?.config;
        if (!cm?.setActiveProfile) return;

        const currentId = cm.getActiveProfileId?.();
        if (currentId && currentId === boundId) return;

        try {
            const runtime = await cm.setActiveProfile(boundId);
            const cfg = runtime || cm.get?.();
            if (window.appBridge) {
                window.appBridge.config.set(cfg);
                window.appBridge.client = cfg?.apiKey ? new LLMClient(cfg) : null;
            }
            window.dispatchEvent(new CustomEvent('preset-bound-config-applied', { detail: { profileId: boundId } }));
        } catch (err) {
            logger.warn('应用预设绑定的 API 配置失败', err);
        }
    }

    async show() {
        await this.store.ready;
        if (!this.element) this.createUI();
        await this.refreshAll();
        this.element.style.display = 'flex';
        this.overlayElement.style.display = 'block';
    }

    hide() {
        if (this.element) this.element.style.display = 'none';
        if (this.overlayElement) this.overlayElement.style.display = 'none';
    }

    createUI() {
        this.overlayElement = document.createElement('div');
        this.overlayElement.id = 'preset-overlay';
        // 必须高于 `.topbar`(12000) 与 `.bottom-nav`(14000)，否则会被遮挡“切掉”
        this.overlayElement.style.cssText = `display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index: 20000;`;
        this.overlayElement.onclick = () => this.hide();

        this.element = document.createElement('div');
        this.element.id = 'preset-panel';
        // Important: fixed top/bottom/left/right + flex layout so inner can scroll on mobile
        this.element.style.cssText = `
            display:none; position:fixed;
            /* 使用 dvh 避免部分移动端 WebView 100vh 计算导致上下被“切掉” */
            top: calc(10px + env(safe-area-inset-top, 0px));
            left: calc(10px + env(safe-area-inset-left, 0px));
            right: calc(10px + env(safe-area-inset-right, 0px));
            height: calc(100vh - 20px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            height: calc(100dvh - 20px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            box-sizing: border-box;
            background:#fff; border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,0.25);
            z-index: 21000;
            flex-direction: column;
            overflow: hidden;
        `;
        this.element.onclick = (e) => e.stopPropagation();

        const tabsHtml = PRESET_TYPES.map(t => `
            <button class="preset-tab" data-type="${t.id}" style="
                border:none; background:transparent; padding:10px 12px; border-radius:10px;
                cursor:pointer; font-size:14px; color:#334155;
            ">${t.label}</button>
        `).join('');

        this.element.innerHTML = `
            <div style="padding:14px 16px; border-bottom:1px solid rgba(0,0,0,0.06); background:rgba(248,250,252,0.92); display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <div style="min-width:0;">
                    <div style="font-weight:800; color:#0f172a;">预设（Preset）</div>
                    <div style="color:#64748b; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        参照 SillyTavern：选择/编辑提示词与生成参数，影响 prompt 构建
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <button id="preset-import" title="导入" style="border:1px solid #e2e8f0; background:#fff; padding:6px 10px; border-radius:10px; cursor:pointer; font-size:12px;">导入</button>
                    <button id="preset-export" title="导出当前" style="border:1px solid #e2e8f0; background:#fff; padding:6px 10px; border-radius:10px; cursor:pointer; font-size:12px;">导出</button>
                    <button id="preset-export-all" title="导出全部" style="border:1px solid #e2e8f0; background:#fff; padding:6px 10px; border-radius:10px; cursor:pointer; font-size:12px;">导出全部</button>
                    <button id="preset-close" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:#0f172a;">×</button>
                </div>
            </div>

            <div style="padding:10px 16px; border-bottom:1px solid rgba(0,0,0,0.06); display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                <div style="display:flex; gap:8px; flex-wrap:wrap;">${tabsHtml}</div>
                <label style="display:flex; align-items:center; gap:8px; font-size:13px; color:#334155; cursor:pointer;">
                    <input id="preset-enabled" type="checkbox" style="width:16px; height:16px;">
                    启用
                </label>
            </div>

            <div id="preset-scroll" style="padding:14px 16px; overflow:auto; flex:1; min-height:0; -webkit-overflow-scrolling: touch; overscroll-behavior: contain;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                    <div style="flex:1; min-width: 240px;">
                        <div style="font-weight:700; margin-bottom:6px; color:#0f172a;">预设</div>
                        <select id="preset-select" style="width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:14px;"></select>
                    </div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        <button id="preset-new" style="padding:10px 12px; border:1px solid #e2e8f0; border-radius:10px; background:#f8fafc; cursor:pointer;">＋ 新建</button>
                        <button id="preset-rename" style="padding:10px 12px; border:1px solid #e2e8f0; border-radius:10px; background:#f8fafc; cursor:pointer;">✎ 重命名</button>
                        <button id="preset-delete" style="padding:10px 12px; border:1px solid #fecaca; border-radius:10px; background:#fee2e2; color:#b91c1c; cursor:pointer;">🗑 删除</button>
                    </div>
                </div>

                <div id="preset-editor" style="margin-top:12px;"></div>

                <div id="preset-status" style="display:none; margin-top:12px; padding:10px; border-radius:10px; font-size:13px;"></div>

                <div style="margin-top:12px; display:flex; align-items:center; justify-content:flex-end; gap:10px;">
                    <button id="preset-cancel" style="padding:10px 18px; border:1px solid #e2e8f0; border-radius:10px; background:#f8fafc; cursor:pointer;">取消</button>
                    <button id="preset-save" style="padding:10px 18px; border:none; border-radius:10px; background:#019aff; color:#fff; cursor:pointer; font-weight:700;">保存</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.overlayElement);
        document.body.appendChild(this.element);

        this.statusEl = this.element.querySelector('#preset-status');
        this.element.querySelector('#preset-close').onclick = () => this.hide();
        this.element.querySelector('#preset-cancel').onclick = () => this.hide();

        // hidden file input for import
        const importInput = document.createElement('input');
        importInput.type = 'file';
        importInput.accept = '.json,application/json';
        importInput.style.display = 'none';
        importInput.id = 'preset-import-file';
        this.element.appendChild(importInput);

        this.element.querySelectorAll('.preset-tab').forEach(btn => {
            btn.addEventListener('click', async () => {
                const type = btn.dataset.type;
                if (!type) return;
                this.activeType = type;
                await this.refreshAll();
            });
        });

        this.element.querySelector('#preset-enabled').onchange = async (e) => {
            await this.store.setEnabled(this.getStoreType(), !!e.target.checked);
            this.showStatus('已更新启用状态', 'success');
            window.dispatchEvent(new CustomEvent('preset-changed'));
        };

        this.element.querySelector('#preset-select').onchange = async (e) => {
            await this.store.setActive(this.getStoreType(), e.target.value);
            await this.refreshEditor();
            await this.applyBoundConfigIfAny();
            window.dispatchEvent(new CustomEvent('preset-changed'));
        };

        this.element.querySelector('#preset-save').onclick = async () => this.onSave();
        this.element.querySelector('#preset-new').onclick = async () => this.onNew();
        this.element.querySelector('#preset-rename').onclick = async () => this.onRename();
        this.element.querySelector('#preset-delete').onclick = async () => this.onDelete();

        this.element.querySelector('#preset-import').onclick = async () => {
            importInput.value = '';
            importInput.click();
        };
        importInput.onchange = async () => {
            const file = importInput.files?.[0];
            if (!file) return;
            await this.importFromFile(file);
        };
        this.element.querySelector('#preset-export').onclick = async () => {
            await this.exportCurrent();
        };
        this.element.querySelector('#preset-export-all').onclick = async () => {
            await this.exportAll();
        };
    }

    detectPresetType(obj) {
        if (!obj || typeof obj !== 'object') return null;
        if (obj.presets && obj.active && obj.enabled) return 'store';
        if (typeof obj.story_string === 'string') return 'context';
        if (typeof obj.content === 'string' && ('post_history' in obj)) return 'sysprompt';
        if (typeof obj.input_sequence === 'string' || typeof obj.output_sequence === 'string') return 'instruct';
        if ('temperature' in obj || 'top_p' in obj || Array.isArray(obj.prompts)) return 'openai';
        return null;
    }

    downloadJson(filename, dataObj) {
        const data = JSON.stringify(dataObj, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 3000);
    }

    async exportCurrent() {
        await this.store.ready;
        const type = this.getStoreType();
        const preset = this.store.getActive(type) || {};
        const name = String(preset.name || type).replace(/[\\/:*?"<>|]+/g, '_');
        const prefix = type === 'openai' ? 'preset' : type;
        this.downloadJson(`${prefix}-${name}.json`, preset);
        this.showStatus('已导出当前预设', 'success');
    }

    async exportAll() {
        await this.store.ready;
        const state = this.store.getState() || {};
        this.downloadJson(`preset-store.json`, state);
        this.showStatus('已导出全部预设', 'success');
    }

    async importFromFile(file) {
        await this.store.ready;
        let text = '';
        try {
            text = await file.text();
        } catch (err) {
            this.showStatus('读取文件失败', 'error');
            return;
        }
        let json = null;
        try {
            json = JSON.parse(text);
        } catch (err) {
            this.showStatus('JSON 格式错误', 'error');
            return;
        }

        const detected = this.detectPresetType(json);
        if (detected === 'store') {
            const replace = confirm('检测到「整套预设设定档」。确定要导入并覆盖当前设置吗？（取消=合并导入）');
            if (replace) {
                await this.store.importState(json, { mode: 'replace' });
            } else {
                await this.store.importState(json, { mode: 'merge' });
            }
            await this.refreshAll();
            this.showStatus('已导入预设设定档', 'success');
            window.dispatchEvent(new CustomEvent('preset-changed'));
            return;
        }

        const currentStoreType = this.getStoreType();
        const detectedType = (detected && detected !== 'store') ? detected : null;
        let importType = detectedType || currentStoreType;

        if (detectedType && detectedType !== currentStoreType) {
            const ok = confirm(`检测到预设格式为「${this.getTypeLabel(detectedType)}」。要导入到该类型吗？（取消=导入到当前tab）`);
            if (!ok) {
                importType = currentStoreType;
            } else {
                importType = detectedType;
            }
        }

        // Switch tab after deciding import target (OpenAI goes to "自定义" for prompt blocks)
        this.activeType = importType === 'openai' ? 'custom' : importType;

        const name = prompt('导入预设名称', json?.name || '导入预设');
        if (!name) return;
        await this.store.upsert(importType, { name, data: { ...json, name } });
        await this.refreshAll();
        this.showStatus('已导入预设', 'success');
        window.dispatchEvent(new CustomEvent('preset-changed'));
    }

    setActiveTabStyles() {
        this.element?.querySelectorAll('.preset-tab')?.forEach(btn => {
            const isActive = btn.dataset.type === this.activeType;
            btn.style.background = isActive ? '#e2e8f0' : 'transparent';
            btn.style.color = isActive ? '#0f172a' : '#334155';
            btn.style.fontWeight = isActive ? '800' : '600';
        });
    }

    showStatus(message, type = 'info') {
        const el = this.statusEl;
        if (!el) return;
        const colors = {
            success: { bg: '#dcfce7', fg: '#166534' },
            error: { bg: '#fee2e2', fg: '#991b1b' },
            info: { bg: '#dbeafe', fg: '#1e40af' }
        };
        const c = colors[type] || colors.info;
        el.style.display = 'block';
        el.style.background = c.bg;
        el.style.color = c.fg;
        el.textContent = message;
        setTimeout(() => { el.style.display = 'none'; }, 3500);
    }

    async refreshAll() {
        await this.store.ready;
        this.setActiveTabStyles();

        const enabledEl = this.element.querySelector('#preset-enabled');
        enabledEl.checked = this.store.getEnabled(this.getStoreType());

        const selectEl = this.element.querySelector('#preset-select');
        const presets = this.store.list(this.getStoreType());
        const activeId = this.store.getActiveId(this.getStoreType());
        selectEl.innerHTML = '';
        presets.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name || p.id;
            selectEl.appendChild(opt);
        });
        if (activeId) selectEl.value = activeId;

        await this.refreshEditor();
    }

    async refreshEditor() {
        await this.store.ready;
        const root = this.element.querySelector('#preset-editor');
        if (!root) return;
        root.innerHTML = '';

        const p = this.store.getActive(this.getStoreType()) || {};

        if (this.activeType === 'sysprompt') {
            root.appendChild(this.renderSyspromptEditor(p));
            return;
        }
        if (this.activeType === 'context') {
            root.appendChild(this.renderContextEditor(p));
            return;
        }
        if (this.activeType === 'instruct') {
            root.appendChild(this.renderInstructEditor(p));
            return;
        }
        if (this.activeType === 'openai') {
            root.appendChild(this.renderOpenAIParamsEditor(p));
            return;
        }
        if (this.activeType === 'custom') {
            root.appendChild(this.renderOpenAIBlocksEditor(p));
            return;
        }
    }

    getStoreType() {
        // “自定义”tab 是 OpenAI preset 的区块视图
        return this.activeType === 'custom' ? 'openai' : this.activeType;
    }

    renderSection(title, desc) {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'border:1px solid rgba(0,0,0,0.06); border-radius:12px; padding:12px; background:rgba(248,250,252,0.6);';
        const h = document.createElement('div');
        h.style.cssText = 'font-weight:800; color:#0f172a;';
        h.textContent = title;
        wrap.appendChild(h);
        if (desc) {
            const d = document.createElement('div');
            d.style.cssText = 'color:#64748b; font-size:12px; margin-top:4px;';
            d.textContent = desc;
            wrap.appendChild(d);
        }
        return wrap;
    }

    renderTextarea(label, id, value, placeholder = '') {
        const block = document.createElement('div');
        block.style.cssText = 'margin-top:10px;';
        block.innerHTML = `
            <div style="font-weight:700; color:#0f172a; margin-bottom:6px;">${label}</div>
            <textarea id="${id}" spellcheck="false" style="
                width:100%; min-height: 140px; resize: vertical;
                border:1px solid #e2e8f0; border-radius:10px; padding:10px;
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
                font-size: 12px; line-height: 1.45;
                background:#ffffff; color:#0f172a;
                box-sizing:border-box;
            " placeholder="${placeholder}"></textarea>
        `;
        setValue(block.querySelector(`#${id}`), value || '');
        return block;
    }

    renderInputRow(fields) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;';
        fields.forEach(f => {
            const cell = document.createElement('div');
            cell.style.cssText = 'flex:1; min-width: 160px;';
            const label = document.createElement('div');
            label.style.cssText = 'font-weight:700; color:#0f172a; margin-bottom:6px;';
            label.textContent = f.label;
            cell.appendChild(label);
            cell.appendChild(f.el);
            row.appendChild(cell);
        });
        return row;
    }

    renderSyspromptEditor(p) {
        const wrap = this.renderSection('系统提示词（System Prompt）', '与 ST 相同：编辑可见内容（纯文本），支持 {{char}} / {{user}} 宏');
        wrap.appendChild(this.renderTextarea('内容', 'sysprompt-content', p.content || '', 'Write {{char}}...'));
        wrap.appendChild(this.renderTextarea('Post-History Instructions（可选）', 'sysprompt-post', p.post_history || '', '（可留空）'));
        return wrap;
    }

    renderContextEditor(p) {
        const wrap = this.renderSection('上下文模板（Context Template）', 'ST 的 story_string 模板，支持 {{#if}} 与变量（description/personality/scenario/persona/wiBefore 等）');

        wrap.appendChild(this.renderTextarea('Story String', 'context-story', p.story_string || '', '{{#if description}}{{description}}{{/if}} ...'));

        const pos = document.createElement('select');
        pos.id = 'context-position';
        pos.style.cssText = 'width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:14px;';
        pos.innerHTML = `
            <option value="${EXT_PROMPT_TYPES.IN_PROMPT}">IN_PROMPT（系统开头）</option>
            <option value="${EXT_PROMPT_TYPES.IN_CHAT}">IN_CHAT（按深度插入历史）</option>
            <option value="${EXT_PROMPT_TYPES.BEFORE_PROMPT}">BEFORE_PROMPT（最前）</option>
            <option value="${EXT_PROMPT_TYPES.NONE}">NONE（不注入）</option>
        `;
        pos.value = String(p.story_string_position ?? EXT_PROMPT_TYPES.IN_PROMPT);

        const depth = document.createElement('input');
        depth.id = 'context-depth';
        depth.type = 'number';
        depth.inputMode = 'numeric';
        depth.min = '0';
        depth.style.cssText = 'width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:14px;';
        depth.value = String(p.story_string_depth ?? 1);

        const role = document.createElement('select');
        role.id = 'context-role';
        role.style.cssText = 'width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:14px;';
        role.innerHTML = `
            <option value="${EXT_PROMPT_ROLES.SYSTEM}">SYSTEM</option>
            <option value="${EXT_PROMPT_ROLES.USER}">USER</option>
            <option value="${EXT_PROMPT_ROLES.ASSISTANT}">ASSISTANT</option>
        `;
        role.value = String(p.story_string_role ?? EXT_PROMPT_ROLES.SYSTEM);

        wrap.appendChild(this.renderInputRow([
            { label: '注入位置', el: pos },
            { label: '深度（IN_CHAT）', el: depth },
            { label: '角色（IN_CHAT）', el: role },
        ]));

        const exSep = document.createElement('input');
        exSep.id = 'context-example-sep';
        exSep.type = 'text';
        exSep.style.cssText = 'width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:14px;';
        exSep.value = p.example_separator ?? '';

        const chatStart = document.createElement('input');
        chatStart.id = 'context-chat-start';
        chatStart.type = 'text';
        chatStart.style.cssText = 'width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:14px;';
        chatStart.value = p.chat_start ?? '';

        wrap.appendChild(this.renderInputRow([
            { label: 'Example Separator', el: exSep },
            { label: 'Chat Start', el: chatStart },
        ]));

        const flags = document.createElement('div');
        flags.style.cssText = 'margin-top:10px; display:flex; gap:12px; flex-wrap:wrap;';
        flags.innerHTML = `
            <label style="display:flex; align-items:center; gap:8px; font-size:13px; color:#334155; cursor:pointer;">
                <input id="context-names-stop" type="checkbox" style="width:16px; height:16px;">
                Names as stop strings
            </label>
            <label style="display:flex; align-items:center; gap:8px; font-size:13px; color:#334155; cursor:pointer;">
                <input id="context-use-stop" type="checkbox" style="width:16px; height:16px;">
                Use stop strings
            </label>
            <label style="display:flex; align-items:center; gap:8px; font-size:13px; color:#334155; cursor:pointer;">
                <input id="context-trim" type="checkbox" style="width:16px; height:16px;">
                Trim sentences
            </label>
            <label style="display:flex; align-items:center; gap:8px; font-size:13px; color:#334155; cursor:pointer;">
                <input id="context-single" type="checkbox" style="width:16px; height:16px;">
                Single line
            </label>
        `;
        flags.querySelector('#context-names-stop').checked = Boolean(p.names_as_stop_strings);
        flags.querySelector('#context-use-stop').checked = Boolean(p.use_stop_strings);
        flags.querySelector('#context-trim').checked = Boolean(p.trim_sentences);
        flags.querySelector('#context-single').checked = Boolean(p.single_line);
        wrap.appendChild(flags);

        return wrap;
    }

    renderInstructEditor(p) {
        const wrap = this.renderSection('Instruct 模板', '与 ST 相同：控制序列/包裹/宏（目前仅保存，暂未用于 prompt 构建）');

        const inputSeq = document.createElement('input');
        inputSeq.id = 'ins-input-seq';
        inputSeq.type = 'text';
        inputSeq.style.cssText = 'width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:14px;';
        inputSeq.value = p.input_sequence ?? '';

        const outputSeq = document.createElement('input');
        outputSeq.id = 'ins-output-seq';
        outputSeq.type = 'text';
        outputSeq.style.cssText = 'width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:14px;';
        outputSeq.value = p.output_sequence ?? '';

        const systemSeq = document.createElement('input');
        systemSeq.id = 'ins-system-seq';
        systemSeq.type = 'text';
        systemSeq.style.cssText = 'width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:14px;';
        systemSeq.value = p.system_sequence ?? '';

        const stopSeq = document.createElement('input');
        stopSeq.id = 'ins-stop-seq';
        stopSeq.type = 'text';
        stopSeq.style.cssText = 'width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:14px;';
        stopSeq.value = p.stop_sequence ?? '';

        wrap.appendChild(this.renderInputRow([
            { label: 'Input sequence', el: inputSeq },
            { label: 'Output sequence', el: outputSeq },
        ]));
        wrap.appendChild(this.renderInputRow([
            { label: 'System sequence', el: systemSeq },
            { label: 'Stop sequence', el: stopSeq },
        ]));

        const flags = document.createElement('div');
        flags.style.cssText = 'margin-top:10px; display:flex; gap:12px; flex-wrap:wrap;';
        flags.innerHTML = `
            <label style="display:flex; align-items:center; gap:8px; font-size:13px; color:#334155; cursor:pointer;">
                <input id="ins-wrap" type="checkbox" style="width:16px; height:16px;">
                Wrap
            </label>
            <label style="display:flex; align-items:center; gap:8px; font-size:13px; color:#334155; cursor:pointer;">
                <input id="ins-macro" type="checkbox" style="width:16px; height:16px;">
                Macro
            </label>
            <label style="display:flex; align-items:center; gap:8px; font-size:13px; color:#334155; cursor:pointer;">
                <input id="ins-skip-examples" type="checkbox" style="width:16px; height:16px;">
                Skip examples
            </label>
        `;
        flags.querySelector('#ins-wrap').checked = Boolean(p.wrap);
        flags.querySelector('#ins-macro').checked = Boolean(p.macro);
        flags.querySelector('#ins-skip-examples').checked = Boolean(p.skip_examples);
        wrap.appendChild(flags);

        return wrap;
    }

    renderOpenAIParamsEditor(p) {
        const wrap = this.renderSection('生成参数', '参照 ST：编辑常用生成参数；提示词区块请到「自定义」tab 管理（不限制特定 LLM，可自行绑定连接配置）');

        const temperature = document.createElement('input');
        temperature.id = 'gen-temperature';
        temperature.type = 'number';
        temperature.step = '0.01';
        temperature.style.cssText = 'width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:14px;';
        temperature.value = String(p.temperature ?? 1);

        const topP = document.createElement('input');
        topP.id = 'gen-top-p';
        topP.type = 'number';
        topP.step = '0.01';
        topP.style.cssText = 'width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:14px;';
        topP.value = String(p.top_p ?? 1);

        const topK = document.createElement('input');
        topK.id = 'gen-top-k';
        topK.type = 'number';
        topK.step = '1';
        topK.style.cssText = 'width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:14px;';
        topK.value = String(p.top_k ?? 0);

        const maxTokens = document.createElement('input');
        maxTokens.id = 'gen-max-tokens';
        maxTokens.type = 'number';
        maxTokens.step = '1';
        maxTokens.style.cssText = 'width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:14px;';
        maxTokens.value = String(p.openai_max_tokens ?? 300);

        const presence = document.createElement('input');
        presence.id = 'gen-presence';
        presence.type = 'number';
        presence.step = '0.01';
        presence.style.cssText = 'width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:14px;';
        presence.value = String(p.presence_penalty ?? 0);

        const frequency = document.createElement('input');
        frequency.id = 'gen-frequency';
        frequency.type = 'number';
        frequency.step = '0.01';
        frequency.style.cssText = 'width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:14px;';
        frequency.value = String(p.frequency_penalty ?? 0);

        wrap.appendChild(this.renderInputRow([
            { label: 'temperature', el: temperature },
            { label: 'top_p', el: topP },
            { label: 'top_k', el: topK },
        ]));
        wrap.appendChild(this.renderInputRow([
            { label: 'max_tokens', el: maxTokens },
            { label: 'presence_penalty', el: presence },
            { label: 'frequency_penalty', el: frequency },
        ]));

        return wrap;
    }

    renderOpenAIBlocksEditor(p) {
        const wrap = this.renderSection('自定义提示词区块（Prompt Blocks）', '与 ST 类似：区块默认折叠，点击展开；可拖拽排序并可新增自定义区块');

        // Prompt blocks (ST-like): show blocks in prompt_order, allow drag reorder
        const prompts = Array.isArray(p.prompts) ? p.prompts : [];
        const promptById = new Map();
        prompts.forEach(pr => {
            if (pr?.identifier) promptById.set(pr.identifier, pr);
        });
        const orderBlock = Array.isArray(p.prompt_order) ? p.prompt_order[0] : null;
        const order = Array.isArray(orderBlock?.order) ? orderBlock.order : [];

        const blocks = order.length
            ? order.map(o => ({ identifier: o.identifier, enabled: o.enabled !== false }))
            : prompts
                .filter(pr => pr?.identifier)
                .map(pr => ({ identifier: pr.identifier, enabled: true }));

        const box = document.createElement('div');
        box.style.cssText = 'margin-top:12px; padding-top:12px; border-top:1px solid rgba(0,0,0,0.06);';

        const headRow = document.createElement('div');
        headRow.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;';
        headRow.innerHTML = `
            <div>
                <div style="font-weight:800; color:#0f172a;">提示词区块（可拖拽排序）</div>
                <div style="color:#64748b; font-size:12px; margin-top:4px;">
                    与 ST 相同：可拖拽调整顺序；marker（如 Chat History/World Info）不显示内容
                </div>
            </div>
            <button type="button" id="openai-add-block" style="padding:8px 10px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer; font-size:12px;">
                ＋ 新增区块
            </button>
        `;
        box.appendChild(headRow);

        const list = document.createElement('div');
        list.id = 'openai-blocks';
        list.style.cssText = 'margin-top:10px; display:flex; flex-direction:column; gap:10px;';

        const makeBlockEl = ({ identifier, enabled }) => {
            const pr = promptById.get(identifier);
            const known = OPENAI_KNOWN_BLOCKS[identifier];
            const isMarker = Boolean(pr?.marker) || Boolean(known?.marker);
            const canEdit = !isMarker && (typeof pr?.content === 'string' || !pr);
            const title = pr?.name || known?.label || identifier;
            const roleName = roleIdToName(pr?.role || 'system');
            const sysPrompt = (typeof pr?.system_prompt === 'boolean') ? pr.system_prompt : true;

            const card = document.createElement('div');
            card.className = 'openai-block';
            card.draggable = true;
            card.dataset.identifier = identifier;
            card.dataset.collapsed = 'true';
            card.style.cssText = `
                border: 1px solid rgba(0,0,0,0.08);
                border-radius: 12px;
                background: #fff;
                overflow: hidden;
            `;

            const header = document.createElement('div');
            header.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; background:rgba(248,250,252,0.85);';

            const left = document.createElement('div');
            left.style.cssText = 'display:flex; align-items:center; gap:10px; min-width:0;';
            left.innerHTML = `
                <div class="collapse-toggle" style="font-size:16px; color:#64748b; user-select:none; width:18px;">▸</div>
                <div class="drag-handle" style="font-size:16px; color:#64748b; cursor:grab; user-select:none;">☰</div>
                <div style="min-width:0;">
                    <div style="font-weight:800; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${title}</div>
                    <div style="color:#64748b; font-size:12px;">${isMarker ? 'marker（自动填充）' : `role: ${roleName}`}</div>
                </div>
            `;
            header.appendChild(left);

            const right = document.createElement('div');
            right.style.cssText = 'display:flex; align-items:center; gap:10px;';
            const enabledWrap = document.createElement('label');
            enabledWrap.style.cssText = 'display:flex; align-items:center; gap:6px; font-size:12px; color:#334155; cursor:pointer;';
            enabledWrap.innerHTML = `<input type="checkbox" class="block-enabled" style="width:16px; height:16px;">启用`;
            const enabledInput = enabledWrap.querySelector('input');
            enabledInput.checked = enabled !== false;
            enabledInput.addEventListener('click', (e) => e.stopPropagation());
            right.appendChild(enabledWrap);

            if (canEdit) {
                const del = document.createElement('button');
                del.type = 'button';
                del.className = 'block-delete';
                del.textContent = '删除';
                del.style.cssText = 'padding:6px 10px; border:1px solid #fecaca; border-radius:10px; background:#fee2e2; color:#b91c1c; cursor:pointer; font-size:12px;';
                del.onclick = () => {
                    if (!confirm(`删除区块「${identifier}」？`)) return;
                    card.remove();
                };
                del.addEventListener('click', (e) => e.stopPropagation());
                right.appendChild(del);
            }

            header.appendChild(right);
            card.appendChild(header);

            const applyEnabledStyle = (isEnabled) => {
                if (isEnabled) {
                    card.style.opacity = '';
                    card.style.filter = '';
                    card.style.background = '#fff';
                    header.style.background = 'rgba(248,250,252,0.85)';
                } else {
                    // 视觉区分：整体灰化（ST 类似“禁用区块”效果）
                    card.style.opacity = '0.62';
                    card.style.filter = 'grayscale(1)';
                    card.style.background = '#f1f5f9';
                    header.style.background = '#e2e8f0';
                }
            };
            enabledInput.addEventListener('change', () => applyEnabledStyle(enabledInput.checked));
            applyEnabledStyle(enabledInput.checked);

            const setCollapsed = (collapsed) => {
                card.dataset.collapsed = collapsed ? 'true' : 'false';
                const toggle = header.querySelector('.collapse-toggle');
                if (toggle) toggle.textContent = collapsed ? '▸' : '▾';
                const body = card.querySelector('.block-body');
                if (body) body.style.display = collapsed ? 'none' : 'block';
            };
            header.addEventListener('click', () => {
                const collapsed = card.dataset.collapsed === 'true';
                setCollapsed(!collapsed);
            });

            if (canEdit) {
                const body = document.createElement('div');
                body.className = 'block-body';
                body.style.cssText = 'padding:10px 12px; display:none; flex-direction:column; gap:10px;';

                const nameInput = document.createElement('input');
                nameInput.type = 'text';
                nameInput.className = 'block-name';
                nameInput.placeholder = '区块名称';
                nameInput.style.cssText = 'width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:14px;';
                nameInput.value = pr?.name || title;

                const roleSel = document.createElement('select');
                roleSel.className = 'block-role';
                roleSel.style.cssText = 'width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:14px;';
                roleSel.innerHTML = `
                    <option value="system">system</option>
                    <option value="user">user</option>
                    <option value="assistant">assistant</option>
                `;
                roleSel.value = roleName;

                const sysChkWrap = document.createElement('label');
                sysChkWrap.style.cssText = 'display:flex; align-items:center; gap:8px; font-size:13px; color:#334155; cursor:pointer;';
                sysChkWrap.innerHTML = `<input type="checkbox" class="block-system" style="width:16px; height:16px;">system_prompt`;
                sysChkWrap.querySelector('input').checked = sysPrompt;

                const metaRow = document.createElement('div');
                metaRow.style.cssText = 'display:flex; gap:10px; flex-wrap:wrap;';
                const leftCell = document.createElement('div');
                leftCell.style.cssText = 'flex:1; min-width:180px;';
                leftCell.appendChild(nameInput);
                const rightCell = document.createElement('div');
                rightCell.style.cssText = 'flex:1; min-width:180px; display:flex; flex-direction:column; gap:8px;';
                rightCell.appendChild(roleSel);
                rightCell.appendChild(sysChkWrap);
                metaRow.appendChild(leftCell);
                metaRow.appendChild(rightCell);
                body.appendChild(metaRow);

                const taId = `openai-block-content-${identifier.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
                const label = `${identifier}`;
                const taBlock = this.renderTextarea(label, taId, pr?.content || '', '');
                const ta = taBlock.querySelector(`#${taId}`);
                if (ta) {
                    ta.dataset.promptIdentifier = identifier;
                    ta.classList.add('block-content');
                    ta.style.minHeight = '120px';
                }
                body.appendChild(taBlock);

                card.appendChild(body);
            } else {
                const hint = document.createElement('div');
                hint.className = 'block-body';
                hint.style.cssText = 'display:none; padding:10px 12px; color:#64748b; font-size:12px;';
                hint.textContent = '该区块为 marker，将在构建 prompt 时自动填充内容（不在此处编辑）。';
                card.appendChild(hint);
            }

            // Drag reorder
            card.addEventListener('dragstart', (e) => {
                e.dataTransfer?.setData('text/plain', identifier);
                e.dataTransfer?.setDragImage(card, 20, 20);
                card.style.opacity = '0.6';
            });
            card.addEventListener('dragend', () => {
                card.style.opacity = '';
                list.querySelectorAll('.openai-block').forEach(el => el.classList.remove('drop-target'));
            });
            card.addEventListener('dragover', (e) => {
                e.preventDefault();
                card.classList.add('drop-target');
            });
            card.addEventListener('dragleave', () => {
                card.classList.remove('drop-target');
            });
            card.addEventListener('drop', (e) => {
                e.preventDefault();
                const fromId = e.dataTransfer?.getData('text/plain');
                if (!fromId || fromId === identifier) return;
                const fromEl = list.querySelector(`.openai-block[data-identifier="${CSS.escape(fromId)}"]`);
                if (!fromEl) return;
                list.insertBefore(fromEl, card);
                card.classList.remove('drop-target');
            });

            // default collapsed
            setCollapsed(true);
            return card;
        };

        blocks.forEach(b => {
            if (!b?.identifier) return;
            list.appendChild(makeBlockEl(b));
        });
        box.appendChild(list);

        // Add block action
        headRow.querySelector('#openai-add-block').onclick = () => {
            const identifier = prompt('区块 identifier（唯一，如 myPrompt）', `custom_${Date.now()}`);
            if (!identifier) return;
            const exists = list.querySelector(`.openai-block[data-identifier="${CSS.escape(identifier)}"]`);
            if (exists) {
                window.toastr?.warning?.('identifier 已存在');
                return;
            }
            const name = prompt('区块名称', identifier) || identifier;
            const role = (prompt('role: system/user/assistant', 'system') || 'system').toLowerCase();
            const content = prompt('区块内容（可稍后再改）', '') ?? '';
            promptById.set(identifier, {
                identifier,
                name,
                role,
                system_prompt: true,
                marker: false,
                content,
            });
            list.appendChild(makeBlockEl({ identifier, enabled: true }));
        };

        wrap.appendChild(box);

        return wrap;
    }

    collectEditorData() {
        const root = this.element.querySelector('#preset-editor');
        const storeType = this.getStoreType();
        const current = deepClone(this.store.getActive(storeType) || {});

        if (this.activeType === 'sysprompt') {
            current.content = root.querySelector('#sysprompt-content')?.value ?? '';
            current.post_history = root.querySelector('#sysprompt-post')?.value ?? '';
            return current;
        }

        if (this.activeType === 'context') {
            current.story_string = root.querySelector('#context-story')?.value ?? '';
            current.story_string_position = getInt(root.querySelector('#context-position')?.value, current.story_string_position ?? EXT_PROMPT_TYPES.IN_PROMPT);
            current.story_string_depth = getInt(root.querySelector('#context-depth')?.value, current.story_string_depth ?? 1);
            current.story_string_role = getInt(root.querySelector('#context-role')?.value, current.story_string_role ?? EXT_PROMPT_ROLES.SYSTEM);
            current.example_separator = root.querySelector('#context-example-sep')?.value ?? '';
            current.chat_start = root.querySelector('#context-chat-start')?.value ?? '';
            current.names_as_stop_strings = Boolean(root.querySelector('#context-names-stop')?.checked);
            current.use_stop_strings = Boolean(root.querySelector('#context-use-stop')?.checked);
            current.trim_sentences = Boolean(root.querySelector('#context-trim')?.checked);
            current.single_line = Boolean(root.querySelector('#context-single')?.checked);
            return current;
        }

        if (this.activeType === 'instruct') {
            current.input_sequence = root.querySelector('#ins-input-seq')?.value ?? '';
            current.output_sequence = root.querySelector('#ins-output-seq')?.value ?? '';
            current.system_sequence = root.querySelector('#ins-system-seq')?.value ?? '';
            current.stop_sequence = root.querySelector('#ins-stop-seq')?.value ?? '';
            current.wrap = Boolean(root.querySelector('#ins-wrap')?.checked);
            current.macro = Boolean(root.querySelector('#ins-macro')?.checked);
            current.skip_examples = Boolean(root.querySelector('#ins-skip-examples')?.checked);
            return current;
        }

        if (this.activeType === 'openai') {
            current.temperature = getNum(root.querySelector('#gen-temperature')?.value, current.temperature ?? 1);
            current.top_p = getNum(root.querySelector('#gen-top-p')?.value, current.top_p ?? 1);
            current.top_k = getInt(root.querySelector('#gen-top-k')?.value, current.top_k ?? 0);
            current.openai_max_tokens = getInt(root.querySelector('#gen-max-tokens')?.value, current.openai_max_tokens ?? 300);
            current.presence_penalty = getNum(root.querySelector('#gen-presence')?.value, current.presence_penalty ?? 0);
            current.frequency_penalty = getNum(root.querySelector('#gen-frequency')?.value, current.frequency_penalty ?? 0);
            current.boundProfileId = window.appBridge?.config?.getActiveProfileId?.() || current.boundProfileId || null;
            return current;
        }

        if (this.activeType === 'custom') {
            // Save prompts + prompt_order from blocks
            const prompts = Array.isArray(current.prompts) ? current.prompts : [];
            const promptById = new Map();
            prompts.forEach(pr => { if (pr?.identifier) promptById.set(pr.identifier, pr); });

            const textareas = root.querySelectorAll('textarea[data-prompt-identifier]');
            textareas.forEach((ta) => {
                const ident = ta.dataset.promptIdentifier;
                if (!ident) return;
                const container = ta.closest('.openai-block');
                const name = container?.querySelector('.block-name')?.value;
                const role = container?.querySelector('.block-role')?.value;
                const systemPrompt = container?.querySelector('.block-system')?.checked;
                const existing = promptById.get(ident) || { identifier: ident };
                const next = {
                    ...existing,
                    identifier: ident,
                    name: (name || existing.name || ident),
                    role: roleIdToName(role || existing.role || 'system'),
                    system_prompt: typeof systemPrompt === 'boolean' ? systemPrompt : (existing.system_prompt ?? true),
                    marker: false,
                    content: String(ta.value || ''),
                };
                promptById.set(ident, next);
            });

            const blocks = Array.from(root.querySelectorAll('.openai-block'));
            const order = blocks
                .map((el) => {
                    const identifier = el.dataset.identifier || '';
                    const enabled = el.querySelector('.block-enabled')?.checked !== false;
                    return identifier ? { identifier, enabled } : null;
                })
                .filter(Boolean);

            order.forEach(({ identifier }) => {
                if (!identifier) return;
                if (promptById.has(identifier)) return;
                const known = OPENAI_KNOWN_BLOCKS[identifier];
                if (known?.marker) {
                    promptById.set(identifier, { identifier, name: known.label, system_prompt: true, marker: true });
                }
            });

            current.prompts = Array.from(promptById.values());
            if (!Array.isArray(current.prompt_order)) current.prompt_order = [];
            if (!current.prompt_order[0] || typeof current.prompt_order[0] !== 'object') {
                current.prompt_order[0] = { character_id: 100000, order: [] };
            }
            current.prompt_order[0].order = order;
            current.boundProfileId = window.appBridge?.config?.getActiveProfileId?.() || current.boundProfileId || null;
            return current;
        }

        return current;
    }

    async onSave() {
        await this.store.ready;
        const storeType = this.getStoreType();
        const currentId = this.store.getActiveId(storeType);
        const data = this.collectEditorData();
        const name = String(data.name || '').trim() || currentId || '未命名';

        try {
            await this.store.upsert(storeType, { id: currentId, name, data: { ...data, name } });
            await this.refreshAll();
            this.showStatus('保存成功', 'success');
            window.dispatchEvent(new CustomEvent('preset-changed'));
        } catch (err) {
            logger.error('保存预设失败', err);
            this.showStatus(err.message || '保存失败', 'error');
        }
    }

    async onNew() {
        await this.store.ready;
        const name = prompt('新建预设名称', '新预设');
        if (!name) return;
        const base = this.store.getActive(this.getStoreType()) || {};
        const data = { ...deepClone(base), name };
        const id = await this.store.upsert(this.getStoreType(), { name, data });
        await this.store.setActive(this.getStoreType(), id);
        await this.refreshAll();
        this.showStatus('已新建', 'success');
        window.dispatchEvent(new CustomEvent('preset-changed'));
    }

    async onRename() {
        await this.store.ready;
        const id = this.store.getActiveId(this.getStoreType());
        const current = this.store.getActive(this.getStoreType());
        if (!id || !current) return;
        const name = prompt('重命名预设', current.name || id);
        if (!name) return;
        await this.store.upsert(this.getStoreType(), { id, name, data: { ...current, name } });
        await this.refreshAll();
        this.showStatus('已重命名', 'success');
        window.dispatchEvent(new CustomEvent('preset-changed'));
    }

    async onDelete() {
        await this.store.ready;
        const id = this.store.getActiveId(this.getStoreType());
        if (!id) return;
        if (!confirm('删除该预设？此操作不可恢复。')) return;
        await this.store.remove(this.getStoreType(), id);
        await this.refreshAll();
        this.showStatus('已删除', 'success');
        window.dispatchEvent(new CustomEvent('preset-changed'));
    }
}
