/**
 * 宏处理引擎 (Macro Engine)
 * 迁移自: src/scripts/utils/macro-engine.js
 * 兼容 SillyTavern 部分常用宏指令
 */

import { logger } from './logger.js';

export class MacroEngine {
  constructor(chatStore) {
    this.chatStore = chatStore;
  }

  normalizeSeparators(text) {
    return String(text || '').replace(/：：/g, '::');
  }

  normalizeMacroValue(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'object' && typeof value.name === 'string') return value.name;
    return '';
  }

  getSessionId(context) {
    return String(context?.sessionId || 'default').trim() || 'default';
  }

  getLastByRole(role, sessionId) {
    try {
      const msgs = this.chatStore?.getMessages?.(sessionId) || [];
      for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i];
        if (!m) continue;
        if (String(m.role || '') !== role) continue;
        const raw =
          typeof m.raw === 'string' && m.raw
            ? m.raw
            : typeof m.content === 'string'
              ? m.content
              : '';
        return String(raw || '');
      }
    } catch {}
    return '';
  }

  getLastIdByRole(role, sessionId) {
    try {
      const msgs = this.chatStore?.getMessages?.(sessionId) || [];
      for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i];
        if (!m) continue;
        if (role && String(m.role || '') !== role) continue;
        const id = m && typeof m.id === 'string' ? m.id : '';
        if (id) return id;
      }
    } catch {}
    return '';
  }

  getLastMessage(sessionId) {
    try {
      const msgs = this.chatStore?.getMessages?.(sessionId) || [];
      for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i];
        if (!m) continue;
        const raw =
          typeof m.raw === 'string' && m.raw
            ? m.raw
            : typeof m.content === 'string'
              ? m.content
              : '';
        if (raw) return String(raw);
      }
    } catch {}
    return '';
  }

  formatIsoDate(d = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  formatIsoTime(d = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  applyVariableMacros(text, context) {
    const sessionId = this.getSessionId(context);
    let out = String(text || '');

    out = out.replace(/{{setvar::([^:}]+)::([^}]*)}}/gi, (_m, name, value) => {
      const key = String(name || '').trim();
      if (key) this.chatStore?.setVariable?.(key, String(value ?? ''), sessionId);
      return '';
    });
    out = out.replace(/{{addvar::([^:}]+)::([^}]*)}}/gi, (_m, name, value) => {
      const key = String(name || '').trim();
      if (!key) return '';
      const curRaw = this.chatStore?.getVariable?.(key, sessionId);
      const curNum = Number(curRaw);
      const addNum = Number(value);
      const next =
        Number.isFinite(curNum) && Number.isFinite(addNum)
          ? String(curNum + addNum)
          : `${String(curRaw ?? '')}${String(value ?? '')}`;
      this.chatStore?.setVariable?.(key, next, sessionId);
      return '';
    });
    out = out.replace(/{{incvar::([^}]+)}}/gi, (_m, name) => {
      const key = String(name || '').trim();
      const cur = Number(this.chatStore?.getVariable?.(key, sessionId));
      const next = (Number.isFinite(cur) ? cur : 0) + 1;
      this.chatStore?.setVariable?.(key, String(next), sessionId);
      return String(next);
    });
    out = out.replace(/{{decvar::([^}]+)}}/gi, (_m, name) => {
      const key = String(name || '').trim();
      const cur = Number(this.chatStore?.getVariable?.(key, sessionId));
      const next = (Number.isFinite(cur) ? cur : 0) - 1;
      this.chatStore?.setVariable?.(key, String(next), sessionId);
      return String(next);
    });
    out = out.replace(/{{getvar::([^}]+)}}/gi, (_m, name) => {
      const key = String(name || '').trim();
      const val = this.chatStore?.getVariable?.(key, sessionId);
      return val === undefined || val === null ? '' : String(val);
    });

    return out;
  }

  applyBuiltInMacros(text, context, baseVars) {
    const sessionId = this.getSessionId(context);
    let out = String(text || '');
    const user = String(baseVars?.user || 'User');
    const char = String(baseVars?.char || 'Assistant');
    const overrideLastUserMessage = (() => {
      const v = context?.lastUserMessage;
      const s = typeof v === 'string' ? v : '';
      return s.trim() ? s : '';
    })();

    out = out.replace(/<USER>/gi, user);
    out = out.replace(/<CHARIFNOTGROUP>/gi, baseVars?.group ? String(baseVars.group) : char);
    out = out.replace(/<GROUP>/gi, baseVars?.group ? String(baseVars.group) : '');
    out = out.replace(/<BOT>/gi, char);
    out = out.replace(/<CHAR>/gi, char);
    out = out.replace(/<user>/gi, user);
    out = out.replace(/<char>/gi, char);
    out = out.replace(/<bot>/gi, char);

    out = out.replace(/{{newline}}/gi, '\n');
    out = out.replace(/(?:\r?\n)*{{trim}}(?:\r?\n)*/gi, '');
    out = out.replace(/{{noop}}/gi, '');
    out = out.replace(/\{\{\/\/([\s\S]*?)\}\}/gm, '');

    out = out.replace(/{{lastMessage}}/gi, () => this.getLastMessage(sessionId));
    out = out.replace(/{{lastMessageId}}/gi, () => this.getLastIdByRole('', sessionId));
    const lastUser = () => overrideLastUserMessage || this.getLastByRole('user', sessionId);
    out = out.replace(/{{lastUserMessage}}/gi, lastUser);
    out = out.replace(/{{userLastMessage}}/gi, lastUser);
    out = out.replace(/{{user_last_message}}/gi, lastUser);
    out = out.replace(/{{lastCharMessage}}/gi, () => this.getLastByRole('assistant', sessionId));
    out = out.replace(/{{lastUserMessageId}}/gi, () => this.getLastIdByRole('user', sessionId));
    out = out.replace(/{{lastCharMessageId}}/gi, () =>
      this.getLastIdByRole('assistant', sessionId)
    );

    out = out.replace(/{{time}}/gi, () =>
      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
    out = out.replace(/{{date}}/gi, () => new Date().toLocaleDateString());
    out = out.replace(/{{weekday}}/gi, () =>
      new Date().toLocaleDateString(undefined, { weekday: 'long' })
    );
    out = out.replace(/{{isotime}}/gi, () => this.formatIsoTime(new Date()));
    out = out.replace(/{{isodate}}/gi, () => this.formatIsoDate(new Date()));

    out = out.replace(/{{reverse:(.+?)}}/gi, (_m, str) =>
      Array.from(String(str ?? ''))
        .reverse()
        .join('')
    );

    return out;
  }

  /**
   * 处理文本中的宏
   */
  process(text, context = {}) {
    if (!text || typeof text !== 'string') return '';
    if (!text.includes('{{') && !text.includes('<')) return text;

    let output = text;
    const maxPasses = 5;
    let pass = 0;

    output = this.normalizeSeparators(output);

    const baseVars = {};
    baseVars.user = this.normalizeMacroValue(context.user) || 'User';
    baseVars.char = this.normalizeMacroValue(context.char) || 'Assistant';

    try {
      for (const [k, v] of Object.entries(context || {})) {
        if (!k || k === 'sessionId' || k === 'user' || k === 'char' || k === 'extraMacros')
          continue;
        const normalized = this.normalizeMacroValue(v);
        if (normalized !== '') baseVars[k] = normalized;
      }
    } catch {}

    if (context?.extraMacros && typeof context.extraMacros === 'object') {
      for (const [k, v] of Object.entries(context.extraMacros)) {
        if (!k) continue;
        const normalized = this.normalizeMacroValue(v);
        if (normalized !== '') baseVars[k] = normalized;
      }
    }

    const baseVarsLower = Object.create(null);
    try {
      for (const [k, v] of Object.entries(baseVars)) {
        if (!k) continue;
        baseVarsLower[String(k).toLowerCase()] = v;
      }
    } catch {}

    const macroRegex = /\{\{(.*?)\}\}/g;

    while (pass < maxPasses) {
      let hasMatch = false;
      let replacedInThisPass = false;

      const before = output;
      output = this.applyBuiltInMacros(output, context, baseVars);
      output = this.applyVariableMacros(output, context);
      if (output !== before) replacedInThisPass = true;

      output = output.replace(macroRegex, (match, content) => {
        hasMatch = true;
        const trimmed = this.normalizeSeparators(content).trim();
        const trimmedLower = trimmed.toLowerCase();

        if (Object.prototype.hasOwnProperty.call(baseVars, trimmed)) {
          replacedInThisPass = true;
          return baseVars[trimmed];
        }
        if (Object.prototype.hasOwnProperty.call(baseVarsLower, trimmedLower)) {
          replacedInThisPass = true;
          return baseVarsLower[trimmedLower];
        }

        const parts = trimmed.split(/::/);
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1);

        if (
          parts.length === 1 &&
          !Object.prototype.hasOwnProperty.call(baseVars, trimmed) &&
          !Object.prototype.hasOwnProperty.call(baseVarsLower, trimmedLower)
        ) {
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
      case 'setvar': {
        if (args.length < 2) return '';
        const key = args[0];
        const val = args.slice(1).join('::');
        this.chatStore?.setVariable?.(key, val, sessionId);
        return '';
      }
      case 'getvar': {
        const key = args[0];
        const def = args[1] || '';
        const val = this.chatStore?.getVariable?.(key, sessionId);
        return val !== undefined && val !== null ? val : def;
      }
      case 'addvar': {
        if (args.length < 2) return '';
        const key = args[0];
        const addRaw = args.slice(1).join('::');
        const curRaw = this.chatStore?.getVariable?.(key, sessionId);
        const curNum = Number(curRaw);
        const addNum = Number(addRaw);
        const next =
          Number.isFinite(curNum) && Number.isFinite(addNum)
            ? String(curNum + addNum)
            : `${String(curRaw ?? '')}${String(addRaw ?? '')}`;
        this.chatStore?.setVariable?.(key, next, sessionId);
        return '';
      }
      case 'incvar': {
        const key = args[0];
        const amt = Number(args[1]) || 1;
        let val = Number(this.chatStore?.getVariable?.(key, sessionId)) || 0;
        val += amt;
        this.chatStore?.setVariable?.(key, val, sessionId);
        return '';
      }
      case 'decvar': {
        const key = args[0];
        const amt = Number(args[1]) || 1;
        let val = Number(this.chatStore?.getVariable?.(key, sessionId)) || 0;
        val -= amt;
        this.chatStore?.setVariable?.(key, val, sessionId);
        return '';
      }
      case 'random': {
        if (args.length === 0) return '';
        const idx = Math.floor(Math.random() * args.length);
        return args[idx];
      }
      case 'dice': {
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
      case 'ifvar': {
        if (args.length < 3) return '';
        const key = args[0];
        const checkVal = args[1];
        const thenVal = args[2] || '';
        const elseVal = args[3] || '';
        const current = String(this.chatStore?.getVariable?.(key, sessionId) || '');
        return current === checkVal ? thenVal : elseVal;
      }
      default:
        return null;
    }
  }
}
