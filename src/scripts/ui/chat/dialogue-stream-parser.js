/**
 * Dialogue-mode stream parser (simplified)
 * - Ignores <thinking>...</thinking> and other non-content parts
 * - Extracts <content>...</content>, then emits completed chat tags inside
 * - Currently focuses on private chat tags: <X和Y的私聊>...</X和Y的私聊>
 * - Inside private chat tag:
 *   - Preferred: lines starting with "-" (each becomes one assistant bubble)
 *   - Fallback: "speaker--content--HH:MM" per line
 */

const normalizeNewlines = (s) => String(s ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

const stripThinkingBlocks = (s) => {
    let out = String(s ?? '');
    // Remove fully closed <thinking> blocks to avoid confusing tag scanning
    // (Keep incomplete blocks for later; we'll only strip complete ones)
    out = out.replace(/<thinking[\s\S]*?>[\s\S]*?<\/thinking>/gi, '');
    return out;
};

const findFirstTagOpen = (s) => s.indexOf('<');

const hasImplicitContentSignal = (s) => {
    const src = String(s ?? '');
    const lower = src.toLowerCase();
    if (lower.includes('moment_start') || lower.includes('moment_reply_start')) return true;
    // A private chat tag can appear without <content> when models don't follow the wrapper rule.
    // Example: <我和貝法的私聊> ... </我和貝法的私聊>
    if (/<\s*[^/][^>]*的私聊\s*>/i.test(src)) return true;
    if (/<\s*群聊\s*:/i.test(src)) return true;
    return false;
};

const parseOpenTag = (s, startIdx) => {
    const gt = s.indexOf('>', startIdx + 1);
    if (gt === -1) return null;
    const raw = s.slice(startIdx + 1, gt).trim();
    const isClosing = raw.startsWith('/');
    let core = isClosing ? raw.slice(1).trim() : raw;
    const selfClosing = core.endsWith('/') || raw.endsWith('/'); // <br/> or <tag .../>
    if (core.endsWith('/')) core = core.slice(0, -1).trim();
    // NOTE: Our protocol tag names may contain spaces (e.g. "我和Lara croft的私聊"),
    // so we intentionally do NOT split by whitespace (attributes are not expected in these tags).
    const tagName = core;
    return { tagName, isClosing, selfClosing, endIdx: gt + 1 };
};

const findMatchingCloseTag = (s, tagName, fromIdx) => {
    const src = String(s ?? '');
    const target = String(tagName ?? '').trim();
    if (!target) return null;
    let idx = Math.max(0, fromIdx | 0);
    while (true) {
        const closeStart = src.indexOf('</', idx);
        if (closeStart === -1) return null;
        const close = parseOpenTag(src, closeStart);
        if (!close) return null; // need more data
        if (close.isClosing && String(close.tagName || '').trim() === target) {
            return { closeIdx: closeStart, afterClose: close.endIdx };
        }
        idx = close.endIdx;
        if (idx >= src.length) return null;
    }
};

const parsePrivateChatMessages = (innerText) => {
    const text = normalizeNewlines(innerText);
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const messages = [];
    for (const line of lines) {
        if (/^[-•*]\s+/.test(line)) {
            messages.push(line.replace(/^[-•*]\s+/, '').trim().replace(/<br\s*\/?>/gi, '\n'));
            continue;
        }
        const m = line.match(/^(.+?)--([\s\S]+?)--(\d{1,2}:\d{2})\s*$/);
        if (m) {
            messages.push(String(m[2] || '').trim().replace(/<br\s*\/?>/gi, '\n'));
            continue;
        }
        // Fallback: treat as a single message line
        messages.push(line.replace(/<br\s*\/?>/gi, '\n'));
    }
    return messages.filter(Boolean);
};

const isGroupChatTag = (tagName) => {
    const tn = String(tagName || '').trim();
    return /^群聊\s*:/i.test(tn);
};

const extractGroupNameFromTag = (tagName) => {
    const tn = String(tagName || '').trim();
    const m = tn.match(/^群聊\s*:\s*(.+)\s*$/i);
    return m ? String(m[1] || '').trim() : '';
};

const parseGroupChatBlock = (innerText) => {
    const src = String(innerText ?? '');
    const getBlock = (tag) => {
        const re = new RegExp(`<\\s*${tag}\\s*>[\\s\\S]*?<\\s*/\\s*${tag}\\s*>`, 'i');
        const m = src.match(re);
        if (!m) return '';
        const open = new RegExp(`<\\s*${tag}\\s*>`, 'i');
        const close = new RegExp(`<\\s*/\\s*${tag}\\s*>`, 'i');
        return String(m[0] || '').replace(open, '').replace(close, '').trim();
    };

    const membersRaw = getBlock('成员');
    const members = membersRaw
        ? membersRaw.split(/[,，]/).map(s => String(s || '').trim()).filter(Boolean)
        : [];

    const chatRaw = getBlock('聊天内容') || src;
    const text = normalizeNewlines(chatRaw).replace(/<br\s*\/?>/gi, '\n');
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    const messages = [];
    for (const line of lines) {
        const m = line.match(/^(.+?)--([\s\S]+?)--(\d{1,2}:\d{2})\s*$/);
        if (m) {
            messages.push({ speaker: String(m[1] || '').trim(), content: String(m[2] || '').trim(), time: String(m[3] || '').trim() });
            continue;
        }
        const parts = line.split('--').map(p => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
            messages.push({ speaker: parts[0], content: parts.slice(1).join('--'), time: '' });
            continue;
        }
    }

    return { members, messages };
};

const extractOtherNameFromPrivateChatTag = (tagName, userName) => {
    // tagName examples:
    // - "我和室友的私聊"
    // - "{{user}}和{{char}}的私聊" (after macros applied)
    const tn = String(tagName || '').trim();
    const suffix = '的私聊';
    if (!tn.endsWith(suffix)) return null;
    const core = tn.slice(0, -suffix.length);
    const prefix = `${String(userName || '').trim()}和`;
    if (prefix && core.startsWith(prefix)) {
        return core.slice(prefix.length).trim() || null;
    }
    // If userName not present, try split by "和"
    const parts = core.split('和').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) return parts[parts.length - 1] || null;
    return null;
};

const parseMomentBlock = (innerText) => {
    const text = normalizeNewlines(innerText);
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const moments = [];
    let current = null;

    const commit = () => {
        if (!current) return;
        // Default counts
        current.views = Number.isFinite(Number(current.views)) ? Number(current.views) : 0;
        current.likes = Number.isFinite(Number(current.likes)) ? Number(current.likes) : 0;
        current.timestamp = Date.now();
        current.signature = `${current.author || ''}\u0000${current.content || ''}\u0000${current.time || ''}`;
        if (!Array.isArray(current.comments)) current.comments = [];
        moments.push(current);
        current = null;
    };

    for (const line of lines) {
        const parts = line.split('--').map(p => p.trim());
        if (parts.length >= 5) {
            // New moment header
            commit();
            current = {
                author: parts[0] || '',
                content: parts[1] || '',
                time: parts[2] || '',
                views: Number(parts[3] || 0),
                likes: Number(parts[4] || 0),
                comments: [],
            };
            continue;
        }
        if (parts.length === 2 && current) {
            current.comments.push({ author: parts[0] || '', content: parts[1] || '' });
            continue;
        }
    }
    commit();
    return moments;
};

const parseMomentReplyBlock = (innerText) => {
    const text = normalizeNewlines(innerText);
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    let momentId = '';
    const comments = [];
    for (const line of lines) {
        const m = line.match(/^moment_id::\s*(.+)\s*$/i);
        if (m) {
            momentId = String(m[1] || '').trim();
            continue;
        }
        const parts = line.split('--').map(p => p.trim());
        if (parts.length >= 2) {
            const author = parts[0] || '';
            const rest = parts.slice(1);
            let replyTo = '';
            let replyToAuthor = '';
            const contentParts = [];
            for (const seg of rest) {
                const s = String(seg || '').trim();
                const m1 = s.match(/^reply_to::\s*(.+)\s*$/i);
                if (m1) {
                    replyTo = String(m1[1] || '').trim();
                    continue;
                }
                const m2 = s.match(/^reply_to_author::\s*(.+)\s*$/i);
                if (m2) {
                    replyToAuthor = String(m2[1] || '').trim();
                    continue;
                }
                contentParts.push(seg);
            }
            comments.push({
                author,
                content: contentParts.join('--') || '',
                replyTo,
                replyToAuthor,
            });
        }
    }
    return { momentId, comments };
};

const findNextToken = (s) => {
    const src = String(s ?? '');
    const lower = src.toLowerCase();
    const idxTag = src.indexOf('<');
    const idxMoment = lower.indexOf('moment_start');
    const idxReply = lower.indexOf('moment_reply_start');
    const candidates = [
        { kind: 'tag', idx: idxTag },
        { kind: 'moment', idx: idxMoment },
        { kind: 'moment_reply', idx: idxReply },
    ].filter(x => x.idx !== -1);
    if (!candidates.length) return null;
    candidates.sort((a, b) => a.idx - b.idx);
    return candidates[0];
};

export class DialogueStreamParser {
    constructor({ userName = '我' } = {}) {
        this.userName = userName;
        this.preBuffer = '';
        this.inContent = false;
        this.contentBuffer = '';
        this.ended = false;
    }

    push(chunk) {
        if (this.ended) return [];
        const events = [];
        const text = String(chunk ?? '');
        if (!text) return events;

        if (!this.inContent) {
            this.preBuffer += text;
            this.preBuffer = stripThinkingBlocks(this.preBuffer);
            // Detect <content ...> opening
            const m = this.preBuffer.match(/<content\b[^>]*>/i);
            if (m) {
                const start = this.preBuffer.toLowerCase().indexOf(m[0].toLowerCase());
                const after = start + m[0].length;
                this.inContent = true;
                this.contentBuffer += this.preBuffer.slice(after);
                this.preBuffer = '';
            } else if (hasImplicitContentSignal(this.preBuffer)) {
                // Fallback: some models may omit <content> wrapper but still output tags we can parse.
                this.inContent = true;
                this.contentBuffer += this.preBuffer;
                this.preBuffer = '';
            } else {
                // keep bounded to avoid memory growth before content
                if (this.preBuffer.length > 80_000) this.preBuffer = this.preBuffer.slice(-40_000);
                return events;
            }
        } else {
            this.contentBuffer += text;
        }

        // If content ended, only parse within it
        const endIdx = this.contentBuffer.toLowerCase().indexOf('</content>');
        let scanText = this.contentBuffer;
        if (endIdx !== -1) {
            scanText = this.contentBuffer.slice(0, endIdx);
        }

        // Parse completed tags in scanText
        let work = scanText;
        let advanced = true;
        while (advanced) {
            advanced = false;
            const next = findNextToken(work);
            if (!next) break;

            if (next.kind === 'moment') {
                const startIdx = next.idx;
                const endMark = 'moment_end';
                const endAt = work.toLowerCase().indexOf(endMark, startIdx);
                if (endAt === -1) break; // wait for more data
                const inner = work.slice(startIdx + 'moment_start'.length, endAt);
                const after = endAt + endMark.length;
                const moments = parseMomentBlock(inner);
                if (moments.length) events.push({ type: 'moments', moments });
                work = work.slice(after);
                advanced = true;
                continue;
            }

            if (next.kind === 'moment_reply') {
                const startIdx = next.idx;
                const endMark = 'moment_reply_end';
                const endAt = work.toLowerCase().indexOf(endMark, startIdx);
                if (endAt === -1) break; // wait for more data
                const inner = work.slice(startIdx + 'moment_reply_start'.length, endAt);
                const after = endAt + endMark.length;
                const { momentId, comments } = parseMomentReplyBlock(inner);
                // moment_id is optional (some tasks already know the target momentId in context).
                if (comments.length) events.push({ type: 'moment_reply', momentId, comments });
                work = work.slice(after);
                advanced = true;
                continue;
            }

            const lt = next.idx;
            const open = parseOpenTag(work, lt);
            if (!open) break; // need more data
            const { tagName, isClosing, endIdx } = open;
            if (isClosing) {
                // Drop stray closing tags
                work = work.slice(endIdx);
                advanced = true;
                continue;
            }
            if (open.selfClosing) {
                // Consume self-closing tags (e.g. <br/>) without affecting parsing
                work = work.slice(endIdx);
                advanced = true;
                continue;
            }

            // Only care about completed tags with a matching close
            const close = findMatchingCloseTag(work, tagName, endIdx);
            if (!close) break; // wait for more data
            const closeIdx = close.closeIdx;

            const inner = work.slice(endIdx, closeIdx);
            const afterClose = close.afterClose;

            if (tagName.endsWith('的私聊')) {
                const otherName = extractOtherNameFromPrivateChatTag(tagName, this.userName);
                const msgs = parsePrivateChatMessages(inner);
                if (msgs.length) {
                    events.push({ type: 'private_chat', tagName, otherName, messages: msgs });
                }
                work = work.slice(afterClose);
                advanced = true;
                continue;
            }

            if (isGroupChatTag(tagName)) {
                const groupName = extractGroupNameFromTag(tagName);
                const { members, messages } = parseGroupChatBlock(inner);
                if (groupName && messages.length) {
                    events.push({ type: 'group_chat', tagName, groupName, members, messages });
                }
                work = work.slice(afterClose);
                advanced = true;
                continue;
            }

            // Ignore other tags but consume them when closed (e.g. <action>...</action>)
            work = work.slice(afterClose);
            advanced = true;
        }

        // Commit remaining unconsumed content
        if (endIdx !== -1) {
            // content ended; keep tail after </content> for future (not used now)
            this.ended = true;
            this.contentBuffer = '';
        } else {
            // keep leftover for future chunks
            this.contentBuffer = work;
            if (this.contentBuffer.length > 160_000) this.contentBuffer = this.contentBuffer.slice(-80_000);
        }

        return events;
    }

    flush() {
        // Only emit when tags are fully closed; flush does nothing additional now.
        return [];
    }
}
