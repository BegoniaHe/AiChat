<!--
  ContactDetailPanel 联系人详情面板
  查看和编辑联系人信息
-->
<script>
  import { chatStore, contactsStore, uiStore } from '$stores';
  import { toast } from 'svelte-sonner';
  import Avatar from './Avatar.svelte';
  import Button from './Button.svelte';
  import Input from './Input.svelte';

  const { contactId = '', onclose } = $props();

  // 获取联系人
  const contact = $derived(contactsStore.get(contactId));

  // 编辑状态
  let editing = $state(false);
  let editData = $state({
    name: '',
    description: '',
    systemPrompt: '',
    avatar: '',
  });

  // 确认删除状态
  let showDeleteConfirm = $state(false);

  // 开始编辑
  function startEdit() {
    if (!contact) return;
    editData = {
      name: contact.name || '',
      description: contact.description || '',
      systemPrompt: contact.systemPrompt || '',
      avatar: contact.avatar || '',
    };
    editing = true;
  }

  // 保存编辑
  function saveEdit() {
    if (!editData.name.trim()) {
      toast.error('名称不能为空');
      return;
    }

    contactsStore.update(contactId, {
      name: editData.name.trim(),
      description: editData.description.trim(),
      systemPrompt: editData.systemPrompt.trim(),
      avatar: editData.avatar.trim(),
    });

    editing = false;
    toast.success('已保存');
  }

  // 取消编辑
  function cancelEdit() {
    editing = false;
  }

  // 删除联系人
  function deleteContact() {
    contactsStore.remove(contactId);
    chatStore.deleteSession(contactId);

    // 清除选中
    if (uiStore.selectedContactId === contactId) {
      uiStore.selectContact(null);
    }

    toast.success('已删除联系人');
    onclose?.();
  }

  // 清空聊天记录
  function clearChat() {
    chatStore.clearSession(contactId);
    toast.success('聊天记录已清空');
  }

  // 切换置顶
  function togglePin() {
    contactsStore.togglePin(contactId);
    toast.success(contact?.pinned ? '已取消置顶' : '已置顶');
  }

  // 切换静音
  function toggleMute() {
    contactsStore.toggleMute(contactId);
    toast.success(contact?.muted ? '已取消免打扰' : '已开启免打扰');
  }
</script>

{#if contact}
  <div class="contact-detail">
    <!-- 头部信息 -->
    <header class="detail-header">
      <button class="back-btn" aria-label="返回" onclick={onclose}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
        </svg>
      </button>
      <h2>联系人详情</h2>
      <button
        class="edit-btn"
        aria-label={editing ? '取消编辑' : '编辑'}
        onclick={() => (editing ? cancelEdit() : startEdit())}
      >
        {#if editing}
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
            />
          </svg>
        {:else}
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
            />
          </svg>
        {/if}
      </button>
    </header>

    <div class="detail-content">
      {#if editing}
        <!-- 编辑模式 -->
        <div class="edit-form">
          <div class="avatar-edit">
            <Avatar src={editData.avatar} alt={editData.name} size="xl" />
            <Input bind:value={editData.avatar} placeholder="头像 URL（可选）" />
          </div>

          <div class="form-group">
            <label for="edit-name">名称</label>
            <Input id="edit-name" bind:value={editData.name} placeholder="输入名称" />
          </div>

          <div class="form-group">
            <label for="edit-desc">描述</label>
            <Input id="edit-desc" bind:value={editData.description} placeholder="输入描述" />
          </div>

          <div class="form-group">
            <label for="edit-prompt">系统提示词</label>
            <textarea
              id="edit-prompt"
              class="textarea"
              bind:value={editData.systemPrompt}
              placeholder="输入系统提示词，定义 AI 的行为和角色..."
              rows="5"
            ></textarea>
          </div>

          <div class="form-actions">
            <Button variant="ghost" onclick={cancelEdit}>取消</Button>
            <Button variant="primary" onclick={saveEdit}>保存</Button>
          </div>
        </div>
      {:else}
        <!-- 查看模式 -->
        <div class="profile-section">
          <Avatar src={contact.avatar} alt={contact.name} size="xl" />
          <h3 class="contact-name">{contact.name}</h3>
          {#if contact.description}
            <p class="contact-desc">{contact.description}</p>
          {/if}
        </div>

        {#if contact.systemPrompt}
          <div class="info-section">
            <h4>系统提示词</h4>
            <p class="system-prompt">{contact.systemPrompt}</p>
          </div>
        {/if}

        <div class="actions-section">
          <button class="action-item" onclick={togglePin}>
            <span class="action-icon">{contact.pinned ? 'Pin' : 'Unpin'}</span>
            <span class="action-label">{contact.pinned ? '取消置顶' : '置顶'}</span>
          </button>

          <button class="action-item" onclick={toggleMute}>
            <span class="action-icon">{contact.muted ? 'Bell' : 'Mute'}</span>
            <span class="action-label">{contact.muted ? '取消免打扰' : '免打扰'}</span>
          </button>

          <button class="action-item" onclick={clearChat}>
            <span class="action-icon">Delete</span>
            <span class="action-label">清空聊天记录</span>
          </button>

          <button class="action-item danger" onclick={() => (showDeleteConfirm = true)}>
            <span class="action-icon">❌</span>
            <span class="action-label">删除联系人</span>
          </button>
        </div>
      {/if}
    </div>
  </div>

  <!-- 删除确认对话框 -->
  {#if showDeleteConfirm}
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
    <div
      class="confirm-overlay"
      role="presentation"
      onclick={() => (showDeleteConfirm = false)}
      onkeydown={(e) => e.key === 'Escape' && (showDeleteConfirm = false)}
    >
      <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
      <div
        class="confirm-dialog"
        role="alertdialog"
        tabindex="-1"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
      >
        <h3 id="confirm-title">确认删除</h3>
        <p>
          确定要删除联系人「{contact.name}」吗？相关的聊天记录也会被删除。
        </p>
        <div class="confirm-actions">
          <Button variant="ghost" onclick={() => (showDeleteConfirm = false)}>取消</Button>
          <Button variant="danger" onclick={deleteContact}>删除</Button>
        </div>
      </div>
    </div>
  {/if}
{:else}
  <div class="no-contact">
    <p>联系人不存在</p>
    <Button variant="primary" onclick={onclose}>返回</Button>
  </div>
{/if}

<style>
  .contact-detail {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-background);
  }

  .detail-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
  }

  .detail-header h2 {
    flex: 1;
    font-size: 17px;
    font-weight: 600;
    color: var(--color-text);
  }

  .back-btn,
  .edit-btn {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    color: var(--color-text-secondary);
    border-radius: var(--radius-md);
    transition: background var(--transition-fast);
  }

  .back-btn:hover,
  .edit-btn:hover {
    background: var(--color-hover);
  }

  .detail-content {
    flex: 1;
    overflow-y: auto;
    padding: 20px 16px;
  }

  /* 查看模式 */
  .profile-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px 0;
    margin-bottom: 24px;
  }

  .contact-name {
    font-size: 20px;
    font-weight: 600;
    color: var(--color-text);
    margin-top: 12px;
  }

  .contact-desc {
    font-size: 14px;
    color: var(--color-text-secondary);
    margin-top: 4px;
  }

  .info-section {
    margin-bottom: 24px;
  }

  .info-section h4 {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-secondary);
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .system-prompt {
    font-size: 14px;
    color: var(--color-text);
    line-height: 1.6;
    padding: 12px;
    background: var(--color-surface);
    border-radius: var(--radius-md);
    white-space: pre-wrap;
  }

  .actions-section {
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .action-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 14px 16px;
    background: transparent;
    text-align: left;
    transition: background var(--transition-fast);
  }

  .action-item:hover {
    background: var(--color-hover);
  }

  .action-item.danger {
    color: var(--color-error);
  }

  .action-icon {
    font-size: 18px;
    width: 24px;
    text-align: center;
  }

  .action-label {
    flex: 1;
    font-size: 15px;
    color: inherit;
  }

  /* 编辑模式 */
  .edit-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .avatar-edit {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .form-group label {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-secondary);
  }

  .textarea {
    padding: 12px;
    font-family: inherit;
    font-size: 14px;
    line-height: 1.5;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    resize: vertical;
    min-height: 100px;
  }

  .textarea:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 8px;
  }

  /* 确认对话框 */
  .confirm-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 1100;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.2s ease;
  }

  .confirm-dialog {
    width: 90%;
    max-width: 320px;
    padding: 24px;
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    animation: scaleIn 0.2s ease;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes scaleIn {
    from {
      transform: scale(0.9);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }

  .confirm-dialog h3 {
    font-size: 17px;
    font-weight: 600;
    color: var(--color-text);
    margin-bottom: 12px;
  }

  .confirm-dialog p {
    font-size: 14px;
    color: var(--color-text-secondary);
    line-height: 1.5;
    margin-bottom: 20px;
  }

  .confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .no-contact {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 16px;
    color: var(--color-text-secondary);
  }
</style>
