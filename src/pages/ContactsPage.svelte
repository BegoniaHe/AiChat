<!--
  ContactsPage 联系人页面
-->
<script>
  import {
    Button,
    ContactItem,
    CreateContactDialog,
    EmptyState,
    SearchInput,
  } from '$lib/components';
  import { contactsStore, uiStore } from '$stores';

  let searchQuery = $state('');
  let showAddDialog = $state(false);

  // 过滤联系人
  const filteredContacts = $derived(
    contactsStore.list.filter((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // 按置顶和最后消息时间排序
  const sortedContacts = $derived(
    [...filteredContacts].sort((a, b) => {
      // 置顶优先
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      // 按最后消息时间排序
      return (b.lastMessageTime || 0) - (a.lastMessageTime || 0);
    })
  );

  function selectContact(id) {
    uiStore.selectContact(id);
    uiStore.setPage('chat');
  }

  function handleCreated(contact) {
    // 创建后自动选中并跳转
    selectContact(contact.id);
  }
</script>

<div class="contacts-page">
  <!-- 搜索栏 -->
  <div class="search-bar">
    <SearchInput bind:value={searchQuery} placeholder="搜索联系人..." />
    <button class="add-btn" aria-label="添加联系人" onclick={() => (showAddDialog = true)}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
      </svg>
    </button>
  </div>

  <!-- 联系人列表 -->
  <div class="contact-list">
    {#each sortedContacts as contact (contact.id)}
      <ContactItem
        {...contact}
        lastMessageTime={contact.lastMessageTime
          ? new Date(contact.lastMessageTime).toLocaleTimeString('zh-CN', {
              hour: '2-digit',
              minute: '2-digit',
            })
          : ''}
        selected={uiStore.selectedContactId === contact.id}
        onclick={() => selectContact(contact.id)}
      />
    {/each}

    {#if sortedContacts.length === 0}
      <EmptyState
        icon={searchQuery ? '🔍' : '👥'}
        title={searchQuery ? `没有找到 "${searchQuery}"` : '还没有联系人'}
        description={searchQuery ? '尝试其他关键词' : '创建你的第一个 AI 角色吧'}
      >
        {#if !searchQuery}
          <Button variant="primary" onclick={() => (showAddDialog = true)}>创建联系人</Button>
        {/if}
      </EmptyState>
    {/if}
  </div>
</div>

<!-- 创建联系人对话框 -->
<CreateContactDialog bind:open={showAddDialog} oncreated={handleCreated} />

<style>
  .contacts-page {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-background);
  }

  .add-btn {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: var(--color-primary);
    background: transparent;
    flex-shrink: 0;
    transition: background var(--transition-fast);
  }

  .add-btn:hover {
    background: var(--color-hover);
  }

  /* Search */
  .search-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
  }

  /* List */
  .contact-list {
    flex: 1;
    overflow-y: auto;
  }
</style>
