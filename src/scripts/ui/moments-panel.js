/**
 * Moments UI (动态) - simplified renderer
 */

import { logger } from '../utils/logger.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const htmlText = (s) => {
    // Escape first, then allow only <br> to render as line breaks.
    return esc(s)
        .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
        .replace(/\n/g, '<br>');
};

export class MomentsPanel {
    constructor({ momentsStore, contactsStore, defaultAvatar = '', userAvatar = '', onUserComment } = {}) {
        this.store = momentsStore;
        this.contactsStore = contactsStore;
        this.defaultAvatar = defaultAvatar;
        this.userAvatar = userAvatar;
        this.onUserComment = typeof onUserComment === 'function' ? onUserComment : null;
        this.listEl = null;
        this.modal = null;
        this.activeMomentId = null;
        this.menuEl = null;
        this.expandedComments = new Set();
        this.openComposer = new Set();
        this.pendingComment = new Set();
    }

    mount(listEl) {
        this.listEl = listEl;
        this.render();
    }

    getAvatarByName(name) {
        const raw = String(name || '').trim();
        if (!raw) return this.defaultAvatar;
        if (raw === '我' || raw.toLowerCase() === 'user' || raw === '用户') {
            return this.userAvatar || this.defaultAvatar;
        }
        try {
            const byId = this.contactsStore?.getContact?.(raw);
            if (byId?.avatar) return byId.avatar;
        } catch {}
        const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, '');
        const loose = (s) => norm(s).replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, '');
        const key = norm(raw);
        const looseKey = loose(raw);
        try {
            const list = this.contactsStore?.listContacts?.() || [];
            const exact = list.find(x => String(x?.name || '').trim() === raw || String(x?.id || '').trim() === raw);
            if (exact?.avatar) return exact.avatar;
            const fuzzy = list.find(x => norm(x?.name) === key || norm(x?.id) === key);
            if (fuzzy?.avatar) return fuzzy.avatar;
            const f2 = list.find(x => loose(x?.name) === looseKey || loose(x?.id) === looseKey);
            return f2?.avatar || this.defaultAvatar;
        } catch {
            return this.defaultAvatar;
        }
    }

    getAvatarForMoment(m) {
        const snap = String(m?.authorAvatar || '').trim();
        if (snap) return snap;
        const authorId = String(m?.authorId || '').trim();
        if (authorId) {
            try {
                const c = this.contactsStore?.getContact?.(authorId);
                if (c?.avatar) return c.avatar;
            } catch {}
        }
        const origin = String(m?.originSessionId || '').trim();
        if (origin) {
            try {
                const c = this.contactsStore?.getContact?.(origin);
                if (c?.avatar) return c.avatar;
            } catch {}
        }
        return this.getAvatarByName(m?.author);
    }

    ensureMenu() {
        if (this.menuEl) return;
        const el = document.createElement('div');
        el.className = 'moment-menu-dropdown hidden';
        el.innerHTML = `
            <button class="moment-menu-item danger" data-action="delete">🗑️ 删除动态</button>
            <button class="moment-menu-item" data-action="cancel">❌ 取消</button>
        `;
        el.addEventListener('click', (e) => e.stopPropagation());
        document.addEventListener('click', () => this.hideMenu());
        el.querySelectorAll('button').forEach((btn) => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                const momentId = el.dataset.momentId || '';
                this.hideMenu();
                if (action === 'delete' && momentId) {
                    const ok = confirm('删除后无法恢复，确定要删除这条动态吗？');
                    if (!ok) return;
                    const removed = this.store?.remove?.(momentId);
                    if (!removed) window.toastr?.warning('删除失败：未找到该动态');
                    else window.toastr?.success('已删除动态');
                    this.render({ preserveScroll: true });
                }
            });
        });
        document.body.appendChild(el);
        this.menuEl = el;
    }

    hideMenu() {
        if (!this.menuEl) return;
        this.menuEl.classList.add('hidden');
        this.menuEl.dataset.momentId = '';
    }

    showMenu(anchorEl, momentId) {
        this.ensureMenu();
        if (!this.menuEl || !anchorEl) return;
        const rect = anchorEl.getBoundingClientRect();
        const el = this.menuEl;
        el.dataset.momentId = String(momentId || '');
        el.classList.remove('hidden');

        // position after visible so we can measure width
        const vw = window.innerWidth || document.documentElement.clientWidth || 360;
        const vh = window.innerHeight || document.documentElement.clientHeight || 640;
        const mw = el.offsetWidth || 140;
        const mh = el.offsetHeight || 80;
        const margin = 8;
        const top = Math.min(vh - mh - margin, rect.bottom + 6);
        const left = Math.max(margin, Math.min(vw - mw - margin, rect.right - mw));
        el.style.top = `${Math.max(margin, top)}px`;
        el.style.left = `${left}px`;
    }

    render({ preserveScroll = false } = {}) {
        if (!this.listEl) return;
        const moments = this.store?.list?.() || [];
        const prevScroll = preserveScroll ? (this.listEl.scrollTop || 0) : 0;
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
            const avatar = this.getAvatarForMoment(m);
            // Backfill originSessionId for older data (helps avatar fallback to current chat persona)
            try {
                const hasOrigin = String(m?.originSessionId || '').trim().length > 0;
                if (!hasOrigin && String(m?.authorId || '').trim()) {
                    this.store?.upsert?.({ id: m.id, originSessionId: String(m.authorId).trim() });
                    m.originSessionId = String(m.authorId).trim();
                }
            } catch {}
            // Backfill snapshot avatar so legacy moments keep correct avatar even if names change later
            try {
                const hasSnap = String(m?.authorAvatar || '').trim().length > 0;
                if (!hasSnap && avatar && avatar !== this.defaultAvatar) {
                    this.store?.upsert?.({
                        id: m.id,
                        authorAvatar: avatar,
                        authorId: m.authorId || '',
                        author: m.author || '',
                        originSessionId: m.originSessionId || '',
                    });
                }
            } catch {}
            const comments = Array.isArray(m.comments) ? m.comments : [];
            const VISIBLE_COMMENTS = 8;
            const expanded = this.expandedComments.has(m.id);
            const showComposer = this.openComposer.has(m.id);
            const hiddenCount = comments.length > VISIBLE_COMMENTS ? (comments.length - VISIBLE_COMMENTS) : 0;
            const visibleComments = expanded ? comments : (hiddenCount > 0 ? comments.slice(-VISIBLE_COMMENTS) : comments);
            const pending = this.pendingComment.has(m.id);
            card.innerHTML = `
                <div class="moment-header">
                    <img src="${esc(avatar)}" alt="" class="moment-avatar">
                    <div class="moment-user-info">
                        <div class="moment-username">${esc(m.author || '角色')}</div>
                        <div class="moment-time">${esc(m.time || '')}</div>
                    </div>
                    <button class="moment-more" aria-label="更多" title="更多">⋯</button>
                </div>
                <div class="moment-content">
                    <div class="moment-text">${htmlText(m.content || '')}</div>
                </div>
                <div class="moment-stats">
                    <span>👁 浏览${Number(m.views || 0)}次</span>
                    <span>💬 评论${comments.length}条</span>
                </div>
                <div class="moment-footer">
                    <span class="moment-likes">👍 ${Number(m.likes || 0)}人已赞</span>
                    <button class="moment-action" data-action="comment" style="margin-left:auto; border:none; background:transparent; color:#2563eb; font-weight:700;">评论</button>
                </div>
                <div class="moment-comments ${comments.length ? '' : 'empty'}" ${comments.length ? '' : 'style="display:none;"'}>
                    ${(!expanded && hiddenCount > 0) ? `<div class="moment-comments-toggle" data-action="expand">展开查看更多评论 (${hiddenCount}条)</div>` : ''}
                    ${visibleComments.map((c) => `
                        <div class="moment-comment">
                            <span class="comment-user">${esc(c.author || '')}：</span>
                            <span class="comment-text">${htmlText(c.content || '')}</span>
                        </div>
                    `).join('')}
                    ${(expanded && hiddenCount > 0) ? `<div class="moment-comments-toggle" data-action="collapse">收起评论</div>` : ''}
                </div>
                <div class="moment-comment-composer" style="${showComposer ? '' : 'display:none;'}">
                    <input class="moment-comment-input" type="text" placeholder="写评论..." ${pending ? 'disabled' : ''} />
                    <button class="moment_comment" data-action="send" ${pending ? 'disabled' : ''}>${pending ? '发送中…' : '发送'}</button>
                </div>
            `;
            const dotsBtn = card.querySelector('.moment-more');
            dotsBtn?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showMenu(dotsBtn, m.id);
            });

            card.querySelector('[data-action="comment"]')?.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.openComposer.has(m.id)) this.openComposer.delete(m.id);
                else this.openComposer.add(m.id);
                this.render({ preserveScroll: true });
                // focus input after rerender
                setTimeout(() => {
                    const escId = (window.CSS && typeof window.CSS.escape === 'function')
                        ? window.CSS.escape(String(m.id))
                        : String(m.id).replace(/["\\]/g, '\\$&');
                    const next = this.listEl?.querySelector(`.moment-card[data-moment-id="${escId}"] .moment-comment-input`);
                    next?.focus?.();
                }, 0);
            });

            card.querySelectorAll('.moment-comments-toggle').forEach((toggle) => {
                toggle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const act = toggle.dataset.action;
                    if (act === 'expand') this.expandedComments.add(m.id);
                    if (act === 'collapse') this.expandedComments.delete(m.id);
                    this.render({ preserveScroll: true });
                });
            });

            const sendBtn = card.querySelector('.moment_comment[data-action="send"]');
            const inputEl = card.querySelector('.moment-comment-input');
            const send = async () => {
                if (pending) return;
                const text = String(inputEl?.value || '').trim();
                if (!text) return;
                this.store.addComments(m.id, [{ author: '我', content: text }]);
                this.openComposer.delete(m.id);
                this.expandedComments.add(m.id); // show newest comment
                if (inputEl) inputEl.value = '';
                this.pendingComment.add(m.id);
                this.render({ preserveScroll: true });

                try {
                    await this.onUserComment?.(m.id, text);
                } catch (err) {
                    logger.warn('onUserComment failed', err);
                } finally {
                    this.pendingComment.delete(m.id);
                    this.render({ preserveScroll: true });
                }
            };
            sendBtn?.addEventListener('click', (e) => {
                e.stopPropagation();
                send();
            });
            inputEl?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    send();
                }
            });

            this.listEl.appendChild(card);
        });
        if (preserveScroll) this.listEl.scrollTop = prevScroll;
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
            const avatar = this.getAvatarForMoment(m);
            const comments = Array.isArray(m.comments) ? m.comments : [];
            body.innerHTML = `
                <div style="display:flex; gap:10px; align-items:flex-start;">
                    <img src="${esc(avatar)}" style="width:42px; height:42px; border-radius:999px; object-fit:cover;">
                    <div style="flex:1;">
                        <div style="font-weight:800;">${esc(m.author || '角色')}</div>
                        <div style="color:#64748b; font-size:12px; margin-top:2px;">${esc(m.time || '')} · 👁 ${Number(m.views || 0)} · 👍 ${Number(m.likes || 0)}</div>
                        <div style="margin-top:10px; overflow-wrap:anywhere;">${htmlText(m.content || '')}</div>
                    </div>
                </div>
                <div style="margin-top:14px; font-weight:800;">评论</div>
                <div style="margin-top:8px; display:flex; flex-direction:column; gap:8px;">
                    ${comments.length ? comments.map(c => `
                        <div style="border:1px solid #e5e7eb; border-radius:12px; padding:10px;">
                            <div style="font-weight:800; font-size:13px;">${esc(c.author || '')}</div>
                            <div style="margin-top:6px; overflow-wrap:anywhere;">${htmlText(c.content || '')}</div>
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
