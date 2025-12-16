/**
 * Contact group renderer - renders contacts with groups
 * - 渲染分组
 * - 支持折叠/展开
 * - 拖拽放置区
 */

import { logger } from '../utils/logger.js';

export class ContactGroupRenderer {
    constructor({ groupStore, contactsStore, renderContactFn, dragManager } = {}) {
        this.groupStore = groupStore;
        this.contactsStore = contactsStore;
        this.renderContactFn = renderContactFn || this.defaultRenderContact.bind(this);
        this.dragManager = dragManager;
    }

    /**
     * 渲染所有分组和未分组联系人到指定容器
     */
    render(containerEl) {
        if (!containerEl) {
            logger.error('ContactGroupRenderer: containerEl is null');
            return;
        }

        containerEl.innerHTML = '';

        const groups = this.groupStore?.listGroups?.() || [];
        const allContacts = (this.contactsStore?.listContacts?.() || []).filter(c => c && !c.isGroup);

        // 1. 渲染分组
        groups.forEach(group => {
            const groupEl = this.renderGroup(group, allContacts);
            containerEl.appendChild(groupEl);
        });

        // 2. 渲染未分组联系人
        const ungroupedContacts = allContacts.filter(c => {
            const isInGroup = this.groupStore?.isContactInAnyGroup?.(c.id);
            return !isInGroup;
        });

        if (ungroupedContacts.length > 0) {
            const ungroupedEl = this.renderUngroupedSection(ungroupedContacts);
            containerEl.appendChild(ungroupedEl);
        }

        // 3. 启用拖拽
        if (this.dragManager) {
            setTimeout(() => {
                this.dragManager.enableDragForContacts('.contact-item');
            }, 50);
        }
    }

    /**
     * 渲染单个分组
     */
    renderGroup(group, allContacts) {
        const div = document.createElement('div');
        div.className = 'contact-group-container';
        div.setAttribute('data-group-id', group.id);

        const isCollapsed = group.collapsed || false;
        const contactsInGroup = allContacts.filter(c => (group.contacts || []).includes(c.id));

        div.innerHTML = `
            <div class="contact-group-header" data-group-id="${group.id}">
                <span class="group-toggle ${isCollapsed ? 'collapsed' : ''}">▼</span>
                <span class="group-name-label">${this.escapeHtml(group.name)}</span>
                <span class="group-contact-count">${contactsInGroup.length}</span>
            </div>
            <div class="contact-group-content ${isCollapsed ? 'collapsed' : 'expanded'}"></div>
            <div class="drop-zone" data-group-id="${group.id}"></div>
        `;

        // 渲染分组中的联系人
        const contentEl = div.querySelector('.contact-group-content');
        contactsInGroup.forEach(contact => {
            const contactEl = this.renderContactFn(contact);
            contactEl.classList.add('contact-item');
            contactEl.setAttribute('data-contact-id', contact.id);
            contactEl.draggable = true;
            contentEl.appendChild(contactEl);
        });

        // 绑定折叠/展开事件
        const headerEl = div.querySelector('.contact-group-header');
        headerEl.onclick = () => this.toggleGroup(group.id);

        return div;
    }

    /**
     * 渲染未分组区域
     */
    renderUngroupedSection(ungroupedContacts) {
        const div = document.createElement('div');
        div.className = 'contact-ungrouped-section';

        div.innerHTML = `
            <div class="contact-ungrouped-header">未分组联系人</div>
            <div class="contact-ungrouped-content"></div>
            <div class="drop-zone" data-group-id="ungrouped"></div>
        `;

        const contentEl = div.querySelector('.contact-ungrouped-content');
        ungroupedContacts.forEach(contact => {
            const contactEl = this.renderContactFn(contact);
            contactEl.classList.add('contact-item');
            contactEl.setAttribute('data-contact-id', contact.id);
            contactEl.draggable = true;
            contentEl.appendChild(contactEl);
        });

        return div;
    }

    /**
     * 默认的联系人渲染函数
     */
    defaultRenderContact(contact) {
        const div = document.createElement('div');
        div.className = 'contact-item';
        div.dataset.session = contact.id;
        div.dataset.name = contact.name || contact.id;

        const avatar = contact.avatar || './assets/external/cdn.discordapp.com-role-icons-1336817752844796016-da610f5548f174d9e04d49b1b28c3af1.webp';
        const name = contact.name || contact.id;

        div.innerHTML = `
            <img src="${avatar}" alt="" class="contact-avatar">
            <div class="contact-info">
                <div class="contact-name">${this.escapeHtml(name)}</div>
                <div class="contact-desc"></div>
            </div>
            <div class="contact-time"></div>
        `;

        return div;
    }

    /**
     * 切换分组折叠状态
     */
    toggleGroup(groupId) {
        try {
            const isCollapsed = this.groupStore?.toggleCollapsed?.(groupId);
            if (isCollapsed === null) return;

            const groupEl = document.querySelector(`.contact-group-container[data-group-id="${groupId}"]`);
            if (!groupEl) return;

            const toggle = groupEl.querySelector('.group-toggle');
            const content = groupEl.querySelector('.contact-group-content');

            if (isCollapsed) {
                toggle?.classList.add('collapsed');
                content?.classList.remove('expanded');
                content?.classList.add('collapsed');
            } else {
                toggle?.classList.remove('collapsed');
                content?.classList.remove('collapsed');
                content?.classList.add('expanded');
            }

            logger.debug(`分组 ${groupId} 折叠状态: ${isCollapsed}`);
        } catch (err) {
            logger.error('切换分组折叠状态失败', err);
        }
    }

    /**
     * 转义 HTML
     */
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }
}
