/**
 * Contact settings panel
 * - Edit contact display name + avatar (does not rename session id)
 */
import { logger } from '../utils/logger.js';
import { avatarDataUrlFromFile } from '../utils/image.js';

export class ContactSettingsPanel {
    constructor({ contactsStore, getSessionId, onSaved } = {}) {
        this.contactsStore = contactsStore;
        this.getSessionId = typeof getSessionId === 'function' ? getSessionId : () => 'default';
        this.onSaved = typeof onSaved === 'function' ? onSaved : null;
        this.overlay = null;
        this.panel = null;
        this.fileInput = null;
        this.avatarPreview = null;
        this.nameInput = null;
        this.currentAvatar = '';
    }

    show() {
        if (!this.panel) this.createUI();
        this.populate();
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
