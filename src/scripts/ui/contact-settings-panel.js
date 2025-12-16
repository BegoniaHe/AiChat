/**
 * Contact settings panel
 * - Edit contact display name + avatar (does not rename session id)
 */
import { logger } from '../utils/logger.js';
import { avatarDataUrlFromFile } from '../utils/image.js';

export class ContactSettingsPanel {
    constructor({ contactsStore, chatStore, getSessionId, onSaved } = {}) {
        this.contactsStore = contactsStore;
        this.chatStore = chatStore;
        this.getSessionId = typeof getSessionId === 'function' ? getSessionId : () => 'default';
        this.onSaved = typeof onSaved === 'function' ? onSaved : null;
        this.overlay = null;
        this.panel = null;
        this.fileInput = null;
        this.avatarPreview = null;
        this.nameInput = null;
        this.archivesList = null;
        this.currentAvatar = '';
    }

    show() {
        if (!this.panel) this.createUI();
        this.populate();
        this.renderArchives();
        this.overlay.style.display = 'block';
        this.panel.style.display = 'block';
    }

    hide() {
        if (this.overlay) this.overlay.style.display = 'none';
        if (this.panel) this.panel.style.display = 'none';
    }

    createUI() {
        this.overlay = document.createElement('div');
        this.overlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.4); z-index:20000;';
        this.overlay.onclick = () => this.hide();

        this.panel = document.createElement('div');
        this.panel.style.cssText = `
            display:none; position:fixed;
            top: calc(10px + env(safe-area-inset-top, 0px));
            left: calc(10px + env(safe-area-inset-left, 0px));
            right: calc(10px + env(safe-area-inset-right, 0px));
            height: calc(100vh - 20px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            height: calc(100dvh - 20px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            background:#fff; border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,0.25);
            z-index:21000;
            overflow:hidden;
            display:flex; flex-direction:column;
        `;
        this.panel.onclick = (e) => e.stopPropagation();

        this.fileInput = document.createElement('input');
        this.fileInput.type = 'file';
        this.fileInput.accept = 'image/*';
        this.fileInput.style.display = 'none';
        this.fileInput.onchange = async () => {
            const file = this.fileInput.files?.[0];
            if (!file) return;
            try {
                this.currentAvatar = await avatarDataUrlFromFile(file, { maxDim: 256, quality: 0.84, maxBytes: 420_000 });
                if (this.avatarPreview) this.avatarPreview.src = this.currentAvatar;
            } catch (err) {
                logger.warn('读取/压缩头像失败', err);
                window.toastr?.error?.('读取头像失败');
            }
        };

        this.panel.innerHTML = `
            <div style="padding:14px 16px; border-bottom:1px solid rgba(0,0,0,0.06); background:rgba(248,250,252,0.92); display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <div style="min-width:0;">
                    <div style="font-weight:800; color:#0f172a;">好友设置</div>
                    <div id="contact-settings-sub" style="color:#64748b; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
                </div>
                <button id="contact-settings-close" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:#0f172a;">×</button>
            </div>

            <div style="padding:14px 16px; overflow:auto; flex:1; min-height:0; -webkit-overflow-scrolling:touch;">
                <div style="display:flex; gap:14px; align-items:center; flex-wrap:wrap;">
                    <button id="contact-avatar-btn" type="button" style="width:72px; height:72px; border-radius:18px; border:1px solid #e2e8f0; background:#fff; padding:0; overflow:hidden; cursor:pointer;">
                        <img id="contact-avatar-preview" alt="" style="width:100%; height:100%; object-fit:cover; display:block;">
                    </button>
                    <div style="flex:1; min-width:220px;">
                        <div style="font-weight:700; color:#0f172a; margin-bottom:6px;">名称</div>
                        <input id="contact-name-input" style="width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:14px;">
                        <div style="color:#64748b; font-size:12px; margin-top:6px;">仅修改显示名称，不会改变聊天室 ID。</div>
                    </div>
                </div>

                <div style="margin-top:20px; border-top:1px solid #eee; padding-top:14px;">
                    <div style="font-weight:700; color:#0f172a; margin-bottom:10px;">聊天管理</div>
                    <button id="contact-new-chat" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:8px; background:#fff; color:#019aff; font-weight:700; margin-bottom:10px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
                        <span>✨</span> 开启新聊天（存档当前）
                    </button>
                    <div style="font-size:12px; color:#64748b; margin-bottom:6px;">历史存档（点击加载）</div>
                    <div id="contact-archives-list" style="max-height:160px; overflow-y:auto; border:1px solid #eee; border-radius:8px; background:#f9f9f9; padding:0;"></div>
                </div>

                <div style="margin-top:14px; display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-end;">
                    <button id="contact-avatar-clear" type="button" style="padding:10px 12px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer;">清除头像</button>
                    <button id="contact-settings-cancel" type="button" style="padding:10px 18px; border:1px solid #e2e8f0; border-radius:10px; background:#f8fafc; cursor:pointer;">取消</button>
                    <button id="contact-settings-save" type="button" style="padding:10px 18px; border:none; border-radius:10px; background:#019aff; color:#fff; cursor:pointer; font-weight:700;">保存</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.overlay);
        document.body.appendChild(this.panel);
        document.body.appendChild(this.fileInput);

        this.avatarPreview = this.panel.querySelector('#contact-avatar-preview');
        this.nameInput = this.panel.querySelector('#contact-name-input');
        this.archivesList = this.panel.querySelector('#contact-archives-list');

        this.panel.querySelector('#contact-settings-close').onclick = () => this.hide();
        this.panel.querySelector('#contact-settings-cancel').onclick = () => this.hide();
        this.panel.querySelector('#contact-avatar-btn').onclick = () => {
            this.fileInput.value = '';
            this.fileInput.click();
        };
        this.panel.querySelector('#contact-avatar-clear').onclick = () => {
            this.currentAvatar = '';
            if (this.avatarPreview) this.avatarPreview.src = './assets/external/cdn.discordapp.com-role-icons-1336817752844796016-da610f5548f174d9e04d49b1b28c3af1.webp';
        };
        this.panel.querySelector('#contact-settings-save').onclick = () => this.save();
        this.panel.querySelector('#contact-new-chat').onclick = () => this.startNewChat();
    }

    renderArchives() {
        if (!this.archivesList || !this.chatStore) return;
        const sid = this.getSessionId();
        const archives = this.chatStore.getArchives(sid);
        const currentId = this.chatStore.state.sessions[sid]?.currentArchiveId; 
        this.archivesList.innerHTML = '';
        
        if (!archives.length) {
            this.archivesList.innerHTML = '<div style="padding:12px; color:#94a3b8; text-align:center; font-size:12px;">暂无历史存档</div>';
            return;
        }

        archives.forEach(arc => {
            const dateStr = new Date(arc.timestamp).toLocaleString();
            const msgCount = Array.isArray(arc.messages) ? arc.messages.length : 0;
            const isCurrent = arc.id === currentId;
            const row = document.createElement('div');
            row.style.cssText = `display:flex; align-items:center; justify-content:space-between; padding:8px 10px; border-bottom:1px solid #eee; background:${isCurrent ? '#eff6ff' : '#fff'}; border-left:${isCurrent ? '3px solid #019aff' : 'none'};`;
            
            const info = document.createElement('div');
            info.style.cssText = 'flex:1; cursor:pointer; min-width:0;';
            info.innerHTML = `
                <div style="font-weight:600; color:#334155; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${arc.name || '未命名存档'} ${isCurrent ? '(当前)' : ''}</div>
                <div style="color:#94a3b8; font-size:11px;">${dateStr} · ${msgCount}条消息</div>
            `;
            info.onclick = () => {
                if (isCurrent) return;
                if (confirm(`确定要加载存档「${arc.name}」吗？\n当前聊天将被自动保存。`)) {
                    this.chatStore.loadArchivedMessages(arc.id, sid);
                    window.toastr?.success('已加载存档');
                    this.onSaved?.({ id: sid, forceRefresh: true }); 
                    this.hide();
                }
            };

            const delBtn = document.createElement('button');
            delBtn.textContent = '×';
            delBtn.style.cssText = 'padding:4px 8px; border:none; background:transparent; color:#94a3b8; font-size:16px; cursor:pointer; margin-left:6px;';
            delBtn.onclick = (e) => {
                e.stopPropagation();
                if (confirm('确定要删除这条存档吗？')) {
                    this.chatStore.deleteArchive(arc.id, sid);
                    this.renderArchives();
                }
            };

            row.appendChild(info);
            row.appendChild(delBtn);
            this.archivesList.appendChild(row);
        });
    }

    startNewChat() {
        if (!this.chatStore) return;
        const sid = this.getSessionId();
        const raw = prompt('请输入当前聊天的存档名称（留空将自动命名）：');
        if (raw === null) return; 
        
        this.chatStore.startNewChat(sid, raw.trim());
        window.toastr?.success('已开启新聊天');
        this.onSaved?.({ id: sid, forceRefresh: true });
        this.hide();
    }

    populate() {
        const sessionId = this.getSessionId();
        const c = this.contactsStore?.getContact?.(sessionId) || { id: sessionId, name: sessionId, avatar: '' };
        // Ensure it exists (so save works)
        this.contactsStore?.upsertContact?.(c);
        const sub = this.panel.querySelector('#contact-settings-sub');
        if (sub) sub.textContent = `会话：${sessionId}`;
        this.currentAvatar = c.avatar || '';
        if (this.avatarPreview) {
            this.avatarPreview.src = this.currentAvatar || './assets/external/cdn.discordapp.com-role-icons-1336817752844796016-da610f5548f174d9e04d49b1b28c3af1.webp';
        }
        if (this.nameInput) this.nameInput.value = c.name || sessionId;
    }

    save() {
        try {
            const sessionId = this.getSessionId();
            const prev = this.contactsStore?.getContact?.(sessionId) || { id: sessionId };
            const name = String(this.nameInput?.value || '').trim() || prev.name || sessionId;
            const avatar = String(this.currentAvatar || '');
            this.contactsStore?.upsertContact?.({ ...prev, id: sessionId, name, avatar });
            window.toastr?.success?.('已保存好友设置');
            this.onSaved?.({ id: sessionId, name, avatar });
            this.hide();
        } catch (err) {
            logger.error('保存好友设置失败', err);
            window.toastr?.error?.(err.message || '保存失败');
        }
    }
}
