<script>
  /**
   * SessionPanel.svelte - 会话管理面板
   * 迁移自: src/scripts/ui/session-panel.js
   */
  import { chatStore, contactsStore } from '$stores';
  import { logger } from '$utils';
  import { tryInvoke } from '$utils/tauri.js';
  import Avatar from '../Avatar.svelte';
  import Modal from '../Modal.svelte';
  import ContactListItem from './ContactListItem.svelte';
  import { buildContactDisplayInfo, validateContactName } from './session-types.js';

  /**
   * @typedef {Object} Props
   * @property {boolean} [open=false] - 是否打开
   * @property {boolean} [focusAdd=false] - 是否聚焦到添加输入框
   * @property {() => void} [onClose] - 关闭回调
   * @property {() => void} [onUpdated] - 更新回调
   */

  /** @type {Props} */
  let { open = $bindable(false), focusAdd = false, onClose, onUpdated } = $props();

  // 本地状态
  let newName = $state('');
  let newAvatar = $state('');
  let nameInput;
  let fileInput;

  // 派生数据
  const contacts = $derived(contactsStore.list || []);
  const currentId = $derived(chatStore.currentSessionId || '');

  // 联系人显示列表
  const displayList = $derived.by(() => {
    return contacts.map((c) =>
      buildContactDisplayInfo(c, {
        currentId,
        getLastMessage: (id) => {
          // 简化：从 chatStore 获取最后消息
          const session = Object.values(chatStore.sessions).find((s) => s.contactId === id);
          const messages = session?.messages || [];
          return messages[messages.length - 1] || null;
        },
        getUnreadCount: (id) => contactsStore.get(id)?.unreadCount || 0,
      })
    );
  });

  // 自动聚焦
  $effect(() => {
    if (open && focusAdd) {
      setTimeout(() => nameInput?.focus(), 100);
    }
  });

  // 切换会话
  function switchTo(id) {
    chatStore.getOrCreateSession(id);
    window.dispatchEvent(new CustomEvent('session-changed', { detail: { id } }));
    open = false;
    logger.info('Switched session', id);
    onClose?.();
  }

  // 改名
  function rename(id) {
    const currentName = contactsStore.get(id)?.name || id;
    const next = prompt('输入新好友名称（同时作为聊天室 ID）', currentName);
    if (!next || next === id) return;

    const validation = validateContactName(next, (name) => {
      return (
        Boolean(contactsStore.get(name)) ||
        Object.values(chatStore.sessions).some((s) => s.contactId === name)
      );
    });

    if (!validation.valid) {
      window.toastr?.warning(validation.error);
      return;
    }

    const nextId = next.trim();

    // 迁移世界书映射（如果有）
    try {
      const map = window.appBridge?.worldSessionMap;
      if (map && map[id]) {
        map[nextId] = map[id];
        delete map[id];
        window.appBridge?.persistWorldSessionMap?.();
      }
    } catch (err) {
      logger.warn('迁移世界书映射失败', err);
    }

    // 迁移联系人记录
    const existing = contactsStore.get(id);
    if (existing) {
      contactsStore.remove(id);
      contactsStore.add({ ...existing, id: nextId, name: nextId });
    }

    // 迁移聊天记录 - 需要在 chatStore 实现 rename
    // chatStore.rename(id, nextId);

    switchTo(nextId);
    onUpdated?.();
  }

  // 删除
  async function remove(id) {
    const name = contactsStore.get(id)?.name || id;
    if (!confirm(`確認删除：${name}？此操作会删除聊天室与好友记录（不可恢复）。`)) return;

    // 清理壁纸（如果有）
    try {
      const session = Object.values(chatStore.sessions).find((s) => s.contactId === id);
      const path = session?.settings?.wallpaper?.path || '';
      if (path) {
        await tryInvoke('delete_wallpaper', {
          sessionId: id,
          path,
        }).catch((err) => {
          logger.warn('删除联系人时清理壁纸失败', err);
        });
      }
    } catch (err) {
      logger.warn('删除联系人时读取壁纸失败', err);
    }

    // 清理世界书映射
    try {
      const map = window.appBridge?.worldSessionMap;
      if (map && map[id]) {
        delete map[id];
        window.appBridge?.persistWorldSessionMap?.();
      }
    } catch (err) {
      logger.warn('清理世界书映射失败', err);
    }

    // 删除会话
    const session = Object.values(chatStore.sessions).find((s) => s.contactId === id);
    if (session) {
      chatStore.deleteSession(session.id);
    }

    // 删除联系人
    contactsStore.remove(id);

    // 切换到其他会话
    const remaining = contactsStore.list;
    if (remaining.length > 0) {
      switchTo(remaining[0].id);
    }

    onUpdated?.();
  }

  // 添加新好友
  function addSession() {
    const validation = validateContactName(newName, (name) => {
      return Boolean(contactsStore.get(name));
    });

    if (!validation.valid) {
      window.toastr?.warning(validation.error);
      return;
    }

    const name = newName.trim();

    // 创建联系人
    contactsStore.add({
      id: name,
      name,
      avatar: newAvatar || '',
      isGroup: false,
      addedAt: Date.now(),
    });

    // 创建/切换会话
    chatStore.getOrCreateSession(name);
    window.appBridge?.setActiveSession?.(name);

    // 重置表单
    newName = '';
    newAvatar = '';

    switchTo(name);
    onUpdated?.();
  }

  // 清空当前会话
  function clearCurrent() {
    const id = currentId;
    if (!id) return;
    if (!confirm(`清空当前会话：${id}？此操作不可恢复。`)) return;

    chatStore.clearSession(id);
    onUpdated?.();
  }

  // 选择头像
  function pickAvatar() {
    fileInput?.click();
  }

  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // 读取文件为 DataURL
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      newAvatar = dataUrl;
    } catch (err) {
      logger.warn('读取头像失败', err);
      window.toastr?.error?.('读取头像失败');
    }
  }

  function handleClose() {
    open = false;
    onClose?.();
  }
</script>

<Modal {open} onClose={handleClose} title="好友列表" maxWidth="460px" maxHeight="80vh">
  <div class="session-panel">
    <!-- 添加区域 -->
    <div class="add-section">
      <button class="avatar-btn" onclick={pickAvatar} title="设置好友头像">
        <Avatar
          src={newAvatar}
          alt="新好友头像"
          size={40}
          fallback="./assets/external/feather-default.png"
        />
      </button>
      <input
        bind:this={nameInput}
        type="text"
        placeholder="新好友名称"
        bind:value={newName}
        onkeydown={(e) => e.key === 'Enter' && addSession()}
      />
      <button class="add-btn" onclick={addSession}>添加</button>
      <button class="clear-btn" onclick={clearCurrent}>清空聊天</button>
    </div>

    <!-- 联系人列表 -->
    <div class="list-container">
      {#if displayList.length === 0}
        <div class="empty">（暂无好友/群组）</div>
      {:else}
        {#each displayList as item (item.id)}
          <ContactListItem
            {...item}
            onSwitch={() => switchTo(item.id)}
            onRename={() => rename(item.id)}
            onDelete={() => remove(item.id)}
          />
        {/each}
      {/if}
    </div>

    <!-- 隐藏的文件输入 -->
    <input
      bind:this={fileInput}
      type="file"
      accept="image/*"
      style="display: none;"
      onchange={handleFileSelect}
    />
  </div>
</Modal>

<style>
  .session-panel {
    display: flex;
    flex-direction: column;
    min-height: 300px;
  }

  .add-section {
    display: flex;
    gap: 8px;
    padding: 12px;
    border-bottom: 1px solid #eee;
    align-items: center;
    flex-wrap: wrap;
  }

  .avatar-btn {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    border: 1px solid #e2e8f0;
    background: #fff;
    padding: 0;
    overflow: hidden;
    cursor: pointer;
    flex-shrink: 0;
  }

  .add-section input[type='text'] {
    flex: 1;
    min-width: 120px;
    padding: 10px;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-size: 14px;
  }

  .add-btn,
  .clear-btn {
    padding: 10px 12px;
    border: 1px solid #ddd;
    border-radius: 8px;
    background: #f5f5f5;
    cursor: pointer;
    font-size: 13px;
    white-space: nowrap;
    transition: background 0.15s;
  }

  .add-btn:hover {
    background: #e2e8f0;
  }

  .clear-btn {
    border-color: #fca5a5;
    background: #fee2e2;
    color: #b91c1c;
  }

  .clear-btn:hover {
    background: #fecaca;
  }

  .list-container {
    flex: 1;
    overflow-y: auto;
    border: 1px solid #eee;
    border-radius: 8px;
    margin: 12px;
  }

  .empty {
    padding: 20px;
    text-align: center;
    color: #888;
  }
</style>
