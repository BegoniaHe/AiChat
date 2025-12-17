/**
 * 宏处理引擎 (Macro Engine)
 * 兼容 SillyTavern 部分常用宏指令，用于在发送 Prompt 前处理变量和逻辑
 */

import { logger } from './logger.js';

export class MacroEngine {
    constructor(chatStore) {
        this.chatStore = chatStore;
    }

    normalizeMacroValue(value) {
        if (value === null || value === undefined) return '';
        if (typeof value === 'string') return value;
        if (typeof value === 'number') return String(value);
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        // Support { name: '...' } pattern (user/char objects)
        if (typeof value === 'object' && typeof value.name === 'string') return value.name;
        return '';
    }

    /**
     * 处理文本中的宏
     * @param {string} text - 原始文本
     * @param {object} context - 上下文 { sessionId, user, char, ... }
     * @returns {string} 处理后的文本
     */
    process(text, context = {}) {
        if (!text || typeof text !== 'string') return '';
        if (!text.includes('{{')) return text; // 快速返回

        let output = text;
        const maxPasses = 5; // 防止死循环
        let pass = 0;

        const baseVars = {};
        // 基础变量（兼容 ST 常用 {{user}} / {{char}}）
        baseVars.user = this.normalizeMacroValue(context.user) || 'User';
        baseVars.char = this.normalizeMacroValue(context.char) || 'Assistant';

        // 允许直接传入其它简单变量：processTextMacros(text, { scenario: '...', personality: '...' })
        // （避免必须塞到 extraMacros 才能替换）
        try {
            for (const [k, v] of Object.entries(context || {})) {
                if (!k || k === 'sessionId' || k === 'user' || k === 'char' || k === 'extraMacros') continue;
                const normalized = this.normalizeMacroValue(v);
                if (normalized !== '') baseVars[k] = normalized;
            }
        } catch {}

        // 兼容旧调用：context.extraMacros
        if (context?.extraMacros && typeof context.extraMacros === 'object') {
            for (const [k, v] of Object.entries(context.extraMacros)) {
                if (!k) continue;
                const normalized = this.normalizeMacroValue(v);
                if (normalized !== '') baseVars[k] = normalized;
            }
        }

        // 匹配 {{...}}
        const macroRegex = /\{\{(.*?)\}\}/g;

        while (pass < maxPasses) {
            let hasMatch = false;
            let replacedInThisPass = false;

            output = output.replace(macroRegex, (match, content) => {
                hasMatch = true;
                const trimmed = content.trim();

                // 1. 优先匹配基础变量 (e.g. {{user}})
                if (baseVars.hasOwnProperty(trimmed)) {
                    replacedInThisPass = true;
                    return baseVars[trimmed];
                }

                // 2. 解析指令 {{cmd::arg1::arg2}}
                const parts = trimmed.split('::');
                const cmd = parts[0].toLowerCase();
                const args = parts.slice(1);

                // 如果没有参数且不是基础变量，可能是尚未定义的变量或者无效格式
                if (parts.length === 1 && !baseVars.hasOwnProperty(trimmed)) {
                    // 尝试作为 getvar 简写？ST 不支持 {{myVar}} 直接获取，必须 {{getvar::myVar}}
                    // 但为了方便，如果不是命令，我们可以保留原样
                    return match;
                }

                try {
                    const result = this.executeCommand(cmd, args, context);
                    if (result !== null) {
                        replacedInThisPass = true;
                        return result;
                    }
                } catch (err) {
                    logger.warn(`Macro exec failed: ${cmd}`, err);
                }
                
                // 无法处理或指令返回 null (表示不处理)，保持原样
                return match;
            });

            if (!hasMatch || !replacedInThisPass) break;
            pass++;
        }

        return output;
    }

    executeCommand(cmd, args, context) {
        const sessionId = context.sessionId || 'default';

        switch (cmd) {
            // --- 变量操作 ---
            case 'setvar': {
                // {{setvar::key::value}}
                if (args.length < 2) return '';
                const key = args[0];
                // 重新组合剩余部分，防止 value 内部还有 ::
                const val = args.slice(1).join('::'); 
                this.chatStore.setVariable(key, val, sessionId);
                return ''; // setvar 消耗掉标签，输出为空
            }
            case 'getvar': {
                // {{getvar::key::default}}
                const key = args[0];
                const def = args[1] || '';
                const val = this.chatStore.getVariable(key, sessionId);
                return (val !== undefined && val !== null) ? val : def;
            }
            case 'incvar': {
                // {{incvar::key::amount}}
                const key = args[0];
                const amt = Number(args[1]) || 1;
                let val = Number(this.chatStore.getVariable(key, sessionId)) || 0;
                val += amt;
                this.chatStore.setVariable(key, val, sessionId);
                return '';
            }
            case 'decvar': {
                // {{decvar::key::amount}}
                const key = args[0];
                const amt = Number(args[1]) || 1;
                let val = Number(this.chatStore.getVariable(key, sessionId)) || 0;
                val -= amt;
                this.chatStore.setVariable(key, val, sessionId);
                return '';
            }

            // --- 随机/工具 ---
            case 'random': {
                // {{random::A::B::C}}
                if (args.length === 0) return '';
                const idx = Math.floor(Math.random() * args.length);
                return args[idx];
            }
            case 'dice': {
                // {{dice::1d20}}
                const match = (args[0] || '').match(/^(\d+)d(\d+)$/i);
                if (!match) return args[0] || '';
                const count = parseInt(match[1]);
                const sides = parseInt(match[2]);
                let total = 0;
                for (let i = 0; i < count; i++) {
                    total += Math.floor(Math.random() * sides) + 1;
                }
                return String(total);
            }
            case 'time':
                return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            case 'date':
                return new Date().toLocaleDateString();
            
            // --- 逻辑控制 (简易版) ---
            case 'ifvar': {
                // {{ifvar::key::value::then::else}}
                if (args.length < 3) return '';
                const key = args[0];
                const checkVal = args[1];
                const thenVal = args[2] || '';
                const elseVal = args[3] || '';
                const current = String(this.chatStore.getVariable(key, sessionId) || '');
                return current === checkVal ? thenVal : elseVal;
            }

            default:
                // 返回 null 表示此指令不是 macro 引擎处理的（或者拼写错误），保持原样
                return null;
        }
    }
}
