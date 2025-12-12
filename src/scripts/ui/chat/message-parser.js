/**
 * Parse assistant messages with special tokens into structured message types.
 * Supported tokens (single-line, trimmed):
 * - [img-URL or desc]          -> image
 * - [yy-voice text]            -> audio placeholder (shows text, expects URL if provided)
 * - [music-title$artist]       -> music card
 * - [zz-amount]                -> transfer card
 * - [bqb-sticker name]         -> sticker badge
 * - inline <img src="...">     -> image
 * - raw URL ending with audio suffix (.mp3/.wav/.ogg/.m4a) -> audio
 *
 * Fallback: plain text.
 */

const TOKEN_PATTERN = /^\[(img|yy|music|zz|bqb)-([\s\S]+)\]$/i;

export function parseSpecialMessage(raw = '') {
    const text = (raw || '').trim();
    // If HTML-like img tag exists, treat as image content
    if (/<img\s+[^>]*src=/.test(text)) {
        const src = (text.match(/src=["']([^"']+)["']/) || [])[1];
        if (src) return { type: 'image', content: src };
    }
    // Detect raw audio URL
    if (/https?:\/\/\S+\.(mp3|wav|ogg|m4a)/i.test(text)) {
        const matchAudio = text.match(/https?:\/\/\S+/i);
        if (matchAudio) {
            return { type: 'audio', content: matchAudio[0] };
        }
    }
    // If text looks like pure URL ending with common image/video
    if (/https?:\/\/\S+\.(png|jpe?g|webp|gif|mp4)/i.test(text)) {
        const matchUrl = text.match(/https?:\/\/\S+/i);
        if (matchUrl) {
            return { type: 'image', content: matchUrl[0] };
        }
    }
    const match = text.match(TOKEN_PATTERN);
    if (!match) {
        return { type: 'text', content: raw };
    }

    const type = match[1].toLowerCase();
    const payload = match[2].trim();

    switch (type) {
        case 'img': {
            // If payload looks like a URL, treat as image URL; otherwise show text.
            const isUrl = /^https?:\/\//i.test(payload) || payload.startsWith('./') || payload.startsWith('/assets');
            if (isUrl) {
                return { type: 'image', content: payload };
            }
            return { type: 'meta', content: `图片：${payload}` };
        }
        case 'yy': {
            // Placeholder: audio URL if present, otherwise show text.
            const isUrl = /^https?:\/\//i.test(payload) || payload.endsWith('.mp3') || payload.endsWith('.wav');
            if (isUrl) {
                return { type: 'audio', content: payload };
            }
            return { type: 'meta', content: `语音：${payload}` };
        }
        case 'music': {
            const [title = payload, artist = ''] = payload.split('$');
            return { type: 'music', content: title.trim(), meta: { artist: artist.trim() } };
        }
        case 'zz': {
            return { type: 'transfer', content: payload };
        }
        case 'bqb': {
            return { type: 'sticker', content: payload };
        }
        default:
            return { type: 'text', content: raw };
    }
}
