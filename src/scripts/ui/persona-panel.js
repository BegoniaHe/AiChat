
import { MediaPicker } from './media-picker.js';

export class PersonaPanel {
    constructor({ personaStore, chatStore = null, getSessionId = null, onPersonaChanged }) {
        this.store = personaStore;
        this.chatStore = chatStore;
        this.getSessionId = typeof getSessionId === 'function' ? getSessionId : null;
        this.onPersonaChanged = onPersonaChanged;
        this.overlay = null;
        this.panel = null;
        this.mediaPicker = new MediaPicker({
            onUrl: (url) => this.updateAvatarPreview(url),
            onFile: (dataUrl) => this.updateAvatarPreview(dataUrl)
        });
        this.editingId = null;
    }

    ensureUI() {
        if (this.overlay) return;

        this.overlay = document.createElement('div');
        this.overlay.className = 'panel-overlay';
        this.overlay.style.display = 'none';
        this.overlay.style.zIndex = '21000'; // High z-index to sit on top
        this.overlay.style.position = 'fixed';
        this.overlay.style.inset = '0';
        this.overlay.style.background = 'rgba(0,0,0,0.38)';
        this.overlay.style.padding = 'calc(10px + env(safe-area-inset-top, 0px)) 10px calc(10px + env(safe-area-inset-bottom, 0px)) 10px';
        this.overlay.style.boxSizing = 'border-box';
        
        // Handle clicking outside to close
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.hide();
        });

        this.panel = document.createElement('div');
        this.panel.className = 'panel-content';
        this.panel.style.cssText = `
            position: relative;
            display: flex; flex-direction: column;
            width: min(94vw, 420px); height: min(82vh, 640px); max-height: calc(100% - 8px);
            background: #fff; border-radius: 12px; overflow: hidden;
            box-shadow: 0 8px 32px rgba(0,0,0,0.2);
        `;

        this.panel.innerHTML = `
            <div class="panel-header" style="padding: 15px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; background: #f8f9fa;">
                <span style="font-weight: bold; font-size: 16px;">👤 用户角色 (Personas)</span>
                <button class="close-btn" style="border: none; background: transparent; font-size: 20px; cursor: pointer; color: #666;">×</button>
            </div>
            <div id="persona-session-lock-bar" style="padding: 10px 15px; border-bottom: 1px solid rgba(0,0,0,0.06); background: #fff; display:none;">
                <!-- Filled dynamically -->
            </div>
            <div id="persona-list-container" style="flex: 1; overflow-y: auto; padding: 10px;">
                <!-- List goes here -->
            </div>
            <div class="panel-footer" style="padding: 15px; border-top: 1px solid #eee; background: #fff; text-align: center;">
                <button id="create-persona-btn" style="
                    background: #007bff; color: white; border: none; padding: 10px 20px; 
                    border-radius: 20px; font-size: 14px; cursor: pointer; width: 100%;
                    box-shadow: 0 2px 5px rgba(0,123,255,0.3);
                ">+ 新建角色</button>
            </div>

            <!-- Edit View (Hidden by default) -->
            <div id="persona-edit-view" style="
                display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                background: #fff; z-index: 10; flex-direction: column;
            ">
                <div style="padding: 12px 12px; border-bottom: 1px solid #eee; display: flex; align-items: center; gap: 8px; background: #f8f9fa;">
                    <button id="edit-back-btn" aria-label="返回" style="
                        width: 44px; height: 44px;
                        border: none; background: transparent;
                        font-size: 22px; cursor: pointer;
                        display: flex; align-items: center; justify-content: center;
                        border-radius: 12px;
                    ">←</button>
                    <span style="font-weight: bold; font-size: 16px;">编辑角色</span>
                </div>
                <div style="flex: 1; overflow-y: auto; padding: 20px;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <div id="edit-avatar-preview" style="
                            width: 80px; height: 80px; border-radius: 50%; background: #eee; 
                            margin: 0 auto 10px; background-size: cover; background-position: center;
                            border: 2px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.1); cursor: pointer;
                        "></div>
                        <button id="edit-avatar-btn" style="font-size: 12px; padding: 4px 10px; background: #eee; border: none; border-radius: 10px; color: #333;">更换头像</button>
                    </div>

                    <div style="margin-bottom: 15px;">
                        <label style="display: block; font-size: 12px; color: #666; margin-bottom: 5px;">名称 ({{user}})</label>
                        <input type="text" id="edit-name" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box;">
                    </div>

                    <div style="margin-bottom: 15px;">
                        <label style="display: block; font-size: 12px; color: #666; margin-bottom: 5px;">
                            详细描述 ({{persona}})
                            <span style="color:#999; font-size:11px; margin-left:5px;">注入到 System Prompt 或 Character Card 中</span>
                        </label>
                        <textarea id="edit-desc" style="
                            width: 100%; height: 120px; padding: 10px; border: 1px solid #ddd; 
                            border-radius: 8px; resize: none; box-sizing: border-box; font-family: inherit;
                        " placeholder="例如：我是一个富有冒险精神的旅行者..."></textarea>
                    </div>

                    <div style="margin-bottom: 15px; padding: 12px; border: 1px solid rgba(0,0,0,0.06); border-radius: 10px; background: rgba(248,250,252,0.8);">
                        <div style="font-size: 12px; font-weight: 700; color: #334155; margin-bottom: 8px;">注入设置（参考 SillyTavern）</div>
                        <div style="margin-bottom: 10px;">
                            <label style="display:block; font-size:12px; color:#666; margin-bottom:5px;">插入位置</label>
                            <select id="edit-position" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:8px; box-sizing:border-box;">
                                <option value="0">IN_PROMPT（作为 system prompt 注入）</option>
                                <option value="4">AT_DEPTH（插入到聊天历史指定深度）</option>
                                <option value="9">NONE（不注入）</option>
                            </select>
                        </div>
                        <div id="edit-depth-wrap" style="display:none; gap:10px;">
                            <div style="flex:1;">
                                <label style="display:block; font-size:12px; color:#666; margin-bottom:5px;">深度（0=最后一条）</label>
                                <input type="number" id="edit-depth" min="0" step="1" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:8px; box-sizing:border-box;" />
                            </div>
                            <div style="flex:1;">
                                <label style="display:block; font-size:12px; color:#666; margin-bottom:5px;">注入角色</label>
                                <select id="edit-role" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:8px; box-sizing:border-box;">
                                    <option value="0">system</option>
                                    <option value="1">user</option>
                                    <option value="2">assistant</option>
                                </select>
                            </div>
                        </div>
                        <div style="margin-top:10px; font-size:11px; color:#64748b; line-height:1.4;">
                            支持宏：<code>{{user}}</code> <code>{{char}}</code> <code>{{time}}</code> <code>{{date}}</code> 以及 <code>{{getvar::k}}</code> 等。
                        </div>
                    </div>

                    <button id="delete-persona-btn" style="width: 100%; padding: 12px; background: #fee2e2; color: #dc2626; border: none; border-radius: 8px; margin-top: 20px; cursor: pointer;">删除此角色</button>
                </div>
                <div style="padding: 15px; border-top: 1px solid #eee; background: #fff;">
                    <button id="save-persona-btn" style="width: 100%; padding: 12px; background: #007bff; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">保存</button>
                </div>
            </div>
        `;

        this.overlay.appendChild(this.panel);
        document.body.appendChild(this.overlay);

        // Bind Events
        this.panel.querySelector('.close-btn').addEventListener('click', () => this.hide());
        this.panel.querySelector('#create-persona-btn').addEventListener('click', () => this.openEdit());
        this.panel.querySelector('#edit-back-btn').addEventListener('click', () => this.closeEdit());
        this.panel.querySelector('#edit-avatar-preview').addEventListener('click', () => this.changeAvatar());
        this.panel.querySelector('#edit-avatar-btn').addEventListener('click', () => this.changeAvatar());
        this.panel.querySelector('#save-persona-btn').addEventListener('click', () => this.saveEdit());
        this.panel.querySelector('#delete-persona-btn').addEventListener('click', () => this.deleteCurrent());
        this.panel.querySelector('#edit-position').addEventListener('change', () => this.updateInjectionUi());
    }

    updateInjectionUi() {
        const posEl = this.panel?.querySelector?.('#edit-position');
        const wrap = this.panel?.querySelector?.('#edit-depth-wrap');
        if (!posEl || !wrap) return;
        const pos = Number(posEl.value);
        // SillyTavern: AT_DEPTH=4 shows depth/role controls
        wrap.style.display = (pos === 4) ? 'flex' : 'none';
    }

    getCurrentSessionId() {
        try {
            return this.getSessionId ? String(this.getSessionId() || '').trim() : '';
        } catch {
            return '';
        }
    }

    getSessionLockPersonaId(sessionId) {
        try {
            if (!this.chatStore || !sessionId) return '';
            const lockId = this.chatStore.getPersonaLock?.(sessionId);
            return lockId ? String(lockId) : '';
        } catch {
            return '';
        }
    }

    setSessionLockPersonaId(sessionId, personaId) {
        try {
            if (!this.chatStore || !sessionId) return false;
            const pid = String(personaId || '').trim();
            if (!pid) return false;
            this.chatStore.setPersonaLock?.(sessionId, pid);
            return true;
        } catch {
            return false;
        }
    }

    clearSessionLockPersonaId(sessionId) {
        try {
            if (!this.chatStore || !sessionId) return false;
            this.chatStore.clearPersonaLock?.(sessionId);
            return true;
        } catch {
            return false;
        }
    }

    renderSessionLockBar() {
        const bar = this.panel?.querySelector?.('#persona-session-lock-bar');
        if (!bar) return;
        const sessionId = this.getCurrentSessionId();
        if (!sessionId || !this.chatStore) {
            bar.style.display = 'none';
            bar.innerHTML = '';
            return;
        }
        const lockPersonaId = this.getSessionLockPersonaId(sessionId);
        const lockedPersona = lockPersonaId ? this.store.get(lockPersonaId) : null;
        const lockedName = lockedPersona?.name || lockPersonaId || '';

        bar.style.display = 'block';
        bar.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:800; color:#0f172a; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">当前会话：${sessionId}</div>
                    <div style="color:#64748b; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        ${lockPersonaId ? `已锁定 Persona：${lockedName}` : '未锁定（使用全局 Persona）'}
                    </div>
                </div>
                ${lockPersonaId ? `<button id="persona-unlock-btn" style="border:1px solid #e2e8f0; background:#fff; border-radius:10px; padding:6px 10px; cursor:pointer;">解除锁定</button>` : ''}
            </div>
        `;
        bar.querySelector('#persona-unlock-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.clearSessionLockPersonaId(sessionId);
            this.renderList();
            if (this.onPersonaChanged) this.onPersonaChanged();
        });
    }

    async show() {
        await this.store.ready;
        this.ensureUI();
        this.renderList();
        this.overlay.style.display = 'flex';
        // Center overlay
        this.overlay.style.justifyContent = 'center';
        this.overlay.style.alignItems = 'center';
    }

    hide() {
        if (this.overlay) this.overlay.style.display = 'none';
        this.closeEdit();
    }

    renderList() {
        this.renderSessionLockBar();
        const listEl = this.panel.querySelector('#persona-list-container');
        listEl.innerHTML = '';
        const personas = this.store.getAll();
        const activeId = this.store.activeId;
        const sessionId = this.getCurrentSessionId();
        const lockPersonaId = sessionId ? this.getSessionLockPersonaId(sessionId) : '';

        personas.forEach(p => {
            const item = document.createElement('div');
            item.style.cssText = `
                display: flex; align-items: center; gap: 10px; padding: 12px;
                border-bottom: 1px solid #f0f0f0; cursor: pointer;
                background: ${p.id === activeId ? '#f0f9ff' : 'white'};
                border-radius: 8px; margin-bottom: 5px;
                border: 1px solid ${p.id === activeId ? '#bae6fd' : 'transparent'};
            `;

            const avatarUrl = p.avatar || './assets/external/sharkpan.xyz-f-BZsa-mmexport1736279012663.png'; // Default user avatar
            const isLockedForSession = lockPersonaId && p.id === lockPersonaId;

            item.innerHTML = `
                <div style="position: relative;">
                    <img src="${avatarUrl}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; background: #eee;">
                    ${p.id === activeId ? '<div style="position: absolute; bottom: 0; right: 0; width: 14px; height: 14px; background: #007bff; border-radius: 50%; border: 2px solid white;"></div>' : ''}
                    ${isLockedForSession ? '<div title="此会话已锁定" style="position:absolute; top:-4px; right:-4px; width:18px; height:18px; background:#0f172a; color:#fff; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:11px; border:2px solid #fff;">🔒</div>' : ''}
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: bold; color: #333; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p.name}</div>
                    <div style="font-size: 12px; color: #999; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p.description || '暂无描述'}</div>
                </div>
                ${sessionId ? `<button class="lock-btn" title="锁定到当前会话" style="padding: 8px; border: none; background: transparent; color: ${isLockedForSession ? '#0f172a' : '#999'}; cursor: pointer; font-size: 16px;">🔒</button>` : ''}
                <button class="edit-btn" style="
                    padding: 8px; border: none; background: transparent; color: #999; cursor: pointer;
                    font-size: 16px;
                ">✎</button>
            `;

            // Click item to switch
            item.addEventListener('click', async (e) => {
                // Ignore if clicked edit button
                if (e.target.closest('.edit-btn') || e.target.closest('.lock-btn')) return;
                await this.store.setActive(p.id);
                this.renderList();
                if (this.onPersonaChanged) this.onPersonaChanged();
            });

            // Lock to current session
            item.querySelector('.lock-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                const sid = this.getCurrentSessionId();
                if (!sid) return;
                const curLock = this.getSessionLockPersonaId(sid);
                if (curLock && curLock === p.id) {
                    this.clearSessionLockPersonaId(sid);
                } else {
                    this.setSessionLockPersonaId(sid, p.id);
                }
                this.renderList();
                if (this.onPersonaChanged) this.onPersonaChanged();
            });

            // Click edit button
            item.querySelector('.edit-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.openEdit(p.id);
            });

            listEl.appendChild(item);
        });
    }

    openEdit(id = null) {
        this.editingId = id;
        const view = this.panel.querySelector('#persona-edit-view');
        const nameInput = this.panel.querySelector('#edit-name');
        const descInput = this.panel.querySelector('#edit-desc');
        const avatarPreview = this.panel.querySelector('#edit-avatar-preview');
        const posEl = this.panel.querySelector('#edit-position');
        const depthEl = this.panel.querySelector('#edit-depth');
        const roleEl = this.panel.querySelector('#edit-role');
        const deleteBtn = this.panel.querySelector('#delete-persona-btn');
        const title = view.querySelector('span');

        if (id) {
            const p = this.store.get(id);
            if (!p) return;
            nameInput.value = p.name || '';
            descInput.value = p.description || '';
            if (posEl) posEl.value = String(Number.isFinite(Number(p.position)) ? Number(p.position) : 0);
            if (depthEl) depthEl.value = String(Number.isFinite(Number(p.depth)) ? Math.max(0, Math.trunc(Number(p.depth))) : 2);
            if (roleEl) roleEl.value = String(Number.isFinite(Number(p.role)) ? Math.max(0, Math.min(2, Math.trunc(Number(p.role)))) : 0);
            this.updateAvatarPreview(p.avatar);
            deleteBtn.style.display = 'block';
            title.textContent = '编辑角色';
            
            // Disable delete if it's the only one
            if (this.store.getAll().length <= 1) {
                deleteBtn.style.display = 'none';
            }
        } else {
            nameInput.value = 'User';
            descInput.value = '';
            if (posEl) posEl.value = '0';
            if (depthEl) depthEl.value = '2';
            if (roleEl) roleEl.value = '0';
            this.updateAvatarPreview('');
            deleteBtn.style.display = 'none';
            title.textContent = '新建角色';
        }

        this.updateInjectionUi();

        view.style.display = 'flex';
        // Animation
        view.style.opacity = '0';
        view.style.transform = 'translateY(20px)';
        requestAnimationFrame(() => {
            view.style.transition = 'all 0.2s ease-out';
            view.style.opacity = '1';
            view.style.transform = 'translateY(0)';
        });
    }

    closeEdit() {
        const view = this.panel.querySelector('#persona-edit-view');
        view.style.display = 'none';
        this.editingId = null;
    }

    updateAvatarPreview(url) {
        const div = this.panel.querySelector('#edit-avatar-preview');
        // If no URL, use default image for preview context
        const safeUrl = url || './assets/external/sharkpan.xyz-f-BZsa-mmexport1736279012663.png';
        div.style.backgroundImage = `url("${safeUrl}")`;
        div.dataset.url = url || '';
    }

    async changeAvatar() {
        // Use MediaPicker to pick image
        const useFile = confirm('使用本地图片文件吗？点击「取消」使用 URL。');
        if (useFile) {
            await this.mediaPicker.pickFile('image');
        } else {
            await this.mediaPicker.pickUrl('请输入头像地址', './assets/external/sharkpan.xyz-f-BZsa-mmexport1736279012663.png');
        }
    }

    async saveEdit() {
        const name = this.panel.querySelector('#edit-name').value.trim();
        const description = this.panel.querySelector('#edit-desc').value;
        const avatar = this.panel.querySelector('#edit-avatar-preview').dataset.url || '';
        const position = Number(this.panel.querySelector('#edit-position')?.value ?? 0);
        const depth = Math.max(0, Math.trunc(Number(this.panel.querySelector('#edit-depth')?.value ?? 2) || 0));
        const role = Math.max(0, Math.min(2, Math.trunc(Number(this.panel.querySelector('#edit-role')?.value ?? 0) || 0)));

        if (!name) {
            alert('请输入角色名称');
            return;
        }

        if (this.editingId) {
            await this.store.update(this.editingId, { name, description, avatar, position, depth, role });
        } else {
            const newP = await this.store.create({ name, description, avatar, position, depth, role });
            this.store.setActive(newP.id); // Auto switch to new
        }

        this.closeEdit();
        this.renderList();
        if (this.onPersonaChanged) this.onPersonaChanged();
    }

    async deleteCurrent() {
        if (!this.editingId) return;
        if (!confirm('确定要删除此角色吗？')) return;

        const success = await this.store.delete(this.editingId);
        if (success) {
            this.closeEdit();
            this.renderList();
            if (this.onPersonaChanged) this.onPersonaChanged();
        } else {
            alert('无法删除（至少保留一个角色）');
        }
    }
}
