/**
 * 世界书管理面板（簡易版）
 * - 查看已保存的世界書列表（localStorage）
 * - 從 ST JSON 文本導入並保存為簡化格式
 */

import { convertSTWorld } from '../storage/worldinfo.js';
import { logger } from '../utils/logger.js';
import { WorldEditorModal } from './world-editor.js';

export class WorldPanel {
    constructor() {
        this.overlay = null;
        this.panel = null;
        this.listEl = null;
        this.importTextarea = null;
        this.fileInput = null;
        this.scope = 'session'; // session | global
        this.editor = new WorldEditorModal({
            onSaved: async () => {
                await this.refreshList();
            }
        });
    }

    async show({ scope = 'session' } = {}) {
        this.scope = scope === 'global' ? 'global' : 'session';
        if (!this.panel) {
            this.createUI();
        }
        await this.refreshList();
        this.overlay.style.display = 'block';
        this.panel.style.display = 'block';
    }

    hide() {
        if (this.overlay) this.overlay.style.display = 'none';
        if (this.panel) this.panel.style.display = 'none';
    }

    async refreshList() {
        if (!this.listEl) return;
        this.listEl.innerHTML = '';
        try {
            const sessionId = window.appBridge?.activeSessionId || 'default';
            const currentId = this.scope === 'global'
                ? (window.appBridge.globalWorldId || '')
                : (window.appBridge.currentWorldId || '');
            const indicator = this.panel?.querySelector('#world-current');
            if (indicator) {
                indicator.textContent = this.scope === 'global'
                    ? `全局當前：${currentId || '未啟用'}`
                    : `會話 ${sessionId} 當前：${currentId || '未啟用'}`;
            }
            const names = await window.appBridge.listWorlds?.();
            if (!names || !names.length) {
                const li = document.createElement('li');
                li.textContent = '（暫無世界書）';
                li.style.color = '#888';
                this.listEl.appendChild(li);
                return;
            }
            names.forEach((name) => {
                const li = document.createElement('li');
                li.style.display = 'flex';
                li.style.alignItems = 'center';
                li.style.justifyContent = 'space-between';
                li.style.padding = '6px 8px';
                li.style.borderBottom = '1px solid #f0f0f0';
                li.style.cursor = 'pointer';
                li.title = '雙擊編輯世界書';
                if (name === currentId) {
                    li.style.background = '#f8fafc';
                    li.style.border = '1px solid #e2e8f0';
                }

                const title = document.createElement('span');
                title.textContent = name;
                title.style.fontWeight = '600';
                title.style.cursor = 'pointer';
                title.ondblclick = async (e) => {
                    e.stopPropagation();
                    await this.openEditor(name);
                };

                li.ondblclick = async (e) => {
                    if (e.target?.tagName === 'BUTTON') return;
                    e.stopPropagation();
                    await this.openEditor(name);
                };

                const actions = document.createElement('div');
                actions.style.display = 'flex';
                actions.style.gap = '6px';

                const activate = document.createElement('button');
                activate.textContent = name === currentId ? '當前' : '啟用';
                activate.style.cssText = 'padding:4px 8px;border:1px solid #ddd;border-radius:6px;background:#f5f5f5;cursor:pointer;';
                if (name === currentId) {
                    activate.disabled = true;
                    activate.style.opacity = '0.7';
                }
                activate.onclick = async () => {
                    if (this.scope === 'global') {
                        await window.appBridge.setGlobalWorld(name);
                    } else {
                        await window.appBridge.setCurrentWorld(name);
                    }
                    const data = await window.appBridge.getWorldInfo(name);
                    logger.info('Activated world', name, data);
                    window.toastr?.success(`已啟用世界書：${name}`);
                    window.dispatchEvent(new CustomEvent('worldinfo-changed', { detail: { worldId: name } }));
                    await this.refreshList();
                };

                const exportBtn = document.createElement('button');
                exportBtn.textContent = '導出';
                exportBtn.style.cssText = 'padding:4px 8px;border:1px solid #ddd;border-radius:6px;background:#f5f5f5;cursor:pointer;';
                exportBtn.onclick = async () => {
                    const data = await window.appBridge.getWorldInfo(name);
                    const text = JSON.stringify(data || {}, null, 2);
                    if (navigator.clipboard?.writeText) {
                        await navigator.clipboard.writeText(text);
                        window.toastr?.success('已複製到剪貼簿');
                    } else {
                        // 退化：下載文件
                        const blob = new Blob([text], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${name}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                        window.toastr?.success('已觸發下載');
                    }
                };

                actions.appendChild(activate);
                actions.appendChild(exportBtn);
                li.appendChild(title);
                li.appendChild(actions);
                this.listEl.appendChild(li);
            });
        } catch (err) {
            logger.error('刷新世界書列表失敗', err);
        }
    }

    async openEditor(name) {
        try {
            const data = await window.appBridge.getWorldInfo(name);
            await this.editor.show(name, data);
        } catch (err) {
            logger.error('打開世界書編輯器失敗', err);
            window.toastr?.error('打開編輯器失敗');
        }
    }

    async onNewWorld() {
        try {
            const raw = prompt('新建世界書名稱', '新世界書');
            const name = String(raw || '').trim();
            if (!name) return;
            const existing = await window.appBridge.listWorlds?.();
            if (Array.isArray(existing) && existing.includes(name)) {
                window.toastr?.warning('名稱已存在，請換一個');
                return;
            }

            const blank = { name, entries: [] };
            await window.appBridge.saveWorldInfo(name, blank);

            if (this.scope === 'global') {
                await window.appBridge.setGlobalWorld(name);
            } else {
                await window.appBridge.setCurrentWorld(name);
            }

            window.toastr?.success(`已新建並啟用：${name}`);
            window.dispatchEvent(new CustomEvent('worldinfo-changed', { detail: { worldId: name } }));
            await this.refreshList();

            // Open editor immediately for convenience
            await this.openEditor(name);
        } catch (err) {
            logger.error('新建世界書失敗', err);
            window.toastr?.error('新建世界書失敗');
        }
    }

    createUI() {
        this.overlay = document.createElement('div');
        this.overlay.id = 'world-overlay';
        this.overlay.style.cssText = `
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.4);
            z-index: 9000;
        `;
        this.overlay.onclick = () => this.hide();

        this.panel = document.createElement('div');
        this.panel.id = 'world-panel';
        this.panel.style.cssText = `
            display: none;
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #fff;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            padding: 16px;
            width: min(520px, 92vw);
            max-height: 80vh;
            overflow: auto;
            z-index: 10000;
        `;
        this.panel.onclick = (e) => e.stopPropagation();

        this.panel.innerHTML = `
            <h3 style="margin: 0 0 12px; color: #0f172a;">世界書管理</h3>
            <div id="world-current" style="margin: -4px 0 12px; color:#475569; font-size:13px;">當前：未啟用</div>
            <div style="display:flex; gap:12px; flex-wrap: wrap;">
                <div style="flex:1 1 45%; min-width: 200px;">
                    <div style="font-weight:700; margin-bottom:6px;">已保存</div>
                    <ul id="world-list" style="list-style:none; padding:8px; border:1px solid #eee; border-radius:8px; max-height:220px; overflow:auto; margin:0;"></ul>
                    <div style="display:flex; gap:8px; margin-top:8px;">
                        <button id="world-new" style="flex:1; padding:8px 10px; border:1px solid #ddd; border-radius:8px; background:#019aff; color:#fff; font-weight:700;">新增</button>
                        <button id="world-export-current" style="flex:1; padding:8px 10px; border:1px solid #ddd; border-radius:8px; background:#f5f5f5;">導出當前</button>
                    </div>
                </div>
                <div style="flex:1 1 45%; min-width: 200px;">
                    <div style="font-weight:700; margin-bottom:6px;">導入 ST JSON</div>
                    <input id="world-file" type="file" accept=".json,application/json" style="width:100%; margin-bottom:8px;">
                    <textarea id="world-json" placeholder="可選：貼上 ST 世界書 JSON 內容" style="width:100%; height:160px; padding:8px; border:1px solid #ddd; border-radius:8px; resize:vertical;"></textarea>
                    <div style="color:#94a3b8; font-size:12px; margin:6px 0;">名稱將取自 JSON 的 name 或文件名（無需手動填寫）</div>
                    <div style="display:flex; gap:8px; margin-top:8px; justify-content:flex-end;">
                        <button id="world-import" style="padding:8px 14px; border-radius:8px; border:1px solid #ddd; background:#f5f5f5;">導入</button>
                        <button id="world-close" style="padding:8px 14px; border-radius:8px; border:1px solid #ddd; background:#f5f5f5;">關閉</button>
                    </div>
                </div>
            </div>
        `;

        this.listEl = this.panel.querySelector('#world-list');
        this.importTextarea = this.panel.querySelector('#world-json');
        this.fileInput = this.panel.querySelector('#world-file');

        this.panel.querySelector('#world-close').onclick = () => this.hide();
        this.panel.querySelector('#world-import').onclick = () => this.onImport();
        this.panel.querySelector('#world-new').onclick = () => this.onNewWorld();
        this.panel.querySelector('#world-export-current').onclick = () => this.onExportCurrent();

        document.body.appendChild(this.overlay);
        document.body.appendChild(this.panel);
    }

    async onImport() {
        let jsonText = this.importTextarea.value.trim();
        let nameHint = '';

        // 文件优先
        const file = this.fileInput?.files?.[0];
        if (file) {
            nameHint = file.name.replace(/\\.json$/i, '');
            jsonText = await file.text();
        }

        if (!jsonText) {
            window.toastr?.warning('請選擇 ST JSON 文件或貼上內容');
            return;
        }

        try {
            const json = JSON.parse(jsonText);
            const nameFromJson = json.name || json.title || '';
            const name = nameFromJson || nameHint || 'imported';
            const simplified = convertSTWorld(json, name);
            await window.appBridge.saveWorldInfo(name, simplified);

            // 若导入文件包含绑定的正则集合，则一并导入并绑定到该世界书
            const boundSets = json?.boundRegexSets || json?.bound_regex_sets || json?.bound_regex_sets_v1 || null;
            if (Array.isArray(boundSets) && boundSets.length) {
                try {
                    const ok = confirm(`检测到世界书包含绑定的正规表达式（${boundSets.length} 组）。是否一并导入并绑定？\n取消：仅导入世界书，不导入正则。`);
                    if (!ok) {
                        await this.refreshList();
                        window.toastr?.success(`導入成功：${name}`);
                        if (this.fileInput) this.fileInput.value = '';
                        this.importTextarea.value = '';
                        return;
                    }

                    await window.appBridge?.regex?.ready;
                    const ruleSig = (r) => {
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
                        if (!findRegex && !String(r?.pattern || '').trim()) {
                            // legacy fallback signature
                            const when = String(r?.when || 'both');
                            const pattern = String(r?.pattern || '').trim();
                            const flags = (r?.flags === undefined || r?.flags === null) ? 'g' : String(r?.flags);
                            const replacement = String(r?.replacement ?? '');
                            return `${when}\u0000${pattern}\u0000${flags}\u0000${replacement}`;
                        }
                        return [
                            findRegex, replaceString, trim, placement,
                            disabled, markdownOnly, promptOnly, runOnEdit, sub, minD, maxD
                        ].join('\u0000');
                    };

                    const existingSigs = new Set();
                    try {
                        const sets = window.appBridge?.regex?.listLocalSets?.() || [];
                        sets.forEach(s => (Array.isArray(s?.rules) ? s.rules : []).forEach(r => {
                            existingSigs.add(ruleSig(r));
                        }));
                    } catch {}

                    for (const s of boundSets) {
                        const rulesRaw = Array.isArray(s?.rules) ? s.rules : [];
                        const rules = [];
                        const localSeen = new Set();
                        for (const rr of rulesRaw) {
                            const sig = ruleSig(rr);
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
                            bind: { type: 'world', worldId: name },
                            rules,
                        });
                    }
                    window.toastr?.success('已导入并绑定正则');
                    window.dispatchEvent(new CustomEvent('regex-changed'));
                } catch (err) {
                    logger.warn('导入绑定正则失败', err);
                }
            }

            await this.refreshList();
            window.toastr?.success(`導入成功：${name}`);
            if (this.fileInput) this.fileInput.value = '';
            this.importTextarea.value = '';
        } catch (err) {
            logger.error('導入世界書失敗', err);
            window.toastr?.error('導入失敗，請檢查 JSON', '錯誤');
        }
    }

    async onExportCurrent() {
        const current = this.scope === 'global'
            ? (window.appBridge.globalWorldId || '未啟用')
            : (window.appBridge.currentWorldId || '未啟用');
        const data = await window.appBridge.getWorldInfo(current);
        if (!data) {
            window.toastr?.warning('沒有可導出的世界書');
            return;
        }
        const payload = { ...(data || {}), name: current };

        // 追加绑定正则集合（便于导入时自动带上）
        try {
            await window.appBridge?.regex?.ready;
            const sets = window.appBridge?.regex?.listLocalSets?.() || [];
            const bound = sets.filter(s => s?.bind?.type === 'world' && s.bind.worldId === current)
                .map(s => ({ name: s.name, enabled: s.enabled !== false, rules: s.rules || [] }));
            if (bound.length) payload.boundRegexSets = bound;
        } catch {}

        const text = JSON.stringify(payload, null, 2);
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            window.toastr?.success(`已複製：${current}`);
        } else {
            const blob = new Blob([text], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${current}.json`;
            a.click();
            URL.revokeObjectURL(url);
            window.toastr?.success(`已觸發下載：${current}.json`);
        }
    }

}
