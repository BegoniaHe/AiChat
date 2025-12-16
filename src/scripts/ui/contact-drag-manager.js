/**
 * Contact drag manager - handles drag and drop for contact grouping
 * - 支持联系人在分组间拖拽
 * - 支持拖拽到未分组区域
 */

import { logger } from '../utils/logger.js';

export class ContactDragManager {
    constructor({ groupStore, onDrop } = {}) {
        this.groupStore = groupStore;
        this.onDrop = typeof onDrop === 'function' ? onDrop : null;

        this.draggedElement = null;
        this.draggedContactId = null;
        this.draggedFromGroupId = null;
        this.initialized = false;
    }

    /**
     * 初始化拖拽功能
     */
    init() {
        if (this.initialized) return;

        document.addEventListener('dragstart', this.handleDragStart.bind(this));
        document.addEventListener('dragover', this.handleDragOver.bind(this));
        document.addEventListener('drop', this.handleDrop.bind(this));
        document.addEventListener('dragend', this.handleDragEnd.bind(this));

        this.initialized = true;
        logger.info('ContactDragManager 已初始化');
    }

    /**
     * 销毁拖拽功能
     */
    destroy() {
        if (!this.initialized) return;

        document.removeEventListener('dragstart', this.handleDragStart.bind(this));
        document.removeEventListener('dragover', this.handleDragOver.bind(this));
        document.removeEventListener('drop', this.handleDrop.bind(this));
        document.removeEventListener('dragend', this.handleDragEnd.bind(this));

        this.initialized = false;
        logger.info('ContactDragManager 已销毁');
    }

    /**
     * 开始拖拽
     */
    handleDragStart(event) {
        const contact = event.target.closest('.contact-item');
        if (!contact) return;

        const contactId = contact.getAttribute('data-contact-id');
        if (!contactId) return;

        this.draggedElement = contact;
        this.draggedContactId = contactId;

        // 查找联系人当前所在的分组
        const groupElement = contact.closest('.contact-group-container');
        if (groupElement) {
            this.draggedFromGroupId = groupElement.getAttribute('data-group-id');
        } else {
            this.draggedFromGroupId = null; // 来自未分组区域
        }

        contact.classList.add('dragging');

        // 显示所有拖拽目标区域
        document.querySelectorAll('.drop-zone').forEach(zone => {
            zone.classList.add('active');
        });

        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', contactId);

        logger.debug(`开始拖拽联系人: ${contactId}, 来自分组: ${this.draggedFromGroupId || '未分组'}`);
    }

    /**
     * 拖拽悬停处理
     */
    handleDragOver(event) {
        const dropZone = event.target.closest('.drop-zone');
        if (!dropZone) return;

        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';

        // 高亮当前悬停的放置区
        this.clearDropZoneHighlights();
        dropZone.classList.add('drag-over');
    }

    /**
     * 放置处理
     */
    async handleDrop(event) {
        event.preventDefault();
        event.stopPropagation();

        const dropZone = event.target.closest('.drop-zone');
        if (!dropZone || !this.draggedContactId) return;

        const targetGroupId = dropZone.getAttribute('data-group-id');

        // 如果拖拽到同一个分组，不做处理
        if (targetGroupId === this.draggedFromGroupId) {
            logger.debug('拖拽到同一分组，取消操作');
            return;
        }

        logger.info(`拖拽联系人: ${this.draggedContactId}, 从 ${this.draggedFromGroupId || '未分组'} 到 ${targetGroupId || '未分组'}`);

        try {
            // 移动联系人
            this.groupStore?.moveContact?.(this.draggedContactId, targetGroupId);

            // 触发回调
            if (this.onDrop) {
                this.onDrop({
                    contactId: this.draggedContactId,
                    fromGroupId: this.draggedFromGroupId,
                    toGroupId: targetGroupId,
                });
            }

            window.toastr?.success?.('已移动联系人');
        } catch (err) {
            logger.error('移动联系人失败', err);
            window.toastr?.error?.('移动联系人失败');
        }
    }

    /**
     * 拖拽结束处理
     */
    handleDragEnd(event) {
        // 清理拖拽状态
        if (this.draggedElement) {
            this.draggedElement.classList.remove('dragging');
        }

        this.clearDropZoneHighlights();

        // 隐藏所有拖拽目标区域
        document.querySelectorAll('.drop-zone').forEach(zone => {
            zone.classList.remove('active');
        });

        this.draggedElement = null;
        this.draggedContactId = null;
        this.draggedFromGroupId = null;

        logger.debug('拖拽结束');
    }

    /**
     * 清除所有放置区的高亮
     */
    clearDropZoneHighlights() {
        document.querySelectorAll('.drop-zone.drag-over').forEach(zone => {
            zone.classList.remove('drag-over');
        });
    }

    /**
     * 为联系人元素启用拖拽
     */
    enableDragForContact(contactElement) {
        if (!contactElement) return;
        contactElement.draggable = true;
        contactElement.classList.add('contact-item');
    }

    /**
     * 批量为联系人元素启用拖拽
     */
    enableDragForContacts(selector = '.contact-item') {
        const contacts = document.querySelectorAll(selector);
        contacts.forEach(contact => {
            this.enableDragForContact(contact);
        });
        logger.debug(`为 ${contacts.length} 个联系人启用拖拽`);
    }
}
