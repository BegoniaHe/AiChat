/**
 * Chat UI rendering and interactions
 */

import { logger } from '../../utils/logger.js';
import { renderRichText, setupIframeResizeListener } from './rich-text-renderer.js';

export class ChatUI {
    constructor() {
        this.scrollEl = document.getElementById('chat-scroll');
        this.inputEl = document.getElementById('composer-input');
        this.sendBtn = document.getElementById('send-button');
        this.configBtn = document.getElementById('config-button');
        this.worldBtn = document.getElementById('world-button');
        this.sessionBtn = document.getElementById('session-button');
        this.typingEl = null;
        this.messageBuffer = [];
        this.sessionLabel = document.getElementById('session-label');
        this.sessionBadge = document.getElementById('session-badge');
        this.errorBanner = null;
        this.isOnline = true;
        this.isStreaming = false;
        this.contextMenu = this.createContextMenu();
        this.longPressTimer = null;
        this.actionHandler = null;

        setupIframeResizeListener();
        this.bindIframeLongPressForwarding();
        this.bindInputAutosize();
        this.bindFocusScroll();
        this.bindNetworkEvents();
    }

    bindIframeLongPressForwarding() {
        if (this.__chatappIframePressBound) return;
        this.__chatappIframePressBound = true;

        window.addEventListener('chatapp-iframe-press', (ev) => {
            const d = ev?.detail;
            if (!d || typeof d !== 'object') return;
            const phase = String(d.phase || '');
            const msgId = String(d.msgId || '');
            const iframeId = String(d.id || '');
            const clientX = Number(d.clientX);
            const clientY = Number(d.clientY);
            if (!phase || !msgId || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return;

            const esc = (CSS && typeof CSS.escape === 'function') ? CSS.escape : (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
            const wrapper = this.scrollEl?.querySelector?.(`[data-msg-id="${esc(msgId)}"]`);
            const message = wrapper?.__chatappMessage;
            if (!message) return;

            if (phase === 'down') {
                const iframe = iframeId ? document.querySelector(`iframe[data-iframe-id="${esc(iframeId)}"]`) : null;
                this.startLongPress({ clientX, clientY, target: iframe || wrapper }, message);
                return;
            }
            if (phase === 'up' || phase === 'cancel') {
                this.clearLongPress();
            }
        }, { passive: true });
    }

    bindInputAutosize() {
        const el = this.inputEl;
        if (!el) return;
        // 目前聊天室輸入是 <input>（單行），避免 autosize 覆寫 CSS 高度
        if (el.tagName !== 'TEXTAREA') return;
        const resize = () => {
            el.style.height = 'auto';
            el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
        };
        el.addEventListener('input', resize);
        resize();
    }

    bindFocusScroll() {
        if (!this.inputEl || !this.scrollEl) return;
        this.inputEl.addEventListener('focus', () => {
            setTimeout(() => this.scrollToBottom(), 120);
        });
    }

    bindNetworkEvents() {
        const updateStatus = () => {
            if (typeof navigator !== 'undefined' && !navigator.onLine) {
                this.isOnline = false;
                this.setSendEnabled(false);
                this.showErrorBanner('網絡不可用，請檢查連接');
            } else {
                this.isOnline = true;
                this.setSendEnabled(true);
                if (this.errorBanner) this.errorBanner.style.display = 'none';
                window.toastr?.info?.('網絡已連接');
            }
        };
        window.addEventListener('online', updateStatus);
        window.addEventListener('offline', updateStatus);
        updateStatus();
    }

    onSend(handler) {
        this.sendBtn.addEventListener('click', handler);
        this.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handler();
            }
        });
    }

    onConfig(handler) {
        if (this.configBtn) {
            this.configBtn.addEventListener('click', handler);
        }
    }

    onWorld(handler) {
        if (this.worldBtn) {
            this.worldBtn.addEventListener('click', handler);
        }
    }

    onSession(handler) {
        if (this.sessionBtn) {
            this.sessionBtn.addEventListener('click', handler);
        }
    }

    getInputText() {
        return this.inputEl.value.trim();
    }

    setInputText(val) {
        this.inputEl.value = val;
    }

    setSessionLabel(id) {
        if (this.sessionLabel) {
            this.sessionLabel.textContent = id;
        }
        if (this.sessionBadge) {
            this.sessionBadge.textContent = id?.startsWith('group:') ? '群聊' : '单聊';
        }
    }

    onInputChange(handler) {
        this.inputEl.addEventListener('input', () => handler(this.inputEl.value));
    }

    clearMessages() {
        this.scrollEl.innerHTML = '';
    }

    clearInput() {
        this.inputEl.value = '';
        this.inputEl.focus();
    }

    setSendingState(isSending) {
        this.sendBtn.disabled = isSending || !this.isOnline || this.isStreaming;
    }

    setSendEnabled(enabled) {
        this.sendBtn.disabled = !enabled;
        if (!enabled) {
            this.sendBtn.textContent = '離線';
        } else {
            this.sendBtn.textContent = '发送';
        }
    }

    scrollToBottom() {
        this.scrollEl.scrollTop = this.scrollEl.scrollHeight;
    }

    /**
     * Render a message bubble - QQ Legacy Structure
     * @param {Object} message
     * @param {'user'|'assistant'|'system'} message.role
     * @param {'text'|'image'|'audio'|'music'|'transfer'|'sticker'|'meta'} message.type
     * @param {string} message.content
     * @param {string} message.avatar - 头像URL
     * @param {string} message.name - 发送者名称
     * @param {string} message.time - 时间戳
     */
    addMessage(message) {
        const el = this.buildMessageElement(message);
        if (el) {
            this.scrollEl.appendChild(el);
            this.scrollToBottom();
        }
        return el?.querySelector('.QQ_chat_msgdiv') || el;
    }

    buildMessageElement(message) {
        if (!message?.content && !message?.type) {
            return null;
        }
        if (!message.id) {
            message.id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
        }

        // 确定消息方向：user 用 QQ_chat_mymsg，其他用 QQ_chat_charmsg
        const isUser = message.role === 'user';
        const wrapper = document.createElement('div');
        wrapper.className = isUser ? 'QQ_chat_mymsg' : 'QQ_chat_charmsg';
        wrapper.dataset.msgId = message.id;
        wrapper.dataset.role = message.role || '';
        wrapper.__chatappMessage = message;

        // 头像
        const avatarImg = document.createElement('img');
        avatarImg.className = 'QQ_chat_head';
        avatarImg.src = message.avatar || './assets/external/cdn.discordapp.com-role-icons-1336817752844796016-da610f5548f174d9e04d49b1b28c3af1.webp';
        avatarImg.alt = message.name || '';

        // 消息气泡
        const bubble = document.createElement('div');
        bubble.className = 'QQ_chat_msgdiv';

        switch (message.type) {
            case 'image':
                bubble.innerHTML = `<img src="${message.content}" alt="image" class="previewable">`;
                const imgEl = bubble.querySelector('img');
                imgEl.addEventListener('click', () => this.openLightbox(message.content));
                imgEl.onerror = () => {
                    imgEl.classList.add('broken');
                    imgEl.alt = '圖片加載失敗';
                    window.toastr?.warning('圖片加載失敗，請檢查連結或網絡');
                };
                break;
            case 'audio':
                bubble.innerHTML = `
                    <div class="message-toolbar">
                        <span class="chip">语音</span>
                        <audio controls preload="none" style="width: 160px;">
                            <source src="${message.content}">
                        </audio>
                    </div>`;
                const audioEl = bubble.querySelector('audio');
                audioEl.onerror = () => {
                    window.toastr?.warning('語音加載失敗');
                };
                break;
            case 'music': {
                const artist = message.meta?.artist || '';
                const url = message.meta?.url || '';
                const statusText = url ? '待播放' : '無音頻地址';
                bubble.innerHTML = `
                    <div class="card music-card">
                        <div class="card-title">🎵 ${message.content || '音乐'}</div>
                        ${artist ? `<div class="card-subtitle">${artist}</div>` : ''}
                        <div class="card-status" data-role="status">${statusText}</div>
                        <div class="card-actions">
                            <button class="card-button" data-action="play">播放</button>
                            <button class="card-button" data-action="pause">暂停</button>
                            ${url ? `<span style="font-size:12px;color:#9ca3af;">${url}</span>` : ''}
                        </div>
                        ${url ? `<div class="card-progress" data-role="progress">00:00 / --:--</div>` : ''}
                    </div>
                `;
                const playBtn = bubble.querySelector('[data-action="play"]');
                const pauseBtn = bubble.querySelector('[data-action="pause"]');
                const audio = url ? new Audio(url) : null;
                let playing = false;
                const statusEl = bubble.querySelector('[data-role="status"]');
                const progressEl = bubble.querySelector('[data-role="progress"]');
                if (audio) {
                    audio.onerror = () => {
                        playing = false;
                        playBtn.textContent = '播放';
                        if (statusEl) statusEl.textContent = '播放錯誤';
                        window.toastr?.error('音頻加載/播放失敗');
                    };
                }

                const formatTime = (sec = 0) => {
                    if (!Number.isFinite(sec)) return '--:--';
                    const m = Math.floor(sec / 60).toString().padStart(2, '0');
                    const s = Math.floor(sec % 60).toString().padStart(2, '0');
                    return `${m}:${s}`;
                };

                const updateProgress = () => {
                    if (!audio || !progressEl) return;
                    const current = formatTime(audio.currentTime || 0);
                    const total = audio.duration ? formatTime(audio.duration) : '--:--';
                    progressEl.textContent = `${current} / ${total}`;
                };

                if (audio) {
                    audio.addEventListener('timeupdate', updateProgress);
                    audio.addEventListener('loadedmetadata', updateProgress);
                    audio.addEventListener('ended', () => {
                        playing = false;
                        playBtn.textContent = '播放';
                        if (statusEl) statusEl.textContent = '播放完畢';
                        updateProgress();
                    });
                }

                playBtn.onclick = () => {
                    if (!audio) {
                        window.toastr?.warning('無音頻地址，播放失敗');
                        return;
                    }
                    audio.play()
                        .then(() => {
                            playing = true;
                            playBtn.textContent = '播放中';
                            if (statusEl) statusEl.textContent = '播放中';
                            updateProgress();
                        })
                        .catch(() => window.toastr?.warning('播放失敗'));
                };
                pauseBtn.onclick = () => {
                    audio?.pause();
                    if (playing) {
                        playBtn.textContent = '播放';
                        if (statusEl) statusEl.textContent = '已暫停';
                        playing = false;
                    }
                };
                break;
            }
            case 'transfer':
                bubble.innerHTML = `
                    <div class="card transfer-card">
                        <div class="card-title">转账</div>
                        <div class="card-subtitle">金额：${message.content}</div>
                        <div class="card-status" data-role="status">待确认</div>
                        <div class="card-actions">
                            <button class="card-button" data-action="confirm">确认收款</button>
                        </div>
                    </div>
                `;
                const confirmBtn = bubble.querySelector('[data-action="confirm"]');
                const statusEl = bubble.querySelector('[data-role="status"]');
                confirmBtn.onclick = () => {
                    confirmBtn.disabled = true;
                    confirmBtn.textContent = '已收款';
                    if (statusEl) {
                        const stamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        statusEl.textContent = `已收款 ${stamp}`;
                    }
                    window.toastr?.success(`已确认收款：${message.content}`);
                };
                break;
            case 'sticker':
                bubble.innerHTML = `<div class="chip">表情包：${message.content}</div>`;
                break;
            case 'meta':
                bubble.classList.add('meta');
                bubble.textContent = message.content;
                break;
            case 'text':
            default:
                // Safe rich rendering (code fences + html iframe preview)
                renderRichText(bubble, message.content, { messageId: message.id });
        }

        // 时间戳
        const timeEl = document.createElement('span');
        timeEl.className = 'QQ_chat_time';
        timeEl.textContent = message.time || '';

        // 组装 DOM - 符合 QQ 原版结构
        if (isUser) {
            // 我的消息：气泡 + 头像 + 时间（grid布局自动处理）
            wrapper.appendChild(bubble);
            wrapper.appendChild(avatarImg);
            wrapper.appendChild(timeEl);
        } else {
            // 别人的消息：头像 + 气泡 + 时间
            wrapper.appendChild(avatarImg);
            wrapper.appendChild(bubble);
            wrapper.appendChild(timeEl);
        }

        // 长按呼出菜单
        wrapper.addEventListener('pointerdown', (e) => this.startLongPress(e, message));
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(evt => {
            wrapper.addEventListener(evt, () => this.clearLongPress());
        });

        return wrapper;
    }

    showTyping(avatarUrl = '') {
        if (this.typingEl) return;
        const wrap = document.createElement('div');
        wrap.className = 'QQ_chat_charmsg';
        wrap.id = 'typing-indicator';

        // 头像（使用默认助手头像）
        const avatar = document.createElement('img');
        avatar.className = 'QQ_chat_head';
        avatar.src = avatarUrl || './assets/external/sharkpan.xyz-f-BZsa-mmexport1736279012663.png';

        // 气泡
        const bubble = document.createElement('div');
        bubble.className = 'QQ_chat_msgdiv';
        bubble.innerHTML = `
            <div class="typing">
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
            </div>
        `;

        wrap.appendChild(avatar);
        wrap.appendChild(bubble);
        this.scrollEl.appendChild(wrap);
        this.typingEl = wrap;
        this.scrollToBottom();
    }

    hideTyping() {
        if (this.typingEl) {
            this.typingEl.remove();
            this.typingEl = null;
        }
    }

    /**
     * Start a streaming assistant bubble
     */
    startAssistantStream(meta = {}) {
        const messageEl = this.addMessage({
            role: 'assistant',
            type: 'text',
            content: ' ',
            avatar: meta.avatar,
            name: meta.name,
            time: meta.time
        });
        // Default: show typing animation inside the streaming bubble (avoid an extra placeholder bubble)
        if (meta?.typing !== false && messageEl) {
            messageEl.innerHTML = `
                <div class="typing">
                    <span class="typing-dot"></span>
                    <span class="typing-dot"></span>
                    <span class="typing-dot"></span>
                </div>
            `;
        }
        const bufferIndex = this.messageBuffer.push({ role: 'assistant', type: 'text', content: '' }) - 1;
        this.isStreaming = true;
        const wrapperEl = messageEl?.closest?.('.QQ_chat_charmsg, .QQ_chat_mymsg') || messageEl?.parentElement || null;
        return {
            update: (text) => {
                // Keep streaming lightweight (avoid re-parsing markdown/code each token)
                messageEl.textContent = text;
                this.scrollToBottom();
                this.messageBuffer[bufferIndex].content = text;
            },
            finish: (finalMessage) => {
                this.isStreaming = false;
                if (finalMessage && finalMessage.type && finalMessage.type !== 'text') {
                    // Replace with structured render
                    const parent = messageEl.parentElement?.parentElement || messageEl.parentElement;
                    parent?.remove();
                    this.addMessage(finalMessage);
                    this.messageBuffer[bufferIndex] = finalMessage;
                } else {
                    const fm = finalMessage || this.messageBuffer[bufferIndex];
                    this.messageBuffer[bufferIndex] = fm;
                    try {
                        // Render rich content for the final text
                        const text = String(fm?.content ?? '');
                        renderRichText(messageEl, text, { messageId: fm?.id || meta?.id });
                    } catch {}
                }
            },
            cancel: () => {
                this.isStreaming = false;
                try { wrapperEl?.remove?.(); } catch {}
                try { this.messageBuffer.splice(bufferIndex, 1); } catch {}
            },
        };
    }

    preloadHistory(messages = []) {
        messages.forEach(msg => this.addMessage({
            role: msg.role === 'user' ? 'user' : 'assistant',
            type: msg.type || 'text',
            content: msg.content,
            name: msg.name,
            avatar: msg.avatar,
            time: msg.time,
            meta: msg.meta,
            badge: msg.badge,
            id: msg.id
        }));
        if (messages.length) {
            this.scrollToBottom();
        }
    }

    removeMessage(msgId) {
        const el = this.scrollEl.querySelector(`[data-msg-id="${msgId}"]`);
        if (el) el.remove();
    }

    updateMessage(msgId, newMessage) {
        const existing = this.scrollEl.querySelector(`[data-msg-id="${msgId}"]`);
        if (!existing) return;
        const newEl = this.buildMessageElement({ ...newMessage, id: msgId });
        if (newEl) existing.replaceWith(newEl);
    }

    onMessageAction(handler) {
        this.actionHandler = handler;
    }

    startLongPress(event, message) {
        this.clearLongPress();
        this.longPressTimer = setTimeout(() => {
            this.showContextMenu(event, message);
        }, 500);
    }

    clearLongPress() {
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
    }

    createContextMenu() {
        const menu = document.createElement('div');
        menu.id = 'msg-context-menu';
        menu.style.cssText = `
            position: fixed;
            background: #fff;
            border: 1px solid #e5e7eb;
            border-radius: 10px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.12);
            padding: 6px;
            display: none;
            z-index: 20000;
            min-width: 140px;
        `;
        document.body.appendChild(menu);
        document.addEventListener('click', () => menu.style.display = 'none');
        return menu;
    }

    async copyToClipboard(text) {
        const s = String(text ?? '');
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(s);
                return true;
            }
        } catch {}
        try {
            const ta = document.createElement('textarea');
            ta.value = s;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            ta.style.top = '0';
            ta.setAttribute('readonly', 'true');
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            ta.remove();
            return ok;
        } catch {
            return false;
        }
    }

    openCodeViewer({ lang = '', code = '' } = {}) {
        const language = String(lang || '').trim();
        const content = String(code ?? '');

        if (!this.__chatappCodeViewer) {
            const overlay = document.createElement('div');
            overlay.id = 'code-viewer-modal';
            overlay.style.cssText = `
                position: fixed;
                inset: 0;
                z-index: 22000;
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
                box-shadow: 0 18px 50px rgba(0,0,0,0.18);
                overflow: hidden;
                display: flex;
                flex-direction: column;
            `;
            panel.addEventListener('click', (e) => e.stopPropagation());

            const header = document.createElement('div');
            header.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                padding: 12px 12px;
                background: #f3f4f6;
                border-bottom: 1px solid #e5e7eb;
            `;
            const title = document.createElement('div');
            title.style.cssText = 'font-size:14px; font-weight:700; color:#111827;';
            title.textContent = '代码';

            const meta = document.createElement('div');
            meta.style.cssText = 'font-size:12px; color:#6b7280; margin-left:auto; max-width: 55vw; overflow:hidden; text-overflow: ellipsis; white-space: nowrap;';
            meta.dataset.role = 'lang';

            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.textContent = '关闭';
            closeBtn.style.cssText = `
                border: 1px solid #e5e7eb;
                background: #fff;
                color: #111827;
                border-radius: 10px;
                padding: 6px 10px;
                font-size: 13px;
            `;

            const body = document.createElement('div');
            body.style.cssText = `
                flex: 1;
                overflow: auto;
                -webkit-overflow-scrolling: touch;
                background: #0b1220;
                padding: 12px;
            `;
            const pre = document.createElement('pre');
            pre.dataset.role = 'code';
            pre.style.cssText = `
                margin: 0;
                color: #e2e8f0;
                font-size: 12px;
                line-height: 1.45;
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace;
                white-space: pre-wrap;
                overflow-x: hidden;
                overflow-wrap: anywhere;
                word-break: break-word;
            `;
            body.appendChild(pre);

            header.appendChild(title);
            header.appendChild(meta);
            header.appendChild(closeBtn);
            panel.appendChild(header);
            panel.appendChild(body);
            overlay.appendChild(panel);

            const hide = () => { overlay.style.display = 'none'; };
            overlay.addEventListener('click', hide);
            closeBtn.addEventListener('click', hide);
            window.addEventListener('keydown', (e) => {
                if (overlay.style.display !== 'none' && e.key === 'Escape') hide();
            });

            document.body.appendChild(overlay);
            this.__chatappCodeViewer = overlay;
        }

        const overlay = this.__chatappCodeViewer;
        const langEl = overlay.querySelector('[data-role="lang"]');
        const codeEl = overlay.querySelector('[data-role="code"]');
        if (langEl) langEl.textContent = language ? language.toUpperCase() : '';
        if (codeEl) codeEl.textContent = content;
        overlay.style.display = 'block';
    }

    showContextMenu(evt, message) {
        if (!this.contextMenu) return;
        const actions = [];
        const target = evt?.target;
        const codeBlock = target?.closest?.('.chat-codeblock') || null;
        const hasCode = !!(codeBlock && typeof codeBlock.__chatappCode === 'string' && codeBlock.__chatappCode.length);
        if (hasCode) {
            actions.push({ key: 'view-code', label: '代码' });
            actions.push({ key: 'copy-code', label: '复制' });
        }
        if (message.role === 'assistant') {
            actions.push({ key: 'regenerate', label: '重新生成' });
            actions.push({ key: 'delete', label: '删除' });
        } else if (message.role === 'user') {
            actions.push({ key: 'edit', label: '编辑' });
            actions.push({ key: 'delete', label: '删除' });
        }
        this.contextMenu.innerHTML = '';
        actions.forEach(act => {
            const btn = document.createElement('button');
            btn.textContent = act.label;
            btn.style.cssText = `
                width: 100%;
                padding: 10px 12px;
                border: none;
                background: transparent;
                text-align: left;
                border-radius: 8px;
                cursor: pointer;
                font-size: 14px;
            `;
            btn.onmouseenter = () => btn.style.background = '#f1f5f9';
            btn.onmouseleave = () => btn.style.background = 'transparent';
            btn.onclick = (e) => {
                e.stopPropagation();
                this.contextMenu.style.display = 'none';
                this.clearLongPress();
                if (act.key === 'copy-code' && hasCode) {
                    this.copyToClipboard(codeBlock.__chatappCode)
                        .then((ok) => ok ? window.toastr?.success?.('已複製到剪貼簿') : window.toastr?.warning?.('複製失敗'));
                    return;
                }
                if (act.key === 'view-code' && hasCode) {
                    this.openCodeViewer({ lang: codeBlock.__chatappLang, code: codeBlock.__chatappCode });
                    return;
                }
                this.actionHandler?.(act.key, message);
            };
            this.contextMenu.appendChild(btn);
        });
        const getPoint = (e) => {
            if (e?.touches?.[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
            if (e?.changedTouches?.[0]) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
            return { x: e.clientX, y: e.clientY };
        };
        const { x, y } = getPoint(evt);

        // 先显示但隐藏，用于测量尺寸
        this.contextMenu.style.visibility = 'hidden';
        this.contextMenu.style.display = 'block';
        const menuW = this.contextMenu.offsetWidth || 160;
        const menuH = this.contextMenu.offsetHeight || 120;
        const padding = 8;

        let left = x;
        let top = y + 6;
        left = Math.max(padding, Math.min(left, window.innerWidth - menuW - padding));
        top = Math.max(padding, Math.min(top, window.innerHeight - menuH - padding));

        this.contextMenu.style.left = `${left}px`;
        this.contextMenu.style.top = `${top}px`;
        this.contextMenu.style.visibility = 'visible';
    }

    openLightbox(url) {
        const overlay = document.createElement('div');
        overlay.className = 'lightbox';
        overlay.innerHTML = `<img src="${url}" alt="preview">`;
        overlay.onclick = () => overlay.remove();
        document.body.appendChild(overlay);
    }

    showErrorBanner(text, action) {
        if (!this.errorBanner) {
            this.errorBanner = document.createElement('div');
            this.errorBanner.style.cssText = `
                position: fixed; top: 0; left: 0; right:0; padding: 10px 12px;
                background: #fef2f2; color: #b91c1c; text-align:center;
                font-size: 13px; z-index: 12000; box-shadow: 0 2px 10px rgba(0,0,0,0.08);
            `;
            document.body.appendChild(this.errorBanner);
        }
        this.errorBanner.innerHTML = '';
        const span = document.createElement('span');
        span.textContent = text;
        this.errorBanner.appendChild(span);

        if (action && typeof action.handler === 'function') {
            const btn = document.createElement('button');
            btn.textContent = action.label || '重試';
            btn.style.cssText = 'margin-left:8px; padding:4px 10px; border:1px solid #ef4444; background:#fff; color:#b91c1c; border-radius:6px; cursor:pointer;';
            btn.onclick = () => action.handler();
            this.errorBanner.appendChild(btn);
        }

        this.errorBanner.style.display = 'block';
        setTimeout(() => {
            if (this.errorBanner) this.errorBanner.style.display = 'none';
        }, action ? 6000 : 4000);
    }
}
