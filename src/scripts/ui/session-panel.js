/**
 * Session list panel (basic)
 * - list sessions, create new, switch
 */

import { logger } from '../utils/logger.js';
import { avatarDataUrlFromFile } from '../utils/image.js';

export class SessionPanel {
    constructor(chatStore, contactsStore, ui, { onUpdated } = {}) {
        this.store = chatStore;
        this.contactsStore = contactsStore;
        this.ui = ui;
        this.overlay = null;
        this.panel = null;
        this.listEl = null;
        this.nameInput = null;
        this.onUpdated = typeof onUpdated === 'function' ? onUpdated : null;
    }

    formatTime(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    show({ focusAdd = false } = {}) {
        if (!this.panel) this.createUI();
        this.refresh();
        this.overlay.style.display = 'block';
        this.panel.style.display = 'block';
        if (focusAdd) {
            setTimeout(() => this.nameInput?.focus(), 0);
        }
    }

    hide() {
        if (this.overlay) this.overlay.style.display = 'none';
        if (this.panel) this.panel.style.display = 'none';
    }

    refresh() {
        if (!this.listEl) return;
        this.listEl.innerHTML = '';
        const contacts = this.contactsStore?.listContacts?.() || [];
        const currentId = this.store.getCurrent();
        if (!contacts.length) {
            const li = document.createElement('li');
            li.textContent = '（暫無好友/群組）';
            li.style.color = '#888';
            this.listEl.appendChild(li);
            return;
        }
        contacts.forEach((c) => {
            const id = c.id;
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
            const isGroup = Boolean(c.isGroup) || id.startsWith('group:');
            const badge = isGroup ? `<span style="padding:2px 6px; border-radius:8px; background:#e0f2fe; color:#0369a1; font-size:11px; margin-left:4px;">群</span>` : '';
            const currentTag = id === currentId ? `<span style="color:#059669; font-size:11px; margin-left:6px;">當前</span>` : '';
            const displayName = c.name || id;
            name.innerHTML = `<strong>${displayName}${badge}${currentTag}</strong><br><span style="color:#888;font-size:12px;">${snippet}</span> ${time ? `<span style="color:#9ca3af;font-size:11px;">${time}</span>` : ''}`;
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
            renameBtn.textContent = '改名';
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
        const currentName = this.contactsStore?.getContact?.(id)?.name || id;
        const next = prompt('輸入新好友名稱（同時作為聊天室 ID）', currentName);
        if (!next || next === id) return;
        const nextId = next.trim();
        if (!nextId) return;
        if (nextId.startsWith('group:')) {
            window.toastr?.warning('好友名稱不可使用 group: 前綴');
            return;
        }
        if (this.contactsStore?.getContact?.(nextId) || this.store.listSessions().includes(nextId)) {
            window.toastr?.warning('名稱已存在，請換一個');
            return;
        }

        // 迁移世界书映射（按会话隔离）
        const map = window.appBridge?.worldSessionMap;
        if (map && map[id]) {
            map[nextId] = map[id];
            delete map[id];
            window.appBridge?.persistWorldSessionMap?.();
        }

        // 迁移联系人记录
        const existing = this.contactsStore?.getContact?.(id);
        if (existing) {
            this.contactsStore.removeContact(id);
            this.contactsStore.upsertContact({ ...existing, id: nextId, name: nextId });
        }

        // 迁移聊天记录
        this.store.rename(id, nextId);

        this.switchTo(nextId);
        this.refresh();
        this.onUpdated?.();
    }

    remove(id) {
        const name = this.contactsStore?.getContact?.(id)?.name || id;
        if (!confirm(`確認刪除：${name}？此操作會刪除聊天室與好友記錄（不可恢復）。`)) return;

        // 清理世界书映射
        const map = window.appBridge?.worldSessionMap;
        if (map && map[id]) {
            delete map[id];
            window.appBridge?.persistWorldSessionMap?.();
        }

        this.store.delete(id);
        this.contactsStore?.removeContact?.(id);
        this.refresh();
        const current = this.store.getCurrent();
        this.switchTo(current);
        this.onUpdated?.();
    }

    createUI() {
        this.overlay = document.createElement('div');
        this.overlay.style.cssText = `
            display:none; position:fixed; inset:0; background:rgba(0,0,0,0.4); z-index:20000;
        `;
        this.overlay.onclick = () => this.hide();

        this.panel = document.createElement('div');
        this.panel.style.cssText = `
            display:none; position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
            width:min(460px,90vw); background:#fff; border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,0.2);
            padding:16px; z-index:21000; max-height:80vh; overflow:auto;
        `;
        this.panel.onclick = (e) => e.stopPropagation();

        this.panel.innerHTML = `
            <h3 style="margin:0 0 12px;">好友列表</h3>
            <div style="display:flex; gap:8px; margin-bottom:8px; align-items:center;">
                <button id="session-avatar-btn" type="button" title="设置好友头像" style="width:44px; height:44px; border-radius:12px; border:1px solid #e2e8f0; background:#fff; padding:0; overflow:hidden; cursor:pointer;">
                    <img id="session-avatar-preview" alt="" style="width:100%; height:100%; object-fit:cover; display:block;" src="./assets/external/cdn.discordapp.com-role-icons-1336817752844796016-da610f5548f174d9e04d49b1b28c3af1.webp">
                </button>
                <input id="session-name" placeholder="新好友名稱" style="flex:1; padding:8px; border:1px solid #ddd; border-radius:8px;">
                <button id="session-add" style="padding:8px 12px; border:1px solid #ddd; border-radius:8px; background:#f5f5f5;">添加</button>
                <button id="session-clear" style="padding:8px 12px; border:1px solid #fca5a5; border-radius:8px; background:#fee2e2; color:#b91c1c;">清空聊天</button>
            </div>
            <ul id="session-list" style="list-style:none; padding:0; margin:0; border:1px solid #eee; border-radius:8px;"></ul>
        `;

        this.newAvatar = '';
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        fileInput.onchange = async () => {
            const file = fileInput.files?.[0];
            if (!file) return;
            try {
                this.newAvatar = await avatarDataUrlFromFile(file, { maxDim: 256, quality: 0.84, maxBytes: 420_000 });
                const img = this.panel.querySelector('#session-avatar-preview');
                if (img) img.src = this.newAvatar || img.src;
            } catch (err) {
                logger.warn('读取/压缩头像失败', err);
                window.toastr?.error?.('读取头像失败');
            }
        };
        this.panel.appendChild(fileInput);

        this.listEl = this.panel.querySelector('#session-list');
        this.nameInput = this.panel.querySelector('#session-name');
        this.panel.querySelector('#session-add').onclick = () => this.addSession();
        this.panel.querySelector('#session-clear').onclick = () => this.clearCurrent();
        this.panel.querySelector('#session-avatar-btn').onclick = () => {
            fileInput.value = '';
            fileInput.click();
        };

        document.body.appendChild(this.overlay);
        document.body.appendChild(this.panel);
    }

    addSession() {
        const name = (this.nameInput.value || '').trim();
        if (!name) {
            window.toastr?.warning('請輸入好友名稱');
            return;
        }

        if (name.startsWith('group:')) {
            window.toastr?.warning('好友名稱不可使用 group: 前綴');
            return;
        }

        if (this.contactsStore?.getContact?.(name)) {
            window.toastr?.warning('好友已存在');
            return;
        }

        // 创建独立聊天室（会话）与联系人记录
        this.contactsStore?.upsertContact?.({ id: name, name, avatar: this.newAvatar || '', isGroup: false, addedAt: Date.now() });
        this.store.switchSession(name);
        window.appBridge?.setActiveSession?.(name);

        this.nameInput.value = '';
        this.newAvatar = '';
        const img = this.panel?.querySelector('#session-avatar-preview');
        if (img) img.src = './assets/external/cdn.discordapp.com-role-icons-1336817752844796016-da610f5548f174d9e04d49b1b28c3af1.webp';
        this.switchTo(name);
        this.refresh();
        this.onUpdated?.();
    }

    clearCurrent() {
        const id = this.store.getCurrent();
        if (!confirm(`清空當前會話：${id}？此操作不可恢復。`)) return;
        this.store.clear(id);
        this.switchTo(id);
        this.refresh();
    }
}
