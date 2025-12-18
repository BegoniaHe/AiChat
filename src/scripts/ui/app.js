import { ChatStore } from '../storage/chat-store.js';
import { ContactsStore } from '../storage/contacts-store.js';
import { GroupStore } from '../storage/group-store.js';
import { MomentsStore } from '../storage/moments-store.js';
import { PersonaStore } from '../storage/persona-store.js';
import { logger } from '../utils/logger.js';
import { safeInvoke } from '../utils/tauri.js';
import './bridge.js';
import { ChatUI } from './chat/chat-ui.js';
import { DialogueStreamParser } from './chat/dialogue-stream-parser.js';
import { parseSpecialMessage } from './chat/message-parser.js';
import { runCommand } from './command-runner.js';
import { ConfigPanel } from './config-panel.js';
import { ContactDragManager } from './contact-drag-manager.js';
import { ContactGroupRenderer } from './contact-group-renderer.js';
import { ContactSettingsPanel } from './contact-settings-panel.js';
import { GroupCreatePanel, GroupSettingsPanel } from './group-chat-panels.js';
import { GroupPanel } from './group-panel.js';
import { MediaPicker } from './media-picker.js';
import { MomentsPanel } from './moments-panel.js';
import { PersonaPanel } from './persona-panel.js';
import { PresetPanel } from './preset-panel.js';
import { RegexPanel } from './regex-panel.js';
import { RegexSessionPanel } from './regex-session-panel.js';
import { SessionPanel } from './session-panel.js';
import { StickerPicker } from './sticker-picker.js';
import { VariablePanel } from './variable-panel.js';
import { WorldPanel } from './world-panel.js';
import { WorldInfoIndicator } from './worldinfo-indicator.js';

const initApp = async () => {
  const ui = new ChatUI();
  const configPanel = new ConfigPanel();
  const presetPanel = new PresetPanel();
  const regexPanel = new RegexPanel();
  const chatStore = new ChatStore();
  window.appBridge.setChatStore(chatStore);
  const contactsStore = new ContactsStore();
  const groupStore = new GroupStore();
  const momentsStore = new MomentsStore();
  const personaStore = new PersonaStore();
  const worldPanel = new WorldPanel({ contactsStore, getSessionId: () => chatStore.getCurrent() });
  await chatStore.ready;
  await contactsStore.ready;
  await groupStore.ready;
  await momentsStore.ready;
  await personaStore.ready;
  await window.appBridge?.regex?.ready;
  await window.appBridge?.presets?.ready;
  window.appBridge.setActiveSession(chatStore.getCurrent());
  const sessionPanel = new SessionPanel(chatStore, contactsStore, ui);
  const regexSessionPanel = new RegexSessionPanel(() => chatStore.getCurrent());
  const contactSettingsPanel = new ContactSettingsPanel({
    contactsStore,
    chatStore,
    getSessionId: () => chatStore.getCurrent(),
    onSaved: ({ forceRefresh } = {}) => {
      refreshChatAndContacts();
      const id = chatStore.getCurrent();
      const c = contactsStore.getContact(id);
      const titleEl = document.getElementById('current-chat-title');
      if (titleEl) titleEl.textContent = formatSessionName(id, c);
      if (forceRefresh) {
        const msgs = chatStore.getMessages(id);
        ui.clearMessages();
        ui.preloadHistory(decorateMessagesForDisplay(msgs));
      }
      try {
        contactSettingsPanel.renderCompactedSummary?.();
      } catch {}
      try {
        if (activePage === 'moments') momentsPanel.render({ preserveScroll: true });
      } catch {}
    },
  });
  const stickerPicker = new StickerPicker(tag => handleSticker(tag));
  const mediaPicker = new MediaPicker({
    onUrl: url => handleImage(url),
    onFile: (dataUrl, file) => {
      const kind = file?.type?.startsWith('audio') ? 'audio' : 'image';
      if (kind === 'audio') {
        handleMusicFile(dataUrl, file?.name);
      } else {
        handleImage(dataUrl);
      }
    },
  });
  const worldIndicator = new WorldInfoIndicator();
  const groupCreatePanel = new GroupCreatePanel({
    contactsStore,
    chatStore,
    onCreated: ({ id, name }) => {
      try {
        refreshChatAndContacts();
      } catch {}
      switchPage('chat');
      enterChatRoom(id, name, 'chat');
    },
  });
  const groupSettingsPanel = new GroupSettingsPanel({
    contactsStore,
    chatStore,
    onSaved: ({ id }) => {
      try {
        refreshChatAndContacts();
      } catch {}
      const c = contactsStore.getContact(id);
      const cur = chatStore.getCurrent();
      if (cur === id && currentChatTitle) currentChatTitle.textContent = formatSessionName(id, c) || c?.name || id;
    },
  });

  // 联系人分组功能
  const contactDragManager = new ContactDragManager({
    groupStore,
    onDrop: () => {
      try {
        refreshChatAndContacts();
      } catch {}
    },
  });
  contactDragManager.init();

  const groupPanel = new GroupPanel({
    groupStore,
    onGroupChanged: () => {
      try {
        refreshChatAndContacts();
      } catch {}
    },
  });

  const avatars = {
    user: './assets/external/sharkpan.xyz-f-BZsa-mmexport1736279012663.png',
    assistant:
      './assets/external/cdn.discordapp.com-role-icons-1336817752844796016-da610f5548f174d9e04d49b1b28c3af1.webp',
  };

  const getEffectivePersona = (sessionId = chatStore.getCurrent()) => {
    const sid = String(sessionId || '').trim() || 'default';
    const lockedId = chatStore.getPersonaLock?.(sid) || '';
    if (lockedId) {
      const locked = personaStore.get(lockedId);
      if (locked) return locked;
      // Lock refers to missing persona; clean it up.
      try {
        chatStore.clearPersonaLock?.(sid);
      } catch {}
    }
    return personaStore.getActive();
  };

  const syncUserPersonaUI = (sessionId = chatStore.getCurrent()) => {
    const p = getEffectivePersona(sessionId);
    const url = p.avatar || './assets/external/sharkpan.xyz-f-BZsa-mmexport1736279012663.png';
    const name = p.name || '我';
    avatars.user = url;
    document.querySelectorAll('.user-avatar-btn img').forEach(img => (img.src = url));
    document.querySelectorAll('.user-nickname').forEach(el => (el.textContent = name));
    try {
      momentsPanel?.setUserAvatar?.(url);
    } catch {}
  };

  const personaPanel = new PersonaPanel({
    personaStore,
    chatStore,
    contactsStore,
    getSessionId: () => chatStore.getCurrent(),
    onPersonaChanged: () => {
      syncUserPersonaUI(chatStore.getCurrent());
      refreshChatAndContacts();
    },
  });
  // Initial sync
  syncUserPersonaUI(chatStore.getCurrent());

  const variablePanel = new VariablePanel({
    chatStore,
    getSessionId: () => chatStore.getCurrent(),
  });

  const getContactCountN = () => {
    try {
      const list = contactsStore.listContacts?.() || [];
      const n = list.filter(c => c && !c.isGroup).length;
      return Math.max(1, n);
    } catch {
      return 1;
    }
  };

  const randInt = (min, max) => {
    const a = Number.isFinite(Number(min)) ? Number(min) : 0;
    const b = Number.isFinite(Number(max)) ? Number(max) : 0;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return Math.floor(lo + Math.random() * (hi - lo + 1));
  };

  const normalizeInitialMomentStats = ({ views, likes }, n) => {
    const nEff = Math.max(1, Number(n) || 1);
    const maxViews = Math.max(0, nEff * 10 - 1);
    const maxLikes = Math.max(0, nEff * 2 - 1);
    let v = Number.isFinite(Number(views)) ? Number(views) : 0;
    let l = Number.isFinite(Number(likes)) ? Number(likes) : 0;

    if (v < 0 || v >= nEff * 10) v = maxViews > 0 ? randInt(Math.max(0, Math.floor(maxViews * 0.25)), maxViews) : 0;
    if (l < 0 || l >= nEff * 2) l = maxLikes > 0 ? randInt(0, maxLikes) : 0;
    l = Math.min(l, v, maxLikes);
    return { views: v, likes: l };
  };

  const bumpMomentEngagement = (momentId, n) => {
    const id = String(momentId || '').trim();
    if (!id) return;
    const m = momentsStore.get(id);
    if (!m) return;
    const nEff = Math.max(1, Number(n) || 1);
    const baseViews = Math.max(2, Math.floor(nEff * 0.9));
    const maxViews = Math.max(baseViews + 2, Math.floor(nEff * 3.2));
    const viewsInc = randInt(baseViews, maxViews);

    // Likes grow slower than views; cap likes increase relative to view increase.
    const baseLikes = Math.max(0, Math.floor(nEff * 0.15));
    const maxLikes = Math.max(baseLikes, Math.floor(nEff * 0.8));
    let likesInc = randInt(baseLikes, maxLikes);
    likesInc = Math.min(likesInc, Math.max(1, Math.floor(viewsInc / 3)));

    const nextViews = Number.isFinite(Number(m.views)) ? Number(m.views) + viewsInc : viewsInc;
    const nextLikesRaw = Number.isFinite(Number(m.likes)) ? Number(m.likes) + likesInc : likesInc;
    const nextLikes = Math.min(nextLikesRaw, nextViews);
    momentsStore.upsert({ id, views: nextViews, likes: nextLikes });
  };

  const momentsPanel = new MomentsPanel({
    momentsStore,
    contactsStore,
    defaultAvatar: avatars.assistant,
    userAvatar: personaStore.getActive()?.avatar || avatars.user,
    onUserComment: async (momentId, commentText, meta = null) => {
      const id = String(momentId || '').trim();
      const userComment = String(commentText || '').trim();
      if (!id || !userComment) return;

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

      const m = momentsStore.get(id);
      if (!m) {
        window.toastr?.warning?.('未找到该动态');
        return;
      }
      // Engagement simulation depends on contacts count N (views grow faster than likes)
      const n = getContactCountN();
      try {
        bumpMomentEngagement(id, n);
      } catch {}

      // Build a constrained comment-reply task (adapted from 手机流式.html momentCommentTask)
      const authorName = String(m.author || '').trim() || '发布者';
      const originSessionId = String(m.originSessionId || m.authorId || chatStore.getCurrent() || '').trim();
      const userCommentId = String(meta?.userCommentId || '').trim();
      const replyTo =
        meta && typeof meta === 'object' && meta.replyTo && typeof meta.replyTo === 'object'
          ? {
              id: String(meta.replyTo.id || '').trim(),
              author: String(meta.replyTo.author || '').trim(),
              content: String(meta.replyTo.content || ''),
            }
          : null;
      const isReplyToComment = Boolean(replyTo?.id);
      const candidates = (contactsStore.listContacts?.() || [])
        .filter(c => c && !c.isGroup)
        .map(c => String(c.name || c.id || '').trim())
        .filter(Boolean)
        .filter(n => n !== '我' && n !== '用户' && n.toLowerCase() !== 'user');

      const uniq = [];
      [authorName, ...candidates].forEach(n => {
        if (n && !uniq.includes(n)) uniq.push(n);
      });
      const listPart = uniq
        .slice(0, 16)
        .map(n => `- ${n}`)
        .join('\n');

      const normalizeName = s => String(s || '').trim();
      const resolvePrivateChatTargetSessionId = otherName => {
        const other = normalizeName(otherName);
        if (!other) return null;

        const byId = contactsStore.getContact(other);
        if (byId?.id) return byId.id;

        try {
          const matches = (contactsStore.listContacts?.() || []).filter(c => normalizeName(c?.name || c?.id) === other);
          if (matches.length === 1) return matches[0].id;
        } catch {}

        return null;
      };

      const target = (() => {
        if (isReplyToComment) {
          const n = normalizeName(replyTo?.author);
          const sid =
            resolvePrivateChatTargetSessionId(n) || (n === normalizeName(authorName) ? originSessionId : null);
          return { name: n || authorName, sessionId: sid || '' };
        }
        const sid = String(originSessionId || '').trim() || resolvePrivateChatTargetSessionId(authorName) || '';
        return { name: normalizeName(authorName) || '发布者', sessionId: sid };
      })();

      const recentComments = (() => {
        const list = Array.isArray(m.comments) ? m.comments : [];
        const tail = list.slice(-12);
        return tail
          .map(c => {
            const cid = String(c?.id || '').trim();
            const a = String(c?.author || '').trim();
            const content = String(c?.content || '').replace(/\n/g, '<br>');
            const rto = String(c?.replyTo || '').trim();
            const rta = String(c?.replyToAuthor || '').trim();
            const parts = [
              cid ? `comment_id::${cid}` : '',
              a ? `author::${a}` : '',
              rto ? `reply_to::${rto}` : '',
              rta ? `reply_to_author::${rta}` : '',
              content ? `content::${content}` : '',
            ].filter(Boolean);
            return parts.length ? `- ${parts.join(' | ')}` : '';
          })
          .filter(Boolean)
          .join('\n');
      })();

      const userLine = isReplyToComment
        ? `{{user}}回覆了${replyTo.author}：{{lastUserMessage}}`
        : `{{user}}：{{lastUserMessage}}`;

      // 场景 C：动态评论（提示词规则由「预设 → 聊天提示词 → 动态评论回复提示词」注入；评论数据作为 system 注入，用户内容通过 {{lastUserMessage}} 填入）
      const promptData = `
【QQ空间动态评论回复（数据）】
moment_id: ${id}
发布者: ${authorName}
动态内容: ${String(m.content || '').trim()}
动态时间: ${String(m.time || '').trim() || '（未知）'}

【用户评论】
user_comment_id: ${userCommentId || '（未知）'}
${userLine}

${
  isReplyToComment
    ? `【回复上下文】
reply_to_comment_id: ${replyTo.id}
reply_to_author: ${replyTo.author}
reply_to_content: ${String(replyTo.content || '').trim()}
`
    : ''
}

${
  recentComments
    ? `【当前评论列表（最近12条，含 comment_id，可用于 reply_to）】
${recentComments}
`
    : ''
}

【可用联系人名单】
${listPart || '-（无）'}
`.trim();

      const applyEvents = (events = []) => {
        let touchedMoments = false;
        let touchedChats = false;
        (Array.isArray(events) ? events : []).forEach(ev => {
          if (!ev || typeof ev !== 'object') return;
          if (ev.type === 'moments') {
            const list = (ev.moments || []).map(mm => {
              const stats = normalizeInitialMomentStats({ views: mm?.views, likes: mm?.likes }, n);
              return { ...(mm || {}), ...stats, originSessionId };
            });
            momentsStore.addMany(list);
            touchedMoments = true;
            return;
          }
          if (ev.type === 'moment_reply') {
            const mid = String(ev.momentId || '').trim() || id;
            momentsStore.addComments(mid, ev.comments || []);
            try {
              bumpMomentEngagement(mid, n);
            } catch {}
            touchedMoments = true;
            return;
          }
          if (ev.type === 'private_chat') {
            const targetSessionId = resolvePrivateChatTargetSessionId(ev.otherName);
            if (!targetSessionId) return;
            (ev.messages || []).forEach(msgText => {
              const parsed = {
                role: 'assistant',
                type: 'text',
                ...parseSpecialMessage(String(msgText || '')),
                name: '助手',
                avatar: contactsStore.getContact(targetSessionId)?.avatar || avatars.assistant,
                time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
              };
              const saved = chatStore.appendMessage(parsed, targetSessionId);
              autoMarkReadIfActive(targetSessionId, saved?.id || parsed?.id || '');
              touchedChats = true;
            });
          }
        });
        if (touchedChats) {
          try {
            refreshChatAndContacts();
          } catch {}
        }
        if (touchedMoments) {
          try {
            momentsPanel.render({ preserveScroll: true });
          } catch {}
        }
        return { touchedMoments, touchedChats };
      };

      try {
        const config = window.appBridge.config.get();
        const parser = new DialogueStreamParser({ userName: '我' });
        let sawMomentReply = false;

        const p = personaStore.getActive?.() || {};
        const persona = getEffectivePersona(originSessionId);
        const uName = String(persona?.name || '').trim() || '我';
        const ctx = {
          user: {
            name: uName,
            persona: String(persona?.description || ''),
            personaPosition: persona?.position,
            personaDepth: persona?.depth,
            personaRole: persona?.role,
          },
          character: { name: target.name || authorName },
          history: [],
          task: { type: 'moment_comment', targetSessionId: target.sessionId || '', targetName: target.name || '' },
          session: { id: originSessionId, isGroup: false },
        };
        ctx.task.promptData = promptData;
        if (isReplyToComment) {
          ctx.task.isReplyToComment = true;
          ctx.task.replyToCommentId = String(replyTo?.id || '').trim();
          ctx.task.replyToAuthor = String(replyTo?.author || '').trim();
        }
        if (config.stream) {
          const stream = await window.appBridge.generate(userComment, ctx);
          for await (const chunk of stream) {
            const events = parser.push(chunk);
            const res = applyEvents(events);
            if (res?.touchedMoments) sawMomentReply = true;
          }
        } else {
          const raw = await window.appBridge.generate(userComment, ctx);
          const events = parser.push(raw);
          const res = applyEvents(events);
          if (res?.touchedMoments) sawMomentReply = true;
        }

        if (sawMomentReply) {
          try {
            await momentsStore.flush();
          } catch {}
        } else {
          window.toastr?.warning?.('未解析到动态评论回复（可能格式不正确）');
        }
      } catch (err) {
        logger.error('动态评论生成失败', err);
        window.toastr?.error?.(err?.message || '动态评论生成失败');
      }
    },
  });

  const formatTime = ts => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatNowTime = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  const isConversationMessage = m => m && (m.role === 'user' || m.role === 'assistant' || m.role === 'system');

  const decorateMessagesForDisplay = (messages = []) => {
    const list = Array.isArray(messages) ? messages : [];
    const convPos = new Map(); // index -> conversation order
    list.forEach((m, i) => {
      if (m && (m.role === 'user' || m.role === 'assistant')) convPos.set(i, convPos.size);
    });
    const total = convPos.size;

    return list.map((m, i) => {
      if (!m || typeof m !== 'object') return m;
      const base = typeof m.raw === 'string' ? m.raw : typeof m.content === 'string' ? m.content : '';
      if (!base) return m;
      const j = convPos.has(i) ? convPos.get(i) : null;
      const depth = j === null ? undefined : total - 1 - j;

      if (m.role === 'assistant' && (m.type === 'text' || !m.type)) {
        // === 创意写作模式（暂时停用）===
        // AI 回覆：输出后先经过正则（display），再做富文本/iframe 渲染
        // return { ...m, content: window.appBridge.applyOutputDisplayRegex(base, { depth }) };
        // === 对话模式 ===
        return { ...m, content: base };
      }
      if (m.role === 'user' && (m.type === 'text' || !m.type)) {
        return { ...m, content: window.appBridge.applyInputDisplayRegex(base, { depth }) };
      }
      return m;
    });
  };

  const getAssistantAvatarForSession = sessionId => {
    const c = contactsStore.getContact(sessionId);
    return c?.avatar || avatars.assistant;
  };

  const getLastVisibleMessage = sessionId => {
    const msgs = chatStore.getMessages(sessionId) || [];
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (isConversationMessage(msgs[i])) return msgs[i];
    }
    return null;
  };

  const snippetFromMessage = msg => {
    if (!msg) return '尚无聊天';
    switch (msg.type) {
      case 'image':
        return '[图片]';
      case 'audio':
        return '[语音]';
      case 'music':
        return `[音乐] ${msg.content || ''}`.trim();
      case 'transfer':
        return `[转账] ${msg.content || ''}`.trim();
      case 'sticker':
        return '[表情]';
      default: {
        const text = String(msg.content || '')
          .replace(/\s+/g, ' ')
          .trim();
        return text.slice(0, 32) || '...';
      }
    }
  };

  const formatSessionName = (sessionId, contact) => {
    const id = String(sessionId || '');
    const c = contact || contactsStore.getContact(id);
    const base = c?.name || (id.startsWith('group:') ? id.replace(/^group:/, '') : id);
    const isGroup = Boolean(c?.isGroup) || id.startsWith('group:');
    if (!isGroup) return base;
    const count = Array.isArray(c?.members) ? c.members.length : 0;
    return `${base}(${count})`;
  };

  const renderChatList = () => {
    const el = document.getElementById('chat-list');
    if (!el) return;
    const ids = chatStore
      .listSessions()
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
    ids.forEach(id => {
      const contact = contactsStore.getContact(id);
      const displayName = formatSessionName(id, contact);
      const avatar = contact?.avatar || avatars.assistant;
      const last = getLastVisibleMessage(id);
      const preview = snippetFromMessage(last);
      const time = last?.timestamp ? formatTime(last.timestamp) : '';
      const unread = chatStore.getUnreadCount(id);
      const unreadBadge =
        unread > 0
          ? `<span style="margin-left:8px; min-width:18px; height:18px; padding:0 6px; display:inline-flex; align-items:center; justify-content:center; border-radius:999px; background:#ef4444; color:#fff; font-size:11px; font-weight:800; line-height:18px;">${unread}</span>`
          : '';

      const item = document.createElement('div');
      item.className = 'chat-list-item';
      item.dataset.session = id;
      item.dataset.name = displayName;
      item.innerHTML = `
	                <img src="${avatar}" alt="" class="chat-item-avatar">
	                <div class="chat-item-content">
	                    <div class="chat-item-header">
	                        <div class="chat-item-name">${displayName}${unreadBadge}</div>
	                        <div class="chat-item-time">${time}</div>
	                    </div>
	                    <div class="chat-item-preview">${preview}</div>
	                </div>
	            `;
      el.appendChild(item);
    });
  };

  // 创建联系人分组渲染器
  const contactGroupRenderer = new ContactGroupRenderer({
    groupStore,
    contactsStore,
    dragManager: contactDragManager,
    renderContactFn: contact => {
      const id = contact.id;
      const last = getLastVisibleMessage(id);
      const preview = snippetFromMessage(last);
      const time = last?.timestamp ? formatTime(last.timestamp) : '';
      const name = formatSessionName(id, contact);
      const avatar = contact.avatar || avatars.assistant;
      const unread = chatStore.getUnreadCount(id);
      const unreadBadge =
        unread > 0
          ? `<span style="margin-left:8px; min-width:18px; height:18px; padding:0 6px; display:inline-flex; align-items:center; justify-content:center; border-radius:999px; background:#ef4444; color:#fff; font-size:11px; font-weight:800; line-height:18px;">${unread}</span>`
          : '';

      const item = document.createElement('div');
      item.className = 'contact-item';
      item.dataset.session = id;
      item.dataset.name = name;
      item.innerHTML = `
	                <img src="${avatar}" alt="" class="contact-avatar">
	                <div class="contact-info">
	                    <div class="contact-name">${name}${unreadBadge}</div>
	                    <div class="contact-desc">${preview}</div>
	                </div>
	                <div class="contact-time">${time}</div>
	            `;
      return item;
    },
  });

  const renderContactsUngrouped = () => {
    const el = document.getElementById('contacts-ungrouped-list');
    if (!el) return;
    const contacts = contactsStore.listContacts().filter(c => c && !c.isGroup);
    if (!contacts.length) {
      el.innerHTML = '';
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:12px 6px; color:#94a3b8; font-size:13px;';
      empty.textContent = '（暂无联系人）';
      el.appendChild(empty);
      return;
    }
    // 使用分组渲染器渲染联系人
    contactGroupRenderer.render(el);
  };

  const renderGroupsList = () => {
    const el = document.getElementById('contacts-groups-list');
    if (!el) return;
    const groups = contactsStore.listContacts().filter(c => c && c.isGroup);
    el.innerHTML = '';
    if (!groups.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:12px 6px; color:#94a3b8; font-size:13px;';
      empty.textContent = '（暂无群聊）';
      el.appendChild(empty);
      return;
    }
    groups.forEach(g => {
      const id = g.id;
      const last = getLastVisibleMessage(id);
      const preview = snippetFromMessage(last);
      const time = last?.timestamp ? formatTime(last.timestamp) : '';
      const name = formatSessionName(id, g);
      const avatar = g.avatar || avatars.assistant;
      const count = Array.isArray(g.members) ? g.members.length : 0;
      const unread = chatStore.getUnreadCount(id);
      const unreadBadge =
        unread > 0
          ? `<span style="margin-left:8px; min-width:18px; height:18px; padding:0 6px; display:inline-flex; align-items:center; justify-content:center; border-radius:999px; background:#ef4444; color:#fff; font-size:11px; font-weight:800; line-height:18px;">${unread}</span>`
          : '';

      const item = document.createElement('div');
      item.className = 'contact-item';
      item.dataset.session = id;
      item.dataset.name = name;
      item.innerHTML = `
	                <img src="${avatar}" alt="" class="contact-avatar">
	                <div class="contact-info">
	                    <div class="contact-name">${name}${unreadBadge}</div>
	                    <div class="contact-desc">${preview || `群成员：${count}人`}</div>
	                </div>
	                <div class="contact-time">${time || String(count).padStart(2, '0') + '人'}</div>
	            `;
      el.appendChild(item);
    });
  };

  const refreshChatAndContactsNow = () => {
    contactsStore.ensureFromSessions(chatStore.listSessions(), { defaultAvatar: avatars.assistant });
    renderChatList();
    renderGroupsList();
    renderContactsUngrouped();
    if (contactsSearch.term && String(contactsSearch.term).trim()) {
      try {
        applyContactsSearchFilter();
      } catch {}
    }
  };

  // Coalesce multiple refresh requests into a single paint cycle to reduce redundant re-renders.
  let refreshChatAndContactsQueued = false;
  let refreshChatAndContactsHandle = null;
  const refreshChatAndContacts = ({ immediate = false } = {}) => {
    if (immediate) {
      refreshChatAndContactsQueued = false;
      if (refreshChatAndContactsHandle != null) {
        try {
          if (typeof window !== 'undefined' && window.cancelAnimationFrame)
            window.cancelAnimationFrame(refreshChatAndContactsHandle);
          else clearTimeout(refreshChatAndContactsHandle);
        } catch {}
        refreshChatAndContactsHandle = null;
      }
      return refreshChatAndContactsNow();
    }
    if (refreshChatAndContactsQueued) return;
    refreshChatAndContactsQueued = true;
    const schedule = cb => {
      try {
        if (typeof window !== 'undefined' && window.requestAnimationFrame) return window.requestAnimationFrame(cb);
      } catch {}
      return setTimeout(cb, 16);
    };
    refreshChatAndContactsHandle = schedule(() => {
      refreshChatAndContactsQueued = false;
      refreshChatAndContactsHandle = null;
      refreshChatAndContactsNow();
    });
  };
  sessionPanel.onUpdated = refreshChatAndContacts;

  /* ---------------- 联系人搜索（参照手机流式.html） ---------------- */
  const contactsSearch = {
    term: '',
    timeout: null,
  };

  const escapeRegExp = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const setHighlighted = (el, term) => {
    if (!el) return;
    const original = el.getAttribute('data-original-text') || el.textContent || '';
    if (!el.getAttribute('data-original-text')) el.setAttribute('data-original-text', original);
    const t = String(term || '').trim();
    if (!t) {
      el.innerHTML = original;
      return;
    }
    const re = new RegExp(`(${escapeRegExp(t)})`, 'gi');
    el.innerHTML = original.replace(re, '<span class="search-highlight">$1</span>');
  };

  const restoreHighlighted = el => {
    if (!el) return;
    const original = el.getAttribute('data-original-text');
    if (original != null) el.innerHTML = original;
  };

  const filterContactItem = (item, searchLower, rawTerm) => {
    const nameEl = item.querySelector('.contact-name');
    const descEl = item.querySelector('.contact-desc');
    const name = (nameEl?.getAttribute('data-original-text') || nameEl?.textContent || '').toLowerCase();
    const desc = (descEl?.getAttribute('data-original-text') || descEl?.textContent || '').toLowerCase();
    const isMatch = !searchLower || name.includes(searchLower) || desc.includes(searchLower);
    item.style.display = isMatch ? '' : 'none';
    if (!searchLower) {
      restoreHighlighted(nameEl);
      restoreHighlighted(descEl);
    } else {
      if (name.includes(searchLower)) setHighlighted(nameEl, rawTerm);
      else restoreHighlighted(nameEl);
      if (desc.includes(searchLower)) setHighlighted(descEl, rawTerm);
      else restoreHighlighted(descEl);
    }
    return isMatch;
  };

  const applyContactsSearchFilter = () => {
    const rawTerm = String(contactsSearch.term || '').trim();
    const searchLower = rawTerm.toLowerCase();

    const groupsWrap = document.getElementById('contacts-groups-list')?.closest('.contact-group') || null;
    const ungroupedWrap = document.getElementById('contacts-ungrouped-list')?.closest('.contact-group') || null;
    const groupsList = document.getElementById('contacts-groups-list');
    const ungroupedList = document.getElementById('contacts-ungrouped-list');

    const filterSection = (listEl, wrapperEl) => {
      if (!listEl || !wrapperEl) return;
      const items = [...listEl.querySelectorAll('.contact-item')];
      let visible = 0;
      for (const it of items) {
        if (filterContactItem(it, searchLower, rawTerm)) visible++;
      }
      wrapperEl.style.display = rawTerm && visible === 0 ? 'none' : '';
    };

    filterSection(groupsList, groupsWrap);
    filterSection(ungroupedList, ungroupedWrap);
  };

  const initContactSearch = () => {
    const input = document.getElementById('contact_search_input');
    const clearBtn = document.getElementById('search_clear_btn');
    const box = document.getElementById('floating_search_box');
    if (!input || !clearBtn || !box) return;
    if (input.hasAttribute('data-initialized')) return;

    const setActiveUi = active => {
      box.classList.toggle('is-active', Boolean(active));
    };

    const update = (nextTerm, { immediate = false } = {}) => {
      contactsSearch.term = String(nextTerm || '');
      const has = contactsSearch.term.trim().length > 0;
      clearBtn.style.display = has ? 'block' : 'none';
      setActiveUi(has);
      if (contactsSearch.timeout) clearTimeout(contactsSearch.timeout);
      const run = () => applyContactsSearchFilter();
      if (immediate) run();
      else contactsSearch.timeout = setTimeout(run, 300);
    };

    input.addEventListener('input', e => update(e.target.value));
    input.addEventListener('focus', () => box.classList.add('is-focus'));
    input.addEventListener('blur', () => box.classList.remove('is-focus'));
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        update('', { immediate: true });
        input.value = '';
      }
    });
    clearBtn.addEventListener('click', () => {
      input.value = '';
      update('', { immediate: true });
      input.focus();
    });

    input.setAttribute('data-initialized', 'true');
  };

  /* ---------------- 底部导航（聊天/联系人/动态） ---------------- */
  const navBtns = document.querySelectorAll('.bottom-nav .nav-btn');
  const pages = {
    chat: document.getElementById('chat-page'),
    contacts: document.getElementById('contacts-page'),
    moments: document.getElementById('moments-page'),
  };
  const chatList = document.getElementById('chat-list');
  const chatRoom = document.getElementById('chat-room');
  let activePage = 'chat';
  const UI_STATE_KEY = 'phone_ui_state_v1';
  const UI_STATE_KV = 'phone_ui_state_v1';
  let uiStateArmed = false;
  let uiStateDiskTimer = null;
  const uiLog = (...args) => {
    try {
      console.log('[CHATAPP_UI]', ...args);
    } catch {}
    try {
      logger.info('[CHATAPP_UI]', ...args);
    } catch {}
    try {
      const g = typeof globalThis !== 'undefined' ? globalThis : window;
      if (g?.__TAURI__) {
        const msg = args
          .map(a => {
            if (a == null) return '';
            if (typeof a === 'string') return a;
            try {
              return JSON.stringify(a);
            } catch {
              return String(a);
            }
          })
          .filter(Boolean)
          .join(' ');
        safeInvoke('log_js', {
          tag: 'CHATAPP_UI',
          level: 'info',
          message: msg.slice(0, 2000),
        }).catch(() => {});
      }
    } catch {}
  };
  const saveUiState = () => {
    try {
      const state = {
        activePage,
        inChatRoom: chatRoom ? !chatRoom.classList.contains('hidden') : false,
        sessionId: chatStore.getCurrent(),
        at: Date.now(),
      };
      const raw = JSON.stringify(state);
      try {
        sessionStorage.setItem(UI_STATE_KEY, raw);
      } catch {}
      try {
        localStorage.setItem(UI_STATE_KEY, raw);
      } catch {}
      if (uiStateDiskTimer) clearTimeout(uiStateDiskTimer);
      uiStateDiskTimer = setTimeout(() => {
        safeInvoke('save_kv', { name: UI_STATE_KV, data: state }).catch(() => {});
      }, 400);
      uiLog('saveUiState', state);
    } catch {}
  };
  const restoreUiState = async () => {
    try {
      const pick = async () => {
        try {
          const raw1 = sessionStorage.getItem(UI_STATE_KEY);
          if (raw1) return JSON.parse(raw1);
        } catch {}
        try {
          const raw2 = localStorage.getItem(UI_STATE_KEY);
          if (raw2) return JSON.parse(raw2);
        } catch {}
        try {
          const kv = await safeInvoke('load_kv', { name: UI_STATE_KV });
          if (kv && typeof kv === 'object') return kv;
        } catch {}
        return null;
      };
      const s = await pick();
      if (!s) {
        uiLog('restoreUiState: no saved state');
        return false;
      }
      const page = String(s?.activePage || '').trim();
      const sid = String(s?.sessionId || '').trim();
      const inChatRoom = Boolean(s?.inChatRoom);
      uiLog('restoreUiState: picked', { page, sid, inChatRoom, at: s?.at || 0 });
      if (page && pages[page]) switchPage(page);
      const sidKnown = sid && (chatStore.hasSession?.(sid) || contactsStore.getContact(sid));
      if (sidKnown) {
        // ensure session exists
        chatStore.switchSession(sid);
        window.appBridge.setActiveSession(sid);
        syncUserPersonaUI(sid);
        const msgs = chatStore.getMessages(sid);
        const draft = chatStore.getDraft(sid);
        ui.clearMessages();
        ui.preloadHistory(decorateMessagesForDisplay(msgs));
        ui.setInputText(draft || '');
        ui.setSessionLabel(sid);
      }
      if (inChatRoom && sid) {
        const c = contactsStore.getContact(sid);
        enterChatRoom(sid, c?.name || sid, page || 'chat');
      }
      if (sid && !sidKnown) {
        uiLog('restoreUiState: sid not yet known (skip switchSession)', { sid });
      }
      return true;
    } catch {
      return false;
    }
  };
  const switchPage = name => {
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
    if (name === 'moments') {
      try {
        momentsPanel.render();
      } catch {}
    }
    if (uiStateArmed) saveUiState();
    uiLog('switchPage', { activePage });
  };
  navBtns.forEach(btn => btn.addEventListener('click', () => switchPage(btn.dataset.page)));

  // 搜索框初始化（仅联系人页）
  initContactSearch();

  // Mirror composer draft to sessionStorage to avoid losing the last few keystrokes on reload/update.
  try {
    const el = document.getElementById('composer-input');
    if (el && !el.hasAttribute('data-draft-mirror')) {
      el.setAttribute('data-draft-mirror', 'true');
      el.addEventListener('input', () => {
        const sid = chatStore.getCurrent();
        const text = String(el.value || '');
        const maxLen = 20_000;
        const trimmed = text.length > maxLen ? text.slice(-maxLen) : text;
        try {
          sessionStorage.setItem(`phone_draft_${sid}`, trimmed);
        } catch {}
      });
    }
  } catch {}

  /* ---------------- 原始回复面板（调试） ---------------- */
  const rawReplyModal = (() => {
    let overlay = null;
    let panel = null;
    let textarea = null;
    let metaEl = null;

    const ensure = () => {
      if (panel) return;
      overlay = document.createElement('div');
      overlay.id = 'raw-reply-overlay';
      overlay.style.cssText = `
                display:none; position:fixed; inset:0;
                background: rgba(0,0,0,0.38);
                z-index: 22000;
                padding: calc(10px + env(safe-area-inset-top, 0px)) 10px calc(10px + env(safe-area-inset-bottom, 0px)) 10px;
                box-sizing: border-box;
            `;

      panel = document.createElement('div');
      panel.id = 'raw-reply-panel';
      panel.style.cssText = `
                width: 100%;
                height: 100%;
                background: #fff;
                border-radius: 14px;
                overflow: hidden;
                display:flex;
                flex-direction:column;
            `;
      panel.addEventListener('click', e => e.stopPropagation());

      panel.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px; padding:12px; background:#f3f4f6; border-bottom:1px solid #e5e7eb;">
                    <div style="font-weight:900;">原始回复</div>
                    <div id="raw-reply-meta" style="margin-left:auto; font-size:12px; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
                    <button id="raw-reply-copy" style="border:1px solid #e5e7eb; background:#fff; border-radius:10px; padding:6px 10px;">复制</button>
                    <button id="raw-reply-close" style="border:1px solid #e5e7eb; background:#fff; border-radius:10px; padding:6px 10px;">关闭</button>
                </div>
                <div style="flex:1; min-height:0; overflow:auto; -webkit-overflow-scrolling:touch; padding:10px;">
                    <textarea id="raw-reply-text" readonly style="
                        width:100%;
                        height:100%;
                        min-height: 100%;
                        resize:none;
                        border:1px solid rgba(0,0,0,0.10);
                        border-radius:12px;
                        padding:12px;
                        font-size:13px;
                        line-height:1.4;
                        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
                        white-space: pre;
                        box-sizing:border-box;
                        outline:none;
                    "></textarea>
                </div>
            `;

      overlay.appendChild(panel);
      overlay.addEventListener('click', () => hide());
      document.body.appendChild(overlay);

      textarea = panel.querySelector('#raw-reply-text');
      metaEl = panel.querySelector('#raw-reply-meta');
      panel.querySelector('#raw-reply-close')?.addEventListener('click', hide);
      panel.querySelector('#raw-reply-copy')?.addEventListener('click', async () => {
        const text = String(textarea?.value || '');
        if (!text) {
          window.toastr?.warning?.('暂无可复制内容');
          return;
        }
        try {
          await navigator.clipboard?.writeText?.(text);
          window.toastr?.success?.('已复制到剪贴簿');
        } catch {
          // fallback: select
          textarea?.focus?.();
          textarea?.select?.();
          window.toastr?.info?.('已选中，请手动复制');
        }
      });
    };

    const show = (text, meta) => {
      ensure();
      if (metaEl) metaEl.textContent = meta || '';
      if (textarea) {
        textarea.value = String(text || '');
        textarea.scrollTop = 0;
      }
      overlay.style.display = 'block';
    };

    const hide = () => {
      if (overlay) overlay.style.display = 'none';
    };

    return { show, hide };
  })();

  /* ---------------- Prompt 预览面板（调试） ---------------- */
  const promptPreviewModal = (() => {
    let overlay = null;
    let panel = null;
    let textarea = null;
    let metaEl = null;

    const ensure = () => {
      if (panel) return;
      overlay = document.createElement('div');
      overlay.id = 'prompt-preview-overlay';
      overlay.style.cssText = `
                display:none; position:fixed; inset:0;
                background: rgba(0,0,0,0.38);
                z-index: 22000;
                padding: calc(10px + env(safe-area-inset-top, 0px)) 10px calc(10px + env(safe-area-inset-bottom, 0px)) 10px;
                box-sizing: border-box;
            `;

      panel = document.createElement('div');
      panel.id = 'prompt-preview-panel';
      panel.style.cssText = `
                width: 100%;
                height: 100%;
                background: #fff;
                border-radius: 14px;
                overflow: hidden;
                display:flex;
                flex-direction:column;
            `;
      panel.addEventListener('click', e => e.stopPropagation());

      panel.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px; padding:12px; background:#f3f4f6; border-bottom:1px solid #e5e7eb;">
                    <div style="font-weight:900;">本次 Prompt</div>
                    <div id="prompt-preview-meta" style="margin-left:auto; font-size:12px; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
                    <button id="prompt-preview-copy" style="border:1px solid #e5e7eb; background:#fff; border-radius:10px; padding:6px 10px;">复制</button>
                    <button id="prompt-preview-close" style="border:1px solid #e5e7eb; background:#fff; border-radius:10px; padding:6px 10px;">关闭</button>
                </div>
                <div style="flex:1; min-height:0; overflow:auto; -webkit-overflow-scrolling:touch; padding:10px;">
                    <textarea id="prompt-preview-text" readonly style="
                        width:100%;
                        height:100%;
                        min-height: 100%;
                        resize:none;
                        border:1px solid rgba(0,0,0,0.10);
                        border-radius:12px;
                        padding:12px;
                        font-size:13px;
                        line-height:1.4;
                        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
                        white-space: pre;
                        box-sizing:border-box;
                        outline:none;
                    "></textarea>
                </div>
            `;

      overlay.appendChild(panel);
      overlay.addEventListener('click', () => hide());
      document.body.appendChild(overlay);

      textarea = panel.querySelector('#prompt-preview-text');
      metaEl = panel.querySelector('#prompt-preview-meta');
      panel.querySelector('#prompt-preview-close')?.addEventListener('click', hide);
      panel.querySelector('#prompt-preview-copy')?.addEventListener('click', async () => {
        const text = String(textarea?.value || '');
        if (!text) {
          window.toastr?.warning?.('暂无内容可复制');
          return;
        }
        try {
          await navigator.clipboard.writeText(text);
          window.toastr?.success?.('已复制');
        } catch {
          try {
            textarea?.select?.();
            document.execCommand?.('copy');
            window.toastr?.success?.('已复制');
          } catch {
            window.toastr?.error?.('复制失败');
          }
        }
      });
    };

    const show = (text, meta = '') => {
      ensure();
      if (!overlay || !panel || !textarea) return;
      textarea.value = String(text || '');
      if (metaEl) metaEl.textContent = meta || '';
      overlay.style.display = 'block';
    };

    const hide = () => {
      if (!overlay) return;
      overlay.style.display = 'none';
    };

    return { show, hide };
  })();

  /* ---------------- 頭像設置菜單 ---------------- */
  const settingsMenu = document.getElementById('settings-menu');
  const quickMenu = document.getElementById('quick-menu');
  // 頂部頭像/＋按鈕在「消息」與「聯係人」頁共用同樣外觀
  const avatarBtns = document.querySelectorAll('.qq-message-topbar .user-avatar-btn');
  const plusBtns = document.querySelectorAll('.qq-message-topbar .icon-button');
  const chatMenuBtn = document.getElementById('chat-menu-btn');
  const chatroomMenu = document.getElementById('chatroom-menu');

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
    document.getElementById('chat-title-menu')?.classList.add('hidden');
    const gd = document.getElementById('group-management-dropdown');
    if (gd) gd.style.display = 'none';
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
    const lastAnchor = kind === 'settings' ? lastSettingsAnchor : kind === 'quick' ? lastQuickAnchor : null;
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

  avatarBtns.forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      toggleSheetAt(settingsMenu, btn, { kind: 'settings' });
    });
  });

  plusBtns.forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      toggleSheetAt(quickMenu, btn, { alignRight: true, kind: 'quick' });
    });
  });

  // Mount moments list renderer
  try {
    const momentsListEl = document.getElementById('moments-list');
    if (momentsListEl) momentsPanel.mount(momentsListEl);
  } catch {}
  chatMenuBtn?.addEventListener('click', e => {
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
      if (action === 'persona') personaPanel.show();
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
      if (action === 'vars') variablePanel.show();
      if (action === 'chat-settings') openChatSettings();
      if (action === 'prompt-preview') {
        const sid = chatStore.getCurrent();
        const contact = contactsStore.getContact(sid);
        const name = contact?.name || sid;
        const req = window.appBridge?.lastRequest;
        const msgs = Array.isArray(req?.messages) ? req.messages : null;
        if (!msgs || !msgs.length) {
          window.toastr?.warning?.('暂无本次 Prompt 记录（请先发送一次）');
        } else {
          const at = req?.at ? new Date(req.at).toLocaleString() : '';
          const head = [
            `provider: ${req?.provider || ''}`,
            `model: ${req?.model || ''}`,
            `baseUrl: ${req?.baseUrl || ''}`,
            `stream: ${req?.stream ? 'true' : 'false'}`,
            req?.options
              ? `options: ${Object.entries(req.options)
                  .filter(([_, v]) => v !== undefined)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(', ')}`
              : '',
          ]
            .filter(Boolean)
            .join('\n');
          // Display only: show prompt text content for easier reading (no JSON, no numbering).
          const body = msgs
            .map(m => String(m?.content ?? ''))
            .filter(t => t.trim().length > 0)
            .join('\n\n');
          const meta = `${name}${at ? ` · ${at}` : ''}`;
          promptPreviewModal.show(`${head}\n\n${body}`.trim(), meta);
        }
      }
      if (action === 'raw-reply') {
        const sid = chatStore.getCurrent();
        const contact = contactsStore.getContact(sid);
        const name = contact?.name || sid;
        const raw = chatStore.getLastRawResponse(sid);
        const at = chatStore.getLastRawAt(sid);
        if (!raw) {
          window.toastr?.warning?.('暂无原始回复记录（请先让 AI 回覆一次）');
        } else {
          const meta = `${name}${at ? ` · ${new Date(at).toLocaleString()}` : ''}`;
          rawReplyModal.show(raw, meta);
        }
      }
      hideMenus();
    });
  });

  // Chat title menu (click current title)
  const chatTitleMenu = document.getElementById('chat-title-menu');
  const currentChatTitle = document.getElementById('current-chat-title');

  const ensureGroupDropdown = () => {
    let el = document.getElementById('group-management-dropdown');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'group-management-dropdown';
    el.style.cssText = `
            display:none;
            position: fixed;
            background: white;
            border: 1px solid rgba(0,0,0,0.10);
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.18);
            z-index: 15000;
            max-height: min(320px, calc(100vh - 140px));
            overflow: auto;
            -webkit-overflow-scrolling: touch;
            min-width: 240px;
        `;
    el.addEventListener('click', e => e.stopPropagation());
    document.body.appendChild(el);
    return el;
  };

  const renderGroupDropdown = (groupId, anchorEl) => {
    const el = ensureGroupDropdown();
    const g = contactsStore.getContact(groupId);
    const members = Array.isArray(g?.members) ? g.members : [];
    const title = `${g?.name || '群聊'} · ${members.length}人`;
    el.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; border-bottom:1px solid rgba(0,0,0,0.06); background:rgba(248,250,252,0.92); border-radius:12px 12px 0 0;">
                <div style="font-weight:900; color:#0f172a; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${title}</div>
                <button id="group-dd-settings" style="border:1px solid #e2e8f0; background:#fff; border-radius:10px; padding:6px 10px; cursor:pointer;">⚙</button>
            </div>
            <div style="padding:8px 0;">
                ${
                  members
                    .map(mid => {
                      const c = contactsStore.getContact(mid);
                      const name = c?.name || mid;
                      const avatar = c?.avatar || avatars.assistant;
                      return `
                        <button class="group-dd-member" data-mid="${mid}" style="width:100%; display:flex; align-items:center; gap:10px; padding:10px 12px; border:none; background:transparent; cursor:pointer; text-align:left;">
                            <img src="${avatar}" alt="" style="width:32px; height:32px; border-radius:50%; object-fit:cover;">
                            <div style="flex:1; min-width:0;">
                                <div style="font-weight:700; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${name}</div>
                                <div style="color:#64748b; font-size:12px;">点击进入私聊</div>
                            </div>
                        </button>
                    `;
                    })
                    .join('') || `<div style="color:#94a3b8; font-size:13px; padding:10px 12px;">暂无成员</div>`
                }
            </div>
        `;

    positionSheet(el, anchorEl, 0, 6, false);
    el.style.display = 'block';

    el.querySelector('#group-dd-settings')?.addEventListener('click', () => {
      el.style.display = 'none';
      groupSettingsPanel.show(groupId);
    });
    el.querySelectorAll('.group-dd-member').forEach(btn => {
      btn.addEventListener('click', () => {
        const mid = btn.dataset.mid;
        if (!mid) return;
        const c = contactsStore.getContact(mid);
        el.style.display = 'none';
        switchPage('chat');
        enterChatRoom(mid, c?.name || mid, 'chat');
      });
    });
  };

  currentChatTitle?.addEventListener('click', e => {
    e.stopPropagation();
    const sid = chatStore.getCurrent();
    const c = contactsStore.getContact(sid);
    const isGroup = Boolean(c?.isGroup) || String(sid || '').startsWith('group:');
    if (isGroup) {
      const el = document.getElementById('group-management-dropdown');
      const showing = el && el.style.display !== 'none';
      hideMenus();
      if (!showing) renderGroupDropdown(sid, currentChatTitle);
      return;
    }
    toggleSheetAt(chatTitleMenu, currentChatTitle, { kind: 'title' });
  });
  chatTitleMenu?.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'contact-settings') contactSettingsPanel.show();
      hideMenus();
    });
  });

  /* ---------------- 聊天列表 <-> 聊天室切换 ---------------- */
  const backToListBtn = document.getElementById('back-to-list');
  let chatOriginPage = 'chat';
  const isChatRoomVisible = () => Boolean(chatRoom) && !chatRoom.classList.contains('hidden');
  const autoMarkReadIfActive = (sessionId, messageId = '') => {
    try {
      const sid = String(sessionId || '').trim();
      if (!sid) return;
      if (!isChatRoomVisible()) return;
      if (String(chatStore.getCurrent() || '') !== sid) return;
      chatStore.markRead(sid, messageId);
    } catch {}
  };

  const enterChatRoom = (sessionId, sessionName, originPage = activePage) => {
    chatOriginPage = originPage || 'chat';
    chatList?.classList.add('hidden');
    chatRoom?.classList.remove('hidden');

    // 隐藏消息界面顶部和底部导航栏
    const messageTopbar = document.getElementById('message-topbar');
    const bottomNav = document.querySelector('.bottom-nav');
    if (messageTopbar) messageTopbar.style.display = 'none';
    if (bottomNav) bottomNav.style.display = 'none';

    const contact = contactsStore.getContact(sessionId);
    if (currentChatTitle)
      currentChatTitle.textContent = formatSessionName(sessionId, contact) || sessionName || sessionId;
    const firstUnreadId = chatStore.getFirstUnreadMessageId(sessionId);
    // 切换会话
    chatStore.switchSession(sessionId);
    window.appBridge.setActiveSession(sessionId);
    syncUserPersonaUI(sessionId);
    // 加载历史
    const history = chatStore.getMessages(sessionId);
    ui.clearMessages();
    history.forEach(msg => ui.addMessage(msg));
    // Jump to first unread message (LINE-like)
    if (firstUnreadId) {
      setTimeout(() => ui.scrollToMessage(firstUnreadId), 50);
    } else {
      setTimeout(() => ui.scrollToBottom(), 0);
    }
    // Mark read once user enters the chatroom
    try {
      chatStore.markRead(sessionId);
    } catch {}
    refreshChatAndContacts();
    const draft = chatStore.getDraft(sessionId);
    if (draft) {
      ui.setInputText(draft);
    } else {
      // Fallback: sessionStorage draft mirror (survives hot reload)
      try {
        const tmp = sessionStorage.getItem(`phone_draft_${sessionId}`) || '';
        if (tmp) ui.setInputText(tmp);
      } catch {}
    }
    ui.setSessionLabel(sessionId);
    if (uiStateArmed) saveUiState();
    uiLog('enterChatRoom', { sessionId, originPage: chatOriginPage });
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
    if (uiStateArmed) saveUiState();
    uiLog('exitChatRoom', { activePage, sessionId: chatStore.getCurrent() });
  };

  backToListBtn?.addEventListener('click', exitChatRoom);

  quickMenu?.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'add-friend') sessionPanel.show({ focusAdd: true });
      if (action === 'create-group') groupCreatePanel.show();
      if (action === 'new-group') groupPanel.show();
      hideMenus();
    });
  });

  /* ---------------- 列表入口共用会话 ---------------- */
  chatList?.addEventListener('click', e => {
    const item = e.target.closest('.chat-list-item');
    if (!item) return;
    const id = item.dataset.session || 'default';
    const name = item.dataset.name || id;
    enterChatRoom(id, name);
    switchPage('chat');
  });

  const contactsUngroupedEl = document.getElementById('contacts-ungrouped-list');
  contactsUngroupedEl?.addEventListener('click', e => {
    const item = e.target.closest('.contact-item');
    if (!item || !item.dataset.session) return;
    const id = item.dataset.session;
    const name = item.dataset.name || id;
    const origin = activePage;
    switchPage('chat');
    enterChatRoom(id, name, origin);
  });

  const contactsGroupsEl = document.getElementById('contacts-groups-list');
  contactsGroupsEl?.addEventListener('click', e => {
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
          name: getEffectivePersona(chatStore.getCurrent())?.name || '我',
          avatar: avatars.user,
          time: formatNowTime(),
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
        name: getEffectivePersona(chatStore.getCurrent())?.name || '我',
        avatar: avatars.user,
        time: formatNowTime(),
      };
      ui.addMessage(msg);
      chatStore.appendMessage(msg);
    },
    sticker: async () => {
      stickerPicker.show();
    },
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
      ui.preloadHistory(decorateMessagesForDisplay(history));
    }
    const draft = chatStore.getDraft(currentId);
    if (draft) ui.setInputText(draft);
  } catch (error) {
    logger.warn('加载历史记录失败，跳过', error);
  }

  // Track the current in-flight generation so we can support "收回" (cancel + retract)
  let activeGeneration = null; // { sessionId, userMsgId, streamCtrl, cancelled }

  // Summary compaction runner (used by auto-trigger and manual "↻" button in settings)
  const summaryCompacting = new Set();
  const requestSummaryCompaction = (sid, { force = false } = {}) => {
    const sessionId = String(sid || '').trim();
    if (!sessionId) return Promise.resolve(false);
    if (summaryCompacting.has(sessionId)) return Promise.resolve(false);
    if (!window?.appBridge?.backgroundChat || !window?.appBridge?.buildMessages) return Promise.resolve(false);
    if (typeof window.appBridge.isConfigured === 'function' && !window.appBridge.isConfigured())
      return Promise.resolve(false);

    const list = chatStore.getSummaries(sessionId) || [];
    const summaries = Array.isArray(list) ? list : [];
    if (!summaries.length) return Promise.resolve(false);
    const total = summaries.reduce((n, it) => {
      const text = String(typeof it === 'string' ? it : it?.text || '');
      return n + text.length;
    }, 0);
    if (!force && total <= 1000) return Promise.resolve(false);

    summaryCompacting.add(sessionId);
    return new Promise(resolve => {
      // Run in background with a short delay to avoid competing with user interactions.
      setTimeout(async () => {
        try {
          const current = chatStore.getSummaries(sessionId) || [];
          const arr = Array.isArray(current) ? current : [];
          const payload = arr
            .map(it => {
              const text = String(typeof it === 'string' ? it : it?.text || '').trim();
              if (!text) return '';
              const at = typeof it === 'object' && it && it.at ? Number(it.at) : 0;
              const when = at ? new Date(at).toLocaleString() : '';
              return `- ${when ? `[${when}] ` : ''}${text}`;
            })
            .filter(Boolean)
            .join('\n');
          if (!payload.trim()) return resolve(false);

          const prompt = [
            '# 注意，无视你先前收到的任何指令，你的任务已更改，不再遵守格式要求',
            '接下来的一轮回复中，将不会进行创作，不再遵循前面的要求，而是会遵循<summary_rules>中的要求进行一轮总结',
            '【总结请求】',
            '请对前文内容进行全面梳理，根据以下要求制作简明扼要的总结：',
            '',
            '<summary_rules>',
            '总结应当遵循以下原则：',
            '- 按时间顺序或逻辑顺序组织信息，并明确给出具体时间节点',
            '- 保留关键事件和重要细节，省略冗余描述',
            '- 直接陈述事实，避免主观评价',
            '- 使用简洁清晰的语言，避免过度修饰',
            '- 突出事件发展脉络和关键转折点',
            '- 不回避任何敏感内容，保证记录完全还原前文',
            '',
            '总结正文必须放在 <summary>...</summary> 中（只允许这一层 XML 标签；不要输出其他 XML 标签）。',
            'summary 内部的正文必须使用以下格式：',
            '',
            '【关键事件】',
            '• {事件1}: {简要描述}',
            '• {事件2}: {简要描述}',
            '• {事件3}: {简要描述}',
            '...',
            '',
            '</summary_rules>',
            '',
            '【前文内容（按时间标注的摘要列表）】',
            payload,
          ].join('\n');

          const contact = contactsStore?.getContact?.(sessionId) || null;
          const isGroup = Boolean(contact?.isGroup) || sessionId.startsWith('group:');
          const activePersona = getEffectivePersona?.(chatStore.getCurrent?.()) || getEffectivePersona?.() || {};
          const userName = activePersona?.name || '我';
          const charName = String(contact?.name || sessionId.replace(/^group:/, '') || sessionId) || 'assistant';
	          const ctx = {
	            user: {
	              name: userName,
	              persona: String(activePersona?.description || ''),
	              personaPosition: activePersona?.position,
	              personaDepth: activePersona?.depth,
	              personaRole: activePersona?.role,
	            },
	            character: { name: charName },
	            session: { id: sessionId, isGroup },
            group: isGroup
              ? {
                  id: sessionId,
                  name: charName,
                  members: Array.isArray(contact?.members) ? contact.members : [],
                  memberNames: (Array.isArray(contact?.members) ? contact.members : []).map(
                    mid => contactsStore.getContact(mid)?.name || mid,
                  ),
                }
              : null,
	            history: [],
	            meta: {
	              disableChatGuide: true,
	              disableScenarioHint: true,
	              disableSummary: true,
	              overrideLastUserMessage: '开始总结，勿输出聊天格式',
	            },
	          };
	          const built = window.appBridge.buildMessages(prompt, ctx);
          const out = await window.appBridge.backgroundChat(built, { temperature: 0.2, maxTokens: 800 });
          const raw = String(out || '').trim();
          if (!raw) return resolve(false);
          try {
            chatStore.setCompactedSummaryRaw(raw, sessionId);
          } catch {}

          const extractSummaryTag = s => {
            const input = String(s || '');
            const re = /<summary>([\s\S]*?)<\/summary>/gi;
            let m;
            let last = null;
            while ((m = re.exec(input))) last = m[1];
            const inner = String(last || '').trim();
            return inner;
          };
          const text = extractSummaryTag(raw);
          if (!text) {
            try {
              window.dispatchEvent(
                new CustomEvent('chatapp-summary-compaction-failed', {
                  detail: { sessionId, reason: 'missing_summary_tag' },
                }),
              );
            } catch {}
            return resolve(false);
          }

          // Validate output format so UI can rely on a recognizable "big summary".
          const hasHeader = /【\s*关键事件\s*】/.test(text);
          const hasBullet = /^[ \t]*[•\-]\s*\S+/m.test(text);
          if (!hasHeader || !hasBullet) {
            try {
              window.dispatchEvent(
                new CustomEvent('chatapp-summary-compaction-failed', {
                  detail: { sessionId, reason: 'format' },
                }),
              );
            } catch {}
            return resolve(false);
          }

          // Store compact summary below the normal summary list and keep only the latest 2 summaries.
          try {
            chatStore.setCompactedSummary(text, sessionId, { raw });
          } catch {}
          try {
            const keep = (chatStore.getSummaries(sessionId) || []).slice(-2);
            chatStore.clearSummaries(sessionId);
            keep.forEach(it => {
              const t = String(typeof it === 'string' ? it : it?.text || '').trim();
              if (t) chatStore.addSummary(t, sessionId);
            });
          } catch {}

          try {
            refreshChatAndContacts();
          } catch {}
          try {
            window.dispatchEvent(new CustomEvent('chatapp-summaries-updated', { detail: { sessionId } }));
          } catch {}
          resolve(true);
        } catch (err) {
          logger.debug('summary compaction failed', err);
          resolve(false);
        } finally {
          summaryCompacting.delete(sessionId);
        }
      }, 450);
    });
  };
  try {
    globalThis.__chatappRequestSummaryCompaction = requestSummaryCompaction;
  } catch {}
  try {
    window.__chatappRequestSummaryCompaction = requestSummaryCompaction;
  } catch {}
  try {
    if (window?.appBridge) window.appBridge.requestSummaryCompaction = requestSummaryCompaction;
  } catch {}

  // Send handler
  const handleSend = async () => {
    const text = ui.getInputText();
    if (!text) return;

    const sessionId = chatStore.getCurrent();
    const contact = contactsStore.getContact(sessionId);
    const characterName =
      contact?.name || (sessionId.startsWith('group:') ? sessionId.replace(/^group:/, '') : sessionId) || 'assistant';
    const activePersona = getEffectivePersona(sessionId);
    const userName = activePersona.name || '我';
    const isGroupChat = Boolean(contact?.isGroup) || sessionId.startsWith('group:');
    const groupMembers = isGroupChat ? (Array.isArray(contact?.members) ? contact.members : []) : [];
    const normalizeName = s => String(s || '').trim();
    const normalizeKey = s => normalizeName(s).toLowerCase().replace(/\s+/g, '');
    // keep only letters/numbers/CJK to avoid emoji/punctuation differences
    const normalizeLoose = s => normalizeKey(s).replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, '');
    const resolvePrivateChatTargetSessionId = otherName => {
      const other = normalizeName(otherName);
      if (!other) return sessionId;
      const currentContact = contactsStore.getContact(sessionId);
      const currentName = normalizeName(currentContact?.name || sessionId);
      const currentId = normalizeName(sessionId);
      if (other === currentName || other === currentId) return sessionId;

      // Prefer an existing contact with the same display name (avoid duplicates like "室友" vs internal id)
      try {
        const matches = (contactsStore.listContacts?.() || []).filter(c => normalizeName(c?.name || c?.id) === other);
        if (matches.length === 1) return matches[0].id;
      } catch {}

      // If otherName itself is an existing contact id, reuse it
      const byId = contactsStore.getContact(other);
      if (byId?.id) return byId.id;

      // Do NOT create a new chat on mismatch.
      // But in practice models may output alias/繁简体导致名字无法精确匹配。
      // 为避免“明明在当前聊天室生成却全部丢弃”，此处回退到当前 session。
      logger.debug('private_chat target name mismatch, fallback to current session', { other, currentName, sessionId });
      return sessionId;
    };

    const resolveGroupChatTargetSessionId = groupName => {
      const gname = normalizeName(groupName);
      if (!gname) return '';
      const currentContact = contactsStore.getContact(sessionId);
      const currentIsGroup = Boolean(currentContact?.isGroup) || String(sessionId || '').startsWith('group:');
      if (currentIsGroup) {
        const curName = normalizeName(currentContact?.name || sessionId);
        if (gname === curName || normalizeLoose(gname) === normalizeLoose(curName)) return sessionId;
      }
      const hit = contactsStore.findGroupIdByName?.(gname) || '';
      return hit;
    };

    const resolveContactByDisplayName = displayName => {
      const raw = normalizeName(displayName);
      if (!raw) return null;
      const key = normalizeLoose(raw);
      const list = contactsStore.listContacts?.() || [];
      const exact = list.find(c => normalizeName(c?.name || c?.id) === raw);
      if (exact) return exact;
      const fuzzy = list.find(c => normalizeLoose(c?.name || c?.id) === key);
      return fuzzy || null;
    };
    const resolveMomentAuthorId = authorName => {
      const raw = normalizeName(authorName);
      if (!raw) return '';
      if (raw === userName || raw.toLowerCase() === 'user' || raw === '用户') return 'user';
      // Common placeholders: treat as current chat character
      if (raw === '发言人' || raw === '角色' || raw === '角色名' || raw === '作者') return sessionId;

      // If authorName matches current chat character display name, bind to current session
      const charLoose = normalizeLoose(characterName);
      const rawLoose = normalizeLoose(raw);
      if (
        rawLoose &&
        charLoose &&
        (rawLoose === charLoose || rawLoose.includes(charLoose) || charLoose.includes(rawLoose))
      ) {
        return sessionId;
      }

      // Author might be an existing contact id
      const byId = contactsStore.getContact(raw);
      if (byId?.id) return byId.id;

      const list = contactsStore.listContacts?.() || [];
      // Exact match
      const exact = list.find(c => normalizeName(c?.name) === raw);
      if (exact?.id) return exact.id;

      const key = normalizeLoose(raw);
      // Fuzzy (normalized)
      const fuzzy = list.find(c => normalizeLoose(c?.name) === key || normalizeLoose(c?.id) === key);
      if (fuzzy?.id) return fuzzy.id;

      // Substring heuristic (pick longest match)
      let best = null;
      let bestLen = 0;
      for (const c of list) {
        const cn = normalizeLoose(c?.name);
        if (!cn) continue;
        if (key.includes(cn) || cn.includes(key)) {
          const len = Math.min(cn.length, key.length);
          if (len > bestLen) {
            bestLen = len;
            best = c;
          }
        }
      }
      return best?.id || '';
    };
    const normalizeMomentAuthorDisplay = authorName => {
      const raw = normalizeName(authorName);
      if (!raw) return normalizeName(characterName) || '角色';
      if (raw === userName || raw.toLowerCase() === 'user' || raw === '用户') return userName;
      if (raw === '发言人' || raw === '角色' || raw === '角色名' || raw === '作者')
        return normalizeName(characterName) || raw;
      return raw;
    };
    const ingestMoments = (moments = []) => {
      const list = Array.isArray(moments) ? moments : [];
      const n = getContactCountN();
      return list.map(m => {
        const author = normalizeMomentAuthorDisplay(m?.author);
        const authorId = resolveMomentAuthorId(author);
        let authorAvatar = '';
        if (authorId === 'user') authorAvatar = avatars.user;
        else if (authorId) authorAvatar = contactsStore.getContact(authorId)?.avatar || '';
        const stats = normalizeInitialMomentStats({ views: m?.views, likes: m?.likes }, n);
        return { ...(m || {}), ...stats, author, authorId, authorAvatar, originSessionId: sessionId };
      });
    };
    const extractSummaryBlock = text => {
      const raw = String(text ?? '');
      const re = /<details>\s*<summary>\s*摘要\s*<\/summary>\s*([\s\S]*?)<\/details>/gi;
      let m;
      let last = null;
      while ((m = re.exec(raw))) last = { index: m.index, full: m[0], inner: m[1] };
      if (!last) return { text: raw, summary: '' };
      const inner = String(last.inner || '');
      const plain = inner.replace(/<[^>]+>/g, ' ');
      // Pure Chinese requirement: drop latin letters; keep digits/punctuation.
      const summary = plain
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[A-Za-z]+/g, '')
        .trim();
      const stripped = (raw.slice(0, last.index) + raw.slice(last.index + last.full.length))
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      return { text: stripped, summary };
    };
    const sanitizeThinkingForProtocolParse = text => {
      const raw = String(text ?? '');
      // More tolerant fallback: if model echoed "<content>" inside (possibly unclosed) thinking,
      // we drop everything before the last </thinking> or </think> then parse the remaining tail once.
      const lower = raw.toLowerCase();
      const closeThinking = '</thinking>';
      const closeThink = '</think>';
      const i1 = lower.lastIndexOf(closeThinking);
      const i2 = lower.lastIndexOf(closeThink);
      const idx = Math.max(i1, i2);
      if (idx === -1) return raw;
      const cut = idx + (idx === i1 ? closeThinking.length : closeThink.length);
      return raw.slice(cut);
    };
	    const buildHistoryForLLM = pendingUserText => {
	      const all = chatStore.getMessages(sessionId) || [];
	      const history = all
	        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
	        .map(m => ({
	          role: m.role,
	          content: typeof m.raw === 'string' ? m.raw : m.content,
	          name: typeof m.name === 'string' ? m.name : '',
	        }));
	      const last = history[history.length - 1];
	      if (
	        pendingUserText &&
	        last?.role === 'user' &&
        String(last.content || '').trim() === String(pendingUserText).trim()
      ) {
        history.pop();
      }
      // Limit outgoing history to the latest 50 messages to reduce distraction/tokens.
      if (history.length > 50) {
        history.splice(0, history.length - 50);
      }
      return history;
    };
    let disableSummaryForThis = false;
    const llmContext = pendingUserText => ({
      user: {
        name: userName,
        persona: activePersona.description || '',
        personaPosition: activePersona.position,
        personaDepth: activePersona.depth,
        personaRole: activePersona.role,
      },
      character: { name: characterName },
      session: { id: sessionId, isGroup: isGroupChat },
      meta: {
        // Avoid breaking protocol/dialogue parsing modes; only enable summary for normal chat replies.
        disableSummary: Boolean(disableSummaryForThis),
      },
      group: isGroupChat
        ? {
            id: sessionId,
            name: characterName,
            members: groupMembers.slice(),
            memberNames: groupMembers.map(mid => contactsStore.getContact(mid)?.name || mid),
          }
        : null,
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

    const storedUser = window.appBridge.applyInputStoredRegex(text, { isEdit: false });
    const displayUser = window.appBridge.applyInputDisplayRegex(storedUser, { isEdit: false, depth: 0 });
    const userMsg = {
      role: 'user',
      type: 'text',
      content: displayUser,
      raw: storedUser,
      name: userName,
      avatar: avatars.user,
      time: formatNowTime(),
    };
    ui.addMessage(userMsg);
    chatStore.appendMessage(userMsg, sessionId);
    activeGeneration = { sessionId, userMsgId: userMsg.id, streamCtrl: null, cancelled: false };
    refreshChatAndContacts();
    ui.clearInput();
    ui.setSendingState(true);

    const config = window.appBridge.config.get();

    let streamCtrl = null;
    let suppressErrorUI = false;
    try {
      if (config.stream) {
        const assistantAvatar = getAssistantAvatarForSession(sessionId);
        const sysp = window.appBridge?.presets?.getActive?.('sysprompt') || {};
        const privateEnabled = Boolean(sysp?.dialogue_enabled) && String(sysp?.dialogue_rules || '').trim().length > 0;
        const groupEnabled = Boolean(sysp?.group_enabled) && String(sysp?.group_rules || '').trim().length > 0;
        const momentCreateEnabled =
          Boolean(sysp?.moment_create_enabled) && String(sysp?.moment_create_rules || '').trim().length > 0;
        const protocolEnabled = momentCreateEnabled || (isGroupChat ? groupEnabled : privateEnabled);
        // Always include summary request prompt; summary (if present) will be extracted from raw response.
        disableSummaryForThis = false;

        if (protocolEnabled) {
          // 对话模式（流式）：不逐字显示 AI 原文；只在捕获到完整的“有效标签”后输出解析结果
          ui.showTyping(assistantAvatar);
          const parser = new DialogueStreamParser({ userName });
          const stream = await window.appBridge.generate(text, llmContext(text));
          let fullRaw = '';
          let didAnything = false;
          let mutatedMoments = false;
          const summarySessionIds = new Set([sessionId]);
          for await (const chunk of stream) {
            if (activeGeneration?.cancelled) break;
            fullRaw += chunk;
            const events = parser.push(chunk);
            for (const ev of events) {
              if (ev.type === 'moments') {
                try {
                  momentsStore.addMany(ingestMoments(ev.moments || []));
                  mutatedMoments = true;
                  didAnything = true;
                  if (activePage === 'moments') momentsPanel.render();
                } catch {}
                continue;
              }
              if (ev.type === 'moment_reply') {
                try {
                  momentsStore.addComments(ev.momentId, ev.comments || []);
                  mutatedMoments = true;
                  didAnything = true;
                  if (activePage === 'moments') momentsPanel.render();
                } catch {}
                continue;
              }
              if (ev.type === 'group_chat') {
                ui.hideTyping();
                const targetGroupId = resolveGroupChatTargetSessionId(ev.groupName);
                if (!targetGroupId) {
                  window.toastr?.warning?.('对话回覆格式错误：群聊标签未匹配任何已存在群组，已丢弃');
                  continue;
                }
                summarySessionIds.add(targetGroupId);
                (ev.messages || []).forEach(m => {
                  const speaker = normalizeName(m?.speaker);
                  const content = String(m?.content || '').replace(/<br\s*\/?>/gi, '\n');
                  const isMe =
                    speaker === userName || normalizeLoose(speaker) === normalizeLoose(userName) || speaker === '用户';
                  const role = isMe ? 'user' : 'assistant';
                  const c = isMe ? null : resolveContactByDisplayName(speaker);
                  const parsed = {
                    role,
                    type: 'text',
                    ...parseSpecialMessage(content),
                    name: role === 'user' ? userName : speaker || '成员',
                    avatar: role === 'user' ? avatars.user : c?.avatar || avatars.assistant,
                    time: m?.time || formatNowTime(),
                    meta: role === 'assistant' ? { showName: true } : undefined,
                  };
                  if (targetGroupId === sessionId) ui.addMessage(parsed);
                  const saved = chatStore.appendMessage(parsed, targetGroupId);
                  if (role === 'assistant') autoMarkReadIfActive(targetGroupId, saved?.id || parsed?.id || '');
                });
                didAnything = true;
                refreshChatAndContacts();
                ui.showTyping(assistantAvatar);
                continue;
              }
              if (ev.type !== 'private_chat') continue;
              ui.hideTyping();

              // 默认路由到当前 session；若标签指向其他私聊，则创建/写入对应会话（后续群聊/动态会扩展）
              const targetSessionId = resolvePrivateChatTargetSessionId(ev.otherName || characterName);
              if (!targetSessionId) {
                window.toastr?.warning?.('对话回覆格式错误：私聊标签未匹配当前联系人，已丢弃');
                continue;
              }
              summarySessionIds.add(targetSessionId);

              ev.messages.forEach(msgText => {
                const parsed = {
                  role: 'assistant',
                  type: 'text',
                  ...parseSpecialMessage(String(msgText || '')),
                  name: '助手',
                  avatar: getAssistantAvatarForSession(targetSessionId),
                  time: formatNowTime(),
                };
                if (targetSessionId === sessionId) {
                  ui.addMessage(parsed);
                }
                const saved = chatStore.appendMessage(parsed, targetSessionId);
                autoMarkReadIfActive(targetSessionId, saved?.id || parsed?.id || '');
              });
              didAnything = true;
              refreshChatAndContacts();

              // Continue waiting animation until stream ends / next tag arrives
              ui.showTyping(assistantAvatar);
            }
          }
          if (activeGeneration?.cancelled) return;
          ui.hideTyping();
          chatStore.setLastRawResponse(fullRaw, sessionId);
          const { summary: protocolSummary } = extractSummaryBlock(fullRaw);
          if (protocolSummary) {
            try {
              for (const sid of summarySessionIds) chatStore.addSummary(protocolSummary, sid);
            } catch {}
            try {
              for (const sid of summarySessionIds) requestSummaryCompaction(sid);
            } catch {}
          }
          if (mutatedMoments) {
            try {
              await momentsStore.flush();
            } catch {}
          }
          refreshChatAndContacts();
          if (!didAnything) {
            // Fallback: if <thinking>/<think> contains literal "<content>", first-pass parsing may start too early.
            // Retry once by stripping complete thinking blocks, then parsing again.
            try {
              const retryText = sanitizeThinkingForProtocolParse(fullRaw);
              if (retryText && retryText !== fullRaw) {
                const retryParser = new DialogueStreamParser({ userName });
                const retryEvents = retryParser.push(retryText);
                retryEvents.forEach(ev => {
                  if (ev?.type === 'moments') {
                    try {
                      momentsStore.addMany(ingestMoments(ev.moments || []));
                      mutatedMoments = true;
                      didAnything = true;
                      if (activePage === 'moments') momentsPanel.render();
                    } catch {}
                    return;
                  }
                  if (ev?.type === 'moment_reply') {
                    try {
                      momentsStore.addComments(ev.momentId, ev.comments || []);
                      mutatedMoments = true;
                      didAnything = true;
                      if (activePage === 'moments') momentsPanel.render();
                    } catch {}
                    return;
                  }
                  if (ev?.type === 'group_chat') {
                    const targetGroupId = resolveGroupChatTargetSessionId(ev.groupName);
                    if (!targetGroupId) return;
                    summarySessionIds.add(targetGroupId);
                    (ev.messages || []).forEach(m => {
                      const speaker = normalizeName(m?.speaker);
                      const content = String(m?.content || '').replace(/<br\s*\/?>/gi, '\n');
                      const isMe =
                        speaker === userName ||
                        normalizeLoose(speaker) === normalizeLoose(userName) ||
                        speaker === '用户';
                      const role = isMe ? 'user' : 'assistant';
                      const c = isMe ? null : resolveContactByDisplayName(speaker);
                      const parsed = {
                        role,
                        type: 'text',
                        ...parseSpecialMessage(content),
                        name: role === 'user' ? userName : speaker || '成员',
                        avatar: role === 'user' ? avatars.user : c?.avatar || avatars.assistant,
                        time: m?.time || formatNowTime(),
                        meta: role === 'assistant' ? { showName: true } : undefined,
                      };
                      if (targetGroupId === sessionId) ui.addMessage(parsed);
                      const saved = chatStore.appendMessage(parsed, targetGroupId);
                      if (role === 'assistant') autoMarkReadIfActive(targetGroupId, saved?.id || parsed?.id || '');
                    });
                    didAnything = true;
                    refreshChatAndContacts();
                    return;
                  }
                  if (ev?.type === 'private_chat') {
                    const targetSessionId = resolvePrivateChatTargetSessionId(ev.otherName || characterName);
                    if (!targetSessionId) return;
                    summarySessionIds.add(targetSessionId);
                    (ev.messages || []).forEach(msgText => {
                      const parsed = {
                        role: 'assistant',
                        type: 'text',
                        ...parseSpecialMessage(String(msgText || '')),
                        name: '助手',
                        avatar: getAssistantAvatarForSession(targetSessionId),
                        time: formatNowTime(),
                      };
                      if (targetSessionId === sessionId) ui.addMessage(parsed);
                      const saved = chatStore.appendMessage(parsed, targetSessionId);
                      autoMarkReadIfActive(targetSessionId, saved?.id || parsed?.id || '');
                    });
                    didAnything = true;
                    refreshChatAndContacts();
                  }
                });
                if (mutatedMoments) {
                  try {
                    await momentsStore.flush();
                  } catch {}
                }
                refreshChatAndContacts();
              }
            } catch {}
            if (!didAnything) {
              window.toastr?.warning?.('未解析到有效对话标签，已丢弃（可在“三 > 原始回复”查看）');
            }
          }
        } else {
          // 兼容旧逻辑（流式逐字）
          streamCtrl = ui.startAssistantStream({
            avatar: assistantAvatar,
            name: '助手',
            time: formatNowTime(),
            typing: true,
          });
          if (activeGeneration && activeGeneration.sessionId === sessionId) activeGeneration.streamCtrl = streamCtrl;
          const stream = await window.appBridge.generate(text, llmContext(text));
          let full = '';
          for await (const chunk of stream) {
            if (activeGeneration?.cancelled) break;
            full += chunk;
            streamCtrl.update(full);
          }
          if (activeGeneration?.cancelled) return;
          chatStore.setLastRawResponse(full, sessionId);
          const { text: stripped, summary } = extractSummaryBlock(full);
          if (summary) {
            try {
              chatStore.addSummary(summary, sessionId);
            } catch {}
          }
          let stored = stripped;
          let display = stripped;
          // === 创意写作模式（暂时停用）===
          // try {
          //     stored = window.appBridge.applyOutputStoredRegex(full);
          //     display = window.appBridge.applyOutputDisplayRegex(stored, { depth: 0 });
          //     streamCtrl.update(display);
          // } catch {}
          const parsed = {
            role: 'assistant',
            name: '助手',
            avatar: assistantAvatar,
            time: formatNowTime(),
            id: streamCtrl?.id,
            rawOriginal: full,
            raw: stored,
            ...parseSpecialMessage(display),
          };
          streamCtrl.finish(parsed);
          {
            const saved = chatStore.appendMessage(parsed, sessionId);
            autoMarkReadIfActive(sessionId, saved?.id || parsed?.id || '');
          }
          refreshChatAndContacts();
        }
      } else {
        const assistantAvatar = getAssistantAvatarForSession(sessionId);
        const sysp = window.appBridge?.presets?.getActive?.('sysprompt') || {};
        const privateEnabled = Boolean(sysp?.dialogue_enabled) && String(sysp?.dialogue_rules || '').trim().length > 0;
        const groupEnabled = Boolean(sysp?.group_enabled) && String(sysp?.group_rules || '').trim().length > 0;
        const momentCreateEnabled =
          Boolean(sysp?.moment_create_enabled) && String(sysp?.moment_create_rules || '').trim().length > 0;
        const protocolEnabled = momentCreateEnabled || (isGroupChat ? groupEnabled : privateEnabled);
        // Always include summary request prompt; summary (if present) will be extracted from raw response.
        disableSummaryForThis = false;

        ui.showTyping(assistantAvatar);
        const resultRaw = await window.appBridge.generate(text, llmContext(text));
        ui.hideTyping();
        chatStore.setLastRawResponse(resultRaw, sessionId);
        const { summary: protocolSummary } = extractSummaryBlock(resultRaw);
        const summarySessionIds = new Set([sessionId]);
        if (protocolEnabled) {
          const parser = new DialogueStreamParser({ userName });
          const events = parser.push(resultRaw);
          let didAnything = false;
          let mutatedMoments = false;
          events.forEach(ev => {
            if (ev?.type === 'moments') {
              momentsStore.addMany(ingestMoments(ev.moments || []));
              didAnything = true;
              mutatedMoments = true;
              return;
            }
            if (ev?.type === 'moment_reply') {
              momentsStore.addComments(ev.momentId, ev.comments || []);
              didAnything = true;
              mutatedMoments = true;
              return;
            }
            if (ev?.type === 'group_chat') {
              const targetGroupId = resolveGroupChatTargetSessionId(ev.groupName);
              if (!targetGroupId) {
                window.toastr?.warning?.('对话回覆格式错误：群聊标签未匹配任何已存在群组，已丢弃');
                return;
              }
              summarySessionIds.add(targetGroupId);
              (ev.messages || []).forEach(m => {
                const speaker = normalizeName(m?.speaker);
                const content = String(m?.content || '').replace(/<br\s*\/?>/gi, '\n');
                const isMe =
                  speaker === userName || normalizeLoose(speaker) === normalizeLoose(userName) || speaker === '用户';
                const role = isMe ? 'user' : 'assistant';
                const c = isMe ? null : resolveContactByDisplayName(speaker);
                const parsed = {
                  role,
                  ...parseSpecialMessage(content),
                  name: role === 'user' ? userName : speaker || '成员',
                  avatar: role === 'user' ? avatars.user : c?.avatar || avatars.assistant,
                  time: m?.time || formatNowTime(),
                  meta: role === 'assistant' ? { showName: true } : undefined,
                };
                if (targetGroupId === sessionId) ui.addMessage(parsed);
                const saved = chatStore.appendMessage(parsed, targetGroupId);
                if (role === 'assistant') autoMarkReadIfActive(targetGroupId, saved?.id || parsed?.id || '');
                didAnything = true;
              });
              return;
            }
            if (ev?.type === 'private_chat') {
              const targetSessionId = resolvePrivateChatTargetSessionId(ev.otherName || characterName);
              if (!targetSessionId) {
                window.toastr?.warning?.('对话回覆格式错误：私聊标签未匹配当前联系人，已丢弃');
                return;
              }
              summarySessionIds.add(targetSessionId);
              (ev.messages || []).forEach(msgText => {
                const parsed = {
                  role: 'assistant',
                  ...parseSpecialMessage(String(msgText || '')),
                  name: '助手',
                  avatar: getAssistantAvatarForSession(targetSessionId),
                  time: formatNowTime(),
                };
                if (targetSessionId === sessionId) ui.addMessage(parsed);
                const saved = chatStore.appendMessage(parsed, targetSessionId);
                autoMarkReadIfActive(targetSessionId, saved?.id || parsed?.id || '');
                didAnything = true;
              });
            }
          });
          if (didAnything) {
            if (protocolSummary) {
              try {
                for (const sid of summarySessionIds) chatStore.addSummary(protocolSummary, sid);
              } catch {}
              try {
                for (const sid of summarySessionIds) requestSummaryCompaction(sid);
              } catch {}
            }
            refreshChatAndContacts();
            if (activePage === 'moments') momentsPanel.render();
            if (mutatedMoments) {
              try {
                await momentsStore.flush();
              } catch {}
            }
            return;
          }
          // Fallback: strip complete <thinking>/<think> blocks then parse once more.
          try {
            const retryText = sanitizeThinkingForProtocolParse(resultRaw);
            if (retryText && retryText !== resultRaw) {
              const retryParser = new DialogueStreamParser({ userName });
              const retryEvents = retryParser.push(retryText);
              retryEvents.forEach(ev => {
                if (ev?.type === 'moments') {
                  momentsStore.addMany(ingestMoments(ev.moments || []));
                  didAnything = true;
                  mutatedMoments = true;
                  return;
                }
                if (ev?.type === 'moment_reply') {
                  momentsStore.addComments(ev.momentId, ev.comments || []);
                  didAnything = true;
                  mutatedMoments = true;
                  return;
                }
                if (ev?.type === 'group_chat') {
                  const targetGroupId = resolveGroupChatTargetSessionId(ev.groupName);
                  if (!targetGroupId) return;
                  summarySessionIds.add(targetGroupId);
                  (ev.messages || []).forEach(m => {
                    const speaker = normalizeName(m?.speaker);
                    const content = String(m?.content || '').replace(/<br\s*\/?>/gi, '\n');
                    const isMe =
                      speaker === userName ||
                      normalizeLoose(speaker) === normalizeLoose(userName) ||
                      speaker === '用户';
                    const role = isMe ? 'user' : 'assistant';
                    const c = isMe ? null : resolveContactByDisplayName(speaker);
                    const parsed = {
                      role,
                      ...parseSpecialMessage(content),
                      name: role === 'user' ? userName : speaker || '成员',
                      avatar: role === 'user' ? avatars.user : c?.avatar || avatars.assistant,
                      time: m?.time || formatNowTime(),
                      meta: role === 'assistant' ? { showName: true } : undefined,
                    };
                    if (targetGroupId === sessionId) ui.addMessage(parsed);
                    const saved = chatStore.appendMessage(parsed, targetGroupId);
                    if (role === 'assistant') autoMarkReadIfActive(targetGroupId, saved?.id || parsed?.id || '');
                    didAnything = true;
                  });
                  return;
                }
                if (ev?.type === 'private_chat') {
                  const targetSessionId = resolvePrivateChatTargetSessionId(ev.otherName || characterName);
                  if (!targetSessionId) return;
                  summarySessionIds.add(targetSessionId);
                  (ev.messages || []).forEach(msgText => {
                    const parsed = {
                      role: 'assistant',
                      ...parseSpecialMessage(String(msgText || '')),
                      name: '助手',
                      avatar: getAssistantAvatarForSession(targetSessionId),
                      time: formatNowTime(),
                    };
                    if (targetSessionId === sessionId) ui.addMessage(parsed);
                    const saved = chatStore.appendMessage(parsed, targetSessionId);
                    autoMarkReadIfActive(targetSessionId, saved?.id || parsed?.id || '');
                    didAnything = true;
                  });
                }
              });
            }
          } catch {}
          if (didAnything) {
            if (protocolSummary) {
              try {
                for (const sid of summarySessionIds) chatStore.addSummary(protocolSummary, sid);
              } catch {}
              try {
                for (const sid of summarySessionIds) requestSummaryCompaction(sid);
              } catch {}
            }
            refreshChatAndContacts();
            if (activePage === 'moments') momentsPanel.render();
            if (mutatedMoments) {
              try {
                await momentsStore.flush();
              } catch {}
            }
            return;
          }
          // 如果对话模式未解析到有效标签，回退显示原文，便于调试
          window.toastr?.warning?.('未解析到有效对话标签，已回退显示原文');
        }
        if (protocolSummary) {
          try {
            for (const sid of summarySessionIds) chatStore.addSummary(protocolSummary, sid);
          } catch {}
          try {
            for (const sid of summarySessionIds) requestSummaryCompaction(sid);
          } catch {}
        }
        // === 创意写作模式（暂时停用）===
        // const stored = window.appBridge.applyOutputStoredRegex(resultRaw);
        // const display = window.appBridge.applyOutputDisplayRegex(stored, { depth: 0 });
        const { text: stripped, summary } = extractSummaryBlock(resultRaw);
        if (summary) {
          try {
            chatStore.addSummary(summary, sessionId);
          } catch {}
          try {
            requestSummaryCompaction(sessionId);
          } catch {}
        }
        const stored = stripped;
        const display = stripped;
        const parsed = {
          role: 'assistant',
          name: '助手',
          avatar: assistantAvatar,
          time: formatNowTime(),
          rawOriginal: resultRaw,
          raw: stored,
          ...parseSpecialMessage(display),
        };
        ui.addMessage(parsed);
        {
          const saved = chatStore.appendMessage(parsed, sessionId);
          autoMarkReadIfActive(sessionId, saved?.id || parsed?.id || '');
        }
        refreshChatAndContacts();
      }
    } catch (error) {
      streamCtrl?.cancel?.();
      ui.hideTyping();
      if (error?.cancelled || (activeGeneration?.cancelled && String(error?.name || '') === 'AbortError')) {
        suppressErrorUI = true;
      }
      if (suppressErrorUI) return;
      logger.error('发送失败', error, { status: error?.status, response: error?.response });
      ui.showErrorBanner(error.message || '发送失败，請檢查網絡或 API 設置', {
        label: '重試',
        handler: () => handleSend(),
      });
      window.toastr?.error(error.message || '发送失败', '错误');
    } finally {
      ui.setSendingState(false);
      activeGeneration = null;
    }
  };

  ui.onSend(handleSend);
  ui.onInputChange(text => chatStore.setDraft(text, chatStore.getCurrent()));
  ui.onMessageAction(async (action, message, payload) => {
    const sessionId = chatStore.getCurrent();
    if (action === 'delete-selected') {
      const ids = Array.isArray(payload?.ids) ? payload.ids.map(String).filter(Boolean) : [];
      if (!ids.length) return;
      ids.forEach(id => {
        chatStore.deleteMessage(id, sessionId);
        ui.removeMessage(id);
      });
      refreshChatAndContacts();
      return;
    }
    if (action === 'retract' && message.role === 'user') {
      const pending =
        activeGeneration && activeGeneration.sessionId === sessionId && activeGeneration.userMsgId === message.id;
      if (pending) {
        try {
          activeGeneration.cancelled = true;
        } catch {}
        try {
          window.appBridge.cancelCurrentGeneration('retract');
        } catch {}
        try {
          activeGeneration.streamCtrl?.cancel?.();
        } catch {}
        try {
          ui.hideTyping?.();
        } catch {}
        try {
          ui.setSendingState(false);
        } catch {}
      }
      chatStore.deleteMessage(message.id, sessionId);
      ui.removeMessage(message.id);
      refreshChatAndContacts();
      return;
    }
    if (action === 'delete') {
      chatStore.deleteMessage(message.id, sessionId);
      ui.removeMessage(message.id);
      refreshChatAndContacts();
      return;
    }
    if (action === 'edit-assistant-raw' && message.role === 'assistant') {
      const next = String(payload?.text ?? '');
      // === 创意写作模式（暂时停用）===
      // const stored = window.appBridge.applyOutputStoredRegex(next, { isEdit: true });
      // const display = window.appBridge.applyOutputDisplayRegex(stored, { isEdit: true, depth: 0 });
      const stored = next;
      const display = next;
      const updater = {
        rawOriginal: next,
        raw: stored,
        ...parseSpecialMessage(display),
      };
      const updated = chatStore.updateMessage(message.id, updater, sessionId);
      if (updated) {
        ui.updateMessage(message.id, updated);
        refreshChatAndContacts();
      }
      return;
    }
    if (action === 'edit-confirm' && message.role === 'user') {
      const newText = String(payload?.text ?? '');
      if (!newText) return;
      const stored = window.appBridge.applyInputStoredRegex(newText, { isEdit: true });
      const display = window.appBridge.applyInputDisplayRegex(stored, { isEdit: true, depth: 0 });
      const updated = chatStore.updateMessage(
        message.id,
        { content: display, raw: stored, time: formatNowTime() },
        sessionId,
      );
      if (updated) {
        ui.updateMessage(message.id, {
          ...updated,
          role: 'user',
          type: 'text',
          avatar: avatars.user,
          name: getEffectivePersona(sessionId)?.name || '我',
        });
        refreshChatAndContacts();
      }
      return;
    }
    if (action === 'edit' && message.role === 'user') {
      // 已由 UI 層接管 startInlineEdit，此處保留舊邏輯備份或直接移除
      return;
    }
    if (action === 'regenerate' && message.role === 'assistant') {
      const msgs = chatStore.getMessages(sessionId);
      const idx = msgs.findIndex(m => m.id === message.id);
      if (idx === -1) return;
      const prevUser = [...msgs]
        .slice(0, idx)
        .reverse()
        .find(m => m.role === 'user');
      if (!prevUser) {
        window.toastr?.warning('未找到對應的用戶消息，無法重生成');
        return;
      }
      ui.removeMessage(message.id);
      chatStore.deleteMessage(message.id, sessionId);
      let streamCtrl = null;
      try {
        const assistantAvatar = getAssistantAvatarForSession(sessionId);
        const text = prevUser.content;
        const config = window.appBridge.config.get();
        let full = '';
        if (config.stream) {
          streamCtrl = ui.startAssistantStream({
            avatar: assistantAvatar,
            name: '助手',
            time: formatNowTime(),
            typing: true,
          });
          const stream = await window.appBridge.generate(text, llmContext(text));
          for await (const chunk of stream) {
            full += chunk;
            streamCtrl.update(full);
          }
          let stored = full;
          let display = full;
          // === 创意写作模式（暂时停用）===
          // try {
          //     stored = window.appBridge.applyOutputStoredRegex(full);
          //     display = window.appBridge.applyOutputDisplayRegex(stored, { depth: 0 });
          //     streamCtrl.update(display);
          // } catch {}
          const parsed = {
            role: 'assistant',
            name: '助手',
            avatar: assistantAvatar,
            time: formatNowTime(),
            id: streamCtrl?.id,
            rawOriginal: full,
            raw: stored,
            ...parseSpecialMessage(display),
          };
          streamCtrl.finish(parsed);
          {
            const saved = chatStore.appendMessage(parsed, sessionId);
            autoMarkReadIfActive(sessionId, saved?.id || parsed?.id || '');
          }
          refreshChatAndContacts();
        } else {
          ui.showTyping(assistantAvatar);
          const resultRaw = await window.appBridge.generate(text, llmContext(text));
          ui.hideTyping();
          // === 创意写作模式（暂时停用）===
          // const stored = window.appBridge.applyOutputStoredRegex(resultRaw);
          // const display = window.appBridge.applyOutputDisplayRegex(stored, { depth: 0 });
          const stored = resultRaw;
          const display = resultRaw;
          const parsed = {
            role: 'assistant',
            name: '助手',
            avatar: assistantAvatar,
            time: formatNowTime(),
            rawOriginal: resultRaw,
            raw: stored,
            ...parseSpecialMessage(display),
          };
          ui.addMessage(parsed);
          {
            const saved = chatStore.appendMessage(parsed, sessionId);
            autoMarkReadIfActive(sessionId, saved?.id || parsed?.id || '');
          }
          refreshChatAndContacts();
        }
      } catch (err) {
        streamCtrl?.cancel?.();
        ui.hideTyping();
        window.toastr?.error(err.message || '重新生成失敗');
      }
      return;
    }
  });
  const rerenderCurrentSession = () => {
    try {
      const id = chatStore.getCurrent();
      const msgs = chatStore.getMessages(id);
      ui.clearMessages();
      ui.preloadHistory(decorateMessagesForDisplay(msgs));
      refreshChatAndContacts();
    } catch {}
  };

  window.addEventListener('worldinfo-changed', () => {
    updateWorldIndicator();
    rerenderCurrentSession();
  });
  window.addEventListener('preset-changed', () => rerenderCurrentSession());
  window.addEventListener('regex-changed', () => {
    rerenderCurrentSession();
  });
  window.addEventListener('session-changed', e => {
    const id = e.detail?.id;
    if (id) {
      window.appBridge.setActiveSession(id);
      const c = contactsStore.getContact(id);
      if (currentChatTitle) currentChatTitle.textContent = c?.name || id;
      syncUserPersonaUI(id);
      const msgs = chatStore.getMessages(id);
      const draft = chatStore.getDraft(id);
      ui.clearMessages();
      ui.preloadHistory(decorateMessagesForDisplay(msgs));
      ui.setInputText(draft || '');
      ui.setSessionLabel(id);
      refreshChatAndContacts();
    }
  });

  try {
    await restoreUiState();
  } catch {}
  if (!activePage) activePage = 'chat';
  if (!pages[activePage]) activePage = 'chat';
  if (!pages[activePage]?.classList.contains('active')) switchPage(activePage || 'chat');
  uiLog('boot: after restore', {
    activePage,
    sessionId: chatStore.getCurrent(),
    inChatRoom: chatRoom ? !chatRoom.classList.contains('hidden') : false,
  });
  updateWorldIndicator();
  refreshChatAndContacts();
  uiStateArmed = true;
  try {
    saveUiState();
  } catch {}

  // If stores hydrate later (e.g. after a WebView reload / offline resume), refresh UI without jumping to defaults.
  window.addEventListener('store-hydrated', async ev => {
    const store = String(ev?.detail?.store || '').trim();
    if (!store) return;
    if (store !== 'chat' && store !== 'contacts') return;
    uiLog('store-hydrated', { store });
    try {
      refreshChatAndContacts();
    } catch {}
    try {
      // If we are stuck on an empty/default session due to early hydration miss, restore the last UI state again.
      const cur = String(chatStore.getCurrent() || '').trim();
      const raw = (() => {
        try {
          return sessionStorage.getItem(UI_STATE_KEY);
        } catch {}
        try {
          return localStorage.getItem(UI_STATE_KEY);
        } catch {}
        return '';
      })();
      const want = raw ? String(JSON.parse(raw)?.sessionId || '').trim() : '';
      uiLog('store-hydrated: check restore', { cur, want, curKnown: chatStore.hasSession?.(cur) });
      if (want && want !== cur && (cur === 'default' || !chatStore.hasSession?.(cur))) {
        await restoreUiState();
      }
    } catch {}
  });

  // Lifecycle diagnostics (helps confirm whether this is a real WebView reload/process restart)
  try {
    window.addEventListener('pageshow', e => uiLog('pageshow', { persisted: Boolean(e?.persisted) }));
    window.addEventListener('pagehide', e => uiLog('pagehide', { persisted: Boolean(e?.persisted) }));
    document.addEventListener('visibilitychange', () => uiLog('visibilitychange', { state: document.visibilityState }));
    window.addEventListener('beforeunload', () => uiLog('beforeunload'));
    window.addEventListener('unload', () => uiLog('unload'));
    window.addEventListener('error', e =>
      uiLog('window.error', { msg: e?.message, file: e?.filename, line: e?.lineno, col: e?.colno }),
    );
    window.addEventListener('unhandledrejection', e =>
      uiLog('unhandledrejection', { reason: String(e?.reason?.message || e?.reason || '') }),
    );
  } catch {}

  function handleSticker(tag) {
    const sessionId = chatStore.getCurrent();
    const msg = {
      role: 'user',
      type: 'sticker',
      content: tag,
      name: getEffectivePersona(sessionId)?.name || '我',
      avatar: avatars.user,
      time: formatNowTime(),
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
      name: getEffectivePersona(sessionId)?.name || '我',
      avatar: avatars.user,
      time: formatNowTime(),
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
      name: getEffectivePersona(sessionId)?.name || '我',
      avatar: avatars.user,
      time: formatNowTime(),
    };
    ui.addMessage(msg);
    chatStore.appendMessage(msg, sessionId);
  }

  function updateWorldIndicator() {
    const globalId = window.appBridge?.globalWorldId || '';
    const currentId = window.appBridge?.currentWorldId || '';
    const label = globalId && currentId ? `全局:${globalId} / 会话:${currentId}` : globalId || currentId || '未啟用';
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
      chatBg: '',
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
      chatBg: chatBgInput.value,
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
    const randomColor = () =>
      '#' +
      Math.floor(Math.random() * 16777215)
        .toString(16)
        .padStart(6, '0');
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

  bubbleColorPicker?.addEventListener('input', e => {
    const color = e.target.value;
    bubbleColorInput.value = color;
    updatePreview(color, textColorInput.value);
  });

  bubbleColorInput?.addEventListener('input', e => {
    const color = e.target.value;
    if (/^#[0-9A-F]{6}$/i.test(color)) {
      bubbleColorPicker.value = color;
      updatePreview(color, textColorInput.value);
    }
  });

  textColorPicker?.addEventListener('input', e => {
    const color = e.target.value;
    textColorInput.value = color;
    updatePreview(bubbleColorInput.value, color);
  });

  textColorInput?.addEventListener('input', e => {
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
