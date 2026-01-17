/**
 * Image helpers
 * - Compress avatar images to avoid localStorage quota errors
 * - Preserve GIF (keep animation)
 */

const readFileAsDataUrl = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('read file failed'));
        reader.readAsDataURL(file);
    });
};

const loadImage = (dataUrl) => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('load image failed'));
        img.src = dataUrl;
    });
};

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const canvasToDataUrl = (canvas, { mime, quality }) => {
    try {
        const out = canvas.toDataURL(mime, quality);
        if (typeof out === 'string' && out.startsWith('data:')) return out;
    } catch {}
    try {
        const out = canvas.toDataURL('image/jpeg', quality);
        if (typeof out === 'string' && out.startsWith('data:')) return out;
    } catch {}
    try {
        const out = canvas.toDataURL();
        if (typeof out === 'string' && out.startsWith('data:')) return out;
    } catch {}
    return '';
};

export const isGifFile = (file) => {
    const type = String(file?.type || '').toLowerCase();
    if (type === 'image/gif') return true;
    const name = String(file?.name || '').toLowerCase();
    return name.endsWith('.gif');
};

/**
 * Convert an image File into a compressed dataURL (avatars).
 * - GIF is preserved (no canvas conversion), to keep animation.
 */
export const avatarDataUrlFromFile = async (file, opts = {}) => {
    const maxDim = Number.isFinite(opts.maxDim) ? opts.maxDim : 256;
    const quality = Number.isFinite(opts.quality) ? opts.quality : 0.84;
    const targetMime = String(opts.mime || 'image/webp');
    const maxBytes = Number.isFinite(opts.maxBytes) ? opts.maxBytes : 400_000; // ~400KB

    if (!file) return '';
    if (isGifFile(file)) {
        // Keep GIF animation (can be large; persistence should rely on save_kv)
        return await readFileAsDataUrl(file);
    }

    const original = await readFileAsDataUrl(file);
    const img = await loadImage(original);

    const w0 = img.naturalWidth || img.width || 1;
    const h0 = img.naturalHeight || img.height || 1;
    const scale = Math.min(1, maxDim / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return original;
    ctx.drawImage(img, 0, 0, w, h);

    // Try a few passes to keep size under maxBytes
    let q = quality;
    let out = canvasToDataUrl(canvas, { mime: targetMime, quality: q }) || original;
    for (let i = 0; i < 4; i++) {
        const approxBytes = Math.ceil((out.length * 3) / 4); // base64 rough
        if (approxBytes <= maxBytes) break;
        q = clamp(q - 0.12, 0.45, 0.92);
        out = canvasToDataUrl(canvas, { mime: targetMime, quality: q }) || out;
    }

    return out || original;
};

/**
 * Compress a data URL image for chat attachments.
 * - Keeps GIF animation (no canvas conversion).
 */
export const compressImageDataUrl = async (dataUrl, opts = {}) => {
    const raw = String(dataUrl || '').trim();
    if (!raw.startsWith('data:image/')) return raw;
    if (raw.startsWith('data:image/gif')) return raw;

    const maxDim = Number.isFinite(opts.maxDim) ? opts.maxDim : 1280;
    const quality = Number.isFinite(opts.quality) ? opts.quality : 0.82;
    const targetMime = String(opts.mime || 'image/jpeg');
    const maxBytes = Number.isFinite(opts.maxBytes) ? opts.maxBytes : 1_200_000;

    const img = await loadImage(raw);
    const w0 = img.naturalWidth || img.width || 1;
    const h0 = img.naturalHeight || img.height || 1;
    const scale = Math.min(1, maxDim / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return raw;
    ctx.drawImage(img, 0, 0, w, h);

    let q = quality;
    let out = canvasToDataUrl(canvas, { mime: targetMime, quality: q }) || raw;
    for (let i = 0; i < 5; i++) {
        const approxBytes = Math.ceil((out.length * 3) / 4);
        if (approxBytes <= maxBytes) break;
        q = clamp(q - 0.12, 0.4, 0.92);
        out = canvasToDataUrl(canvas, { mime: targetMime, quality: q }) || out;
    }

    return out || raw;
};
