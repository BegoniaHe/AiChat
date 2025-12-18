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

const canInitClient = (cfg) => {
    const c = cfg || {};
    const hasKey = typeof c.apiKey === 'string' && c.apiKey.trim().length > 0;
    const hasVertexSa = c.provider === 'vertexai' && typeof c.vertexaiServiceAccount === 'string' && c.vertexaiServiceAccount.trim().length > 0;
    return hasKey || hasVertexSa;
};

const PRESET_TYPES = [
    { id: 'sysprompt', label: '系统提示词' },
    { id: 'chatprompts', label: '聊天提示词' },
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
    SYSTEM_DEPTH_1: 3, // 固定：history 后（<chat_guide>）
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
        // Drafts keyed by `${storeType}:${presetId}` so changes across tabs aren't lost.
        this.drafts = new Map();
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
                window.appBridge.client = canInitClient(cfg) ? new LLMClient(cfg) : null;
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
                this.captureDraft();
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
            this.captureDraft();
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
        // OpenAI preset: ST exports are raw preset objects; prompts can be an array or an object map.
        if (
            'temperature' in obj ||
            'top_p' in obj ||
            'temp_openai' in obj ||
            'top_p_openai' in obj ||
            'openai_max_context' in obj ||
            'openai_max_tokens' in obj ||
            ('prompts' in obj) ||
            ('prompt_order' in obj)
        ) return 'openai';
        return null;
    }

    convertStRegexScriptsToRules(regexes = []) {
        const scripts = Array.isArray(regexes) ? regexes : [];
        const rules = [];
        scripts.forEach((s) => {
            const findRegex = String(s?.findRegex || '').trim();
            if (!findRegex) return;
            rules.push({
                id: s?.id || undefined,
                scriptName: String(s?.scriptName || '').trim(),
                findRegex,
                replaceString: String(s?.replaceString ?? ''),
                trimStrings: Array.isArray(s?.trimStrings) ? s.trimStrings : [],
                placement: Array.isArray(s?.placement) ? s.placement : [],
                disabled: Boolean(s?.disabled),
                markdownOnly: Boolean(s?.markdownOnly),
                promptOnly: Boolean(s?.promptOnly),
                runOnEdit: Boolean(s?.runOnEdit),
                substituteRegex: Number(s?.substituteRegex ?? 0),
                minDepth: s?.minDepth ?? null,
                maxDepth: s?.maxDepth ?? null,
            });
        });
        return rules;
    }

    getRuleSignature(r) {
        const findRegex = String(r?.findRegex || '').trim();
        const replaceString = String(r?.replaceString ?? '');
        const trim = Array.isArray(r?.trimStrings) ? r.trimStrings.map(String).join('\n') : '';
        const placement = Array.isArray(r?.placement) ? r.placement.map(n => Number(n)).filter(Number.isFinite).sort((a, b) => a - b).join(',') : '';
        const disabled = r?.disabled ? '1' : '0';
        const markdownOnly = r?.markdownOnly ? '1' : '0';
        const promptOnly = r?.promptOnly ? '1' : '0';
        const runOnEdit = r?.runOnEdit ? '1' : '0';
        const sub = String(Number(r?.substituteRegex ?? 0));
        const minD = (r?.minDepth === null || r?.minDepth === undefined || r?.minDepth === '') ? '' : String(r?.minDepth);
        const maxD = (r?.maxDepth === null || r?.maxDepth === undefined || r?.maxDepth === '') ? '' : String(r?.maxDepth);
        if (!findRegex && String(r?.pattern || '').trim()) {
            const when = String(r?.when || 'both');
            const pattern = String(r?.pattern || '').trim();
            const flags = (r?.flags === undefined || r?.flags === null) ? 'g' : String(r?.flags);
            const replacement = String(r?.replacement ?? '');
            return `${when}\u0000${pattern}\u0000${flags}\u0000${replacement}`;
        }
        // ignore id/scriptName; focus on behavior
        return [
            findRegex, replaceString, trim, placement,
            disabled, markdownOnly, promptOnly, runOnEdit, sub, minD, maxD
        ].join('\u0000');
    }

    getExistingLocalRuleSigs() {
        const sigs = new Set();
        try {
            const sets = window.appBridge?.regex?.listLocalSets?.() || [];
            sets.forEach(s => {
                (Array.isArray(s?.rules) ? s.rules : []).forEach(r => {
                    sigs.add(this.getRuleSignature(r));
                });
            });
        } catch {}
        return sigs;
    }

    extractStRegexBindingSets(obj) {
        const out = [];
        const seenScriptIds = new Set();

        const tryAddRegexes = (container) => {
            const regexes = container?.RegexBinding?.regexes;
            if (!Array.isArray(regexes) || !regexes.length) return;
            const filtered = regexes.filter(r => {
                const id = String(r?.id || '');
                if (!id) return true;
                if (seenScriptIds.has(id)) return false;
                seenScriptIds.add(id);
                return true;
            });
            if (!filtered.length) return;
            const rules = this.convertStRegexScriptsToRules(filtered);
            if (!rules.length) return;
            out.push({ name: 'RegexBinding', enabled: true, rules });
        };

        const tryParseJsonString = (s) => {
            const raw = String(s || '').trim();
            if (!raw) return null;
            if (!raw.includes('RegexBinding')) return null;
            if (!(raw.startsWith('{') || raw.startsWith('['))) return null;
            try { return JSON.parse(raw); } catch { return null; }
        };

        const walk = (node, depth = 0) => {
            if (!node || depth > 18) return;
            if (typeof node === 'string') {
                const parsed = tryParseJsonString(node);
                if (parsed && typeof parsed === 'object') {
                    tryAddRegexes(parsed);
                    walk(parsed, depth + 1);
                }
                return;
            }
            if (Array.isArray(node)) {
                node.forEach(v => walk(v, depth + 1));
                return;
            }
            if (typeof node === 'object') {
                // direct object with RegexBinding
                tryAddRegexes(node);
                for (const v of Object.values(node)) walk(v, depth + 1);
            }
        };

        walk(obj, 0);
        return out;
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
        const payload = { ...(preset || {}) };

        // 若该预设绑定了正则集合，则导出时一并带上（便于导入自动绑定/启用）
        try {
            await window.appBridge?.regex?.ready;
            const sets = window.appBridge?.regex?.listLocalSets?.() || [];
            const bindType = type;
            const bindId = this.store.getActiveId(type);
            if (bindType && bindId) {
                const bound = sets
                    .filter(s => s?.bind?.type === 'preset' && s.bind.presetType === bindType && s.bind.presetId === bindId)
                    .map(s => ({ name: s.name, enabled: s.enabled !== false, rules: s.rules || [] }));
                if (bound.length) payload.boundRegexSets = bound;
            }
        } catch {}

        this.downloadJson(`${prefix}-${name}.json`, payload);
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
        let boundSets = json?.boundRegexSets || json?.bound_regex_sets || json?.bound_regex_sets_v1 || null;
        const data = { ...json, name };
        delete data.boundRegexSets;
        delete data.bound_regex_sets;
        delete data.bound_regex_sets_v1;

        // ST 预设：可能包含 RegexBinding.regexes（对象或被塞在 prompts[n].content 的 JSON 字符串里）
        if (!Array.isArray(boundSets) || !boundSets.length) {
            const stSets = this.extractStRegexBindingSets(json);
            if (stSets.length) boundSets = stSets;
        }

        const presetId = await this.store.upsert(importType, { name, data });

        // 若导入文件包含绑定正则集合，则一并导入并绑定到该预设
        if (Array.isArray(boundSets) && boundSets.length) {
            try {
                const ok = confirm(`检测到预设包含绑定的正规表达式（${boundSets.length} 组）。是否一并导入并绑定？\n取消：仅导入预设，不导入正则。`);
                if (!ok) {
                    await this.refreshAll();
                    this.showStatus('已导入预设（未导入绑定正则）', 'success');
                    window.dispatchEvent(new CustomEvent('preset-changed'));
                    return;
                }

                await window.appBridge?.regex?.ready;
                const existingSigs = this.getExistingLocalRuleSigs();
                for (const s of boundSets) {
                    const rulesRaw = Array.isArray(s?.rules) ? s.rules : [];
                    const rules = [];
                    const localSeen = new Set();
                    for (const rr of rulesRaw) {
                        const sig = this.getRuleSignature(rr);
                        if (!sig || localSeen.has(sig) || existingSigs.has(sig)) continue;
                        localSeen.add(sig);
                        existingSigs.add(sig);
                        rules.push(rr);
                    }
                    if (!rules.length) continue;
                    const setName = String(s?.name || '正则').trim() || '正则';
                    await window.appBridge.regex.upsertLocalSet({
                        name: `${setName} (${name})`,
                        enabled: s?.enabled !== false,
                        bind: { type: 'preset', presetType: importType, presetId },
                        rules,
                    });
                }
                window.dispatchEvent(new CustomEvent('regex-changed'));
            } catch (err) {
                logger.warn('导入绑定正则失败', err);
            }
        }

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

        const storeType = this.getStoreType();
        const presetId = this.store.getActiveId(storeType);
        const key = this.getDraftKey(storeType, presetId);
        const p = (key && this.drafts.has(key))
            ? this.drafts.get(key)
            : (this.store.getActive(storeType) || {});

        if (this.activeType === 'sysprompt') {
            root.appendChild(this.renderSyspromptEditor(p));
            return;
        }
        if (this.activeType === 'chatprompts') {
            root.appendChild(this.renderChatPromptsEditor(p));
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
        if (this.activeType === 'custom') return 'openai';
        if (this.activeType === 'chatprompts') return 'sysprompt';
        return this.activeType;
    }

    getDraftKey(storeType, presetId) {
        const st = String(storeType || '').trim();
        const id = String(presetId || '').trim();
        if (!st || !id) return null;
        return `${st}:${id}`;
    }

    captureDraft() {
        try {
            if (!this.element) return;
            const root = this.element.querySelector('#preset-editor');
            if (!root || !root.children.length) return;
            const storeType = this.getStoreType();
            const presetId = this.store.getActiveId(storeType);
            const key = this.getDraftKey(storeType, presetId);
            if (!key) return;
            const base = this.drafts.has(key)
                ? this.drafts.get(key)
                : deepClone(this.store.getActive(storeType) || {});
            const next = this.collectEditorData(base);
            this.drafts.set(key, next);
        } catch (err) {
            logger.debug('captureDraft failed', err);
        }
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

    renderChatPromptsEditor(p) {
        const wrap = this.renderSection(
            '聊天提示词（对话模式）',
            '私聊/群聊/动态提示词都放在这里；其中“私聊/群聊/摘要”固定注入到系统深度=1（历史前，且摘要在聊天提示词下方），避免混入 <history>。'
        );

        const list = document.createElement('div');
        list.style.cssText = 'margin-top:12px; display:flex; flex-direction:column; gap:10px;';

        const makePromptBlock = ({
            idPrefix,
            title,
            subtitle,
            enabledKey,
            positionKey,
            depthKey,
            roleKey,
            rulesKey,
            defaultDepth,
            enabledLabel,
            placeholder,
            positionOptions = null,
            showDepthRole = true,
        }) => {
            const card = document.createElement('div');
            card.style.cssText = `
                border: 1px solid rgba(0,0,0,0.08);
                border-radius: 12px;
                background: #fff;
                overflow: hidden;
            `;
            card.dataset.collapsed = 'true';

            const header = document.createElement('div');
            header.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; background:rgba(248,250,252,0.85);';

            const left = document.createElement('div');
            left.style.cssText = 'display:flex; align-items:center; gap:10px; min-width:0;';
            left.innerHTML = `
                <div class="collapse-toggle" style="font-size:16px; color:#64748b; user-select:none; width:18px;">▸</div>
                <div style="min-width:0;">
                    <div style="font-weight:800; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${title}</div>
                    <div style="color:#64748b; font-size:12px;">${subtitle}</div>
                </div>
            `;
            header.appendChild(left);

            const right = document.createElement('div');
            right.style.cssText = 'display:flex; align-items:center; gap:10px;';
            const enabledWrap = document.createElement('label');
            enabledWrap.style.cssText = 'display:flex; align-items:center; gap:6px; font-size:12px; color:#334155; cursor:pointer;';
            enabledWrap.innerHTML = `<input id="${idPrefix}-enabled" type="checkbox" style="width:16px; height:16px;">${enabledLabel}`;
            const enabledInput = enabledWrap.querySelector('input');
            enabledInput.checked = Boolean(p[enabledKey]);
            enabledInput.addEventListener('click', (e) => e.stopPropagation());
            right.appendChild(enabledWrap);
            header.appendChild(right);
            card.appendChild(header);

            const body = document.createElement('div');
            body.className = 'block-body';
            body.style.cssText = 'padding:10px 12px; display:none;';

            const pos = document.createElement('select');
            pos.id = `${idPrefix}-position`;
            pos.style.cssText = 'width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:14px;';
            const opts = Array.isArray(positionOptions) && positionOptions.length
                ? positionOptions
                : [
                    { v: EXT_PROMPT_TYPES.IN_PROMPT, t: 'IN_PROMPT（系统开头）' },
                    { v: EXT_PROMPT_TYPES.IN_CHAT, t: 'IN_CHAT（按深度插入历史）' },
                    { v: EXT_PROMPT_TYPES.BEFORE_PROMPT, t: 'BEFORE_PROMPT（最前）' },
                    { v: EXT_PROMPT_TYPES.NONE, t: 'NONE（不注入）' },
                ];
            pos.innerHTML = opts.map(o => `<option value="${o.v}">${o.t}</option>`).join('');
            const fallbackPos = opts.some(o => o.v === EXT_PROMPT_TYPES.SYSTEM_DEPTH_1) ? EXT_PROMPT_TYPES.SYSTEM_DEPTH_1 : EXT_PROMPT_TYPES.IN_PROMPT;
            pos.value = String(p[positionKey] ?? fallbackPos);

            const depth = document.createElement('input');
            depth.id = `${idPrefix}-depth`;
            depth.type = 'number';
            depth.inputMode = 'numeric';
            depth.min = '0';
            depth.style.cssText = 'width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:14px;';
            depth.value = String(p[depthKey] ?? defaultDepth);

            const role = document.createElement('select');
            role.id = `${idPrefix}-role`;
            role.style.cssText = 'width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:14px;';
            role.innerHTML = `
                <option value="${EXT_PROMPT_ROLES.SYSTEM}">SYSTEM</option>
                <option value="${EXT_PROMPT_ROLES.USER}">USER</option>
                <option value="${EXT_PROMPT_ROLES.ASSISTANT}">ASSISTANT</option>
            `;
            role.value = String(p[roleKey] ?? EXT_PROMPT_ROLES.SYSTEM);

            if (showDepthRole) {
                body.appendChild(this.renderInputRow([
                    { label: '注入位置', el: pos },
                    { label: '深度（IN_CHAT）', el: depth },
                    { label: '角色（IN_CHAT）', el: role },
                ]));
            } else {
                depth.disabled = true;
                role.disabled = true;
                body.appendChild(this.renderInputRow([
                    { label: '注入位置', el: pos },
                    { label: '深度（固定）', el: depth },
                    { label: '角色（固定）', el: role },
                ]));
            }

            const ta = this.renderTextarea('规则内容（纯文本）', `${idPrefix}-rules`, p[rulesKey] || '', placeholder);
            body.appendChild(ta);
            card.appendChild(body);

            const applyEnabledStyle = (isEnabled) => {
                if (isEnabled) {
                    card.style.opacity = '';
                    card.style.filter = '';
                    card.style.background = '#fff';
                    header.style.background = 'rgba(248,250,252,0.85)';
                } else {
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
                body.style.display = collapsed ? 'none' : 'block';
            };
            header.addEventListener('click', () => setCollapsed(card.dataset.collapsed !== 'true'));
            setCollapsed(true); // default collapsed

            return card;
        };

        list.appendChild(makePromptBlock({
            idPrefix: 'dialogue',
            title: '私聊提示词',
            subtitle: '解析 <content> 内的 <{{user}}和{{char}}的私聊>，每行 - 开头为一条消息',
            enabledKey: 'dialogue_enabled',
            positionKey: 'dialogue_position',
            depthKey: 'dialogue_depth',
            roleKey: 'dialogue_role',
            rulesKey: 'dialogue_rules',
            defaultDepth: 1,
            enabledLabel: '启用',
            placeholder: '私聊协议提示词（<content> + 私聊标签 + - 行）',
            positionOptions: [
                { v: EXT_PROMPT_TYPES.SYSTEM_DEPTH_1, t: 'SYSTEM_DEPTH_1（紧跟 chat history，<chat_guide>）' },
                { v: EXT_PROMPT_TYPES.NONE, t: 'NONE（不注入）' },
            ],
            showDepthRole: false,
        }));
        list.appendChild(makePromptBlock({
            idPrefix: 'moment',
            title: '动态发布决策提示词',
            subtitle: '让模型决定是否要输出 moment_start/moment_end（仅用于私聊/群聊场景）',
            enabledKey: 'moment_create_enabled',
            positionKey: 'moment_create_position',
            depthKey: 'moment_create_depth',
            roleKey: 'moment_create_role',
            rulesKey: 'moment_create_rules',
            defaultDepth: 0,
            enabledLabel: '启用',
            placeholder: '动态发布决策提示词（决定是否输出 moment_start...moment_end）',
        }));
        list.appendChild(makePromptBlock({
            idPrefix: 'moment-comment',
            title: '动态评论回覆提示词',
            subtitle: '仅用于“动态评论”场景：输出 moment_reply_start/moment_reply_end（不输出私聊/群聊）',
            enabledKey: 'moment_comment_enabled',
            positionKey: 'moment_comment_position',
            depthKey: 'moment_comment_depth',
            roleKey: 'moment_comment_role',
            rulesKey: 'moment_comment_rules',
            defaultDepth: 0,
            enabledLabel: '启用',
            placeholder: '动态评论回覆规则（<content> + moment_reply_*）',
        }));
        list.appendChild(makePromptBlock({
            idPrefix: 'group',
            title: '群聊提示词',
            subtitle: '解析 <content> 内的 <群聊:群名字>（含 <成员>/<聊天内容>），并分发到对应群聊',
            enabledKey: 'group_enabled',
            positionKey: 'group_position',
            depthKey: 'group_depth',
            roleKey: 'group_role',
            rulesKey: 'group_rules',
            defaultDepth: 1,
            enabledLabel: '启用',
            placeholder: '群聊协议提示词（<content> + <群聊:群名字> + 发言人--内容--HH:MM）',
            positionOptions: [
                { v: EXT_PROMPT_TYPES.SYSTEM_DEPTH_1, t: 'SYSTEM_DEPTH_1（紧跟 chat history，<chat_guide>）' },
                { v: EXT_PROMPT_TYPES.NONE, t: 'NONE（不注入）' },
            ],
            showDepthRole: false,
        }));

        list.appendChild(makePromptBlock({
            idPrefix: 'summary',
            title: '摘要提示词',
            subtitle: '固定注入到系统深度=1（位于聊天提示词下方）；用于要求模型在回覆末尾输出 <details><summary>摘要</summary>...</details>',
            enabledKey: 'summary_enabled',
            positionKey: 'summary_position',
            depthKey: 'summary_depth',
            roleKey: 'summary_role',
            rulesKey: 'summary_rules',
            defaultDepth: 1,
            enabledLabel: '启用',
            placeholder: '每次输出结束后，紧跟着输出纯中文摘要（details/summary 格式）',
            positionOptions: [
                { v: EXT_PROMPT_TYPES.SYSTEM_DEPTH_1, t: 'SYSTEM_DEPTH_1（紧跟 chat history，<chat_guide>）' },
                { v: EXT_PROMPT_TYPES.NONE, t: 'NONE（不注入）' },
            ],
            showDepthRole: false,
        }));

        wrap.appendChild(list);
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

        const maxContext = document.createElement('input');
        maxContext.id = 'gen-max-context';
        maxContext.type = 'range';
        maxContext.min = '256';
        maxContext.max = '200000';
        maxContext.step = '256';
        maxContext.style.cssText = 'width:100%;';
        maxContext.value = String(p.openai_max_context ?? 4095);

        const maxContextNum = document.createElement('input');
        maxContextNum.id = 'gen-max-context-num';
        maxContextNum.type = 'number';
        maxContextNum.step = '1';
        maxContextNum.style.cssText = 'width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:14px;';
        maxContextNum.value = String(p.openai_max_context ?? 4095);

        const syncMaxContext = (val) => {
            const n = Number(val);
            if (!Number.isFinite(n)) return;
            const clamped = Math.max(0, Math.min(200000, Math.trunc(n)));
            maxContext.value = String(clamped);
            maxContextNum.value = String(clamped);
        };
        maxContext.addEventListener('input', () => syncMaxContext(maxContext.value));
        maxContextNum.addEventListener('input', () => syncMaxContext(maxContextNum.value));

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

        const ctxBlock = document.createElement('div');
        ctxBlock.style.cssText = 'margin-top:10px;';
        ctxBlock.innerHTML = `
            <div style="font-weight:700; color:#0f172a; margin-bottom:6px;">最大上下文长度（max_context）</div>
            <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                <div style="flex:2; min-width:200px;" id="gen-max-context-range-wrap"></div>
                <div style="flex:1; min-width:160px;" id="gen-max-context-num-wrap"></div>
            </div>
            <div style="color:#64748b; font-size:12px; margin-top:6px;">用于限制可用上下文窗口（后续可用于自动裁剪历史）。</div>
        `;
        ctxBlock.querySelector('#gen-max-context-range-wrap').appendChild(maxContext);
        ctxBlock.querySelector('#gen-max-context-num-wrap').appendChild(maxContextNum);
        wrap.appendChild(ctxBlock);

        wrap.appendChild(this.renderInputRow([
            { label: 'temperature', el: temperature },
            { label: 'top_p', el: topP },
            { label: 'top_k', el: topK },
        ]));
        wrap.appendChild(this.renderInputRow([
            { label: '最大输出 token（max_output_tokens）', el: maxTokens },
            { label: 'presence_penalty', el: presence },
            { label: 'frequency_penalty', el: frequency },
        ]));

        return wrap;
    }

    renderOpenAIBlocksEditor(p) {
        const wrap = this.renderSection('自定义提示词区块（Prompt Blocks）', '与 ST 类似：区块默认折叠，点击展开；可拖拽排序并可新增自定义区块');

        // Prompt blocks (ST-like): show blocks in prompt_order, allow drag reorder
        const pickPromptOrderBlock = () => {
            const arr = Array.isArray(p.prompt_order) ? p.prompt_order : [];
            const byId = (id) => arr.find(b => b && typeof b === 'object' && String(b.character_id) === String(id));
            // ST PromptManager global dummyId=100001, keep 100000 as fallback.
            return byId(100001) || byId(100000) || arr[0] || null;
        };
        const prompts = Array.isArray(p.prompts) ? p.prompts : [];
        const promptById = new Map();
        prompts.forEach(pr => {
            if (pr?.identifier) promptById.set(pr.identifier, pr);
        });
        const orderBlock = pickPromptOrderBlock();
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

    collectEditorData(base) {
        const root = this.element.querySelector('#preset-editor');
        const storeType = this.getStoreType();
        const current = deepClone(base || this.store.getActive(storeType) || {});

        if (this.activeType === 'sysprompt') {
            current.content = root.querySelector('#sysprompt-content')?.value ?? '';
            current.post_history = root.querySelector('#sysprompt-post')?.value ?? '';
            return current;
        }

        if (this.activeType === 'chatprompts') {
            current.dialogue_enabled = Boolean(root.querySelector('#dialogue-enabled')?.checked);
            current.dialogue_position = getInt(root.querySelector('#dialogue-position')?.value, current.dialogue_position ?? EXT_PROMPT_TYPES.SYSTEM_DEPTH_1);
            current.dialogue_depth = getInt(root.querySelector('#dialogue-depth')?.value, current.dialogue_depth ?? 1);
            current.dialogue_role = getInt(root.querySelector('#dialogue-role')?.value, current.dialogue_role ?? EXT_PROMPT_ROLES.SYSTEM);
            current.dialogue_rules = root.querySelector('#dialogue-rules')?.value ?? '';

            current.moment_create_enabled = Boolean(root.querySelector('#moment-enabled')?.checked);
            current.moment_create_position = getInt(root.querySelector('#moment-position')?.value, current.moment_create_position ?? EXT_PROMPT_TYPES.IN_PROMPT);
            current.moment_create_depth = getInt(root.querySelector('#moment-depth')?.value, current.moment_create_depth ?? 1);
            current.moment_create_role = getInt(root.querySelector('#moment-role')?.value, current.moment_create_role ?? EXT_PROMPT_ROLES.SYSTEM);
            current.moment_create_rules = root.querySelector('#moment-rules')?.value ?? '';

            current.moment_comment_enabled = Boolean(root.querySelector('#moment-comment-enabled')?.checked);
            current.moment_comment_position = getInt(root.querySelector('#moment-comment-position')?.value, current.moment_comment_position ?? EXT_PROMPT_TYPES.IN_PROMPT);
            current.moment_comment_depth = getInt(root.querySelector('#moment-comment-depth')?.value, current.moment_comment_depth ?? 0);
            current.moment_comment_role = getInt(root.querySelector('#moment-comment-role')?.value, current.moment_comment_role ?? EXT_PROMPT_ROLES.SYSTEM);
            current.moment_comment_rules = root.querySelector('#moment-comment-rules')?.value ?? '';

            current.group_enabled = Boolean(root.querySelector('#group-enabled')?.checked);
            current.group_position = getInt(root.querySelector('#group-position')?.value, current.group_position ?? EXT_PROMPT_TYPES.SYSTEM_DEPTH_1);
            current.group_depth = getInt(root.querySelector('#group-depth')?.value, current.group_depth ?? 1);
            current.group_role = getInt(root.querySelector('#group-role')?.value, current.group_role ?? EXT_PROMPT_ROLES.SYSTEM);
            current.group_rules = root.querySelector('#group-rules')?.value ?? '';

            current.summary_enabled = Boolean(root.querySelector('#summary-enabled')?.checked);
            current.summary_position = getInt(root.querySelector('#summary-position')?.value, current.summary_position ?? EXT_PROMPT_TYPES.SYSTEM_DEPTH_1);
            current.summary_rules = root.querySelector('#summary-rules')?.value ?? '';
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
            current.openai_max_context = getInt(root.querySelector('#gen-max-context-num')?.value ?? root.querySelector('#gen-max-context')?.value, current.openai_max_context ?? 4095);
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
            const findBlock = (id) => current.prompt_order.find(b => b && typeof b === 'object' && String(b.character_id) === String(id));
            let target = findBlock(100001) || findBlock(100000) || current.prompt_order[0] || null;
            if (!target || typeof target !== 'object') {
                target = { character_id: 100001, order: [] };
                current.prompt_order.push(target);
            } else if (target.character_id === undefined || target.character_id === null) {
                target.character_id = 100001;
            }
            target.order = order;
            // Per requirement: only keep ST global dummyId=100001 block to avoid importing/keeping extra blocks.
            current.prompt_order = [{ character_id: 100001, order: target.order }];
            current.boundProfileId = window.appBridge?.config?.getActiveProfileId?.() || current.boundProfileId || null;
            return current;
        }

        return current;
    }

    async onSave() {
        await this.store.ready;
        try {
            // Save current tab into drafts first, then persist all drafts (all tabs) together.
            this.captureDraft();

            const toSave = [];
            for (const [key, data] of this.drafts.entries()) {
                const [storeType, presetId] = String(key).split(':');
                if (!storeType || !presetId) continue;
                const name = String(data?.name || '').trim() || presetId || '未命名';
                toSave.push({ storeType, presetId, name, data: { ...(data || {}), name } });
            }

            // Also ensure active presets are saved even if not drafted (no-op update)
            for (const st of ['sysprompt', 'context', 'instruct', 'openai']) {
                const activeId = this.store.getActiveId(st);
                if (!activeId) continue;
                const key = this.getDraftKey(st, activeId);
                if (key && this.drafts.has(key)) continue;
                const data = deepClone(this.store.getActive(st) || {});
                const name = String(data?.name || '').trim() || activeId || '未命名';
                toSave.push({ storeType: st, presetId: activeId, name, data: { ...(data || {}), name } });
            }

            for (const item of toSave) {
                await this.store.upsert(item.storeType, { id: item.presetId, name: item.name, data: item.data });
            }

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
        this.captureDraft();
        const base = this.store.getActive(this.getStoreType()) || {};
        const data = { ...deepClone(base), name };
        const id = await this.store.upsert(this.getStoreType(), { name, data });
        await this.store.setActive(this.getStoreType(), id);
        // clear drafts for this type to avoid mixing
        for (const k of Array.from(this.drafts.keys())) {
            if (String(k).startsWith(`${this.getStoreType()}:`)) this.drafts.delete(k);
        }
        await this.refreshAll();
        this.showStatus('已新建', 'success');
        window.dispatchEvent(new CustomEvent('preset-changed'));
    }

    async onRename() {
        await this.store.ready;
        const id = this.store.getActiveId(this.getStoreType());
        const current = this.store.getActive(this.getStoreType());
        if (!id || !current) return;
        this.captureDraft();
        const name = prompt('重命名预设', current.name || id);
        if (!name) return;
        await this.store.upsert(this.getStoreType(), { id, name, data: { ...current, name } });
        const key = this.getDraftKey(this.getStoreType(), id);
        if (key && this.drafts.has(key)) {
            const d = this.drafts.get(key) || {};
            d.name = name;
            this.drafts.set(key, d);
        }
        await this.refreshAll();
        this.showStatus('已重命名', 'success');
        window.dispatchEvent(new CustomEvent('preset-changed'));
    }

    async onDelete() {
        await this.store.ready;
        const id = this.store.getActiveId(this.getStoreType());
        if (!id) return;
        if (!confirm('删除该预设？此操作不可恢复。')) return;
        this.captureDraft();
        await this.store.remove(this.getStoreType(), id);
        const key = this.getDraftKey(this.getStoreType(), id);
        if (key) this.drafts.delete(key);
        await this.refreshAll();
        this.showStatus('已删除', 'success');
        window.dispatchEvent(new CustomEvent('preset-changed'));
    }
}
