/**
 * Regex panel (Global + Local, ST-like)
 * - Global rules always apply
 * - Local sets apply when their bound preset/world is active
 */
import { RegexStore } from '../storage/regex-store.js';
import { logger } from '../utils/logger.js';

const deepClone = (v) => {
    try {
        return structuredClone(v);
    } catch {
        return JSON.parse(JSON.stringify(v));
    }
};

const genId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const normalizeRule = (r = {}) => ({
    id: r.id || genId('re'),
    name: String(r.name || '').trim(),
    enabled: r.enabled !== false,
    when: (r.when === 'input' || r.when === 'output' || r.when === 'both') ? r.when : 'both',
    pattern: String(r.pattern || ''),
    replacement: String(r.replacement ?? ''),
    flags: (r.flags === undefined || r.flags === null) ? 'g' : String(r.flags),
});

const PRESET_TYPES = [
    { id: 'sysprompt', label: '系统提示词' },
    { id: 'context', label: '上下文模板' },
    { id: 'instruct', label: 'Instruct 模板' },
    { id: 'openai', label: '生成参数/自定义' },
];

export class RegexPanel {
    constructor() {
        this.store = window.appBridge?.regex || new RegexStore();
        this.element = null;
        this.overlay = null;
        this.activeTab = 'global'; // global | local
        this.activeLocalSetId = null;
        this.statusEl = null;
    }

    async show() {
        await this.store.ready;
        if (!this.element) this.createUI();
        await this.refreshAll();
        this.overlay.style.display = 'block';
        this.element.style.display = 'flex';
    }

    hide() {
        if (this.element) this.element.style.display = 'none';
        if (this.overlay) this.overlay.style.display = 'none';
    }

    createUI() {
        this.overlay = document.createElement('div');
        this.overlay.id = 'regex-overlay';
        this.overlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:20000;';
        this.overlay.onclick = () => this.hide();

        this.element = document.createElement('div');
        this.element.id = 'regex-panel';
        this.element.style.cssText = `
            display:none; position:fixed;
            top: calc(10px + env(safe-area-inset-top, 0px));
            left: calc(10px + env(safe-area-inset-left, 0px));
            right: calc(10px + env(safe-area-inset-right, 0px));
            height: calc(100vh - 20px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            height: calc(100dvh - 20px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            background:#fff; border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,0.25);
            z-index:21000;
            flex-direction:column;
            overflow:hidden;
        `;
        this.element.onclick = (e) => e.stopPropagation();

        this.element.innerHTML = `
            <div style="padding:14px 16px; border-bottom:1px solid rgba(0,0,0,0.06); background:rgba(248,250,252,0.92); display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <div style="min-width:0;">
                    <div style="font-weight:800; color:#0f172a;">正规表达式</div>
                    <div style="color:#64748b; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        参考 ST：按规则替换输入/输出文本；支持全局与绑定预设/世界书的局部规则
                    </div>
                </div>
                <button id="regex-close" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:#0f172a;">×</button>
            </div>

            <div style="padding:10px 16px; border-bottom:1px solid rgba(0,0,0,0.06); display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button class="regex-tab" data-tab="global" style="border:none; background:transparent; padding:10px 12px; border-radius:10px; cursor:pointer; font-size:14px; color:#334155;">全局正则</button>
                    <button class="regex-tab" data-tab="local" style="border:none; background:transparent; padding:10px 12px; border-radius:10px; cursor:pointer; font-size:14px; color:#334155;">局部正则</button>
                </div>
                <div id="regex-tools" style="display:flex; gap:8px; flex-wrap:wrap;"></div>
            </div>

            <div id="regex-scroll" style="padding:14px 16px; overflow:auto; flex:1; min-height:0; -webkit-overflow-scrolling:touch;">
                <div id="regex-body"></div>
                <div id="regex-status" style="display:none; margin-top:12px; padding:10px; border-radius:10px; font-size:13px;"></div>
            </div>
        `;

        document.body.appendChild(this.overlay);
        document.body.appendChild(this.element);

        this.statusEl = this.element.querySelector('#regex-status');
        this.element.querySelector('#regex-close').onclick = () => this.hide();
        this.element.querySelectorAll('.regex-tab').forEach(btn => {
            btn.addEventListener('click', async () => {
                this.activeTab = btn.dataset.tab || 'global';
                await this.refreshAll();
            });
        });
    }

    setActiveTabStyles() {
        this.element?.querySelectorAll('.regex-tab')?.forEach(btn => {
            const isActive = btn.dataset.tab === this.activeTab;
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
        setTimeout(() => { try { el.style.display = 'none'; } catch {} }, 2200);
    }

    renderRuleCard(rule) {
        const r = normalizeRule(rule);
        const card = document.createElement('div');
        card.className = 'regex-rule';
        card.dataset.ruleId = r.id;
        card.dataset.collapsed = 'true';
        card.style.cssText = 'border:1px solid rgba(0,0,0,0.08); border-radius:12px; background:#fff; overflow:hidden;';

        const header = document.createElement('div');
        header.className = 're-header';
        header.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; background:rgba(248,250,252,0.85); cursor:pointer;';

        const left = document.createElement('div');
        left.style.cssText = 'display:flex; align-items:center; gap:10px; min-width:0;';
        left.innerHTML = `
            <div class="re-toggle" style="font-size:16px; color:#64748b; user-select:none; width:18px;">▸</div>
            <div style="min-width:0;">
                <div class="re-title" style="font-weight:800; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
                <div class="re-sub" style="color:#64748b; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
            </div>
        `;
        header.appendChild(left);

        const right = document.createElement('div');
        right.style.cssText = 'display:flex; align-items:center; gap:10px;';
        const enabledWrap = document.createElement('label');
        enabledWrap.style.cssText = 'display:flex; align-items:center; gap:6px; font-size:12px; color:#334155; cursor:pointer;';
        enabledWrap.innerHTML = `<input type="checkbox" class="re-enabled" style="width:16px; height:16px;">启用`;
        right.appendChild(enabledWrap);
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 're-del';
        del.textContent = '删除';
        del.style.cssText = 'padding:6px 10px; border:1px solid #fecaca; border-radius:10px; background:#fee2e2; color:#b91c1c; cursor:pointer; font-size:12px;';
        right.appendChild(del);
        header.appendChild(right);

        const body = document.createElement('div');
        body.className = 're-body';
        body.style.cssText = 'display:none; padding:12px; gap:10px;';

        body.innerHTML = `
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
                <div style="flex:1; min-width: 200px;">
                    <div style="font-weight:700; color:#0f172a; margin-bottom:6px;">名称（可选）</div>
                    <input class="re-name" style="width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:13px;">
                </div>
                <div style="flex:1; min-width: 180px;">
                    <div style="font-weight:700; color:#0f172a; margin-bottom:6px;">生效位置</div>
                    <select class="re-when" style="width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:13px;">
                        <option value="both">输入+输出</option>
                        <option value="input">仅输入（发送前）</option>
                        <option value="output">仅输出（显示前）</option>
                    </select>
                </div>
                <div style="width:140px;">
                    <div style="font-weight:700; color:#0f172a; margin-bottom:6px;">flags</div>
                    <input class="re-flags" placeholder="gimsuy" style="width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:13px;">
                </div>
            </div>
            <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
                <div style="flex:1; min-width: 240px;">
                    <div style="font-weight:700; color:#0f172a; margin-bottom:6px;">匹配（pattern）</div>
                    <input class="re-pattern" spellcheck="false" style="width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:13px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;">
                </div>
                <div style="flex:1; min-width: 240px;">
                    <div style="font-weight:700; color:#0f172a; margin-bottom:6px;">替换（replacement）</div>
                    <input class="re-repl" spellcheck="false" style="width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:13px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;">
                </div>
            </div>
        `;

        const enabledInput = enabledWrap.querySelector('input');
        enabledInput.checked = r.enabled !== false;
        body.querySelector('.re-name').value = r.name || '';
        body.querySelector('.re-when').value = r.when;
        body.querySelector('.re-flags').value = r.flags ?? 'g';
        body.querySelector('.re-pattern').value = r.pattern || '';
        body.querySelector('.re-repl').value = r.replacement ?? '';

        const updateHeader = () => {
            const name = body.querySelector('.re-name')?.value?.trim();
            const pattern = body.querySelector('.re-pattern')?.value?.trim();
            const repl = body.querySelector('.re-repl')?.value?.trim();
            const when = body.querySelector('.re-when')?.value || 'both';
            const title = name || (pattern ? `${pattern.slice(0, 28)}${pattern.length > 28 ? '…' : ''}` : '未命名规则');
            const sub = `${when} · ${repl ? `→ ${repl.slice(0, 28)}${repl.length > 28 ? '…' : ''}` : '→ (空)'}`;
            left.querySelector('.re-title').textContent = title;
            left.querySelector('.re-sub').textContent = sub;
            card.style.opacity = enabledInput.checked ? '' : '0.62';
            card.style.filter = enabledInput.checked ? '' : 'grayscale(1)';
        };
        updateHeader();

        const setCollapsed = (collapsed) => {
            card.dataset.collapsed = collapsed ? 'true' : 'false';
            header.querySelector('.re-toggle').textContent = collapsed ? '▸' : '▾';
            body.style.display = collapsed ? 'none' : 'block';
        };
        setCollapsed(true);

        header.addEventListener('click', () => {
            const collapsed = card.dataset.collapsed === 'true';
            setCollapsed(!collapsed);
        });
        // prevent toggle when interacting with controls
        card.querySelectorAll('input,select,button').forEach(el => {
            el.addEventListener('click', (e) => e.stopPropagation());
        });
        enabledInput.addEventListener('change', updateHeader);
        body.querySelectorAll('input,select').forEach(el => el.addEventListener('input', updateHeader));

        card.appendChild(header);
        card.appendChild(body);
        return card;
    }

    collectRules(container) {
        const rules = [];
        container.querySelectorAll('.regex-rule').forEach(el => {
            const id = el.dataset.ruleId || genId('re');
            rules.push(normalizeRule({
                id,
                name: el.querySelector('.re-name')?.value || '',
                enabled: el.querySelector('.re-enabled')?.checked !== false,
                when: el.querySelector('.re-when')?.value || 'both',
                flags: el.querySelector('.re-flags')?.value ?? 'g',
                pattern: el.querySelector('.re-pattern')?.value || '',
                replacement: el.querySelector('.re-repl')?.value ?? '',
            }));
        });
        return rules;
    }

    async refreshAll() {
        await this.store.ready;
        if (!this.element) return;
        this.setActiveTabStyles();
        const tools = this.element.querySelector('#regex-tools');
        const body = this.element.querySelector('#regex-body');
        if (!tools || !body) return;
        tools.innerHTML = '';
        body.innerHTML = '';

        if (this.activeTab === 'global') {
            body.appendChild(this.renderGlobal());
            return;
        }
        body.appendChild(await this.renderLocal());
    }

    renderGlobal() {
        const g = this.store.getGlobal();
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex; flex-direction:column; gap:12px;';

        const head = document.createElement('div');
        head.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;';
        head.innerHTML = `
            <label style="display:flex; align-items:center; gap:8px; font-size:13px; color:#334155; cursor:pointer;">
                <input id="re-global-enabled" type="checkbox" style="width:16px; height:16px;">
                启用全局正则
            </label>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <button type="button" id="re-global-add" style="padding:10px 12px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer;">＋ 新增规则</button>
                <button type="button" id="re-global-save" style="padding:10px 12px; border:none; border-radius:10px; background:#019aff; color:#fff; cursor:pointer; font-weight:700;">保存</button>
            </div>
        `;
        head.querySelector('#re-global-enabled').checked = g.enabled !== false;
        wrap.appendChild(head);

        const list = document.createElement('div');
        list.id = 're-global-list';
        list.style.cssText = 'display:flex; flex-direction:column; gap:10px;';
        (Array.isArray(g.rules) ? g.rules : []).forEach(r => list.appendChild(this.renderRuleCard(r)));
        wrap.appendChild(list);

        head.querySelector('#re-global-add').onclick = () => {
            list.appendChild(this.renderRuleCard({}));
        };
        list.addEventListener('click', (e) => {
            const del = e.target.closest('.re-del');
            if (!del) return;
            const card = del.closest('.regex-rule');
            if (card) card.remove();
        });
        head.querySelector('#re-global-save').onclick = async () => {
            try {
                const enabled = head.querySelector('#re-global-enabled')?.checked !== false;
                const rules = this.collectRules(list);
                await this.store.setGlobal({ enabled, rules });
                this.showStatus('已保存全局正则', 'success');
                window.dispatchEvent(new CustomEvent('regex-changed'));
            } catch (err) {
                logger.error('保存全局正则失败', err);
                this.showStatus(err.message || '保存失败', 'error');
            }
        };

        return wrap;
    }

    async renderLocal() {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex; gap:12px; align-items:stretch; flex-wrap:wrap;';

        const left = document.createElement('div');
        left.style.cssText = 'flex:1; min-width: 220px; max-width: 320px;';
        left.innerHTML = `
            <div style="font-weight:800; color:#0f172a; margin-bottom:8px;">局部正则集合</div>
            <div style="display:flex; gap:8px; margin-bottom:8px;">
                <button type="button" id="re-local-new" style="flex:1; padding:10px 12px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer;">＋ 新建</button>
                <button type="button" id="re-local-del" style="padding:10px 12px; border:1px solid #fecaca; border-radius:10px; background:#fee2e2; color:#b91c1c; cursor:pointer;">删除</button>
            </div>
            <div id="re-local-setlist" style="border:1px solid rgba(0,0,0,0.08); border-radius:12px; overflow:hidden;"></div>
        `;

        const right = document.createElement('div');
        right.style.cssText = 'flex:3; min-width: 280px;';
        right.innerHTML = `<div id="re-local-editor"></div>`;

        wrap.appendChild(left);
        wrap.appendChild(right);

        const sets = this.store.listLocalSets();
        if (!this.activeLocalSetId && sets[0]?.id) this.activeLocalSetId = sets[0].id;

        const setlist = left.querySelector('#re-local-setlist');
        const editor = right.querySelector('#re-local-editor');
        const renderSetList = () => {
            setlist.innerHTML = '';
            if (!sets.length) {
                const empty = document.createElement('div');
                empty.style.cssText = 'padding:12px; color:#94a3b8; text-align:center;';
                empty.textContent = '暂无局部正则集合';
                setlist.appendChild(empty);
                return;
            }
            sets.forEach(s => {
                const item = document.createElement('button');
                item.type = 'button';
                item.style.cssText = 'width:100%; text-align:left; padding:10px 12px; border:none; cursor:pointer; background:#fff; border-bottom:1px solid rgba(0,0,0,0.06);';
                item.innerHTML = `
                    <div style="font-weight:800; color:#0f172a;">${s.name || s.id}</div>
                    <div style="font-size:12px; color:#64748b; margin-top:2px;">${s.bind ? this.formatBind(s.bind) : '未绑定（不会自动启用）'}</div>
                `;
                if (s.id === this.activeLocalSetId) {
                    item.style.background = '#e2e8f0';
                }
                item.onclick = async () => {
                    this.activeLocalSetId = s.id;
                    await this.refreshAll();
                };
                setlist.appendChild(item);
            });
        };
        renderSetList();

        const setObj = this.activeLocalSetId ? this.store.getLocalSet(this.activeLocalSetId) : null;
        editor.innerHTML = '';
        editor.appendChild(this.renderLocalEditor(setObj));

        left.querySelector('#re-local-new').onclick = async () => {
            const name = prompt('新建局部正则名称', '新正则');
            if (!name) return;
            const id = await this.store.upsertLocalSet({ name, enabled: true, bind: null, rules: [] });
            this.activeLocalSetId = id;
            await this.refreshAll();
            this.showStatus('已新建', 'success');
            window.dispatchEvent(new CustomEvent('regex-changed'));
        };
        left.querySelector('#re-local-del').onclick = async () => {
            if (!this.activeLocalSetId) return;
            const cur = this.store.getLocalSet(this.activeLocalSetId);
            if (!confirm(`删除局部正则「${cur?.name || this.activeLocalSetId}」？`)) return;
            await this.store.removeLocalSet(this.activeLocalSetId);
            this.activeLocalSetId = null;
            await this.refreshAll();
            this.showStatus('已删除', 'success');
            window.dispatchEvent(new CustomEvent('regex-changed'));
        };

        return wrap;
    }

    formatBind(bind) {
        if (!bind) return '';
        if (bind.type === 'world') return `绑定世界书：${bind.worldId || ''}`;
        if (bind.type === 'preset') return `绑定预设：${bind.presetType || ''}/${bind.presetId || ''}`;
        return '绑定：未知';
    }

    renderLocalEditor(setObj) {
        const s = setObj ? deepClone(setObj) : null;
        if (!s) {
            const empty = document.createElement('div');
            empty.style.cssText = 'padding:12px; color:#94a3b8;';
            empty.textContent = '请选择或新建一个局部正则集合';
            return empty;
        }

        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex; flex-direction:column; gap:12px;';

        const head = document.createElement('div');
        head.style.cssText = 'border:1px solid rgba(0,0,0,0.06); border-radius:12px; padding:12px; background:rgba(248,250,252,0.6);';
        head.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                <div style="flex:1; min-width:220px;">
                    <div style="font-weight:800; color:#0f172a;">局部正则：${s.name}</div>
                    <div style="color:#64748b; font-size:12px; margin-top:4px;">绑定到预设或世界书后，切换到对应对象时自动生效</div>
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                    <button type="button" id="re-local-rename" style="padding:10px 12px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer;">✎ 重命名</button>
                    <button type="button" id="re-local-save" style="padding:10px 12px; border:none; border-radius:10px; background:#019aff; color:#fff; cursor:pointer; font-weight:700;">保存</button>
                </div>
            </div>
            <div style="margin-top:10px; display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
                <label style="display:flex; align-items:center; gap:8px; font-size:13px; color:#334155; cursor:pointer;">
                    <input id="re-local-enabled" type="checkbox" style="width:16px; height:16px;">
                    启用集合
                </label>
                <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
                    <div style="font-size:13px; color:#334155; font-weight:700;">绑定</div>
                    <select id="re-bind-type" style="padding:8px 10px; border:1px solid #e2e8f0; border-radius:10px; font-size:13px;">
                        <option value="">不绑定</option>
                        <option value="preset">绑定预设</option>
                        <option value="world">绑定世界书</option>
                    </select>
                    <select id="re-bind-preset-type" style="display:none; padding:8px 10px; border:1px solid #e2e8f0; border-radius:10px; font-size:13px;"></select>
                    <select id="re-bind-preset-id" style="display:none; padding:8px 10px; border:1px solid #e2e8f0; border-radius:10px; font-size:13px; min-width: 220px;"></select>
                    <select id="re-bind-world" style="display:none; padding:8px 10px; border:1px solid #e2e8f0; border-radius:10px; font-size:13px; min-width: 220px;"></select>
                </div>
            </div>
        `;
        wrap.appendChild(head);

        const enabledEl = head.querySelector('#re-local-enabled');
        enabledEl.checked = s.enabled !== false;

        const bindType = head.querySelector('#re-bind-type');
        const presetType = head.querySelector('#re-bind-preset-type');
        const presetId = head.querySelector('#re-bind-preset-id');
        const worldSel = head.querySelector('#re-bind-world');

        presetType.innerHTML = PRESET_TYPES.map(t => `<option value="${t.id}">${t.label}</option>`).join('');

        const updatePresetList = () => {
            const pt = presetType.value;
            const presets = window.appBridge?.presets?.list?.(pt) || [];
            presetId.innerHTML = '';
            presets.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name || p.id;
                presetId.appendChild(opt);
            });
        };
        updatePresetList();

        const updateWorldList = async () => {
            const ws = window.appBridge?.worldStore;
            await ws?.ready;
            const list = ws?.list?.() || [];
            worldSel.innerHTML = '';
            list.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                worldSel.appendChild(opt);
            });
        };
        updateWorldList().catch(() => {});

        const applyBindUI = () => {
            const t = bindType.value;
            presetType.style.display = t === 'preset' ? '' : 'none';
            presetId.style.display = t === 'preset' ? '' : 'none';
            worldSel.style.display = t === 'world' ? '' : 'none';
        };

        // init bind values
        if (s.bind?.type === 'preset') {
            bindType.value = 'preset';
            presetType.value = s.bind.presetType || 'openai';
            updatePresetList();
            presetId.value = s.bind.presetId || '';
        } else if (s.bind?.type === 'world') {
            bindType.value = 'world';
            worldSel.value = s.bind.worldId || '';
        } else {
            bindType.value = '';
        }
        applyBindUI();

        bindType.onchange = () => applyBindUI();
        presetType.onchange = () => { updatePresetList(); };

        const rulesWrap = document.createElement('div');
        rulesWrap.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;';
        rulesWrap.innerHTML = `
            <div style="font-weight:800; color:#0f172a;">规则</div>
            <button type="button" id="re-local-add" style="padding:10px 12px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer;">＋ 新增规则</button>
        `;
        wrap.appendChild(rulesWrap);

        const list = document.createElement('div');
        list.id = 're-local-rules';
        list.style.cssText = 'display:flex; flex-direction:column; gap:10px;';
        (Array.isArray(s.rules) ? s.rules : []).forEach(r => list.appendChild(this.renderRuleCard(r)));
        wrap.appendChild(list);

        rulesWrap.querySelector('#re-local-add').onclick = () => {
            list.appendChild(this.renderRuleCard({}));
        };
        list.addEventListener('click', (e) => {
            const del = e.target.closest('.re-del');
            if (!del) return;
            const card = del.closest('.regex-rule');
            if (card) card.remove();
        });

        head.querySelector('#re-local-rename').onclick = async () => {
            const name = prompt('重命名局部正则', s.name || '局部正则');
            if (!name) return;
            s.name = name;
            await this.store.upsertLocalSet({ ...s, name });
            await this.refreshAll();
            this.showStatus('已重命名', 'success');
            window.dispatchEvent(new CustomEvent('regex-changed'));
        };

        head.querySelector('#re-local-save').onclick = async () => {
            try {
                const enabled = enabledEl.checked !== false;
                const rules = this.collectRules(list);

                let bind = null;
                if (bindType.value === 'preset') {
                    bind = { type: 'preset', presetType: presetType.value, presetId: presetId.value };
                } else if (bindType.value === 'world') {
                    bind = { type: 'world', worldId: worldSel.value };
                }

                await this.store.upsertLocalSet({ id: s.id, name: s.name, enabled, bind, rules });
                this.showStatus('已保存局部正则', 'success');
                window.dispatchEvent(new CustomEvent('regex-changed'));
            } catch (err) {
                logger.error('保存局部正则失败', err);
                this.showStatus(err.message || '保存失败', 'error');
            }
        };

        return wrap;
    }
}
