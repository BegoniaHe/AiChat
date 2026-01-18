<!--
  Sidebar 侧边栏组件
  包含导航和快捷操作
-->
<script>
  import { contactsStore, uiStore } from '$stores';
  import Avatar from './Avatar.svelte';

  // 最近聊天
  const recentChats = $derived(
    contactsStore.list
      .filter((c) => c.lastMessage)
      .sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0))
      .slice(0, 5)
  );

  function selectContact(id) {
    uiStore.selectContact(id);
    uiStore.setPage('chat');
    uiStore.closeSidebar();
  }

  function navigateTo(page) {
    uiStore.setPage(page);
    uiStore.closeSidebar();
  }
</script>

{#if uiStore.sidebarOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="sidebar-overlay"
    role="presentation"
    tabindex="-1"
    onclick={() => uiStore.closeSidebar()}
    onkeydown={(e) => e.key === 'Escape' && uiStore.closeSidebar()}
  >
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <nav
      class="sidebar"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <!-- 头部 -->
      <header class="sidebar-header">
        <div class="app-info">
          <span class="app-icon">AC</span>
          <span class="app-name">AiChat</span>
        </div>
        <button class="close-btn" aria-label="关闭侧边栏" onclick={() => uiStore.closeSidebar()}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
            />
          </svg>
        </button>
      </header>

      <!-- 导航菜单 -->
      <nav class="sidebar-nav">
        <button
          class="nav-item"
          class:active={uiStore.currentPage === 'chat'}
          onclick={() => navigateTo('chat')}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
          </svg>
          <span>聊天</span>
        </button>

        <button
          class="nav-item"
          class:active={uiStore.currentPage === 'contacts'}
          onclick={() => navigateTo('contacts')}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
            />
          </svg>
          <span>联系人</span>
        </button>

        <button
          class="nav-item"
          class:active={uiStore.currentPage === 'moments'}
          onclick={() => navigateTo('moments')}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"
            />
          </svg>
          <span>动态</span>
        </button>
      </nav>

      <!-- 最近聊天 -->
      {#if recentChats.length > 0}
        <div class="recent-section">
          <h3 class="section-title">最近聊天</h3>
          <div class="recent-list">
            {#each recentChats as contact (contact.id)}
              <button class="recent-item" onclick={() => selectContact(contact.id)}>
                <Avatar src={contact.avatar} alt={contact.name} size="sm" />
                <span class="recent-name">{contact.name}</span>
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- 底部 -->
      <footer class="sidebar-footer">
        <button
          class="footer-btn"
          onclick={() => {
            uiStore.closeSidebar();
            uiStore.toggleSettings();
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
            />
          </svg>
          <span>设置</span>
        </button>
      </footer>
    </nav>
  </div>
{/if}

<style>
  .sidebar-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 900;
    animation: fadeIn 0.2s ease;
  }

  .sidebar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 280px;
    max-width: 80vw;
    background: var(--color-surface);
    display: flex;
    flex-direction: column;
    animation: slideIn 0.3s ease;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes slideIn {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(0);
    }
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    border-bottom: 1px solid var(--color-border);
  }

  .app-info {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .app-icon {
    font-size: 24px;
  }

  .app-name {
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text);
  }

  .close-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    color: var(--color-text-secondary);
    border-radius: var(--radius-md);
    transition: background var(--transition-fast);
  }

  .close-btn:hover {
    background: var(--color-hover);
  }

  .sidebar-nav {
    padding: 12px 8px;
    border-bottom: 1px solid var(--color-border);
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px 16px;
    background: transparent;
    color: var(--color-text);
    border-radius: var(--radius-md);
    text-align: left;
    transition: background var(--transition-fast);
  }

  .nav-item:hover {
    background: var(--color-hover);
  }

  .nav-item.active {
    background: var(--color-primary);
    color: white;
  }

  .nav-item svg {
    flex-shrink: 0;
  }

  .nav-item span {
    font-size: 15px;
    font-weight: 500;
  }

  .recent-section {
    flex: 1;
    padding: 16px;
    overflow-y: auto;
  }

  .section-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 12px;
  }

  .recent-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .recent-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 12px;
    background: transparent;
    border-radius: var(--radius-md);
    text-align: left;
    transition: background var(--transition-fast);
  }

  .recent-item:hover {
    background: var(--color-hover);
  }

  .recent-name {
    flex: 1;
    font-size: 14px;
    color: var(--color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sidebar-footer {
    padding: 12px;
    border-top: 1px solid var(--color-border);
  }

  .footer-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 12px 16px;
    background: transparent;
    color: var(--color-text-secondary);
    border-radius: var(--radius-md);
    text-align: left;
    transition: background var(--transition-fast);
  }

  .footer-btn:hover {
    background: var(--color-hover);
    color: var(--color-text);
  }

  .footer-btn span {
    font-size: 14px;
  }
</style>
