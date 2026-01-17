/**
 * 世界书编辑弹窗（参考 SillyTavern World Info 设计）
 * - 双栏：左侧条目列表，右侧条目编辑
 * - 支持新增/复制/删除条目与保存
 * - 保存时保留 ST 字段，并兼容旧字段命名
 */

import { logger } from '../utils/logger.js';

const DEFAULT_DEPTH = 4;
const DEFAULT_WEIGHT = 100;

const SELECTIVE_LOGIC_OPTIONS = [
    { value: 0, label: 'AND 任一（匹配任一关键词）' },
    { value: 1, label: 'NOT 全部（不匹配全部关键词）' },
    { value: 2, label: 'NOT 任一（不匹配任一关键词）' },
    { value: 3, label: 'AND 全部（匹配全部关键词）' },
];

const POSITION_OPTIONS = [
    { value: 0, label: '↑Char（角色前）' },
    { value: 1, label: '↓Char（角色后）' },
    { value: 2, label: '↑AT（作者备注前）' },
    { value: 3, label: '↓AT（作者备注后）' },
    { value: 4, label: '@Depth（按深度插入）' },
    { value: 5, label: '↑EM（例子前）' },
    { value: 6, label: '↓EM（例子后）' },
];

const ROLE_OPTIONS = [
    { value: 0, label: 'system' },
    { value: 1, label: 'user' },
    { value: 2, label: 'assistant' },
];

const deepClone = (obj) => {
    try {
        return structuredClone(obj);
    } catch {
        return JSON.parse(JSON.stringify(obj || {}));
    }
};

const toNumber = (val, def) => {
    const n = Number(val);
    return Number.isFinite(n) ? n : def;
};

const normalizeArray = (val) => {
    if (Array.isArray(val)) return val.map(v => String(v).trim()).filter(Boolean);
    if (typeof val === 'string') {
        return val.split(/[,，\n\r]/).map(s => s.trim()).filter(Boolean);
    }
    return [];
};

const normalizeEntry = (entry = {}, index = 0) => {
    const e = { ...entry };

    e.id = e.id ?? (Number.isInteger(e.uid) ? String(e.uid) : `entry-${index}`);
    if (e.uid == null && /^\d+$/.test(e.id)) {
        e.uid = Number(e.id);
    }

    const comment = e.comment ?? e.title ?? '';
    e.comment = comment;
    e.title = comment;

    const key = normalizeArray(e.key ?? e.triggers);
    const keysecondary = normalizeArray(e.keysecondary ?? e.secondary);
    e.key = key;
    e.triggers = key;
    e.keysecondary = keysecondary;
    e.secondary = keysecondary;

    const order = toNumber(e.order ?? e.priority, 100);
    e.order = order;
    e.priority = order;

    e.depth = toNumber(e.depth, DEFAULT_DEPTH);
    e.position = toNumber(e.position, 0);
    e.role = toNumber(e.role, 0);

    e.disable = Boolean(e.disable);
    e.constant = Boolean(e.constant);
    e.selective = e.selective !== false;
    e.selectiveLogic = toNumber(e.selectiveLogic, 0);

    // 概率：旧格式可能是 0-1 的 ratio
    const rawProb = e.probability;
    const probPercent = typeof rawProb === 'number'
        ? (rawProb <= 1 ? Math.round(rawProb * 100) : Math.round(rawProb))
        : 100;
    e.probability = probPercent;
    e.useProbability = e.useProbability !== false;

    e.ignoreBudget = Boolean(e.ignoreBudget);
    e.excludeRecursion = Boolean(e.excludeRecursion);
    e.preventRecursion = Boolean(e.preventRecursion);
    e.vectorized = Boolean(e.vectorized);
    e.addMemo = Boolean(e.addMemo);

    e.matchPersonaDescription = Boolean(e.matchPersonaDescription);
    e.matchCharacterDescription = Boolean(e.matchCharacterDescription);
    e.matchCharacterPersonality = Boolean(e.matchCharacterPersonality);
    e.matchCharacterDepthPrompt = Boolean(e.matchCharacterDepthPrompt);
    e.matchScenario = Boolean(e.matchScenario);
    e.matchCreatorNotes = Boolean(e.matchCreatorNotes);

    e.group = e.group ?? '';
    e.groupOverride = Boolean(e.groupOverride);
    e.groupWeight = toNumber(e.groupWeight, DEFAULT_WEIGHT);

    e.scanDepth = e.scanDepth ?? null;
    e.caseSensitive = e.caseSensitive ?? null;
    e.matchWholeWords = e.matchWholeWords ?? null;
    e.useGroupScoring = e.useGroupScoring ?? null;

    e.automationId = e.automationId ?? '';
    e.sticky = e.sticky ?? null;
    e.cooldown = e.cooldown ?? null;
    e.delay = e.delay ?? null;
    e.delayUntilRecursion = toNumber(e.delayUntilRecursion, 0);

    e.content = e.content ?? '';
    return e;
};

const createDefaultEntry = (index = 0) => normalizeEntry({ constant: true, selective: false }, index);

const positionLabel = (pos = 0, role = 0, depth = DEFAULT_DEPTH) => {
    switch (Number(pos)) {
        case 0: return '↑Char';
        case 1: return '↓Char';
        case 2: return '↑AT';
        case 3: return '↓AT';
        case 4: return `@D${depth}/${ROLE_OPTIONS.find(r => r.value === role)?.label || 'system'}`;
        case 5: return '↑EM';
        case 6: return '↓EM';
        default: return String(pos);
    }
};

export class WorldEditorModal {
    constructor({ onSaved } = {}) {
        this.overlay = null;
        this.modal = null;
        this.entriesListEl = null;
        this.editorEl = null;
        this.titleEl = null;
        this.saveBtn = null;
        this.addBtn = null;
        this.worldName = '';
        this.data = { name: '', entries: [] };
        this.currentIndex = 0;
        this.onSaved = onSaved;
    }

    async show(name, data) {
        if (!this.modal) {
            this.createUI();
        }
        this.worldName = name;
        this.data = deepClone(data || { name, entries: [] });
        if (!Array.isArray(this.data.entries)) this.data.entries = [];
        this.data.entries = this.data.entries.map((e, i) => normalizeEntry(e, i));
        if (!this.data.entries.length) {
            this.data.entries.push(createDefaultEntry(0));
        }
        if (this.titleEl) {
            this.titleEl.textContent = `世界书：${name}`;
        }
        this.currentIndex = 0;
        this.renderList();
        this.selectEntry(0);
        this.overlay.style.display = 'block';
        this.modal.style.display = 'block';
    }

    hide() {
        if (this.overlay) this.overlay.style.display = 'none';
        if (this.modal) this.modal.style.display = 'none';
    }

    createUI() {
        this.overlay = document.createElement('div');
        this.overlay.id = 'world-editor-overlay';
        this.overlay.className = 'popup-overlay';
        this.overlay.style.display = 'none';
        // Ensure editor sits above world management panel
        this.overlay.style.position = 'fixed';
        this.overlay.style.inset = '0';
        this.overlay.style.background = 'rgba(0,0,0,0.45)';
        this.overlay.style.zIndex = '22000';
        this.overlay.onclick = () => this.hide();

        this.modal = document.createElement('div');
        this.modal.id = 'world-editor-modal';
        this.modal.className = 'world-editor-popup';
        this.modal.style.display = 'none';
        this.modal.style.position = 'fixed';
        this.modal.style.top = '50%';
        this.modal.style.left = '50%';
        this.modal.style.transform = 'translate(-50%, -50%)';
        this.modal.style.zIndex = '23000';
        this.modal.onclick = (e) => e.stopPropagation();

        this.modal.innerHTML = `
            <div class="world-editor-header">
                <div class="world-editor-title" id="world-editor-title">世界书</div>
                <div class="world-editor-actions">
                    <button id="world-editor-save">保存</button>
                    <button id="world-editor-close" class="world-editor-close">×</button>
                </div>
            </div>
            <div class="world-editor-body">
                <div class="world-entries-column">
                    <div class="world-entries-toolbar">
                        <button id="world-entry-add">＋ 新条目</button>
                    </div>
                    <ul id="world-entries-list" class="world-entries-list"></ul>
                </div>
                <div id="world-entry-editor" class="world-entry-editor"></div>
            </div>
        `;

        this.entriesListEl = this.modal.querySelector('#world-entries-list');
        this.editorEl = this.modal.querySelector('#world-entry-editor');
        this.titleEl = this.modal.querySelector('#world-editor-title');
        this.saveBtn = this.modal.querySelector('#world-editor-save');
        this.addBtn = this.modal.querySelector('#world-entry-add');

        this.modal.querySelector('#world-editor-close').onclick = () => this.hide();
        this.saveBtn.onclick = () => this.saveWorld();
        this.addBtn.onclick = () => this.addEntry();

        document.body.appendChild(this.overlay);
        document.body.appendChild(this.modal);
    }

    renderList() {
        if (!this.entriesListEl) return;
        this.entriesListEl.innerHTML = '';
        this.data.entries.forEach((entry, i) => {
            const li = document.createElement('li');
            li.className = `world-entry-item ${i === this.currentIndex ? 'active' : ''}`;

            const lights = document.createElement('div');
            lights.className = 'world-entry-lights';
            const green = document.createElement('span');
            green.className = `world-entry-light ${entry.disable ? 'red' : 'green'}`;
            const blue = document.createElement('span');
            blue.className = `world-entry-light ${entry.constant ? 'blue' : ''}`;
            lights.appendChild(green);
            lights.appendChild(blue);

            const main = document.createElement('div');
            main.className = 'world-entry-main';
            const title = document.createElement('div');
            title.className = 'world-entry-title';
            title.textContent = entry.comment || `（无标题 ${i + 1}）`;
            const meta = document.createElement('div');
            meta.className = 'world-entry-meta';
            const pos = positionLabel(entry.position, entry.role, entry.depth);
            meta.innerHTML = `
                <span>${pos}</span>
                <span>D${entry.depth}</span>
                <span>O${entry.order}</span>
                <span>${entry.useProbability ? `${entry.probability}%` : '100%'}</span>
            `;
            main.appendChild(title);
            main.appendChild(meta);

            li.appendChild(lights);
            li.appendChild(main);
            li.onclick = () => this.selectEntry(i);
            this.entriesListEl.appendChild(li);
        });
    }

    selectEntry(index) {
        this.currentIndex = Math.max(0, Math.min(index, this.data.entries.length - 1));
        this.renderList();
        this.renderEditor();
    }

    renderEditor() {
        if (!this.editorEl) return;
        const entry = this.data.entries[this.currentIndex];
        if (!entry) {
            this.editorEl.innerHTML = '<div style="color:#888;">（无条目）</div>';
            return;
        }

        const buildOptions = (opts, selected) =>
            opts.map(o => `<option value="${o.value}" ${Number(selected) === o.value ? 'selected' : ''}>${o.label}</option>`).join('');

        this.editorEl.innerHTML = `
            <div class="world-entry-form">
                <label>标题 / Memo</label>
                <input type="text" id="we-comment" value="${entry.comment || ''}" placeholder="条目标题（可选）">

                <label>内容</label>
                <textarea id="we-content" placeholder="条目内容">${entry.content || ''}</textarea>

                <div class="world-entry-row">
                    <div class="col">
                        <label>主触发关键词（key）</label>
                        <textarea id="we-key" placeholder="用逗号或换行分隔">${(entry.key || []).join(', ')}</textarea>
                    </div>
                    <div class="col">
                        <label>副触发关键词（keysecondary）</label>
                        <textarea id="we-keysecondary" placeholder="用逗号或换行分隔">${(entry.keysecondary || []).join(', ')}</textarea>
                    </div>
                </div>

                <div class="world-entry-row">
                    <div class="col">
                        <label>位置（position）</label>
                        <select id="we-position">${buildOptions(POSITION_OPTIONS, entry.position)}</select>
                    </div>
                    <div class="col">
                        <label>深度（depth）</label>
                        <input type="number" id="we-depth" min="0" max="1000" value="${entry.depth}">
                    </div>
                    <div class="col">
                        <label>顺序 / Order</label>
                        <input type="number" id="we-order" min="-9999" max="9999" value="${entry.order}">
                    </div>
                </div>

                <div class="world-entry-row">
                    <div class="col">
                        <label>触发概率（Trigger %）</label>
                        <input type="number" id="we-probability" min="0" max="100" value="${entry.probability}">
                    </div>
                    <div class="col">
                        <label>&nbsp;</label>
                        <div class="world-entry-toggles">
                            <label><input type="checkbox" id="we-useProbability" ${entry.useProbability ? 'checked' : ''}> 启用概率</label>
                        </div>
                    </div>
                    <div class="col" id="we-role-wrap" style="${Number(entry.position) === 4 ? '' : 'display:none;'}">
                        <label>插入角色（role）</label>
                        <select id="we-role">${buildOptions(ROLE_OPTIONS, entry.role)}</select>
                    </div>
                </div>

                <div class="world-entry-section">
                    <label>状态（绿灯 / 蓝灯等）</label>
                    <div class="world-entry-toggles">
                        <label><input type="checkbox" id="we-disable" ${entry.disable ? 'checked' : ''}> 禁用（红灯）</label>
                        <label><input type="checkbox" id="we-constant" ${entry.constant ? 'checked' : ''}> 常驻（蓝灯）</label>
                        <label><input type="checkbox" id="we-selective" ${entry.selective ? 'checked' : ''}> 选择性触发（绿灯）</label>
                        <label><input type="checkbox" id="we-ignoreBudget" ${entry.ignoreBudget ? 'checked' : ''}> 忽略预算</label>
                        <label><input type="checkbox" id="we-excludeRecursion" ${entry.excludeRecursion ? 'checked' : ''}> 不参与递归</label>
                        <label><input type="checkbox" id="we-preventRecursion" ${entry.preventRecursion ? 'checked' : ''}> 阻止递归</label>
                    </div>

                    <label style="margin-top:8px;">选择性逻辑（Selective Logic）</label>
                    <select id="we-selectiveLogic">${buildOptions(SELECTIVE_LOGIC_OPTIONS, entry.selectiveLogic)}</select>
                </div>

                <div class="world-entry-section">
                    <label>匹配来源（Match）</label>
                    <div class="world-entry-toggles">
                        <label><input type="checkbox" id="we-matchPersonaDescription" ${entry.matchPersonaDescription ? 'checked' : ''}> Persona 描述</label>
                        <label><input type="checkbox" id="we-matchCharacterDescription" ${entry.matchCharacterDescription ? 'checked' : ''}> 角色描述</label>
                        <label><input type="checkbox" id="we-matchCharacterPersonality" ${entry.matchCharacterPersonality ? 'checked' : ''}> 角色性格</label>
                        <label><input type="checkbox" id="we-matchCharacterDepthPrompt" ${entry.matchCharacterDepthPrompt ? 'checked' : ''}> 角色深度提示</label>
                        <label><input type="checkbox" id="we-matchScenario" ${entry.matchScenario ? 'checked' : ''}> 场景</label>
                        <label><input type="checkbox" id="we-matchCreatorNotes" ${entry.matchCreatorNotes ? 'checked' : ''}> 作者注释</label>
                    </div>
                </div>

                <div class="world-entry-section">
                    <div class="world-entry-row">
                        <div class="col">
                            <label>纳入组（group）</label>
                            <input type="text" id="we-group" value="${entry.group || ''}" placeholder="逗号分隔多个组">
                        </div>
                        <div class="col">
                            <label>组权重（groupWeight）</label>
                            <input type="number" id="we-groupWeight" min="0" max="9999" value="${entry.groupWeight}">
                        </div>
                    </div>
                    <div class="world-entry-toggles" style="margin-top:6px;">
                        <label><input type="checkbox" id="we-groupOverride" ${entry.groupOverride ? 'checked' : ''}> 允许覆盖同组</label>
                        <label><input type="checkbox" id="we-caseSensitive" ${entry.caseSensitive ? 'checked' : ''}> 区分大小写（覆盖）</label>
                        <label><input type="checkbox" id="we-matchWholeWords" ${entry.matchWholeWords ? 'checked' : ''}> 全词匹配（覆盖）</label>
                        <label><input type="checkbox" id="we-useGroupScoring" ${entry.useGroupScoring ? 'checked' : ''}> 组打分（覆盖）</label>
                    </div>
                    <label style="margin-top:6px;">扫描深度覆盖（scanDepth，可空）</label>
                    <input type="number" id="we-scanDepth" min="0" max="1000" value="${entry.scanDepth ?? ''}" placeholder="留空使用全局设置">
                </div>

                <div class="world-entry-actions">
                    <button id="we-duplicate">复制条目</button>
                    <button id="we-delete">删除条目</button>
                </div>
            </div>
        `;

        const q = (sel) => this.editorEl.querySelector(sel);
        const bindInput = (sel, key, map = (v) => v) => {
            const el = q(sel);
            if (!el) return;
            el.addEventListener('input', () => {
                entry[key] = map(el.value);
                if (key === 'comment') this.renderList();
            });
        };
        const bindNumber = (sel, key, def, min, max) => {
            const el = q(sel);
            if (!el) return;
            el.addEventListener('input', () => {
                let v = toNumber(el.value, def);
                if (min != null) v = Math.max(min, v);
                if (max != null) v = Math.min(max, v);
                entry[key] = v;
                if (key === 'order' || key === 'depth' || key === 'position') this.renderList();
            });
        };
        const bindCheck = (sel, key) => {
            const el = q(sel);
            if (!el) return;
            el.addEventListener('change', () => {
                entry[key] = el.checked;
                this.renderList();
            });
        };

        bindInput('#we-comment', 'comment', (v) => v);
        bindInput('#we-content', 'content', (v) => v);
        bindInput('#we-key', 'key', (v) => normalizeArray(v));
        bindInput('#we-keysecondary', 'keysecondary', (v) => normalizeArray(v));

        bindNumber('#we-depth', 'depth', DEFAULT_DEPTH, 0, 1000);
        bindNumber('#we-order', 'order', 100, -9999, 9999);
        bindNumber('#we-probability', 'probability', 100, 0, 100);
        bindNumber('#we-groupWeight', 'groupWeight', DEFAULT_WEIGHT, 0, 9999);
        bindNumber('#we-delayUntilRecursion', 'delayUntilRecursion', 0, 0, 9999);

        const posEl = q('#we-position');
        if (posEl) {
            posEl.addEventListener('change', () => {
                entry.position = toNumber(posEl.value, 0);
                const roleWrap = q('#we-role-wrap');
                if (roleWrap) roleWrap.style.display = Number(entry.position) === 4 ? '' : 'none';
                this.renderList();
            });
        }

        const roleEl = q('#we-role');
        if (roleEl) {
            roleEl.addEventListener('change', () => {
                entry.role = toNumber(roleEl.value, 0);
                this.renderList();
            });
        }

        const logicEl = q('#we-selectiveLogic');
        if (logicEl) {
            logicEl.addEventListener('change', () => {
                entry.selectiveLogic = toNumber(logicEl.value, 0);
            });
        }

        // 覆盖类字段：checkbox 表示 true；若取消则置 null（表示不覆盖）
        const bindOverrideCheck = (sel, key) => {
            const el = q(sel);
            if (!el) return;
            el.addEventListener('change', () => {
                entry[key] = el.checked ? true : null;
            });
        };

        bindCheck('#we-disable', 'disable');
        bindCheck('#we-constant', 'constant');
        bindCheck('#we-selective', 'selective');
        bindCheck('#we-ignoreBudget', 'ignoreBudget');
        bindCheck('#we-excludeRecursion', 'excludeRecursion');
        bindCheck('#we-preventRecursion', 'preventRecursion');

        bindCheck('#we-matchPersonaDescription', 'matchPersonaDescription');
        bindCheck('#we-matchCharacterDescription', 'matchCharacterDescription');
        bindCheck('#we-matchCharacterPersonality', 'matchCharacterPersonality');
        bindCheck('#we-matchCharacterDepthPrompt', 'matchCharacterDepthPrompt');
        bindCheck('#we-matchScenario', 'matchScenario');
        bindCheck('#we-matchCreatorNotes', 'matchCreatorNotes');

        bindInput('#we-group', 'group', (v) => v);
        bindCheck('#we-groupOverride', 'groupOverride');

        bindOverrideCheck('#we-caseSensitive', 'caseSensitive');
        bindOverrideCheck('#we-matchWholeWords', 'matchWholeWords');
        bindOverrideCheck('#we-useGroupScoring', 'useGroupScoring');

        const scanDepthEl = q('#we-scanDepth');
        if (scanDepthEl) {
            scanDepthEl.addEventListener('input', () => {
                const v = scanDepthEl.value.trim();
                entry.scanDepth = v === '' ? null : toNumber(v, null);
            });
        }

        bindCheck('#we-useProbability', 'useProbability');

        const dupBtn = q('#we-duplicate');
        if (dupBtn) dupBtn.onclick = () => this.duplicateEntry(this.currentIndex);
        const delBtn = q('#we-delete');
        if (delBtn) delBtn.onclick = () => this.deleteEntry(this.currentIndex);
    }

    addEntry() {
        const newEntry = createDefaultEntry(this.data.entries.length);
        newEntry.id = `entry-${Date.now()}`;
        this.data.entries.unshift(newEntry);
        this.selectEntry(0);
    }

    duplicateEntry(index) {
        const base = this.data.entries[index];
        if (!base) return;
        const copy = normalizeEntry(deepClone(base), this.data.entries.length);
        copy.id = `entry-${Date.now()}`;
        copy.comment = `${copy.comment || 'entry'}（复制）`;
        this.data.entries.splice(index + 1, 0, copy);
        this.selectEntry(index + 1);
    }

    deleteEntry(index) {
        if (this.data.entries.length <= 1) {
            window.toastr?.warning('至少保留一个条目');
            return;
        }
        this.data.entries.splice(index, 1);
        this.selectEntry(Math.max(0, index - 1));
    }

    prepareForSave() {
        const entries = this.data.entries.map((entry, i) => {
            const e = normalizeEntry(entry, i);
            // 兼容旧命名
            e.title = e.comment;
            e.triggers = e.key;
            e.secondary = e.keysecondary;
            e.priority = e.order;
            return e;
        });
        return { name: this.worldName, entries };
    }

    async saveWorld() {
        try {
            const payload = this.prepareForSave();
            await window.appBridge.saveWorldInfo(this.worldName, payload);
            window.toastr?.success(`世界书已保存：${this.worldName}`);
            this.onSaved?.(this.worldName, payload);
            this.hide();
        } catch (err) {
            logger.error('保存世界书失败', err);
            window.toastr?.error('保存失败，请检查控制台');
        }
    }
}
