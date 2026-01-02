/**
 * Group chat panels
 * - Create group from contacts
 * - Manage group settings (name/avatar/members)
 */

import { logger } from '../utils/logger.js';
import { avatarDataUrlFromFile } from '../utils/image.js';
import { appSettings } from '../storage/app-settings.js';

const getMemoryStorageMode = () => {
    const mode = String(appSettings.get().memoryStorageMode || 'summary').toLowerCase();
    return mode === 'table' ? 'table' : 'summary';
};

const genGroupId = () => `group:${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const normalize = (s) => String(s || '').trim();
const normalizeKey = (s) => normalize(s).toLowerCase().replace(/\s+/g, '');

const defaultAvatar = './assets/external/feather-default.png';

export class GroupCreatePanel {
    constructor({ contactsStore, chatStore, onCreated } = {}) {
        this.contactsStore = contactsStore;
        this.chatStore = chatStore;
        this.onCreated = typeof onCreated === 'function' ? onCreated : null;

        this.overlay = null;
        this.panel = null;
        this.fileInput = null;

        this.avatar = '';
        this.selected = new Set();
    }

    show() {
        if (!this.panel) this.createUI();
        this.avatar = '';
        this.selected.clear();
        this.panel.querySelector('#group-name').value = '';
        this.panel.querySelector('#group-search').value = '';
        this.renderContacts();
        this.updateAvatarPreview();
        this.updateCreateEnabled();
        this.overlay.style.display = 'block';
        this.panel.style.display = 'flex';
    }

    hide() {
        if (this.overlay) this.overlay.style.display = 'none';
        if (this.panel) this.panel.style.display = 'none';
    }

    createUI() {
        this.overlay = document.createElement('div');
        this.overlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:20000;';
        this.overlay.addEventListener('click', () => this.hide());

        this.panel = document.createElement('div');
        this.panel.style.cssText = `
            display:none; position:fixed;
            top: calc(10px + env(safe-area-inset-top, 0px));
            left: calc(10px + env(safe-area-inset-left, 0px));
            right: calc(10px + env(safe-area-inset-right, 0px));
            height: calc(100vh - 20px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            height: calc(100dvh - 20px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            background:#fff; border-radius:14px; box-shadow:0 10px 40px rgba(0,0,0,0.25);
            z-index:21000;
            overflow:hidden;
            flex-direction:column;
        `;
        this.panel.addEventListener('click', (e) => e.stopPropagation());

        this.panel.innerHTML = `
            <div style="padding:14px 16px; border-bottom:1px solid rgba(0,0,0,0.06); background:linear-gradient(135deg, rgba(25,154,255,0.10), rgba(0,102,204,0.08)); display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <div style="min-width:0;">
                    <div style="font-weight:900; color:#0f172a;">创建群组</div>
                    <div style="color:#64748b; font-size:12px;">从联系人中选择成员</div>
                </div>
                <button id="group-close" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:#0f172a;">×</button>
            </div>

            <div style="padding:14px 16px; overflow:auto; flex:1; min-height:0; -webkit-overflow-scrolling:touch;">
                <div style="display:flex; gap:14px; align-items:center; flex-wrap:wrap;">
                    <button id="group-avatar-btn" type="button" style="width:72px; height:72px; border-radius:18px; border:1px solid #e2e8f0; background:#fff; padding:0; overflow:hidden; cursor:pointer;">
                        <img id="group-avatar-preview" alt="" style="width:100%; height:100%; object-fit:cover; display:block;">
                    </button>
                    <div style="flex:1; min-width:220px;">
                        <div style="font-weight:700; color:#0f172a; margin-bottom:6px;">群组名称</div>
                        <input id="group-name" style="width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:14px;" placeholder="请输入群组名称">
                        <div id="group-name-hint" style="color:#64748b; font-size:12px; margin-top:6px;"></div>
                    </div>
                </div>

                <div style="margin-top:14px;">
                    <div style="font-weight:800; color:#0f172a; margin-bottom:8px;">选择成员</div>
                    <div style="position:relative;">
                        <input id="group-search" style="width:100%; padding:10px 12px; border:1px solid #e2e8f0; border-radius:10px; font-size:14px; box-sizing:border-box;" placeholder="搜索联系人...">
                    </div>
                    <div id="group-contacts" style="margin-top:10px; display:flex; flex-direction:column; gap:8px;"></div>
                </div>
            </div>

            <div style="padding:14px 16px; border-top:1px solid rgba(0,0,0,0.06); background:rgba(248,250,252,0.92); display:flex; gap:10px;">
                <button id="group-cancel" style="flex:1; padding:10px 14px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer;">取消</button>
                <button id="group-create" style="flex:1; padding:10px 14px; border:none; border-radius:10px; background:#019aff; color:#fff; cursor:pointer; font-weight:800;">创建</button>
            </div>
        `;

        this.fileInput = document.createElement('input');
        this.fileInput.type = 'file';
        this.fileInput.accept = 'image/*';
        this.fileInput.style.display = 'none';
        this.fileInput.onchange = async () => {
            const file = this.fileInput.files?.[0];
            if (!file) return;
            try {
                this.avatar = await avatarDataUrlFromFile(file, { maxDim: 256, quality: 0.84, maxBytes: 520_000 });
                this.updateAvatarPreview();
            } catch (err) {
                logger.warn('读取/压缩群组头像失败', err);
                window.toastr?.error?.('读取头像失败');
            }
        };

        document.body.appendChild(this.overlay);
        document.body.appendChild(this.panel);
        document.body.appendChild(this.fileInput);

        this.panel.querySelector('#group-close').onclick = () => this.hide();
        this.panel.querySelector('#group-cancel').onclick = () => this.hide();
        this.panel.querySelector('#group-avatar-btn').onclick = () => {
            this.fileInput.value = '';
            this.fileInput.click();
        };
        this.panel.querySelector('#group-name').addEventListener('input', () => this.updateCreateEnabled());
        this.panel.querySelector('#group-search').addEventListener('input', () => this.renderContacts());
        this.panel.querySelector('#group-create').onclick = () => this.createGroup();
    }

    updateAvatarPreview() {
        const img = this.panel?.querySelector('#group-avatar-preview');
        if (!img) return;
        img.src = this.avatar || defaultAvatar;
    }

    updateCreateEnabled() {
        if (!this.panel) return;
        const btn = this.panel.querySelector('#group-create');
        const hint = this.panel.querySelector('#group-name-hint');
        const name = normalize(this.panel.querySelector('#group-name')?.value);
        const membersCount = this.selected.size;
        const nameKey = normalizeKey(name);

        let error = '';
        if (!name) error = '请输入群组名称';
        else {
            const groups = this.contactsStore?.listGroups?.() || [];
            const dup = groups.find(g => normalizeKey(g?.name) === nameKey);
            if (dup) error = '已存在同名群组';
        }
        if (!error && membersCount < 2) error = '请至少选择 2 位成员';

        if (hint) {
            hint.textContent = error ? error : `已选择 ${membersCount} 位成员`;
            hint.style.color = error ? '#ef4444' : '#64748b';
        }
        if (btn) btn.disabled = Boolean(error);
    }

    renderContacts() {
        const listEl = this.panel?.querySelector('#group-contacts');
        if (!listEl) return;
        const q = normalizeKey(this.panel.querySelector('#group-search')?.value);
        const friends = this.contactsStore?.listFriends?.() || [];
        const filtered = q
            ? friends.filter(c => normalizeKey(c?.name || c?.id).includes(q))
            : friends;

        listEl.innerHTML = '';
        if (!filtered.length) {
            const empty = document.createElement('div');
            empty.textContent = '暂无联系人';
            empty.style.cssText = 'color:#94a3b8; font-size:13px; padding:10px 6px;';
            listEl.appendChild(empty);
            this.updateCreateEnabled();
            return;
        }

        filtered.forEach((c) => {
            const id = normalize(c?.id);
            if (!id) return;
            const row = document.createElement('button');
            row.type = 'button';
            row.style.cssText = `
                display:flex; align-items:center; gap:10px;
                padding:10px 10px;
                border:1px solid ${this.selected.has(id) ? '#93c5fd' : '#e2e8f0'};
                background:${this.selected.has(id) ? 'rgba(59,130,246,0.08)' : '#fff'};
                border-radius:12px;
                cursor:pointer;
                text-align:left;
            `;
            const img = document.createElement('img');
            img.src = c?.avatar || defaultAvatar;
            img.alt = '';
            img.style.cssText = 'width:36px; height:36px; border-radius:50%; object-fit:cover;';
            const name = document.createElement('div');
            name.textContent = c?.name || id;
            name.style.cssText = 'font-weight:700; color:#0f172a; flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';
            const tag = document.createElement('div');
            tag.textContent = this.selected.has(id) ? '已选' : '';
            tag.style.cssText = 'font-size:12px; color:#2563eb;';
            row.appendChild(img);
            row.appendChild(name);
            row.appendChild(tag);

            row.onclick = () => {
                if (this.selected.has(id)) this.selected.delete(id);
                else this.selected.add(id);
                this.renderContacts();
            };
            listEl.appendChild(row);
        });
        this.updateCreateEnabled();
    }

    createGroup() {
        try {
            const name = normalize(this.panel?.querySelector('#group-name')?.value);
            if (!name) return;
            const members = [...this.selected].map(normalize).filter(Boolean);
            if (members.length < 2) return;

            const id = genGroupId();
            this.contactsStore?.upsertContact?.({
                id,
                name,
                avatar: this.avatar || '',
                isGroup: true,
                members,
                addedAt: Date.now(),
            });

            // System messages
            const memberNames = members
                .map(mid => this.contactsStore?.getContact?.(mid)?.name || mid)
                .filter(Boolean);
            const sys1 = { role: 'system', type: 'meta', content: `你创建了群聊「${name}」`, name: '系统', avatar: '' , time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) };
            const sys2 = { role: 'system', type: 'meta', content: `你邀请了：${memberNames.join('、')} 加入群聊`, name: '系统', avatar: '' , time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) };
            this.chatStore?.appendMessage?.(sys1, id);
            this.chatStore?.appendMessage?.(sys2, id);

            this.hide();
            window.toastr?.success?.('群组已创建');
            this.onCreated?.({ id, name });
        } catch (err) {
            logger.error('创建群组失败', err);
            window.toastr?.error?.(err.message || '创建失败');
        }
    }
}

export class GroupSettingsPanel {
    constructor({ contactsStore, chatStore, onSaved } = {}) {
        this.contactsStore = contactsStore;
        this.chatStore = chatStore;
        this.onSaved = typeof onSaved === 'function' ? onSaved : null;

        this.overlay = null;
        this.panel = null;
        this.fileInput = null;

        this.groupId = '';
        this.avatar = '';
        this.members = [];
        this.archivesList = null;
        this.summariesList = null;
        this.compactedList = null;
        this.summarySection = null;
        this.memoryTableSection = null;
        this.summaryBatchMode = false;
        this.summarySelectedKeys = new Set();
        this.summariesBatchBar = null;
        this.summaryEditOverlay = null;
        this.summaryEditPanel = null;
        this.summaryEditTextarea = null;
        this.summaryEditSave = null;
        this.summaryEditCancel = null;
        this.summaryCompacting = false;

        this.addOverlay = null;
        this.addPanel = null;
        this.addSelected = new Set();
    }

    show(groupId) {
        const id = normalize(groupId);
        if (!id) return;
        if (!this.panel) this.createUI();
        this.groupId = id;
        this.applyMemoryMode();
        this.populate();
        this.renderArchives();
        this.renderSummaries();
        this.renderCompactedSummary();
        this.overlay.style.display = 'block';
        this.panel.style.display = 'flex';
    }

    hide() {
        if (this.overlay) this.overlay.style.display = 'none';
        if (this.panel) this.panel.style.display = 'none';
    }

    applyMemoryMode() {
        const summaryOn = getMemoryStorageMode() === 'summary';
        if (this.summarySection) this.summarySection.style.display = summaryOn ? 'block' : 'none';
        if (this.memoryTableSection) this.memoryTableSection.style.display = summaryOn ? 'none' : 'block';
    }

    createUI() {
        this.overlay = document.createElement('div');
        this.overlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:20000;';
        this.overlay.addEventListener('click', () => this.hide());

        this.panel = document.createElement('div');
        this.panel.style.cssText = `
            display:none; position:fixed;
            top: calc(10px + env(safe-area-inset-top, 0px));
            left: calc(10px + env(safe-area-inset-left, 0px));
            right: calc(10px + env(safe-area-inset-right, 0px));
            height: calc(100vh - 20px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            height: calc(100dvh - 20px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            background:#fff; border-radius:14px; box-shadow:0 10px 40px rgba(0,0,0,0.25);
            z-index:21000;
            overflow:hidden;
            flex-direction:column;
        `;
        this.panel.addEventListener('click', (e) => e.stopPropagation());

        this.panel.innerHTML = `
            <div style="padding:14px 16px; border-bottom:1px solid rgba(0,0,0,0.06); background:rgba(248,250,252,0.92); display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <div style="min-width:0;">
                    <div style="font-weight:900; color:#0f172a;">群聊设置</div>
                    <div id="group-settings-sub" style="color:#64748b; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
                </div>
                <button id="group-settings-close" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:#0f172a;">×</button>
            </div>

            <div style="padding:14px 16px; overflow:auto; flex:1; min-height:0; -webkit-overflow-scrolling:touch;">
                <div style="display:flex; gap:14px; align-items:center; flex-wrap:wrap;">
                    <button id="group-settings-avatar-btn" type="button" style="width:72px; height:72px; border-radius:18px; border:1px solid #e2e8f0; background:#fff; padding:0; overflow:hidden; cursor:pointer;">
                        <img id="group-settings-avatar-preview" alt="" style="width:100%; height:100%; object-fit:cover; display:block;">
                    </button>
                    <div style="flex:1; min-width:220px;">
                        <div style="font-weight:700; color:#0f172a; margin-bottom:6px;">群组名称</div>
                        <input id="group-settings-name" style="width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:14px;">
                        <div style="color:#64748b; font-size:12px; margin-top:6px;">修改名称不会改变聊天室 ID。</div>
                    </div>
                </div>

	                <div style="margin-top:14px;">
	                    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
	                        <div style="font-weight:800; color:#0f172a;">成员</div>
	                        <button id="group-settings-add" style="border:1px solid #e2e8f0; background:#fff; padding:6px 10px; border-radius:10px; cursor:pointer;">＋ 添加</button>
	                    </div>
	                    <div id="group-settings-members" style="margin-top:10px; display:flex; flex-direction:column; gap:8px;"></div>
	                </div>

                    <div style="margin-top:18px; border-top:1px solid rgba(0,0,0,0.06); padding-top:14px;">
                        <div style="font-weight:800; color:#0f172a; margin-bottom:8px;">聊天管理</div>
                        <button id="group-new-chat" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:8px; background:#fff; color:#019aff; font-weight:700; margin-bottom:10px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
                            <span>✨</span> 开启新聊天（存档当前）
                        </button>
                        <div style="font-size:12px; color:#64748b; margin-bottom:6px;">历史存档（点击加载）</div>
                        <div id="group-archives-list" style="max-height:160px; overflow-y:auto; border:1px solid #eee; border-radius:8px; background:#f9f9f9; padding:0;"></div>
                    </div>

                    <div id="group-summary-section" style="margin-top:18px; border-top:1px solid rgba(0,0,0,0.06); padding-top:14px;">
                        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:6px;">
                            <div style="font-weight:800; color:#0f172a;">摘要</div>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <button id="group-summaries-batch" type="button" title="批量操作" style="width:32px; height:28px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer; color:#0f172a; font-size:16px; line-height:1;">☰</button>
                                <button id="group-summaries-clear" type="button" style="padding:6px 10px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer; color:#ef4444;">清空</button>
                            </div>
                        </div>
                        <div style="font-size:12px; color:#64748b; margin-bottom:8px;">该群聊每次互动保存一条摘要（与聊天存档绑定）</div>
                        <div id="group-summaries-batchbar" style="display:none; align-items:center; justify-content:flex-end; gap:8px; margin:-2px 0 10px;">
                            <button id="group-summaries-batch-edit" type="button" title="批量编辑" style="width:34px; height:30px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer; color:#0f172a; font-size:16px;">✎</button>
                            <button id="group-summaries-batch-delete" type="button" title="批量删除" style="width:34px; height:30px; border:1px solid #fecaca; border-radius:10px; background:#fff; cursor:pointer; color:#b91c1c; font-size:16px;">🗑</button>
                            <button id="group-summaries-batch-cancel" type="button" title="退出批量" style="width:34px; height:30px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer; color:#0f172a; font-size:18px;">×</button>
                        </div>
                        <div id="group-summaries-list" style="max-height:180px; overflow-y:auto; border:1px solid #eee; border-radius:10px; background:#fff; padding:0;"></div>

	                    <div style="margin-top:14px;">
	                        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:6px;">
	                            <div style="font-weight:800; color:#0f172a;">大总结</div>
	                            <div style="display:flex; align-items:center; gap:8px;">
	                                <button id="group-compacted-raw" type="button" title="查看原始回覆" style="width:32px; height:28px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer; color:#0f172a; font-size:16px; line-height:1;">📄</button>
	                                <button id="group-compacted-edit" type="button" title="编辑" style="width:32px; height:28px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer; color:#0f172a; font-size:16px; line-height:1;">✎</button>
	                                <button id="group-compacted-run" type="button" title="手动生成/刷新" style="width:32px; height:28px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer; color:#0f172a; font-size:16px; line-height:1;">↻</button>
	                                <button id="group-compacted-clear" type="button" title="删除" style="width:32px; height:28px; border:1px solid #fecaca; border-radius:10px; background:#fff; cursor:pointer; color:#b91c1c; font-size:16px; line-height:1;">🗑</button>
	                            </div>
	                        </div>
	                        <div style="font-size:12px; color:#64748b; margin-bottom:8px;">摘要总字数超过阈值会自动生成大总结（与聊天存档绑定）</div>
	                        <div id="group-compacted-summary" style="max-height:220px; overflow-y:auto; border:1px solid #eee; border-radius:10px; background:#fff; padding:0;"></div>
	                    </div>
                    </div>

                    <div id="group-memory-table-section" style="display:none; margin-top:18px; padding:12px; border:1px dashed #e2e8f0; border-radius:12px; background:#f8fafc;">
                        <div style="font-weight:800; color:#0f172a; margin-bottom:6px;">记忆表格</div>
                        <div style="font-size:12px; color:#64748b; line-height:1.4;">
                            记忆表格模式已开启。后续记忆表格编辑界面将展示在这里（与当前群聊绑定）。
                        </div>
                    </div>
	            </div>

            <div style="padding:14px 16px; border-top:1px solid rgba(0,0,0,0.06); background:rgba(248,250,252,0.92); display:flex; gap:10px;">
                <button id="group-settings-cancel" style="flex:1; padding:10px 14px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer;">取消</button>
                <button id="group-settings-save" style="flex:1; padding:10px 14px; border:none; border-radius:10px; background:#019aff; color:#fff; cursor:pointer; font-weight:800;">保存</button>
            </div>
        `;

        this.fileInput = document.createElement('input');
        this.fileInput.type = 'file';
        this.fileInput.accept = 'image/*';
        this.fileInput.style.display = 'none';
        this.fileInput.onchange = async () => {
            const file = this.fileInput.files?.[0];
            if (!file) return;
            try {
                this.avatar = await avatarDataUrlFromFile(file, { maxDim: 256, quality: 0.84, maxBytes: 520_000 });
                this.updateAvatarPreview();
            } catch (err) {
                logger.warn('读取/压缩群组头像失败', err);
                window.toastr?.error?.('读取头像失败');
            }
        };

        document.body.appendChild(this.overlay);
        document.body.appendChild(this.panel);
        document.body.appendChild(this.fileInput);
        this.archivesList = this.panel.querySelector('#group-archives-list');
        this.summariesList = this.panel.querySelector('#group-summaries-list');
        this.compactedList = this.panel.querySelector('#group-compacted-summary');
        this.summarySection = this.panel.querySelector('#group-summary-section');
        this.memoryTableSection = this.panel.querySelector('#group-memory-table-section');
        this.summariesBatchBar = this.panel.querySelector('#group-summaries-batchbar');

        this.panel.querySelector('#group-settings-close').onclick = () => this.hide();
        this.panel.querySelector('#group-settings-cancel').onclick = () => this.hide();
        this.panel.querySelector('#group-settings-avatar-btn').onclick = () => {
            this.fileInput.value = '';
            this.fileInput.click();
        };
        this.panel.querySelector('#group-settings-add').onclick = () => this.openAddMembers();
        this.panel.querySelector('#group-settings-save').onclick = () => this.save();
        this.panel.querySelector('#group-new-chat').onclick = () => this.startNewChat();
        this.panel.querySelector('#group-summaries-clear').onclick = () => {
            const sid = this.groupId;
            if (!sid) return;
            if (!confirm('确定要清空该群聊当前存档/聊天的所有摘要吗？')) return;
            try { this.chatStore?.clearSummaries?.(sid); } catch {}
            this.summarySelectedKeys = new Set();
            this.setSummaryBatchMode(false);
            this.renderSummaries();
        };
        this.panel.querySelector('#group-summaries-batch').onclick = () => this.setSummaryBatchMode(!this.summaryBatchMode);
	        this.panel.querySelector('#group-summaries-batch-cancel').onclick = () => this.setSummaryBatchMode(false);
	        this.panel.querySelector('#group-summaries-batch-delete').onclick = () => this.deleteSelectedSummaries();
	        this.panel.querySelector('#group-summaries-batch-edit').onclick = () => this.editSelectedSummaries();
	        this.panel.querySelector('#group-compacted-raw').onclick = () => this.openCompactedRaw();
	        this.panel.querySelector('#group-compacted-edit').onclick = () => this.editCompactedSummary();
	        this.panel.querySelector('#group-compacted-run').onclick = () => this.runCompactedSummary();
	        this.panel.querySelector('#group-compacted-clear').onclick = () => {
	            const sid = this.groupId;
	            if (!sid) return;
            if (!confirm('确定要清空该群聊当前存档/聊天的大总结吗？')) return;
            try { this.chatStore?.clearCompactedSummary?.(sid); } catch {}
            this.renderCompactedSummary();
        };

        window.addEventListener('memory-storage-mode-changed', () => {
            try {
                if (!this.panel || this.panel.style.display === 'none') return;
                this.applyMemoryMode();
            } catch {}
        });
        window.addEventListener('chatapp-summaries-updated', (ev) => {
            try {
                if (!this.panel || this.panel.style.display === 'none') return;
                const sid = this.groupId;
                const target = String(ev?.detail?.sessionId || '').trim();
                if (!sid || !target || sid !== target) return;
                this.renderSummaries();
                this.renderCompactedSummary();
            } catch {}
        });
    }

	    setSummaryBatchMode(enabled) {
	        const next = Boolean(enabled);
	        this.summaryBatchMode = next;
	        if (!next) this.summarySelectedKeys = new Set();
	        if (this.summariesBatchBar) this.summariesBatchBar.style.display = next ? 'flex' : 'none';
	        this.renderSummaries();
	    }

	    ensureCompactedRawModal() {
	        if (this.__compactedRawReady) return;
	        this.__compactedRawReady = true;

	        const overlay = document.createElement('div');
	        overlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:22000;';
	        const panel = document.createElement('div');
	        panel.style.cssText = `
	            display:none; position:fixed;
	            left: calc(12px + env(safe-area-inset-left, 0px));
	            right: calc(12px + env(safe-area-inset-right, 0px));
	            bottom: calc(12px + env(safe-area-inset-bottom, 0px));
	            max-height: calc(100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
	            background:#fff; border-radius:14px; box-shadow:0 10px 40px rgba(0,0,0,0.28);
	            z-index:23000;
	            overflow:hidden;
	            display:flex; flex-direction:column;
	        `;
	        panel.addEventListener('click', (e) => e.stopPropagation());
	        panel.innerHTML = `
	            <div style="padding:12px 14px; border-bottom:1px solid rgba(0,0,0,0.06); display:flex; align-items:center; justify-content:space-between; gap:10px;">
	                <div style="font-weight:900; color:#0f172a;">大总结原始回覆</div>
	                <button data-role="close" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:#0f172a;">×</button>
	            </div>
	            <div style="padding:12px 14px; flex:1; min-height:0; overflow:auto;">
	                <textarea data-role="textarea" readonly style="width:100%; min-height:220px; resize:vertical; padding:10px; border:1px solid #e2e8f0; border-radius:12px; font-size:13px; line-height:1.4; box-sizing:border-box; white-space:pre-wrap;"></textarea>
	            </div>
	            <div style="padding:12px 14px; border-top:1px solid rgba(0,0,0,0.06); background:rgba(248,250,252,0.92); display:flex; gap:10px;">
	                <button data-role="copy" style="flex:1; padding:10px 12px; border:1px solid #e2e8f0; border-radius:12px; background:#fff; cursor:pointer;">复制</button>
	                <button data-role="ok" style="flex:1; padding:10px 12px; border:none; border-radius:12px; background:#019aff; color:#fff; cursor:pointer; font-weight:900;">关闭</button>
	            </div>
	        `;
	        document.body.appendChild(overlay);
	        document.body.appendChild(panel);

	        const textarea = panel.querySelector('[data-role="textarea"]');
	        const close = () => {
	            overlay.style.display = 'none';
	            panel.style.display = 'none';
	        };
	        overlay.addEventListener('click', close);
	        panel.querySelector('[data-role="close"]').onclick = close;
	        panel.querySelector('[data-role="ok"]').onclick = close;
	        panel.querySelector('[data-role="copy"]').onclick = async () => {
	            try {
	                await navigator.clipboard?.writeText?.(String(textarea?.value || ''));
	                window.toastr?.success?.('已复制原始回覆');
	            } catch {}
	        };

	        this.__compactedRawOverlay = overlay;
	        this.__compactedRawPanel = panel;
	        this.__compactedRawTextarea = textarea;
	        this.__compactedRawClose = close;
	    }

	    openCompactedRaw() {
	        const sid = this.groupId;
	        if (!sid) return;
	        const raw = String(this.chatStore?.getCompactedSummaryRaw?.(sid) || '').trim();
	        if (!raw) {
	            window.toastr?.info?.('暂无本次大总结的原始回覆（旧数据可能未记录）');
	            return;
	        }
	        this.ensureCompactedRawModal();
	        this.__compactedRawTextarea.value = raw;
	        this.__compactedRawOverlay.style.display = 'block';
	        this.__compactedRawPanel.style.display = 'flex';
	        setTimeout(() => {
	            try { this.__compactedRawTextarea?.focus?.(); } catch {}
	        }, 0);
	    }

	    ensureCompactedEditModal() {
	        if (this.__compactedEditReady) return;
	        this.__compactedEditReady = true;

	        const overlay = document.createElement('div');
	        overlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:22000;';
	        overlay.addEventListener('click', () => close());
	        const panel = document.createElement('div');
	        panel.style.cssText = `
	            display:none; position:fixed;
	            left: calc(12px + env(safe-area-inset-left, 0px));
	            right: calc(12px + env(safe-area-inset-right, 0px));
	            bottom: calc(12px + env(safe-area-inset-bottom, 0px));
	            max-height: calc(100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
	            background:#fff; border-radius:14px; box-shadow:0 10px 40px rgba(0,0,0,0.28);
	            z-index:23000;
	            overflow:hidden;
	            display:flex; flex-direction:column;
	        `;
	        panel.addEventListener('click', (e) => e.stopPropagation());
	        panel.innerHTML = `
	            <div style="padding:12px 14px; border-bottom:1px solid rgba(0,0,0,0.06); display:flex; align-items:center; justify-content:space-between; gap:10px;">
	                <div style="font-weight:900; color:#0f172a;">编辑大总结</div>
	                <button data-role="close" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:#0f172a;">×</button>
	            </div>
	            <div style="padding:12px 14px; flex:1; min-height:0; overflow:auto;">
	                <textarea data-role="textarea" style="width:100%; min-height:200px; resize:vertical; padding:10px; border:1px solid #e2e8f0; border-radius:12px; font-size:13px; line-height:1.4; box-sizing:border-box;"></textarea>
	            </div>
	            <div style="padding:12px 14px; border-top:1px solid rgba(0,0,0,0.06); background:rgba(248,250,252,0.92); display:flex; gap:10px;">
	                <button data-role="cancel" style="flex:1; padding:10px 12px; border:1px solid #e2e8f0; border-radius:12px; background:#fff; cursor:pointer;">取消</button>
	                <button data-role="save" style="flex:1; padding:10px 12px; border:none; border-radius:12px; background:#019aff; color:#fff; cursor:pointer; font-weight:900;">保存</button>
	            </div>
	        `;
	        document.body.appendChild(overlay);
	        document.body.appendChild(panel);

	        const textarea = panel.querySelector('[data-role="textarea"]');
	        const close = () => {
	            overlay.style.display = 'none';
	            panel.style.display = 'none';
	            this.__compactedEditOnSave = null;
	        };
	        panel.querySelector('[data-role="close"]').onclick = close;
	        panel.querySelector('[data-role="cancel"]').onclick = close;
	        panel.querySelector('[data-role="save"]').onclick = () => {
	            const v = String(textarea?.value || '').trim();
	            this.__compactedEditOnSave?.(v);
	        };

	        this.__compactedEditOverlay = overlay;
	        this.__compactedEditPanel = panel;
	        this.__compactedEditTextarea = textarea;
	        this.__compactedEditClose = close;
	    }

	    editCompactedSummary() {
	        const sid = this.groupId;
	        if (!sid) return;
	        const cs = this.chatStore?.getCompactedSummary?.(sid);
	        const text = String(cs?.text || '').trim();
	        if (!text) {
	            window.toastr?.info?.('暂无大总结可编辑');
	            return;
	        }
	        this.ensureCompactedEditModal();
	        this.__compactedEditOnSave = (next) => {
	            const t = String(next || '').trim();
	            if (!t) {
	                window.toastr?.error?.('内容不能为空');
	                return;
	            }
	            const raw = String(this.chatStore?.getCompactedSummaryRaw?.(sid) || '');
	            try { this.chatStore?.setCompactedSummary?.(t, sid, { raw }); } catch {}
	            try { window.dispatchEvent(new CustomEvent('chatapp-summaries-updated', { detail: { sessionId: sid } })); } catch {}
	            this.renderCompactedSummary();
	            try { this.__compactedEditClose?.(); } catch {}
	            window.toastr?.success?.('已更新大总结');
	        };
	        if (this.__compactedEditTextarea) this.__compactedEditTextarea.value = text;
	        this.__compactedEditOverlay.style.display = 'block';
	        this.__compactedEditPanel.style.display = 'flex';
	        setTimeout(() => {
	            try { this.__compactedEditTextarea?.focus?.(); } catch {}
	        }, 0);
	    }

    ensureSummaryEditModal() {
        if (this.summaryEditPanel) return;
        this.summaryEditOverlay = document.createElement('div');
        this.summaryEditOverlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:22000;';
        this.summaryEditOverlay.addEventListener('click', () => this.closeSummaryEditModal());

        this.summaryEditPanel = document.createElement('div');
        this.summaryEditPanel.style.cssText = `
            display:none; position:fixed;
            left: calc(12px + env(safe-area-inset-left, 0px));
            right: calc(12px + env(safe-area-inset-right, 0px));
            bottom: calc(12px + env(safe-area-inset-bottom, 0px));
            max-height: calc(100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            background:#fff; border-radius:14px; box-shadow:0 10px 40px rgba(0,0,0,0.28);
            z-index:23000;
            overflow:hidden;
            display:flex; flex-direction:column;
        `;
        this.summaryEditPanel.addEventListener('click', (e) => e.stopPropagation());
        this.summaryEditPanel.innerHTML = `
            <div style="padding:12px 14px; border-bottom:1px solid rgba(0,0,0,0.06); display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <div style="font-weight:900; color:#0f172a;">批量编辑摘要</div>
                <button data-role="close" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:#0f172a;">×</button>
            </div>
            <div style="padding:12px 14px; flex:1; min-height:0; overflow:auto;">
                <div style="font-size:12px; color:#64748b; margin-bottom:8px;">每行一条摘要（顺序对应所选摘要）。</div>
                <textarea data-role="textarea" style="width:100%; min-height:180px; resize:vertical; padding:10px; border:1px solid #e2e8f0; border-radius:12px; font-size:13px; line-height:1.4; box-sizing:border-box;"></textarea>
            </div>
            <div style="padding:12px 14px; border-top:1px solid rgba(0,0,0,0.06); background:rgba(248,250,252,0.92); display:flex; gap:10px;">
                <button data-role="cancel" style="flex:1; padding:10px 12px; border:1px solid #e2e8f0; border-radius:12px; background:#fff; cursor:pointer;">取消</button>
                <button data-role="save" style="flex:1; padding:10px 12px; border:none; border-radius:12px; background:#019aff; color:#fff; cursor:pointer; font-weight:900;">保存</button>
            </div>
        `;
        document.body.appendChild(this.summaryEditOverlay);
        document.body.appendChild(this.summaryEditPanel);
        this.summaryEditTextarea = this.summaryEditPanel.querySelector('[data-role="textarea"]');
        this.summaryEditSave = this.summaryEditPanel.querySelector('[data-role="save"]');
        this.summaryEditCancel = this.summaryEditPanel.querySelector('[data-role="cancel"]');
        this.summaryEditPanel.querySelector('[data-role="close"]').onclick = () => this.closeSummaryEditModal();
        this.summaryEditCancel.onclick = () => this.closeSummaryEditModal();
    }

    openSummaryEditModal(value, onSave) {
        this.ensureSummaryEditModal();
        this.__summaryEditOnSave = typeof onSave === 'function' ? onSave : null;
        if (this.summaryEditTextarea) this.summaryEditTextarea.value = String(value || '');
        if (this.summaryEditSave) {
            this.summaryEditSave.disabled = false;
            this.summaryEditSave.onclick = () => {
                const v = String(this.summaryEditTextarea?.value || '');
                try { this.__summaryEditOnSave?.(v); } catch {}
            };
        }
        if (this.summaryEditOverlay) this.summaryEditOverlay.style.display = 'block';
        if (this.summaryEditPanel) this.summaryEditPanel.style.display = 'flex';
        setTimeout(() => {
            try { this.summaryEditTextarea?.focus?.(); } catch {}
        }, 0);
    }

    closeSummaryEditModal() {
        if (this.summaryEditOverlay) this.summaryEditOverlay.style.display = 'none';
        if (this.summaryEditPanel) this.summaryEditPanel.style.display = 'none';
        this.__summaryEditOnSave = null;
    }

    parseEditedSummaryLines(text) {
        const raw = String(text || '');
        const lines = raw.split(/\r?\n/).map(s => String(s).trim());
        const bullet = lines
            .filter(l => l.startsWith('- '))
            .map(l => l.slice(2).trim())
            .filter(Boolean);
        if (bullet.length) return bullet;
        return lines.filter(Boolean);
    }

    deleteSelectedSummaries() {
        const sid = this.groupId;
        if (!sid) return;
        const keys = [...this.summarySelectedKeys];
        if (!keys.length) {
            window.toastr?.info?.('未选择任何摘要');
            return;
        }
        if (!confirm(`确定要删除所选摘要（${keys.length}条）吗？`)) return;
        const items = keys.map((k) => {
            const [atStr, ...rest] = String(k).split('|');
            return { at: Number(atStr || 0) || 0, text: rest.join('|') };
        });
        try { this.chatStore?.deleteSummaryItems?.(items, sid); } catch {}
        this.setSummaryBatchMode(false);
        this.renderSummaries();
    }

    editSelectedSummaries() {
        const sid = this.groupId;
        if (!sid) return;
        const keys = [...this.summarySelectedKeys];
        if (!keys.length) {
            window.toastr?.info?.('未选择任何摘要');
            return;
        }
        const entries = keys.map((k) => {
            const [atStr, ...rest] = String(k).split('|');
            return { at: Number(atStr || 0) || 0, text: rest.join('|') };
        });
        const initial = entries.map(e => `- ${e.text}`).join('\n');
        this.openSummaryEditModal(initial, (nextRaw) => {
            const lines = this.parseEditedSummaryLines(nextRaw);
            if (lines.length !== entries.length) {
                window.toastr?.error?.(`行数不匹配：需要 ${entries.length} 行，实际 ${lines.length} 行`);
                return;
            }
            const updates = entries.map((e, i) => ({ at: e.at, fromText: e.text, toText: lines[i] }));
            try { this.chatStore?.updateSummaryItems?.(updates, sid); } catch {}
            this.closeSummaryEditModal();
            this.setSummaryBatchMode(false);
            this.renderSummaries();
        });
    }

    async runCompactedSummary() {
        const sid = this.groupId;
        if (!sid) return;
        if (this.summaryCompacting) return;
        const pick = () =>
            globalThis?.__chatappRequestSummaryCompaction ||
            window?.__chatappRequestSummaryCompaction ||
            window?.appBridge?.requestSummaryCompaction;
        let fn = pick();
        if (typeof fn !== 'function') {
            await new Promise((r) => setTimeout(r, 50));
            fn = pick();
        }
        if (typeof fn !== 'function') {
            window.toastr?.error?.('大总结生成器尚未初始化，请稍后再试');
            return;
        }
        this.summaryCompacting = true;
        try {
            window.toastr?.info?.('正在生成大总结…');
            const ok = await fn(sid, { force: true });
            if (!ok) window.toastr?.error?.('大总结解析失败：未输出 <summary>…</summary> 或内容格式不符合要求，请重试');
            this.renderSummaries();
            this.renderCompactedSummary();
        } catch (err) {
            logger.warn('手动生成大总结失败', err);
            window.toastr?.error?.('生成失败');
        } finally {
            this.summaryCompacting = false;
        }
    }

    populate() {
        const g = this.contactsStore?.getContact?.(this.groupId);
        if (!g) return;
        const sub = this.panel.querySelector('#group-settings-sub');
        if (sub) sub.textContent = `会话：${this.groupId}`;
        this.avatar = g.avatar || '';
        this.members = Array.isArray(g.members) ? g.members.map(normalize).filter(Boolean) : [];
        const nameEl = this.panel.querySelector('#group-settings-name');
        if (nameEl) nameEl.value = g.name || '';
        this.updateAvatarPreview();
        this.renderMembers();
    }

    renderSummaries() {
        if (!this.summariesList || !this.chatStore) return;
        const sid = this.groupId;
        const list = this.chatStore.getSummaries(sid) || [];
        const summaries = Array.isArray(list) ? list.slice().reverse() : [];
        this.summariesList.innerHTML = '';
        if (!summaries.length) {
            this.summariesList.innerHTML = '<div style="padding:12px; color:#94a3b8; text-align:center; font-size:12px;">暂无摘要</div>';
            return;
        }
        summaries.slice(0, 50).forEach((it) => {
            const text = String((typeof it === 'string') ? it : it?.text || '').trim();
            if (!text) return;
            const at = (typeof it === 'object' && it && it.at) ? Number(it.at) : 0;
            const time = at ? new Date(at).toLocaleString() : '';
            const key = `${Number(at || 0) || 0}|${text}`;
            const row = document.createElement('div');
            if (this.summaryBatchMode) {
                const selected = this.summarySelectedKeys.has(key);
                row.style.cssText = `padding:10px 10px; border-bottom:1px solid rgba(0,0,0,0.06); display:flex; gap:10px; align-items:flex-start; cursor:pointer; background:${selected ? 'rgba(59,130,246,0.06)' : '#fff'};`;
                row.innerHTML = `
                    <div style="width:20px; height:20px; border-radius:999px; border:2px solid ${selected ? '#2563eb' : 'rgba(0,0,0,0.20)'}; margin-top:2px; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:900; font-size:12px; background:${selected ? '#2563eb' : 'transparent'}; box-sizing:border-box;">${selected ? '✓' : ''}</div>
                    <div style="flex:1; min-width:0;">
                        <div style="color:#0f172a; font-size:13px; line-height:1.35; white-space:pre-wrap; word-break:break-word;">${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
                        ${time ? `<div style="color:#94a3b8; font-size:11px; margin-top:6px;">${time}</div>` : ''}
                    </div>
                `;
                row.addEventListener('click', () => {
                    if (this.summarySelectedKeys.has(key)) this.summarySelectedKeys.delete(key);
                    else this.summarySelectedKeys.add(key);
                    this.renderSummaries();
                });
            } else {
                row.style.cssText = 'padding:10px 10px; border-bottom:1px solid rgba(0,0,0,0.06); cursor:pointer;';
                row.innerHTML = `
                    <div style="color:#0f172a; font-size:13px; line-height:1.35; white-space:pre-wrap; word-break:break-word;">${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
                    ${time ? `<div style="color:#94a3b8; font-size:11px; margin-top:6px;">${time}</div>` : ''}
                `;
                row.addEventListener('click', async () => {
                    try {
                        await navigator.clipboard?.writeText?.(text);
                        window.toastr?.success?.('已复制摘要');
                    } catch {}
                });
            }
            this.summariesList.appendChild(row);
        });
    }

    renderCompactedSummary() {
        if (!this.compactedList || !this.chatStore) return;
        const sid = this.groupId;
        const cs = this.chatStore.getCompactedSummary?.(sid);
        this.compactedList.innerHTML = '';
        const text = String(cs?.text || '').trim();
        if (!text) {
            this.compactedList.innerHTML = '<div style="padding:12px; color:#94a3b8; text-align:center; font-size:12px;">暂无大总结</div>';
            return;
        }
        const at = Number(cs?.at || 0) || 0;
        const time = at ? new Date(at).toLocaleString() : '';
        const row = document.createElement('div');
        row.style.cssText = 'padding:10px 10px; border-bottom:1px solid rgba(0,0,0,0.06); cursor:pointer;';
        row.innerHTML = `
            <div style="color:#0f172a; font-size:13px; line-height:1.35; white-space:pre-wrap;">${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
            ${time ? `<div style="color:#94a3b8; font-size:11px; margin-top:6px;">${time}</div>` : ''}
        `;
        row.addEventListener('click', async () => {
            try {
                await navigator.clipboard?.writeText?.(text);
                window.toastr?.success?.('已复制大总结');
            } catch {}
        });
        this.compactedList.appendChild(row);
    }

    renderArchives() {
        if (!this.archivesList || !this.chatStore) return;
        const sid = this.groupId;
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

    updateAvatarPreview() {
        const img = this.panel?.querySelector('#group-settings-avatar-preview');
        if (!img) return;
        img.src = this.avatar || defaultAvatar;
    }

    renderMembers() {
        const listEl = this.panel?.querySelector('#group-settings-members');
        if (!listEl) return;
        listEl.innerHTML = '';
        if (!this.members.length) {
            const empty = document.createElement('div');
            empty.textContent = '暂无成员';
            empty.style.cssText = 'color:#94a3b8; font-size:13px; padding:10px 6px;';
            listEl.appendChild(empty);
            return;
        }
        this.members.forEach((mid) => {
            const c = this.contactsStore?.getContact?.(mid);
            const row = document.createElement('div');
            row.style.cssText = 'display:flex; align-items:center; gap:10px; padding:10px; border:1px solid #e2e8f0; border-radius:12px;';
            const img = document.createElement('img');
            img.src = c?.avatar || defaultAvatar;
            img.alt = '';
            img.style.cssText = 'width:32px; height:32px; border-radius:50%; object-fit:cover;';
            const name = document.createElement('div');
            name.textContent = c?.name || mid;
            name.style.cssText = 'font-weight:700; color:#0f172a; flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';
            const rm = document.createElement('button');
            rm.textContent = '移除';
            rm.type = 'button';
            rm.style.cssText = 'border:none; background:#fee2e2; color:#b91c1c; padding:6px 10px; border-radius:10px; cursor:pointer;';
            rm.onclick = () => {
                this.members = this.members.filter(x => x !== mid);
                this.renderMembers();
            };
            row.appendChild(img);
            row.appendChild(name);
            row.appendChild(rm);
            listEl.appendChild(row);
        });
    }

    openAddMembers() {
        this.ensureAddModal();
        this.addSelected.clear();
        this.renderAddCandidates();
        this.addOverlay.style.display = 'block';
        this.addPanel.style.display = 'flex';
    }

    ensureAddModal() {
        if (this.addPanel) return;
        this.addOverlay = document.createElement('div');
        this.addOverlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:22000;';
        this.addOverlay.addEventListener('click', () => this.closeAddModal());

        this.addPanel = document.createElement('div');
        this.addPanel.style.cssText = `
            display:none; position:fixed;
            top: calc(18px + env(safe-area-inset-top, 0px));
            left: calc(18px + env(safe-area-inset-left, 0px));
            right: calc(18px + env(safe-area-inset-right, 0px));
            height: calc(100vh - 36px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            height: calc(100dvh - 36px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            background:#fff; border-radius:14px; box-shadow:0 10px 40px rgba(0,0,0,0.25);
            z-index:23000;
            overflow:hidden;
            flex-direction:column;
        `;
        this.addPanel.addEventListener('click', (e) => e.stopPropagation());
        this.addPanel.innerHTML = `
            <div style="padding:14px 16px; border-bottom:1px solid rgba(0,0,0,0.06); background:linear-gradient(135deg, rgba(25,154,255,0.10), rgba(0,102,204,0.08)); display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <div style="min-width:0;">
                    <div style="font-weight:900; color:#0f172a;">添加成员</div>
                    <div style="color:#64748b; font-size:12px;">从联系人中选择</div>
                </div>
                <button id="group-add-close" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:#0f172a;">×</button>
            </div>

            <div style="padding:14px 16px; overflow:auto; flex:1; min-height:0; -webkit-overflow-scrolling:touch;">
                <input id="group-add-search" style="width:100%; padding:10px 12px; border:1px solid #e2e8f0; border-radius:10px; font-size:14px; box-sizing:border-box;" placeholder="搜索联系人...">
                <div id="group-add-list" style="margin-top:10px; display:flex; flex-direction:column; gap:8px;"></div>
            </div>

            <div style="padding:14px 16px; border-top:1px solid rgba(0,0,0,0.06); background:rgba(248,250,252,0.92); display:flex; gap:10px;">
                <button id="group-add-cancel" style="flex:1; padding:10px 14px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer;">取消</button>
                <button id="group-add-confirm" style="flex:1; padding:10px 14px; border:none; border-radius:10px; background:#019aff; color:#fff; cursor:pointer; font-weight:800;">添加</button>
            </div>
        `;

        document.body.appendChild(this.addOverlay);
        document.body.appendChild(this.addPanel);

        this.addPanel.querySelector('#group-add-close').onclick = () => this.closeAddModal();
        this.addPanel.querySelector('#group-add-cancel').onclick = () => this.closeAddModal();
        this.addPanel.querySelector('#group-add-search').addEventListener('input', () => this.renderAddCandidates());
        this.addPanel.querySelector('#group-add-confirm').onclick = () => {
            const picks = [...this.addSelected].map(normalize).filter(Boolean);
            if (!picks.length) {
                window.toastr?.info?.('未选择任何成员');
                return;
            }
            const next = [...new Set([...this.members, ...picks])];
            this.members = next;
            this.renderMembers();
            this.closeAddModal();
        };
    }

    closeAddModal() {
        if (this.addOverlay) this.addOverlay.style.display = 'none';
        if (this.addPanel) this.addPanel.style.display = 'none';
    }

    renderAddCandidates() {
        const listEl = this.addPanel?.querySelector('#group-add-list');
        if (!listEl) return;
        const q = normalizeKey(this.addPanel.querySelector('#group-add-search')?.value);
        const friends = this.contactsStore?.listFriends?.() || [];
        const candidates = friends.filter(f => f?.id && !this.members.includes(f.id));
        const filtered = q
            ? candidates.filter(c => normalizeKey(c?.name || c?.id).includes(q))
            : candidates;

        listEl.innerHTML = '';
        if (!filtered.length) {
            const empty = document.createElement('div');
            empty.textContent = '暂无可添加联系人';
            empty.style.cssText = 'color:#94a3b8; font-size:13px; padding:10px 6px;';
            listEl.appendChild(empty);
            return;
        }
        filtered.forEach((c) => {
            const id = normalize(c?.id);
            if (!id) return;
            const row = document.createElement('button');
            row.type = 'button';
            row.style.cssText = `
                display:flex; align-items:center; gap:10px;
                padding:10px 10px;
                border:1px solid ${this.addSelected.has(id) ? '#93c5fd' : '#e2e8f0'};
                background:${this.addSelected.has(id) ? 'rgba(59,130,246,0.08)' : '#fff'};
                border-radius:12px;
                cursor:pointer;
                text-align:left;
            `;
            const img = document.createElement('img');
            img.src = c?.avatar || defaultAvatar;
            img.alt = '';
            img.style.cssText = 'width:36px; height:36px; border-radius:50%; object-fit:cover;';
            const name = document.createElement('div');
            name.textContent = c?.name || id;
            name.style.cssText = 'font-weight:700; color:#0f172a; flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';
            const tag = document.createElement('div');
            tag.textContent = this.addSelected.has(id) ? '已选' : '';
            tag.style.cssText = 'font-size:12px; color:#2563eb;';
            row.appendChild(img);
            row.appendChild(name);
            row.appendChild(tag);
            row.onclick = () => {
                if (this.addSelected.has(id)) this.addSelected.delete(id);
                else this.addSelected.add(id);
                this.renderAddCandidates();
            };
            listEl.appendChild(row);
        });
    }

    startNewChat() {
        if (!this.chatStore) return;
        const sid = this.groupId;
        const raw = prompt('请输入当前聊天的存档名称（留空将自动命名）：');
        if (raw === null) return;

        this.chatStore.startNewChat(sid, raw.trim());
        window.toastr?.success('已开启新聊天');
        this.onSaved?.({ id: sid, forceRefresh: true });
        this.hide();
    }

    save() {
        try {
            const prev = this.contactsStore?.getContact?.(this.groupId);
            if (!prev) return;
            const nextName = normalize(this.panel?.querySelector('#group-settings-name')?.value) || prev.name;
            const nextKey = normalizeKey(nextName);
            const groups = this.contactsStore?.listGroups?.() || [];
            const dup = groups.find(g => g?.id !== this.groupId && normalizeKey(g?.name) === nextKey);
            if (dup) {
                window.toastr?.error?.('已存在同名群组');
                return;
            }

            const beforeMembers = Array.isArray(prev.members) ? prev.members.map(normalize).filter(Boolean) : [];
            const afterMembers = [...new Set(this.members.map(normalize).filter(Boolean))];
            this.contactsStore?.upsertContact?.({
                ...prev,
                id: this.groupId,
                name: nextName,
                avatar: this.avatar || '',
                isGroup: true,
                members: afterMembers,
            });

            const time = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            let didAppendSystem = false;
            if (nextName !== prev.name) {
                this.chatStore?.appendMessage?.({ role: 'system', type: 'meta', content: `群聊名称已更新：${prev.name} → ${nextName}`, name: '系统', time }, this.groupId);
                didAppendSystem = true;
            }
            const added = afterMembers.filter(x => !beforeMembers.includes(x));
            const removed = beforeMembers.filter(x => !afterMembers.includes(x));
            if (added.length) {
                const names = added.map(mid => this.contactsStore?.getContact?.(mid)?.name || mid).join('、');
                this.chatStore?.appendMessage?.({ role: 'system', type: 'meta', content: `成员加入：${names}`, name: '系统', time }, this.groupId);
                didAppendSystem = true;
            }
            if (removed.length) {
                const names = removed.map(mid => this.contactsStore?.getContact?.(mid)?.name || mid).join('、');
                this.chatStore?.appendMessage?.({ role: 'system', type: 'meta', content: `成员已移除：${names}`, name: '系统', time }, this.groupId);
                didAppendSystem = true;
            }

            window.toastr?.success?.('已保存群聊设置');
            this.onSaved?.({ id: this.groupId, forceRefresh: didAppendSystem });
            this.hide();
        } catch (err) {
            logger.error('保存群聊设置失败', err);
            window.toastr?.error?.(err.message || '保存失败');
        }
    }
}
