/**
 * Extract external asset URLs from the legacy 手机流式.html for localization.
 * Usage (from repo root):
 *   node scripts/utils/extract-assets.js
 *
 * Outputs:
 *   asset-manifest.json  // sorted unique URLs
 *   asset-summary.txt    // domain summary
 */

import fs from 'fs';
import path from 'path';

const legacyPath = path.resolve(process.cwd(), '..', '手机流式.html');
const outputJson = path.resolve(process.cwd(), 'asset-manifest.json');
const outputSummary = path.resolve(process.cwd(), 'asset-summary.txt');

function extractUrls(text) {
    const regex = /https?:\/\/[^\s"'()<>]+/g;
    const urls = new Set();
    for (const match of text.matchAll(regex)) {
        const url = match[0]
            .replace(/&amp;/g, '&')
            .replace(/\\r\\n/g, '\n')
            .trim();
        // Skip obvious schema refs
        if (url.includes('w3.org')) continue;
        urls.add(url);
    }
    return Array.from(urls);
}

function summarize(urls) {
    const map = new Map();
    urls.forEach((u) => {
        try {
            const d = new URL(u).hostname;
            map.set(d, (map.get(d) || 0) + 1);
        } catch {
            // ignore
        }
    });
    return Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([host, count]) => `${host}: ${count}`);
}

function main() {
    if (!fs.existsSync(legacyPath)) {
        console.error(`Legacy file not found: ${legacyPath}`);
        process.exit(1);
    }
    const html = fs.readFileSync(legacyPath, 'utf-8');
    const urls = extractUrls(html).sort();

    fs.writeFileSync(outputJson, JSON.stringify({ generatedAt: new Date().toISOString(), urls }, null, 2));
    fs.writeFileSync(outputSummary, summarize(urls).join('\n'), 'utf-8');

    console.log(`Extracted ${urls.length} unique URLs`);
    console.log(`- ${outputJson}`);
    console.log(`- ${outputSummary}`);
}

main();
