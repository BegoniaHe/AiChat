/**
 * Group panel - manage contact groups
 * - 创建新分组
 * - 编辑/删除分组
 * - 显示分组列表
 */

import { logger } from '../utils/logger.js';

export class GroupPanel {
    constructor({ groupStore, onGroupChanged } = {}) {
        this.groupStore = groupStore;
        this.onGroupChanged = typeof onGroupChanged === 'function' ? onGroupChanged : null;
        this.overlay = null;
        this.panel = null;
        this.nameInput = null;
    }

    show() {
        if (!this.panel) this.createUI();
        this.refresh();
        this.overlay.style.display = 'block';
        this.panel.style.display = 'flex';
        setTimeout(() => {
            if (this.nameInput) this.nameInput.focus();
        }, 100);
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

        this.panel.innerHTML = `
            <div style="padding:14px 16px; border-bottom:1px solid rgba(0,0,0,0.06); background:rgba(248,250,252,0.92); display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <div style="min-width:0;">
                    <div style="font-weight:800; color:#0f172a;">联系人分组</div>
                    <div style="color:#64748b; font-size:12px;">管理你的联系人分组</div>
                </div>
                <button id="group-panel-close" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:#0f172a;">×</button>
            </div>

            <div style="padding:14px 16px; border-bottom:1px solid rgba(0,0,0,0.06); background:#fafbfc;">
                <div style="font-weight:700; color:#0f172a; margin-bottom:8px;">新建分组</div>
                <div style="display:flex; gap:8px;">
                    <input id="group-name-input" type="text" placeholder="输入分组名称" maxlength="15" style="flex:1; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:14px;">
                    <button id="group-create-btn" style="padding:10px 18px; border:none; border-radius:10px; background:#019aff; color:#fff; cursor:pointer; font-weight:700; white-space:nowrap;">创建</button>
                </div>
            </div>

            <div style="flex:1; overflow:auto; -webkit-overflow-scrolling:touch; padding:14px 16px;">
                <div style="font-weight:700; color:#0f172a; margin-bottom:10px;">已有分组</div>
                <div id="group-list"></div>
            </div>
        `;

        document.body.appendChild(this.overlay);
        document.body.appendChild(this.panel);

        this.nameInput = this.panel.querySelector('#group-name-input');

        this.panel.querySelector('#group-panel-close').onclick = () => this.hide();
        this.panel.querySelector('#group-create-btn').onclick = () => this.createGroup();

        this.nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.createGroup();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.hide();
            }
        });
    }

    refresh() {
        const listEl = this.panel?.querySelector('#group-list');
        if (!listEl) return;

        const groups = this.groupStore?.listGroups?.() || [];

        if (groups.length === 0) {
            listEl.innerHTML = '<div style="color:#94a3b8; text-align:center; padding:20px;">暂无分组</div>';
            return;
        }

        listEl.innerHTML = groups.map(g => this.renderGroupItem(g)).join('');

        // 绑定事件
        groups.forEach(g => {
            const editBtn = listEl.querySelector(`[data-group-edit="${g.id}"]`);
            const deleteBtn = listEl.querySelector(`[data-group-delete="${g.id}"]`);

            if (editBtn) {
                editBtn.onclick = () => this.editGroup(g.id);
            }
            if (deleteBtn) {
                deleteBtn.onclick = () => this.deleteGroup(g.id);
            }
        });
    }

    renderGroupItem(group) {
        const count = group.contacts?.length || 0;
        return `
            <div style="display:flex; align-items:center; gap:10px; padding:12px; border:1px solid #e2e8f0; border-radius:10px; margin-bottom:8px; background:#fafbfc;">
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:600; color:#0f172a;">${this.escapeHtml(group.name)}</div>
                    <div style="font-size:12px; color:#64748b;">${count} 个联系人</div>
                </div>
                <button data-group-edit="${group.id}" style="padding:6px 12px; border:1px solid #e2e8f0; border-radius:8px; background:#fff; cursor:pointer; font-size:12px;">重命名</button>
                <button data-group-delete="${group.id}" style="padding:6px 12px; border:1px solid #fca5a5; border-radius:8px; background:#fef2f2; color:#dc2626; cursor:pointer; font-size:12px;">删除</button>
            </div>
        `;
    }

    createGroup() {
        const name = this.nameInput?.value?.trim();
        if (!name) {
            window.toastr?.warning?.('请输入分组名称');
            return;
        }

        try {
            const group = this.groupStore?.createGroup?.(name);
            window.toastr?.success?.(`分组「${group.name}」创建成功`);
            this.nameInput.value = '';
            this.refresh();
            this.onGroupChanged?.({ type: 'create', group });
        } catch (err) {
            logger.error('创建分组失败', err);
            window.toastr?.error?.(err.message || '创建分组失败');
        }
    }

    editGroup(groupId) {
        const group = this.groupStore?.getGroup?.(groupId);
        if (!group) return;

        const newName = prompt('输入新的分组名称', group.name);
        if (!newName || newName.trim() === '') return;
        if (newName.trim() === group.name) return;

        try {
            this.groupStore?.updateGroup?.(groupId, { name: newName.trim() });
            window.toastr?.success?.(`分组重命名为「${newName.trim()}」`);
            this.refresh();
            this.onGroupChanged?.({ type: 'update', group: this.groupStore.getGroup(groupId) });
        } catch (err) {
            logger.error('重命名分组失败', err);
            window.toastr?.error?.(err.message || '重命名失败');
        }
    }

    deleteGroup(groupId) {
        const group = this.groupStore?.getGroup?.(groupId);
        if (!group) return;

        const count = group.contacts?.length || 0;
        const msg = count > 0
            ? `确定要删除分组「${group.name}」吗？\n分组中的 ${count} 个联系人将移动到未分组区域。`
            : `确定要删除分组「${group.name}」吗？`;

        if (!confirm(msg)) return;

        try {
            this.groupStore?.deleteGroup?.(groupId);
            window.toastr?.success?.(`分组「${group.name}」已删除`);
            this.refresh();
            this.onGroupChanged?.({ type: 'delete', groupId });
        } catch (err) {
            logger.error('删除分组失败', err);
            window.toastr?.error?.('删除分组失败');
        }
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
