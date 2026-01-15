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
        this.usePointerDrag = !ContactDragManager.isTouchDevice();
        this.pointerId = null;
        this.pointerStart = null;
        this.pointerTarget = null;
        this.pointerDragging = false;
        this.pointerOverZone = null;
        this.suppressClick = false;
        this.initialized = false;

        this.boundDragStart = this.handleDragStart.bind(this);
        this.boundDragOver = this.handleDragOver.bind(this);
        this.boundDrop = this.handleDrop.bind(this);
        this.boundDragEnd = this.handleDragEnd.bind(this);
        this.boundPointerDown = this.handlePointerDown.bind(this);
        this.boundPointerMove = this.handlePointerMove.bind(this);
        this.boundPointerUp = this.handlePointerUp.bind(this);
        this.boundPointerCancel = this.handlePointerCancel.bind(this);
        this.boundClickCapture = this.handleClickCapture.bind(this);
    }

    static isTouchDevice() {
        try {
            return Boolean(('ontouchstart' in window) || (navigator?.maxTouchPoints > 0));
        } catch {
            return false;
        }
    }

    /**
     * 初始化拖拽功能
     */
    init() {
        if (this.initialized) return;

        document.addEventListener('dragstart', this.boundDragStart);
        document.addEventListener('dragover', this.boundDragOver);
        document.addEventListener('drop', this.boundDrop);
        document.addEventListener('dragend', this.boundDragEnd);
        if (this.usePointerDrag) {
            document.addEventListener('pointerdown', this.boundPointerDown, { passive: true });
            document.addEventListener('pointermove', this.boundPointerMove, { passive: false });
            document.addEventListener('pointerup', this.boundPointerUp);
            document.addEventListener('pointercancel', this.boundPointerCancel);
            document.addEventListener('click', this.boundClickCapture, true);
        }

        this.initialized = true;
        logger.info('ContactDragManager 已初始化');
    }

    /**
     * 销毁拖拽功能
     */
    destroy() {
        if (!this.initialized) return;

        document.removeEventListener('dragstart', this.boundDragStart);
        document.removeEventListener('dragover', this.boundDragOver);
        document.removeEventListener('drop', this.boundDrop);
        document.removeEventListener('dragend', this.boundDragEnd);
        if (this.usePointerDrag) {
            document.removeEventListener('pointerdown', this.boundPointerDown);
            document.removeEventListener('pointermove', this.boundPointerMove);
            document.removeEventListener('pointerup', this.boundPointerUp);
            document.removeEventListener('pointercancel', this.boundPointerCancel);
            document.removeEventListener('click', this.boundClickCapture, true);
        }

        this.initialized = false;
        logger.info('ContactDragManager 已销毁');
    }

    beginDrag(contact) {
        if (!contact) return false;
        const contactId = contact.getAttribute('data-contact-id');
        if (!contactId) return false;
        this.draggedElement = contact;
        this.draggedContactId = contactId;

        const groupElement = contact.closest('.contact-group-container');
        if (groupElement) {
            this.draggedFromGroupId = groupElement.getAttribute('data-group-id');
        } else {
            this.draggedFromGroupId = null;
        }

        contact.classList.add('dragging');
        document.querySelectorAll('.drop-zone').forEach(zone => {
            zone.classList.add('active');
        });
        return true;
    }

    endDrag() {
        if (this.draggedElement) {
            this.draggedElement.classList.remove('dragging');
        }
        this.clearDropZoneHighlights();
        document.querySelectorAll('.drop-zone').forEach(zone => {
            zone.classList.remove('active');
        });
        this.draggedElement = null;
        this.draggedContactId = null;
        this.draggedFromGroupId = null;
    }

    dropOnZone(dropZone) {
        if (!dropZone || !this.draggedContactId) return false;
        const targetGroupId = dropZone.getAttribute('data-group-id');
        if (targetGroupId === this.draggedFromGroupId) {
            logger.debug('拖拽到同一分组，取消操作');
            return true;
        }

        logger.info(`拖拽联系人: ${this.draggedContactId}, 从 ${this.draggedFromGroupId || '未分组'} 到 ${targetGroupId || '未分组'}`);

        try {
            this.groupStore?.moveContact?.(this.draggedContactId, targetGroupId);
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
        return true;
    }

    /**
     * 开始拖拽
     */
    handleDragStart(event) {
        if (this.usePointerDrag) return;
        const contact = event.target.closest('.contact-item');
        if (!contact) return;

        if (!this.beginDrag(contact)) return;
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', this.draggedContactId || '');
        }

        logger.debug(`开始拖拽联系人: ${this.draggedContactId}, 来自分组: ${this.draggedFromGroupId || '未分组'}`);
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
        this.dropOnZone(dropZone);
    }

    /**
     * 拖拽结束处理
     */
    handleDragEnd(event) {
        this.endDrag();

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

    updateDropZoneHover(dropZone) {
        this.clearDropZoneHighlights();
        this.pointerOverZone = dropZone || null;
        if (this.pointerOverZone) {
            this.pointerOverZone.classList.add('drag-over');
        }
    }

    handlePointerDown(event) {
        if (!this.usePointerDrag || event.button !== 0 || event.pointerType === 'touch') return;
        const contact = event.target.closest('.contact-item');
        if (!contact) return;
        this.pointerStart = { x: event.clientX, y: event.clientY };
        this.pointerId = event.pointerId;
        this.pointerTarget = contact;
        this.pointerDragging = false;
        this.pointerOverZone = null;
        contact.setPointerCapture?.(event.pointerId);
    }

    handlePointerMove(event) {
        if (!this.pointerTarget || event.pointerId !== this.pointerId || event.pointerType === 'touch') return;
        if (!this.pointerStart) return;
        const dx = event.clientX - this.pointerStart.x;
        const dy = event.clientY - this.pointerStart.y;
        const dist = Math.hypot(dx, dy);
        if (!this.pointerDragging && dist < 6) return;
        if (!this.pointerDragging) {
            const started = this.beginDrag(this.pointerTarget);
            if (!started) {
                this.resetPointerState();
                return;
            }
            this.pointerDragging = true;
        }
        event.preventDefault();
        const target = document.elementFromPoint(event.clientX, event.clientY);
        const dropZone = target?.closest ? target.closest('.drop-zone') : null;
        this.updateDropZoneHover(dropZone);
    }

    handlePointerUp(event) {
        if (event.pointerId !== this.pointerId) return;
        if (this.pointerDragging) {
            const target = document.elementFromPoint(event.clientX, event.clientY);
            const dropZone = this.pointerOverZone || (target?.closest ? target.closest('.drop-zone') : null);
            this.dropOnZone(dropZone);
            this.suppressClick = true;
        }
        this.pointerTarget?.releasePointerCapture?.(event.pointerId);
        this.endDrag();
        this.resetPointerState();
    }

    handlePointerCancel(event) {
        if (event.pointerId !== this.pointerId) return;
        this.pointerTarget?.releasePointerCapture?.(event.pointerId);
        this.endDrag();
        this.resetPointerState();
    }

    handleClickCapture(event) {
        if (!this.suppressClick) return;
        if (event.target?.closest?.('.contact-item')) {
            event.preventDefault();
            event.stopPropagation();
        }
        this.suppressClick = false;
    }

    resetPointerState() {
        this.pointerId = null;
        this.pointerStart = null;
        this.pointerTarget = null;
        this.pointerDragging = false;
        this.pointerOverZone = null;
    }

    /**
     * 为联系人元素启用拖拽
     */
    enableDragForContact(contactElement) {
        if (!contactElement) return;
        contactElement.draggable = !this.usePointerDrag;
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
