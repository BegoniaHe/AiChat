<!--
  ContactItem 组件
  联系人列表项
-->
<script>
  import Avatar from './Avatar.svelte';

  const {
    id = '',
    name = '',
    avatar = '',
    lastMessage = '',
    lastMessageTime = '',
    unreadCount = 0,
    pinned = false,
    muted = false,
    selected = false,
    onclick,
  } = $props();
</script>

<button class="contact-item" class:selected class:pinned {onclick}>
  <Avatar src={avatar} alt={name} size="md" />

  <div class="info">
    <div class="top-row">
      <span class="name">{name}</span>
      {#if lastMessageTime}
        <span class="time">{lastMessageTime}</span>
      {/if}
    </div>

    <div class="bottom-row">
      <span class="last-message">{lastMessage || '暂无消息'}</span>

      <div class="badges">
        {#if muted}
          <span class="badge muted">静音</span>
        {/if}
        {#if unreadCount > 0}
          <span class="badge unread">{unreadCount > 99 ? '99+' : unreadCount}</span>
        {/if}
      </div>
    </div>
  </div>
</button>

<style>
  .contact-item {
    display: flex;
    gap: 12px;
    width: 100%;
    padding: 12px 16px;
    background: transparent;
    text-align: left;
    transition: background var(--transition-fast);
  }

  .contact-item:hover {
    background: var(--color-hover);
  }

  .contact-item.selected {
    background: var(--color-hover);
  }

  .contact-item.pinned {
    background: rgba(0, 0, 0, 0.02);
  }

  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .top-row,
  .bottom-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .name {
    font-size: 15px;
    font-weight: 500;
    color: var(--color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .time {
    font-size: 12px;
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  .last-message {
    flex: 1;
    font-size: 13px;
    color: var(--color-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .badges {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-shrink: 0;
  }

  .badge {
    font-size: 11px;
  }

  .badge.unread {
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    background: var(--color-danger, #ef4444);
    color: white;
    border-radius: var(--radius-full);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .badge.muted {
    opacity: 0.5;
  }
</style>
