/**
 * Download external assets listed in asset-manifest.json into src/assets/external.
 *
 * Usage (from repo root):
 *   node scripts/utils/download-assets.js
 *
 * Notes:
 * - Requires network access; HTTP-only sources may fail on Android, so prefer HTTPS.
 * - Skips data already present by filename.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const manifestPath = path.resolve(__dirname, '..', '..', 'asset-manifest.json');
const outputDir = path.resolve(__dirname, '..', '..', 'src', 'assets', 'external');

async function download(url, dest) {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Request failed ${res.status} ${res.statusText}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    await fs.promises.writeFile(dest, Buffer.from(arrayBuffer));
}

function safeFilename(url) {
    try {
        const u = new URL(url);
        const clean = u.pathname.split('/').filter(Boolean).join('-') || 'file';
        return `${u.hostname}-${clean}`.replace(/[^a-zA-Z0-9._-]+/g, '_');
    } catch {
        return url.replace(/[^a-zA-Z0-9._-]+/g, '_');
    }
}

async function main() {
    if (!fs.existsSync(manifestPath)) {
        console.error('asset-manifest.json not found, run extract-assets first.');
        process.exit(1);
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const urls = manifest.urls || [];
    if (!urls.length) {
        console.log('No URLs to download.');
        return;
    }

    await fs.promises.mkdir(outputDir, { recursive: true });

    for (const url of urls) {
        const filename = safeFilename(url);
        const dest = path.join(outputDir, filename);
        if (fs.existsSync(dest)) {
            console.log(`Skip (exists): ${filename}`);
            continue;
        }
        try {
            console.log(`Downloading: ${url}`);
            await download(url, dest);
        } catch (err) {
            console.warn(`Failed: ${url} -> ${err.message}`);
        }
    }

    console.log('Done. Output dir:', outputDir);
}

main();
