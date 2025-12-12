/**
 * Slash command runner (basic placeholders)
 */

import { logger } from '../utils/logger.js';

const COMMANDS = {
  '/clear': {
    desc: '清空當前會話',
    run: async ({ chatStore, ui }) => {
      const id = chatStore.getCurrent();
      chatStore.clear(id);
      ui.clearMessages();
      ui.setInputText('');
      window.toastr?.success(`已清空會話：${id}`);
    }
  },
  '/session': {
    desc: '顯示會話面板',
    run: async ({ sessionPanel }) => sessionPanel.show()
  },
  '/world': {
    desc: '顯示世界書面板',
    run: async ({ worldPanel }) => worldPanel.show()
  },
  '/worldset': {
    desc: '/worldset <id> 設置當前會話的世界書',
    run: async ({ appBridge }, args) => {
      const id = args[1];
      if (!id) {
        window.toastr?.warning('請提供世界書 ID');
        return;
      }
      appBridge.setCurrentWorld(id);
      window.toastr?.success(`已切換世界書：${id}`);
    }
  },
  '/worldlist': {
    desc: '列出已存世界書 ID',
    run: async ({ appBridge }) => {
      const names = appBridge.listWorlds();
      if (!names || !names.length) {
        window.toastr?.info('暫無世界書');
        return;
      }
      alert('世界書列表:\n' + names.join('\n'));
    }
  },
  '/exportworld': {
    desc: '導出當前世界書 JSON 到剪貼簿',
    run: async ({ appBridge }) => {
      const id = appBridge.currentWorldId;
      if (!id) {
        window.toastr?.warning('尚未選擇世界書');
        return;
      }
      const data = await appBridge.getWorldInfo(id);
      await navigator.clipboard?.writeText(JSON.stringify(data || {}, null, 2));
      window.toastr?.success(`已複製世界書：${id}`);
    }
  },
  '/export': {
    desc: '導出當前會話 JSON 到剪貼簿',
    run: async ({ chatStore }) => {
      const id = chatStore.getCurrent();
      const data = chatStore.getMessages(id);
      await navigator.clipboard?.writeText(JSON.stringify(data, null, 2));
      window.toastr?.success('已複製當前會話 JSON');
    }
  },
  '/rename': {
    desc: '/rename 新ID 重命名當前會話',
    run: async ({ chatStore, ui }, args) => {
      const newId = args[1];
      if (!newId) {
        window.toastr?.warning('請提供新 ID，例如 /rename mychat');
        return;
      }
      const old = chatStore.getCurrent();
      if (chatStore.listSessions().includes(newId)) {
        window.toastr?.warning('ID 已存在');
        return;
      }
      chatStore.rename(old, newId);
      ui.setSessionLabel(newId);
      window.dispatchEvent(new CustomEvent('session-changed', { detail: { id: newId } }));
      window.toastr?.success(`會話已重命名為 ${newId}`);
    }
  },
  '/help': {
    desc: '列出可用命令',
    run: async () => {
      const list = Object.entries(COMMANDS).map(([k, v]) => `${k} - ${v.desc || ''}`).join('\n');
      alert(`可用命令：\n${list}`);
    }
  }
};

export function runCommand(input, ctx) {
  const text = (input || '').trim();
  const parts = text.split(/\s+/);
  const cmdKey = parts[0];
  const cmd = COMMANDS[cmdKey];
  if (!cmd) return false;
  const handler = COMMANDS[cmdKey];
  try {
    handler.run(ctx, parts);
  } catch (err) {
    logger.error('命令執行失敗', err);
    window.toastr?.error('命令執行失敗');
  }
  return true;
}

export function registerCommand(key, desc, runner) {
  COMMANDS[key] = { desc, run: runner };
}
