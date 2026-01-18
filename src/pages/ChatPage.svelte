<!--
  ChatPage 聊天页面
-->
<script>
  import { createLLMClient } from '$api';
  import {
    Avatar,
    ChatBubble,
    ContactDetailPanel,
    MessageActions,
    MessageInput,
  } from '$lib/components';
  import { chatStore, configStore, contactsStore, uiStore } from '$stores';
  import { toast } from 'svelte-sonner';

  let inputValue = $state('');
  let sending = $state(false);
  /** @type {HTMLElement|undefined} */
  let messagesContainer = $state(undefined);
  /** @type {AbortController|null} */
  let abortController = $state(null);
  /** 是否显示联系人详情面板 */
  let showDetail = $state(false);
  /** 消息操作菜单 */
  let showMessageActions = $state(false);
  let selectedMessage = $state(null);

  // 当前联系人
  const currentContact = $derived(
    uiStore.selectedContactId ? contactsStore.get(uiStore.selectedContactId) : null
  );

  // 当前消息
  const messages = $derived(chatStore.currentMessages);

  // 选择联系人时加载会话
  $effect(() => {
    if (uiStore.selectedContactId) {
      chatStore.getOrCreateSession(uiStore.selectedContactId);
      showDetail = false; // 切换联系人时关闭详情面板
    }
  });

  // 滚动到底部
  $effect(() => {
    if (messages.length && messagesContainer) {
      // 使用 requestAnimationFrame 确保 DOM 更新后滚动
      requestAnimationFrame(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      });
    }
  });

  // 构建系统消息
  function buildSystemMessage() {
    if (!currentContact?.systemPrompt) return null;
    return {
      role: 'system',
      content: currentContact.systemPrompt,
    };
  }

  // 停止生成
  function stopGeneration() {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
  }

  async function handleSend(content) {
    if (!currentContact || sending) return;

    // 先保存当前消息历史（不包括即将添加的消息）
    const previousMessages = [...messages];

    // 添加用户消息
    const userMessage = chatStore.addMessage({
      role: 'user',
      content,
      status: 'sent',
    });

    inputValue = '';
    sending = true;

    // 添加 AI 消息占位
    const aiMessage = chatStore.addMessage({
      role: 'assistant',
      content: '',
      name: currentContact.name,
      status: 'sending',
    });

    try {
      // 获取配置
      const config = configStore.active;
      if (!config.apiKey) {
        chatStore.updateMessage(aiMessage.id, {
          content: '请先在设置中配置 API Key',
          status: 'error',
        });
        sending = false;
        return;
      }

      // 创建客户端
      const client = createLLMClient(config);

      // 创建 AbortController
      abortController = new AbortController();

      // 构建消息历史
      const history = [];

      // 添加系统消息
      const systemMsg = buildSystemMessage();
      if (systemMsg) {
        history.push(systemMsg);
      }

      // 添加历史消息 (最近 20 条，不包括刚添加的)
      const recentMessages = previousMessages.slice(-20);
      for (const m of recentMessages) {
        if (m.role === 'user' || m.role === 'assistant') {
          history.push({
            role: m.role,
            content: m.content,
          });
        }
      }

      // 添加当前用户消息
      history.push({
        role: 'user',
        content,
      });

      // 流式请求
      let fullContent = '';
      for await (const chunk of client.streamChat(history, {
        signal: abortController.signal,
      })) {
        fullContent += chunk;
        chatStore.updateMessage(aiMessage.id, {
          content: fullContent,
          status: 'sending',
        });
      }

      chatStore.updateMessage(aiMessage.id, {
        content: fullContent,
        status: 'sent',
      });

      // 更新联系人最后消息
      contactsStore.updateLastMessage(
        currentContact.id,
        fullContent.slice(0, 50) + (fullContent.length > 50 ? '...' : '')
      );
    } catch (err) {
      if (err.name === 'AbortError') {
        chatStore.updateMessage(aiMessage.id, {
          status: 'sent',
        });
      } else {
        chatStore.updateMessage(aiMessage.id, {
          content: `错误: ${err.message}`,
          status: 'error',
        });
      }
    } finally {
      sending = false;
      abortController = null;
    }
  }

  // 重新生成最后一条 AI 消息
  async function regenerate() {
    if (sending || messages.length < 2) return;

    // 找到最后一条用户消息
    const lastUserMsgIndex = messages.findLastIndex((m) => m.role === 'user');
    if (lastUserMsgIndex === -1) return;

    const lastUserMsg = messages[lastUserMsgIndex];

    // 删除最后一条 AI 消息
    const lastAiMsg = messages[messages.length - 1];
    if (lastAiMsg.role === 'assistant') {
      chatStore.deleteMessage(lastAiMsg.id);
    }

    // 重新发送
    await handleSend(lastUserMsg.content);
  }

  // 显示消息操作菜单
  function handleMessageAction(msg) {
    selectedMessage = msg;
    showMessageActions = true;
  }

  // 删除消息
  function handleDeleteMessage() {
    if (selectedMessage) {
      chatStore.deleteMessage(selectedMessage.id);
      toast.success('消息已删除');
    }
  }

  // 重新生成指定消息
  async function handleRegenerateMessage() {
    if (!selectedMessage || selectedMessage.role !== 'assistant') return;

    // 找到该消息前的最后一条用户消息
    const msgIndex = messages.findIndex((m) => m.id === selectedMessage.id);
    if (msgIndex <= 0) return;

    // 向前找用户消息
    let userMsg = null;
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        userMsg = messages[i];
        break;
      }
    }

    if (!userMsg) return;

    // 删除当前 AI 消息
    chatStore.deleteMessage(selectedMessage.id);

    // 重新发送
    await handleSend(userMsg.content);
  }
</script>

<!-- 消息操作菜单 -->
<MessageActions
  message={selectedMessage}
  bind:open={showMessageActions}
  ondelete={handleDeleteMessage}
  onregenerate={selectedMessage?.role === 'assistant' ? handleRegenerateMessage : null}
/>

<div class="chat-page">
  {#if showDetail && currentContact}
    <!-- 联系人详情面板 -->
    <ContactDetailPanel contactId={currentContact.id} onclose={() => (showDetail = false)} />
  {:else if currentContact}
    <!-- 头部 -->
    <header class="chat-header">
      <button class="back-btn" aria-label="返回" onclick={() => uiStore.setPage('contacts')}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
        </svg>
      </button>
      <button class="header-info" onclick={() => (showDetail = true)} aria-label="查看联系人详情">
        <Avatar src={currentContact.avatar} alt={currentContact.name} size="sm" />
        <div class="header-text">
          <h2 class="contact-name">{currentContact.name}</h2>
          {#if currentContact.description}
            <span class="contact-desc">{currentContact.description}</span>
          {/if}
        </div>
      </button>
      <button class="header-action" aria-label="更多选项" onclick={() => (showDetail = true)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>
    </header>

    <!-- 消息列表 -->
    <div class="messages" bind:this={messagesContainer}>
      {#each messages as message (message.id)}
        <ChatBubble
          id={message.id}
          role={message.role}
          content={message.content}
          name={message.role === 'assistant' ? currentContact.name : ''}
          avatar={message.role === 'assistant' ? currentContact.avatar : ''}
          time={message.time}
          status={message.status}
          onlongpress={handleMessageAction}
          oncontextmenu={handleMessageAction}
        />
      {/each}

      {#if messages.length === 0}
        <div class="empty-state">
          <Avatar src={currentContact.avatar} alt={currentContact.name} size="xl" />
          <h3>{currentContact.name}</h3>
          {#if currentContact.greeting}
            <p class="greeting">{currentContact.greeting}</p>
          {:else}
            <p>开始你们的对话吧</p>
          {/if}
        </div>
      {/if}
    </div>

    <!-- 停止生成按钮 -->
    {#if sending}
      <div class="stop-button-container">
        <button class="stop-button" onclick={stopGeneration}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
          停止生成
        </button>
      </div>
    {/if}

    <!-- 输入框 -->
    <MessageInput bind:value={inputValue} loading={sending} onsend={handleSend} />
  {:else}
    <!-- 未选择联系人 -->
    <div class="no-contact">
      <div class="no-contact-icon">💬</div>
      <h3>选择一个对话</h3>
      <p>从联系人列表中选择一个角色开始聊天</p>
    </div>
  {/if}
</div>

<style>
  .chat-page {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-background);
  }

  /* Header */
  .chat-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
  }

  .back-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: var(--color-text-secondary);
    transition: background var(--transition-fast);
  }

  .back-btn:hover {
    background: var(--color-hover);
  }

  .header-info {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    padding: 4px 8px;
    border-radius: var(--radius-md);
    transition: background var(--transition-fast);
    cursor: pointer;
  }

  .header-info:hover {
    background: var(--color-hover);
  }

  .header-text {
    flex: 1;
    min-width: 0;
  }

  .contact-name {
    font-size: 16px;
    font-weight: 600;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .contact-desc {
    font-size: 12px;
    color: var(--color-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
  }

  .header-action {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: var(--color-text-secondary);
    transition: background var(--transition-fast);
  }

  .header-action:hover {
    background: var(--color-hover);
  }

  /* Messages */
  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px 0;
  }

  /* Stop button */
  .stop-button-container {
    display: flex;
    justify-content: center;
    padding: 8px;
  }

  .stop-button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    color: var(--color-text-secondary);
    font-size: 13px;
    transition: all var(--transition-fast);
  }

  .stop-button:hover {
    background: var(--color-hover);
    color: var(--color-text);
  }

  /* Empty state */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
    padding: 32px;
    color: var(--color-text-secondary);
  }

  .empty-state h3 {
    margin: 16px 0 8px;
    font-size: 18px;
    color: var(--color-text);
  }

  .empty-state p {
    font-size: 14px;
    margin: 0;
  }

  .empty-state .greeting {
    font-style: italic;
    color: var(--color-text);
  }

  /* No contact selected */
  .no-contact {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
    padding: 32px;
    color: var(--color-text-secondary);
  }

  .no-contact-icon {
    font-size: 64px;
    margin-bottom: 16px;
  }

  .no-contact h3 {
    margin: 0 0 8px;
    font-size: 20px;
    color: var(--color-text);
  }

  .no-contact p {
    font-size: 14px;
  }
</style>
