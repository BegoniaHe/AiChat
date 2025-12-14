import './bridge.js';
import { ConfigPanel } from './config-panel.js';
import { ChatUI } from './chat/chat-ui.js';
import { parseSpecialMessage } from './chat/message-parser.js';
import { WorldPanel } from './world-panel.js';
import { ChatStore } from '../storage/chat-store.js';
import { ContactsStore } from '../storage/contacts-store.js';
import { SessionPanel } from './session-panel.js';
import { StickerPicker } from './sticker-picker.js';
import { MediaPicker } from './media-picker.js';
import { WorldInfoIndicator } from './worldinfo-indicator.js';
import { runCommand } from './command-runner.js';
import { logger } from '../utils/logger.js';
import { PresetPanel } from './preset-panel.js';
import { RegexPanel } from './regex-panel.js';
import { RegexSessionPanel } from './regex-session-panel.js';

const initApp = async () => {
    const ui = new ChatUI();
    const configPanel = new ConfigPanel();
    const presetPanel = new PresetPanel();
    const regexPanel = new RegexPanel();
    const worldPanel = new WorldPanel();
    const chatStore = new ChatStore();
    const contactsStore = new ContactsStore();
    await chatStore.ready;
    await contactsStore.ready;
    window.appBridge.setActiveSession(chatStore.getCurrent());
    const sessionPanel = new SessionPanel(chatStore, contactsStore, ui);
    const regexSessionPanel = new RegexSessionPanel(() => chatStore.getCurrent());
    const stickerPicker = new StickerPicker((tag) => handleSticker(tag));
    const mediaPicker = new MediaPicker({
        onUrl: (url) => handleImage(url),
        onFile: (dataUrl, file) => {
            const kind = file?.type?.startsWith('audio') ? 'audio' : 'image';
            if (kind === 'audio') {
                handleMusicFile(dataUrl, file?.name);
            } else {
                handleImage(dataUrl);
            }
        }
    });
    const worldIndicator = new WorldInfoIndicator();

    const avatars = {
        user: './assets/external/sharkpan.xyz-f-BZsa-mmexport1736279012663.png',
        assistant: './assets/external/cdn.discordapp.com-role-icons-1336817752844796016-da610f5548f174d9e04d49b1b28c3af1.webp'
    };

    const formatTime = (ts) => {
        if (!ts) return '';
        const d = new Date(ts);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const isConversationMessage = (m) => m && (m.role === 'user' || m.role === 'assistant');

    const getLastVisibleMessage = (sessionId) => {
        const msgs = chatStore.getMessages(sessionId) || [];
        for (let i = msgs.length - 1; i >= 0; i--) {
            if (isConversationMessage(msgs[i])) return msgs[i];
        }
        return null;
    };

    const snippetFromMessage = (msg) => {
        if (!msg) return '尚无聊天';
        switch (msg.type) {
            case 'image': return '[图片]';
            case 'audio': return '[语音]';
            case 'music': return `[音乐] ${msg.content || ''}`.trim();
            case 'transfer': return `[转账] ${msg.content || ''}`.trim();
            case 'sticker': return '[表情]';
            default: {
                const text = String(msg.content || '').replace(/\s+/g, ' ').trim();
                return text.slice(0, 32) || '...';
            }
        }
    };

    const renderChatList = () => {
        const el = document.getElementById('chat-list');
        if (!el) return;
        const ids = chatStore.listSessions()
            .filter(id => (chatStore.getMessages(id) || []).some(isConversationMessage))
            .slice(0, 50);
        el.innerHTML = '';
        if (!ids.length) {
            const empty = document.createElement('div');
            empty.style.cssText = 'padding:20px 12px; color:#94a3b8; text-align:center;';
            empty.textContent = '暂无聊天记录';
            el.appendChild(empty);
            return;
        }
        ids.forEach((id) => {
            const contact = contactsStore.getContact(id);
            const displayName = contact?.name || (id.startsWith('group:') ? id.replace(/^group:/, '') : id);
            const avatar = contact?.avatar || avatars.assistant;
            const last = getLastVisibleMessage(id);
            const preview = snippetFromMessage(last);
            const time = last?.timestamp ? formatTime(last.timestamp) : '';

            const item = document.createElement('div');
            item.className = 'chat-list-item';
            item.dataset.session = id;
            item.dataset.name = displayName;
            item.innerHTML = `
                <img src="${avatar}" alt="" class="chat-item-avatar">
                <div class="chat-item-content">
                    <div class="chat-item-header">
                        <div class="chat-item-name">${displayName}</div>
                        <div class="chat-item-time">${time}</div>
                    </div>
                    <div class="chat-item-preview">${preview}</div>
                </div>
            `;
            el.appendChild(item);
        });
    };

    const renderContactsUngrouped = () => {
        const el = document.getElementById('contacts-ungrouped-list');
        if (!el) return;
        const contacts = contactsStore.listContacts();
        el.innerHTML = '';
        if (!contacts.length) {
            const empty = document.createElement('div');
            empty.style.cssText = 'padding:12px 6px; color:#94a3b8; font-size:13px;';
            empty.textContent = '（暂无联系人）';
            el.appendChild(empty);
            return;
        }
        contacts.forEach((c) => {
            const id = c.id;
            const last = getLastVisibleMessage(id);
            const preview = snippetFromMessage(last);
            const time = last?.timestamp ? formatTime(last.timestamp) : '';
            const name = c.name || (id.startsWith('group:') ? id.replace(/^group:/, '') : id);
            const avatar = c.avatar || avatars.assistant;

            const item = document.createElement('div');
            item.className = 'contact-item';
            item.dataset.session = id;
            item.dataset.name = name;
            item.innerHTML = `
                <img src="${avatar}" alt="" class="contact-avatar">
                <div class="contact-info">
                    <div class="contact-name">${name}</div>
                    <div class="contact-desc">${preview}</div>
                </div>
                <div class="contact-time">${time}</div>
            `;
            el.appendChild(item);
        });
    };

    const refreshChatAndContacts = () => {
        contactsStore.ensureFromSessions(chatStore.listSessions(), { defaultAvatar: avatars.assistant });
        renderChatList();
        renderContactsUngrouped();
    };
    sessionPanel.onUpdated = refreshChatAndContacts;

    /* ---------------- 底部导航（聊天/联系人/动态） ---------------- */
    const navBtns = document.querySelectorAll('.bottom-nav .nav-btn');
    const pages = {
        chat: document.getElementById('chat-page'),
        contacts: document.getElementById('contacts-page'),
        moments: document.getElementById('moments-page')
    };
    let activePage = 'chat';
    const switchPage = (name) => {
        activePage = name;
        navBtns.forEach(t => t.classList.toggle('active', t.dataset.page === name));
        Object.entries(pages).forEach(([k, el]) => {
            if (el) el.classList.toggle('active', k === name);
        });
        // 返回聊天列表視圖（非聊天室）以貼合原始切換邏輯
        if (name !== 'chat') {
            chatRoom?.classList.add('hidden');
            chatList?.classList.remove('hidden');
        }
    };
    navBtns.forEach(btn => btn.addEventListener('click', () => switchPage(btn.dataset.page)));
    switchPage('chat');

    /* ---------------- 頭像設置菜單 ---------------- */
    const settingsMenu = document.getElementById('settings-menu');
    const quickMenu = document.getElementById('quick-menu');
    // 頂部頭像/＋按鈕在「消息」與「聯係人」頁共用同樣外觀
    const avatarBtns = document.querySelectorAll('.qq-message-topbar .user-avatar-btn');
    const plusBtns = document.querySelectorAll('.qq-message-topbar .icon-button');
    const chatMenuBtn = document.getElementById('chat-menu-btn');
    const chatroomMenu = document.getElementById('chatroom-menu');
    const chatList = document.getElementById('chat-list');
    const chatRoom = document.getElementById('chat-room');

    // Chat settings modal elements
    const chatSettingsModal = document.getElementById('chat-settings-modal');
    const chatSettingsOverlay = document.getElementById('chat-settings-overlay');
    const closeChatSettingsBtn = document.getElementById('close-chat-settings');
    const bubbleColorInput = document.getElementById('bubble-color-input');
    const bubbleColorPicker = document.getElementById('bubble-color');
    const textColorInput = document.getElementById('text-color-input');
    const textColorPicker = document.getElementById('text-color');
    const chatBgInput = document.getElementById('chat-bg');
    const chatSettingPreview = document.getElementById('chat-setting-preview');
    const randomSettingBtn = document.getElementById('random-setting-btn');
    const saveSettingBtn = document.getElementById('save-setting-btn');
    const cancelSettingBtn = document.getElementById('cancel-setting-btn');

    const hideMenus = () => {
        settingsMenu?.classList.add('hidden');
        quickMenu?.classList.add('hidden');
        chatroomMenu?.classList.add('hidden');
    };

    const positionSheet = (menuEl, anchorEl, offsetX = 0, offsetY = 0, alignRight = false) => {
        if (!menuEl || !anchorEl) return;
        const rect = anchorEl.getBoundingClientRect();
        const desiredTop = rect.bottom + window.scrollY + 1 + offsetY;
        const top = Math.max(0, desiredTop);

        menuEl.style.top = `${top}px`;
        if (alignRight) {
            // Right align: position from right edge of anchor
            const right = window.innerWidth - rect.right - window.scrollX + offsetX;
            menuEl.style.right = `${right}px`;
            menuEl.style.left = 'auto';
        } else {
            // Left align: position from left edge of anchor
            const left = rect.left + window.scrollX + offsetX;
            menuEl.style.left = `${left}px`;
            menuEl.style.right = 'auto';
        }
    };

    let lastSettingsAnchor = null;
    let lastQuickAnchor = null;

    const toggleSheetAt = (menuEl, anchorEl, { alignRight = false, kind = 'generic' } = {}) => {
        if (!menuEl || !anchorEl) return;
        const isVisible = !menuEl.classList.contains('hidden');
        const lastAnchor = kind === 'settings' ? lastSettingsAnchor : (kind === 'quick' ? lastQuickAnchor : null);
        const sameAnchor = lastAnchor === anchorEl;
        hideMenus();
        positionSheet(menuEl, anchorEl, 0, 4, alignRight);
        // 若是同一個錨點且當前已顯示，則視為 toggle 關閉；否則打開並重定位
        if (!isVisible || !sameAnchor) {
            menuEl.classList.remove('hidden');
        } else {
            menuEl.classList.add('hidden');
        }
        if (kind === 'settings') lastSettingsAnchor = anchorEl;
        if (kind === 'quick') lastQuickAnchor = anchorEl;
    };

    avatarBtns.forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSheetAt(settingsMenu, btn, { kind: 'settings' });
        });
    });

    plusBtns.forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSheetAt(quickMenu, btn, { alignRight: true, kind: 'quick' });
        });
    });
    chatMenuBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        positionSheet(chatroomMenu, chatMenuBtn, 0, 4, true);
        chatroomMenu?.classList.toggle('hidden');
        settingsMenu?.classList.add('hidden');
        quickMenu?.classList.add('hidden');
    });
    document.addEventListener('click', hideMenus);

    settingsMenu?.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            if (action === 'session') sessionPanel.show();
            if (action === 'preset') presetPanel.show();
            if (action === 'world-global') worldPanel.show({ scope: 'global' });
            if (action === 'regex') regexPanel.show();
            if (action === 'config') configPanel.show();
            hideMenus();
        });
    });
    chatroomMenu?.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            if (action === 'world') worldPanel.show();
            if (action === 'regex') regexSessionPanel.show();
            if (action === 'chat-settings') openChatSettings();
            hideMenus();
        });
    });

    /* ---------------- 聊天列表 <-> 聊天室切换 ---------------- */
    const backToListBtn = document.getElementById('back-to-list');
    const currentChatTitle = document.getElementById('current-chat-title');
    let chatOriginPage = 'chat';

    const enterChatRoom = (sessionId, sessionName, originPage = activePage) => {
        chatOriginPage = originPage || 'chat';
        chatList?.classList.add('hidden');
        chatRoom?.classList.remove('hidden');

        // 隐藏消息界面顶部和底部导航栏
        const messageTopbar = document.getElementById('message-topbar');
        const bottomNav = document.querySelector('.bottom-nav');
        if (messageTopbar) messageTopbar.style.display = 'none';
        if (bottomNav) bottomNav.style.display = 'none';

        if (currentChatTitle) currentChatTitle.textContent = sessionName || sessionId;
        // 切换会话
        chatStore.switchSession(sessionId);
        window.appBridge.setActiveSession(sessionId);
        // 加载历史
        const history = chatStore.getMessages(sessionId);
        ui.clearMessages();
        history.forEach(msg => ui.addMessage(msg));
        const draft = chatStore.getDraft(sessionId);
        ui.setInputText(draft || '');
        ui.setSessionLabel(sessionId);
    };

    const exitChatRoom = () => {
        chatRoom?.classList.add('hidden');
        chatList?.classList.remove('hidden');

        // 恢复显示消息界面顶部和底部导航栏
        const messageTopbar = document.getElementById('message-topbar');
        const bottomNav = document.querySelector('.bottom-nav');
        if (messageTopbar) messageTopbar.style.display = '';
        if (bottomNav) bottomNav.style.display = '';

        if (chatOriginPage && chatOriginPage !== 'chat') {
            switchPage(chatOriginPage);
        }
        chatOriginPage = 'chat';
    };

    backToListBtn?.addEventListener('click', exitChatRoom);

    quickMenu?.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            if (action === 'add-friend') sessionPanel.show({ focusAdd: true });
            if (action === 'create-group') window.toastr?.info('创建群组占位');
            if (action === 'new-group') window.toastr?.info('新建分组占位');
            hideMenus();
        });
    });

    /* ---------------- 列表入口共用会话 ---------------- */
    chatList?.addEventListener('click', (e) => {
        const item = e.target.closest('.chat-list-item');
        if (!item) return;
        const id = item.dataset.session || 'default';
        const name = item.dataset.name || id;
        enterChatRoom(id, name);
        switchPage('chat');
    });

    const contactsUngroupedEl = document.getElementById('contacts-ungrouped-list');
    contactsUngroupedEl?.addEventListener('click', (e) => {
        const item = e.target.closest('.contact-item');
        if (!item || !item.dataset.session) return;
        const id = item.dataset.session;
        const name = item.dataset.name || id;
        const origin = activePage;
        switchPage('chat');
        enterChatRoom(id, name, origin);
    });

    // Quick action buttons
    const actionHandlers = {
        image: async () => {
            const useFile = confirm('使用本地圖片文件嗎？點擊「取消」改用 URL。');
            if (useFile) {
                await mediaPicker.pickFile('image');
            } else {
                await mediaPicker.pickUrl('輸入圖片地址（可貼 https:// 或本地 file://）', avatars.user);
            }
        },
        music: async () => {
            const useFile = confirm('使用本地音頻文件嗎？點擊「取消」改用 URL。');
            if (useFile) {
                await mediaPicker.pickFile('audio');
            } else {
                const title = prompt('輸入歌名', '未命名');
                const artist = prompt('輸入歌手', '');
                const audioUrl = prompt('音源 URL（可留空）', '');
                if (!title) return;
                const msg = {
                    role: 'user',
                    type: 'music',
                    content: title,
                    meta: { artist, url: audioUrl },
                    name: '我',
                    avatar: avatars.user,
                    time: new Date().toLocaleTimeString().slice(0, 5)
                };
                ui.addMessage(msg);
                chatStore.appendMessage(msg);
            }
        },
        transfer: async () => {
            const amount = prompt('輸入金額（示例：520元）', '520元');
            if (!amount) return;
            const msg = {
                role: 'user',
                type: 'transfer',
                content: amount,
                name: '我',
                avatar: avatars.user,
                time: new Date().toLocaleTimeString().slice(0, 5)
            };
            ui.addMessage(msg);
            chatStore.appendMessage(msg);
        },
        sticker: async () => {
            stickerPicker.show();
        }
    };

    document.querySelectorAll('.action-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            const handler = actionHandlers[action];
            if (handler) {
                handler();
            } else {
                window.toastr?.info(`快捷操作占位：${action}`);
            }
        });
    });
    // Support badge for grouping/role
    const sessionBadge = document.createElement('span');
    sessionBadge.className = 'badge';
    sessionBadge.textContent = '单聊';
    sessionBadge.id = 'session-badge';
    const titleEl = document.querySelector('.app-title');
    if (titleEl) {
        titleEl.appendChild(sessionBadge);
        worldIndicator.mount(titleEl);
    }

    // Button: open config
    ui.onConfig(() => configPanel.show());
    // Button: open world
    ui.onWorld(() => {
        worldPanel.show();
        updateWorldIndicator();
    });
    // Button: session switcher
    const sessionBtn = document.getElementById('session-button');
    if (sessionBtn) {
        sessionBtn.addEventListener('click', () => sessionPanel.show());
    }

    // Preload chat history if available
    try {
        const sessions = chatStore.listSessions();
        const currentId = chatStore.getCurrent();
        const history = chatStore.getMessages(currentId);
        ui.setSessionLabel(currentId);
        if (history && history.length) {
            ui.preloadHistory(history);
        }
        const draft = chatStore.getDraft(currentId);
        if (draft) ui.setInputText(draft);
    } catch (error) {
        logger.warn('加载历史记录失败，跳过', error);
    }

    // Send handler
    const handleSend = async () => {
        const text = ui.getInputText();
        if (!text) return;

        const sessionId = chatStore.getCurrent();
        const contact = contactsStore.getContact(sessionId);
        const characterName = contact?.name || (sessionId.startsWith('group:') ? sessionId.replace(/^group:/, '') : sessionId) || 'assistant';
        const userName = 'user';
        const buildHistoryForLLM = (pendingUserText) => {
            const all = chatStore.getMessages(sessionId) || [];
            const history = all
                .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
                .map(m => ({ role: m.role, content: m.content }));
            const last = history[history.length - 1];
            if (pendingUserText && last?.role === 'user' && String(last.content || '').trim() === String(pendingUserText).trim()) {
                history.pop();
            }
            return history;
        };
        const llmContext = (pendingUserText) => ({
            user: { name: userName },
            character: { name: characterName },
            history: buildHistoryForLLM(pendingUserText),
        });

        // slash command support
        if (text.startsWith('/')) {
            const handled = runCommand(text, { chatStore, ui, sessionPanel, worldPanel, appBridge: window.appBridge });
            if (handled) {
                ui.clearInput();
                return;
            }
        }

        if (!window.appBridge.isConfigured()) {
            ui.showErrorBanner('未配置 API，請先填寫 Base URL / Key / 模型');
            window.toastr?.warning('请先配置 API 信息', '未配置');
            configPanel.show();
            return;
        }
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            ui.showErrorBanner('當前離線，請連接網絡後再試');
            window.toastr?.warning('離線狀態，無法發送');
            return;
        }

        const userMsg = {
            role: 'user',
            type: 'text',
            content: text,
            name: '我',
            avatar: avatars.user,
            time: new Date().toLocaleTimeString().slice(0, 5)
        };
        ui.addMessage(userMsg);
        chatStore.appendMessage(userMsg, sessionId);
        refreshChatAndContacts();
        ui.clearInput();
        ui.setSendingState(true);

        const config = window.appBridge.config.get();

        try {
            if (config.stream) {
                ui.showTyping();
                const streamBubble = ui.startAssistantStream();
                const stream = await window.appBridge.generate(text, llmContext(text));
                let full = '';
                for await (const chunk of stream) {
                    full += chunk;
                    streamBubble.update(full);
                }
                ui.hideTyping();
                try {
                    const processed = window.appBridge.applyOutputRegex(full);
                    if (processed !== full) {
                        full = processed;
                        streamBubble.update(full);
                    }
                } catch {}
                const parsed = {
                    role: 'assistant',
                    name: '助手',
                    avatar: avatars.assistant,
                    time: new Date().toLocaleTimeString().slice(0, 5),
                    ...parseSpecialMessage(full)
                };
                streamBubble.finish(parsed);
                chatStore.appendMessage(parsed, sessionId);
                refreshChatAndContacts();
            } else {
                ui.showTyping();
                const result = await window.appBridge.generate(text, llmContext(text));
                ui.hideTyping();
                const parsed = {
                    role: 'assistant',
                    name: '助手',
                    avatar: avatars.assistant,
                    time: new Date().toLocaleTimeString().slice(0, 5),
                    ...parseSpecialMessage(result)
                };
                ui.addMessage(parsed);
                chatStore.appendMessage(parsed, sessionId);
                refreshChatAndContacts();
            }
        } catch (error) {
            ui.hideTyping();
            logger.error('发送失败', error);
            ui.showErrorBanner(error.message || '发送失败，請檢查網絡或 API 設置', {
                label: '重試',
                handler: () => handleSend()
            });
            window.toastr?.error(error.message || '发送失败', '错误');
        } finally {
            ui.setSendingState(false);
        }
    };

    ui.onSend(handleSend);
    ui.onInputChange((text) => chatStore.setDraft(text, chatStore.getCurrent()));
    ui.onMessageAction(async (action, message) => {
        const sessionId = chatStore.getCurrent();
        if (action === 'delete') {
            chatStore.deleteMessage(message.id, sessionId);
            ui.removeMessage(message.id);
            refreshChatAndContacts();
            return;
        }
        if (action === 'edit' && message.role === 'user') {
            const newText = prompt('編輯消息', message.content || '');
            if (newText === null) return;
            const updated = chatStore.updateMessage(message.id, { content: newText, time: new Date().toLocaleTimeString().slice(0, 5) }, sessionId);
            if (updated) {
                ui.updateMessage(message.id, { ...updated, role: 'user', type: 'text', avatar: avatars.user, name: '我' });
                refreshChatAndContacts();
            }
            return;
        }
        if (action === 'regenerate' && message.role === 'assistant') {
            const msgs = chatStore.getMessages(sessionId);
            const idx = msgs.findIndex(m => m.id === message.id);
            if (idx === -1) return;
            const prevUser = [...msgs].slice(0, idx).reverse().find(m => m.role === 'user');
            if (!prevUser) {
                window.toastr?.warning('未找到對應的用戶消息，無法重生成');
                return;
            }
            ui.removeMessage(message.id);
            chatStore.deleteMessage(message.id, sessionId);
            try {
                ui.showTyping();
                const text = prevUser.content;
                const config = window.appBridge.config.get();
                let full = '';
                if (config.stream) {
                    const streamBubble = ui.startAssistantStream();
                    const stream = await window.appBridge.generate(text, llmContext(text));
                    for await (const chunk of stream) {
                        full += chunk;
                        streamBubble.update(full);
                    }
                    ui.hideTyping();
                    try {
                        const processed = window.appBridge.applyOutputRegex(full);
                        if (processed !== full) {
                            full = processed;
                            streamBubble.update(full);
                        }
                    } catch {}
                    const parsed = {
                        role: 'assistant',
                        name: '助手',
                        avatar: avatars.assistant,
                        time: new Date().toLocaleTimeString().slice(0, 5),
                        ...parseSpecialMessage(full)
                    };
                    streamBubble.finish(parsed);
                    chatStore.appendMessage(parsed, sessionId);
                    refreshChatAndContacts();
                } else {
                    const result = await window.appBridge.generate(text, llmContext(text));
                    ui.hideTyping();
                    const parsed = {
                        role: 'assistant',
                        name: '助手',
                        avatar: avatars.assistant,
                        time: new Date().toLocaleTimeString().slice(0, 5),
                        ...parseSpecialMessage(result)
                    };
                    ui.addMessage(parsed);
                    chatStore.appendMessage(parsed, sessionId);
                    refreshChatAndContacts();
                }
            } catch (err) {
                ui.hideTyping();
                window.toastr?.error(err.message || '重新生成失敗');
            }
            return;
        }
    });
    window.addEventListener('worldinfo-changed', () => updateWorldIndicator());
    window.addEventListener('session-changed', (e) => {
        const id = e.detail?.id;
        if (id) {
            window.appBridge.setActiveSession(id);
            const msgs = chatStore.getMessages(id);
            const draft = chatStore.getDraft(id);
            ui.clearMessages();
            ui.preloadHistory(msgs);
            ui.setInputText(draft || '');
            ui.setSessionLabel(id);
            refreshChatAndContacts();
        }
    });

    updateWorldIndicator();
    refreshChatAndContacts();

    function handleSticker(tag) {
        const sessionId = chatStore.getCurrent();
        const msg = {
            role: 'user',
            type: 'sticker',
            content: tag,
            name: '我',
            avatar: avatars.user,
            time: new Date().toLocaleTimeString().slice(0, 5)
        };
        ui.addMessage(msg);
        chatStore.appendMessage(msg, sessionId);
    }

    function handleImage(url) {
        const sessionId = chatStore.getCurrent();
        const msg = {
            role: 'user',
            type: 'image',
            content: url,
            name: '我',
            avatar: avatars.user,
            time: new Date().toLocaleTimeString().slice(0, 5)
        };
        ui.addMessage(msg);
        chatStore.appendMessage(msg, sessionId);
    }

    function handleMusicFile(dataUrl, name = '本地音頻') {
        const sessionId = chatStore.getCurrent();
        const msg = {
            role: 'user',
            type: 'music',
            content: name,
            meta: { artist: '本地', url: dataUrl },
            name: '我',
            avatar: avatars.user,
            time: new Date().toLocaleTimeString().slice(0, 5)
        };
        ui.addMessage(msg);
        chatStore.appendMessage(msg, sessionId);
    }

    function updateWorldIndicator() {
        const globalId = window.appBridge?.globalWorldId || '';
        const currentId = window.appBridge?.currentWorldId || '';
        const label = globalId && currentId
            ? `全局:${globalId} / 会话:${currentId}`
            : (globalId || currentId || '未啟用');
        worldIndicator.setName(label);
    }

    /* ---------------- 聊天设置功能 ---------------- */
    function openChatSettings() {
        const sessionId = chatStore.getCurrent();
        loadChatSettings(sessionId);
        chatSettingsOverlay.style.display = 'block';
        chatSettingsModal.style.display = 'block';
        hideMenus();
    }

    function closeChatSettings() {
        chatSettingsOverlay.style.display = 'none';
        chatSettingsModal.style.display = 'none';
    }

    function loadChatSettings(sessionId) {
        const settings = chatStore.getSessionSettings(sessionId) || {
            bubbleColor: '#44639d',
            textColor: '#FFFFFF',
            chatBg: ''
        };

        bubbleColorInput.value = settings.bubbleColor;
        bubbleColorPicker.value = settings.bubbleColor;
        textColorInput.value = settings.textColor;
        textColorPicker.value = settings.textColor;
        chatBgInput.value = settings.chatBg || '';

        updatePreview(settings.bubbleColor, settings.textColor);
    }

    function saveChatSettings() {
        const sessionId = chatStore.getCurrent();
        const settings = {
            bubbleColor: bubbleColorInput.value,
            textColor: textColorInput.value,
            chatBg: chatBgInput.value
        };

        chatStore.setSessionSettings(sessionId, settings);
        applyChatSettings(sessionId, settings);
        window.toastr?.success('设置已保存');
        closeChatSettings();
    }

    function applyChatSettings(sessionId, settings) {
        // Apply to all messages in current session
        const styleId = `chat-settings-${sessionId}`;
        let styleEl = document.getElementById(styleId);
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = styleId;
            document.head.appendChild(styleEl);
        }

        let css = '';
        if (settings.bubbleColor) {
            css += `.QQ_chat_msgdiv { background-color: ${settings.bubbleColor} !important; }\n`;
        }
        if (settings.textColor) {
            css += `.QQ_chat_msgdiv span { color: ${settings.textColor} !important; }\n`;
        }
        if (settings.chatBg) {
            css += `.QQ_chat_page { background-image: url('${settings.chatBg}') !important; background-size: cover; background-position: center; }\n`;
        }

        styleEl.textContent = css;
    }

    function updatePreview(bubbleColor, textColor) {
        chatSettingPreview.style.backgroundColor = bubbleColor;
        const span = chatSettingPreview.querySelector('span');
        if (span) span.style.color = textColor;
    }

    function randomChatSettings() {
        const randomColor = () => '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
        const bubble = randomColor();
        const text = randomColor();

        bubbleColorInput.value = bubble;
        bubbleColorPicker.value = bubble;
        textColorInput.value = text;
        textColorPicker.value = text;

        updatePreview(bubble, text);
    }

    // Event listeners for chat settings
    closeChatSettingsBtn?.addEventListener('click', closeChatSettings);
    chatSettingsOverlay?.addEventListener('click', closeChatSettings);
    cancelSettingBtn?.addEventListener('click', closeChatSettings);
    saveSettingBtn?.addEventListener('click', saveChatSettings);
    randomSettingBtn?.addEventListener('click', randomChatSettings);

    bubbleColorPicker?.addEventListener('input', (e) => {
        const color = e.target.value;
        bubbleColorInput.value = color;
        updatePreview(color, textColorInput.value);
    });

    bubbleColorInput?.addEventListener('input', (e) => {
        const color = e.target.value;
        if (/^#[0-9A-F]{6}$/i.test(color)) {
            bubbleColorPicker.value = color;
            updatePreview(color, textColorInput.value);
        }
    });

    textColorPicker?.addEventListener('input', (e) => {
        const color = e.target.value;
        textColorInput.value = color;
        updatePreview(bubbleColorInput.value, color);
    });

    textColorInput?.addEventListener('input', (e) => {
        const color = e.target.value;
        if (/^#[0-9A-F]{6}$/i.test(color)) {
            textColorPicker.value = color;
            updatePreview(bubbleColorInput.value, color);
        }
    });

    // Load settings for current session on startup
    try {
        const sessionId = chatStore.getCurrent();
        const settings = chatStore.getSessionSettings(sessionId);
        if (settings) {
            applyChatSettings(sessionId, settings);
        }
    } catch (error) {
        logger.warn('加载会话设置失败', error);
    }

    logger.info('✅ Chat UI 初始化完成');
};

document.addEventListener('DOMContentLoaded', initApp);
