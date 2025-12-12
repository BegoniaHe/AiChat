/**
 * Session list panel (basic)
 * - list sessions, create new, switch
 */

import { logger } from '../utils/logger.js';

export class SessionPanel {
    constructor(store, ui) {
        this.store = store;
        this.ui = ui;
        this.overlay = null;
        this.panel = null;
        this.listEl = null;
        this.nameInput = null;
    }

    formatTime(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    show() {
        if (!this.panel) this.createUI();
        this.refresh();
        this.overlay.style.display = 'block';
        this.panel.style.display = 'block';
    }

    hide() {
        if (this.overlay) this.overlay.style.display = 'none';
        if (this.panel) this.panel.style.display = 'none';
    }

    refresh() {
        if (!this.listEl) return;
        this.listEl.innerHTML = '';
        const sessions = this.store.listSessions();
        const currentId = this.store.getCurrent();
        if (!sessions.length) {
            const li = document.createElement('li');
            li.textContent = '（暫無會話）';
            li.style.color = '#888';
            this.listEl.appendChild(li);
            return;
        }
        sessions.forEach((id) => {
            const li = document.createElement('li');
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.style.alignItems = 'center';
            li.style.padding = '6px 8px';
            li.style.borderBottom = '1px solid #f0f0f0';
            if (id === currentId) {
                li.style.background = '#f8fafc';
                li.style.border = '1px solid #e2e8f0';
            }

            const name = document.createElement('span');
            const last = this.store.getLastMessage(id);
            const snippet = last ? (last.content || '').slice(0, 32) : '新會話';
            const time = last && last.timestamp ? this.formatTime(last.timestamp) : '';
            const isGroup = id.startsWith('group:');
            const badge = isGroup ? `<span style="padding:2px 6px; border-radius:8px; background:#e0f2fe; color:#0369a1; font-size:11px; margin-left:4px;">群</span>` : '';
            const currentTag = id === currentId ? `<span style="color:#059669; font-size:11px; margin-left:6px;">當前</span>` : '';
            name.innerHTML = `<strong>${id}${badge}${currentTag}</strong><br><span style="color:#888;font-size:12px;">${snippet}</span> ${time ? `<span style="color:#9ca3af;font-size:11px;">${time}</span>` : ''}`;
            if (id === currentId) {
                name.style.fontWeight = '700';
            }

            const btn = document.createElement('button');
            btn.textContent = id === currentId ? '當前' : '切換';
            btn.style.cssText = 'padding:4px 8px;border:1px solid #ddd;border-radius:6px;background:#f5f5f5;cursor:pointer;';
            btn.onclick = () => this.switchTo(id);

            const actions = document.createElement('div');
            actions.style.display = 'flex';
            actions.style.gap = '6px';

            const renameBtn = document.createElement('button');
            renameBtn.textContent = '重命名';
            renameBtn.style.cssText = 'padding:4px 8px;border:1px solid #ddd;border-radius:6px;background:#f5f5f5;cursor:pointer;';
            renameBtn.onclick = () => this.rename(id);

            const delBtn = document.createElement('button');
            delBtn.textContent = '刪除';
            delBtn.style.cssText = 'padding:4px 8px;border:1px solid #fca5a5;border-radius:6px;background:#fee2e2;color:#b91c1c;cursor:pointer;';
            delBtn.onclick = () => this.remove(id);

            li.appendChild(name);
            actions.appendChild(btn);
            actions.appendChild(renameBtn);
            actions.appendChild(delBtn);
            li.appendChild(actions);
            this.listEl.appendChild(li);
        });
    }

    switchTo(id) {
        this.store.setCurrent(id);
        window.dispatchEvent(new CustomEvent('session-changed', { detail: { id } }));
        this.hide();
        logger.info('Switched session', id);
    }

    rename(id) {
        const next = prompt('輸入新會話 ID', id);
        if (!next || next === id) return;
        if (this.store.listSessions().includes(next)) {
            window.toastr?.warning('ID 已存在，請換一個');
            return;
        }
        this.store.rename(id, next);
        this.switchTo(next);
        this.refresh();
    }

    remove(id) {
        if (!confirm(`確認刪除會話：${id}？`)) return;
        this.store.delete(id);
        this.refresh();
        const current = this.store.getCurrent();
        this.switchTo(current);
    }

    createUI() {
        this.overlay = document.createElement('div');
        this.overlay.style.cssText = `
            display:none; position:fixed; inset:0; background:rgba(0,0,0,0.4); z-index:9000;
        `;
        this.overlay.onclick = () => this.hide();

        this.panel = document.createElement('div');
        this.panel.style.cssText = `
            display:none; position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
            width:min(460px,90vw); background:#fff; border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,0.2);
            padding:16px; z-index:10000; max-height:80vh; overflow:auto;
        `;
        this.panel.onclick = (e) => e.stopPropagation();

        this.panel.innerHTML = `
            <h3 style="margin:0 0 12px;">會話列表</h3>
            <div style="display:flex; gap:8px; margin-bottom:8px;">
                <input id="session-name" placeholder="新會話ID" style="flex:1; padding:8px; border:1px solid #ddd; border-radius:8px;">
                <button id="session-add" style="padding:8px 12px; border:1px solid #ddd; border-radius:8px; background:#f5f5f5;">新建</button>
                <button id="session-clear" style="padding:8px 12px; border:1px solid #fca5a5; border-radius:8px; background:#fee2e2; color:#b91c1c;">清空當前</button>
            </div>
            <ul id="session-list" style="list-style:none; padding:0; margin:0; border:1px solid #eee; border-radius:8px;"></ul>
        `;

        this.listEl = this.panel.querySelector('#session-list');
        this.nameInput = this.panel.querySelector('#session-name');
        this.panel.querySelector('#session-add').onclick = () => this.addSession();
        this.panel.querySelector('#session-clear').onclick = () => this.clearCurrent();

        document.body.appendChild(this.overlay);
        document.body.appendChild(this.panel);
    }

    addSession() {
        const id = (this.nameInput.value || '').trim();
        if (!id) {
            window.toastr?.warning('請輸入會話ID');
            return;
        }
        if (!this.store.listSessions().includes(id)) {
            this.store.setCurrent(id);
            this.store.appendMessage({ role: 'system', type: 'meta', content: '新會話開始' }, id);
        } else {
            this.store.setCurrent(id);
        }
        this.nameInput.value = '';
        this.switchTo(id);
        this.refresh();
    }

    clearCurrent() {
        const id = this.store.getCurrent();
        if (!confirm(`清空當前會話：${id}？此操作不可恢復。`)) return;
        this.store.clear(id);
        this.switchTo(id);
        this.refresh();
    }
}
