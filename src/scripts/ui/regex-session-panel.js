/**
 * Regex panel (Session scoped)
 * - Only applies in the current chat session
 */
import { RegexStore } from '../storage/regex-store.js';
import { logger } from '../utils/logger.js';

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

export class RegexSessionPanel {
    constructor(getSessionId) {
        this.store = window.appBridge?.regex || new RegexStore();
        this.getSessionId = typeof getSessionId === 'function' ? getSessionId : () => 'default';
        this.element = null;
        this.overlay = null;
        this.statusEl = null;
    }

    async show() {
        await this.store.ready;
        if (!this.element) this.createUI();
        await this.refresh();
        this.overlay.style.display = 'block';
        this.element.style.display = 'flex';
    }

    hide() {
        if (this.element) this.element.style.display = 'none';
        if (this.overlay) this.overlay.style.display = 'none';
    }

    createUI() {
        this.overlay = document.createElement('div');
        this.overlay.id = 'regex-session-overlay';
        this.overlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:20000;';
        this.overlay.onclick = () => this.hide();

        this.element = document.createElement('div');
        this.element.id = 'regex-session-panel';
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
                    <div style="font-weight:800; color:#0f172a;">正规表达式（聊天室）</div>
                    <div id="re-session-sub" style="color:#64748b; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
                </div>
                <button id="re-session-close" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:#0f172a;">×</button>
            </div>

            <div id="re-session-scroll" style="padding:14px 16px; overflow:auto; flex:1; min-height:0; -webkit-overflow-scrolling:touch;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                    <label style="display:flex; align-items:center; gap:8px; font-size:13px; color:#334155; cursor:pointer;">
                        <input id="re-session-enabled" type="checkbox" style="width:16px; height:16px;">
                        启用本聊天室正则
                    </label>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        <button type="button" id="re-session-add" style="padding:10px 12px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer;">＋ 新增规则</button>
                        <button type="button" id="re-session-save" style="padding:10px 12px; border:none; border-radius:10px; background:#019aff; color:#fff; cursor:pointer; font-weight:700;">保存</button>
                    </div>
                </div>

                <div id="re-session-list" style="margin-top:12px; display:flex; flex-direction:column; gap:10px;"></div>

                <div id="re-session-status" style="display:none; margin-top:12px; padding:10px; border-radius:10px; font-size:13px;"></div>
            </div>
        `;

        document.body.appendChild(this.overlay);
        document.body.appendChild(this.element);

        this.statusEl = this.element.querySelector('#re-session-status');
        this.element.querySelector('#re-session-close').onclick = () => this.hide();
        this.element.querySelector('#re-session-add').onclick = () => {
            const list = this.element.querySelector('#re-session-list');
            list.appendChild(this.renderRuleCard({}));
        };
        this.element.querySelector('#re-session-list').addEventListener('click', (e) => {
            const del = e.target.closest('.re-del');
            if (!del) return;
            const card = del.closest('.regex-rule');
            if (card) card.remove();
        });
        this.element.querySelector('#re-session-save').onclick = async () => this.save();
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
        card.querySelectorAll('input,select,button').forEach(el => {
            el.addEventListener('click', (e) => e.stopPropagation());
        });
        enabledInput.addEventListener('change', updateHeader);
        body.querySelectorAll('input,select').forEach(el => el.addEventListener('input', updateHeader));

        card.appendChild(header);
        card.appendChild(body);
        return card;
    }

    collectRules() {
        const root = this.element.querySelector('#re-session-list');
        const rules = [];
        root.querySelectorAll('.regex-rule').forEach(el => {
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

    async refresh() {
        await this.store.ready;
        const sid = this.getSessionId();
        const sub = this.element.querySelector('#re-session-sub');
        if (sub) sub.textContent = `当前会话：${sid}`;
        const state = this.store.getSession(sid);
        this.element.querySelector('#re-session-enabled').checked = state.enabled !== false;
        const list = this.element.querySelector('#re-session-list');
        list.innerHTML = '';
        (Array.isArray(state.rules) ? state.rules : []).forEach(r => list.appendChild(this.renderRuleCard(r)));
    }

    async save() {
        const sid = this.getSessionId();
        if (!sid) return;
        try {
            const enabled = this.element.querySelector('#re-session-enabled')?.checked !== false;
            const rules = this.collectRules();
            await this.store.setSession(sid, { enabled, rules });
            this.showStatus('已保存', 'success');
            window.dispatchEvent(new CustomEvent('regex-changed'));
        } catch (err) {
            logger.error('保存聊天室正则失败', err);
            this.showStatus(err.message || '保存失败', 'error');
        }
    }
}
