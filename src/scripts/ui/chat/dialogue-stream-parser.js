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

const parseOpenTag = (s, startIdx) => {
    const gt = s.indexOf('>', startIdx + 1);
    if (gt === -1) return null;
    const raw = s.slice(startIdx + 1, gt);
    const tagName = raw.trim().replace(/^\/+/, '').split(/\s+/)[0];
    const isClosing = raw.trim().startsWith('/');
    return { tagName, isClosing, endIdx: gt + 1 };
};

const parsePrivateChatMessages = (innerText) => {
    const text = normalizeNewlines(innerText);
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const messages = [];
    for (const line of lines) {
        if (/^[-•*]\s+/.test(line)) {
            messages.push(line.replace(/^[-•*]\s+/, '').trim());
            continue;
        }
        const m = line.match(/^(.+?)--([\s\S]+?)--(\d{1,2}:\d{2})\s*$/);
        if (m) {
            messages.push(String(m[2] || '').trim());
            continue;
        }
        // Fallback: treat as a single message line
        messages.push(line);
    }
    return messages.filter(Boolean);
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
            const lt = findFirstTagOpen(work);
            if (lt === -1) break;

            const open = parseOpenTag(work, lt);
            if (!open) break; // need more data
            const { tagName, isClosing, endIdx } = open;
            if (isClosing) {
                // Drop stray closing tags
                work = work.slice(endIdx);
                advanced = true;
                continue;
            }

            // Only care about completed tags with a matching close
            const closeTag = `</${tagName}>`;
            const closeIdx = work.indexOf(closeTag, endIdx);
            if (closeIdx === -1) break; // wait for more data

            const inner = work.slice(endIdx, closeIdx);
            const afterClose = closeIdx + closeTag.length;

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

