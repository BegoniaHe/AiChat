#!/usr/bin/env node

/**
 * 路径修复脚本 - 将外部 URL 和绝对路径转换为相对路径
 */

import fs from 'fs';
import path from 'path';

console.log('🔧 开始修复资源路径...\n');

/**
 * 修复 CSS 文件中的路径
 */
function fixCSSPaths(content) {
    let fixed = content;

    // 移除外部 CDN URL
    fixed = fixed.replace(/url\(['"]?https?:\/\/[^'")\s]+['"]?\)/gi, match => {
        console.log(`   ⚠️  移除外部 URL: ${match}`);
        return 'url()';
    });

    // 修复绝对路径为相对路径
    fixed = fixed.replace(/url\(['"]?\/assets\//gi, "url('./assets/");

    // 修复 file:// 协议
    fixed = fixed.replace(/url\(['"]?file:\/\/[^'")\s]+['"]?\)/gi, match => {
        console.log(`   ⚠️  移除 file:// 路径: ${match}`);
        return 'url()';
    });

    return fixed;
}

/**
 * 修复 JS 文件中的路径
 */
function fixJSPaths(content) {
    let fixed = content;

    // 修复图片路径（非 API 的 http/https）
    fixed = fixed.replace(/['"]https?:\/\/(?!api\.)[^'"]+\.(jpg|png|gif|webp|svg)['"]/gi, match => {
        console.log(`   ⚠️  替换外部图片: ${match}`);
        return "'./assets/images/placeholder.jpg'";
    });

    return fixed;
}

/**
 * 处理文件
 */
function processFile(filePath, processor) {
    if (!fs.existsSync(filePath)) {
        console.log(`   ⏭️  跳过（文件不存在）: ${filePath}`);
        return;
    }

    try {
        let content = fs.readFileSync(filePath, 'utf8');
        const processed = processor(content);

        if (content !== processed) {
            fs.writeFileSync(filePath, processed, 'utf8');
            console.log(`   ✅ 已修复: ${filePath}`);
        } else {
            console.log(`   ✨ 无需修复: ${filePath}`);
        }
    } catch (error) {
        console.error(`   ❌ 处理失败: ${filePath}`, error.message);
    }
}

// 处理 CSS 文件
console.log('📄 处理 CSS 文件:');
const cssFiles = [
    'src/assets/css/main.css',
    'src/assets/css/result.css'
];

cssFiles.forEach(file => processFile(file, fixCSSPaths));

// 处理 JS 文件
console.log('\n📄 处理 JS 文件:');
const jsFiles = [
    'src/scripts/main.js'
];

jsFiles.forEach(file => processFile(file, fixJSPaths));

console.log('\n✅ 路径修复完成！');
