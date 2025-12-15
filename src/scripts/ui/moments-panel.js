/**
 * Moments UI (动态) - simplified renderer
 */

import { logger } from '../utils/logger.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class MomentsPanel {
    constructor({ momentsStore, contactsStore, defaultAvatar = '' } = {}) {
        this.store = momentsStore;
        this.contactsStore = contactsStore;
        this.defaultAvatar = defaultAvatar;
        this.listEl = null;
        this.modal = null;
        this.activeMomentId = null;
    }

    mount(listEl) {
        this.listEl = listEl;
        this.render();
    }

    getAvatarByName(name) {
        const n = String(name || '').trim();
        if (!n) return this.defaultAvatar;
        try {
            const c = this.contactsStore?.listContacts?.()?.find(x => String(x?.name || x?.id).trim() === n);
            return c?.avatar || this.defaultAvatar;
        } catch {
            return this.defaultAvatar;
        }
    }

    render() {
        if (!this.listEl) return;
        const moments = this.store?.list?.() || [];
        this.listEl.innerHTML = '';
        if (!moments.length) {
            const empty = document.createElement('div');
            empty.style.cssText = 'padding:16px; color:#64748b; text-align:center;';
            empty.textContent = '（暂无动态）';
            this.listEl.appendChild(empty);
            return;
        }
        moments.forEach((m) => {
            const card = document.createElement('div');
            card.className = 'moment-card';
            card.dataset.momentId = m.id;
            const avatar = this.getAvatarByName(m.author);
            const comments = Array.isArray(m.comments) ? m.comments : [];
            const lastComment = comments.length ? comments[comments.length - 1] : null;
            card.innerHTML = `
                <div class="moment-header">
                    <img src="${esc(avatar)}" alt="" class="moment-avatar">
                    <div class="moment-user-info">
                        <div class="moment-username">${esc(m.author || '角色')}</div>
                        <div class="moment-time">${esc(m.time || '')}</div>
                    </div>
                    <button class="moment-more">⋯</button>
                </div>
                <div class="moment-content">
                    <div class="moment-text">${esc(m.content || '')}</div>
                </div>
                <div class="moment-stats">
                    <span>👁 浏览${Number(m.views || 0)}次</span>
                    <span>💬 评论${comments.length}条</span>
                </div>
                <div class="moment-footer">
                    <span class="moment-likes">👍 ${Number(m.likes || 0)}人已赞</span>
                    <button class="moment-action" data-action="comment" style="margin-left:auto; border:none; background:transparent; color:#2563eb; font-weight:700;">评论</button>
                </div>
                ${lastComment ? `<div class="moment-comment">
                    <span class="comment-user">${esc(lastComment.author || '')}：</span>
                    <span class="comment-text">${esc(lastComment.content || '')}</span>
                </div>` : ''}
            `;
            card.querySelector('[data-action="comment"]')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openDetail(m.id);
            });
            card.addEventListener('click', () => this.openDetail(m.id));
            this.listEl.appendChild(card);
        });
    }

    ensureModal() {
        if (this.modal) return;
        const overlay = document.createElement('div');
        overlay.id = 'moments-detail-overlay';
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 23000;
            display: none;
            background: rgba(0,0,0,0.32);
            padding: calc(14px + env(safe-area-inset-top)) 14px calc(14px + env(safe-area-inset-bottom)) 14px;
            box-sizing: border-box;
        `;
        const panel = document.createElement('div');
        panel.style.cssText = `
            height: 100%;
            background: #fff;
            border-radius: 14px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        `;
        panel.addEventListener('click', (e) => e.stopPropagation());
        panel.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; padding:12px; background:#f3f4f6; border-bottom:1px solid #e5e7eb;">
                <div style="font-weight:800;">动态</div>
                <div id="moment-detail-meta" style="margin-left:auto; font-size:12px; color:#64748b;"></div>
                <button id="moment-detail-close" style="border:1px solid #e5e7eb; background:#fff; border-radius:10px; padding:6px 10px;">关闭</button>
            </div>
            <div id="moment-detail-body" style="flex:1; overflow:auto; -webkit-overflow-scrolling:touch; padding:12px;"></div>
            <div style="padding:10px; border-top:1px solid #e5e7eb; display:flex; gap:10px;">
                <input id="moment-comment-input" type="text" placeholder="写评论..." style="flex:1; padding:10px; border:1px solid #e2e8f0; border-radius:999px;">
                <button id="moment-comment-send" style="padding:10px 14px; border:none; border-radius:999px; background:#019aff; color:#fff; font-weight:800;">发送</button>
            </div>
        `;
        overlay.appendChild(panel);
        overlay.addEventListener('click', () => { overlay.style.display = 'none'; });
        panel.querySelector('#moment-detail-close')?.addEventListener('click', () => { overlay.style.display = 'none'; });
        panel.querySelector('#moment-comment-send')?.addEventListener('click', () => this.addLocalComment());
        document.body.appendChild(overlay);
        this.modal = overlay;
    }

    openDetail(momentId) {
        this.ensureModal();
        this.activeMomentId = momentId;
        const m = this.store?.get?.(momentId);
        if (!m) return;
        const meta = this.modal.querySelector('#moment-detail-meta');
        if (meta) meta.textContent = `id: ${m.id}`;
        const body = this.modal.querySelector('#moment-detail-body');
        if (body) {
            const avatar = this.getAvatarByName(m.author);
            const comments = Array.isArray(m.comments) ? m.comments : [];
            body.innerHTML = `
                <div style="display:flex; gap:10px; align-items:flex-start;">
                    <img src="${esc(avatar)}" style="width:42px; height:42px; border-radius:999px; object-fit:cover;">
                    <div style="flex:1;">
                        <div style="font-weight:800;">${esc(m.author || '角色')}</div>
                        <div style="color:#64748b; font-size:12px; margin-top:2px;">${esc(m.time || '')} · 👁 ${Number(m.views || 0)} · 👍 ${Number(m.likes || 0)}</div>
                        <div style="margin-top:10px; white-space:pre-wrap; overflow-wrap:anywhere;">${esc(m.content || '')}</div>
                    </div>
                </div>
                <div style="margin-top:14px; font-weight:800;">评论</div>
                <div style="margin-top:8px; display:flex; flex-direction:column; gap:8px;">
                    ${comments.length ? comments.map(c => `
                        <div style="border:1px solid #e5e7eb; border-radius:12px; padding:10px;">
                            <div style="font-weight:800; font-size:13px;">${esc(c.author || '')}</div>
                            <div style="margin-top:6px; white-space:pre-wrap; overflow-wrap:anywhere;">${esc(c.content || '')}</div>
                        </div>
                    `).join('') : `<div style="color:#64748b;">（暂无评论）</div>`}
                </div>
            `;
        }
        this.modal.style.display = 'block';
    }

    addLocalComment() {
        try {
            const id = this.activeMomentId;
            if (!id) return;
            const input = this.modal?.querySelector('#moment-comment-input');
            const text = String(input?.value || '').trim();
            if (!text) return;
            this.store.addComments(id, [{ author: '我', content: text }]);
            if (input) input.value = '';
            this.openDetail(id);
            this.render();
        } catch (err) {
            logger.error('addLocalComment failed', err);
        }
    }
}

