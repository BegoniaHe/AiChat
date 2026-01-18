<!--
  MomentsPage 朋友圈页面
  显示 AI 角色的动态/朋友圈
-->
<script>
  import { Avatar, Button, EmptyState } from '$lib/components';
  import { contactsStore } from '$stores';
  import { toast } from 'svelte-sonner';

  // 动态数据存储
  let moments = $state([
    {
      id: '1',
      authorId: null,
      author: '系统',
      avatar: '',
      content:
        '欢迎使用 AiChat！这是一个 AI 聊天应用，您可以创建不同角色的 AI 进行对话。点击底部的「联系人」添加新角色开始聊天吧！ 🎉',
      images: [],
      likes: 0,
      liked: false,
      comments: [],
      time: Date.now() - 3600000,
    },
  ]);

  // 发布动态表单
  let showCompose = $state(false);
  let composeContent = $state('');
  let composeImages = $state([]);

  // 评论相关
  let commentingId = $state(null);
  let commentText = $state('');

  // 格式化时间
  function formatTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;

    const date = new Date(timestamp);
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  // 点赞
  function toggleLike(momentId) {
    const moment = moments.find((m) => m.id === momentId);
    if (moment) {
      moment.liked = !moment.liked;
      moment.likes += moment.liked ? 1 : -1;
      moments = [...moments];
    }
  }

  // 开始评论
  function startComment(momentId) {
    commentingId = commentingId === momentId ? null : momentId;
    commentText = '';
  }

  // 提交评论
  function submitComment(momentId) {
    if (!commentText.trim()) return;

    const moment = moments.find((m) => m.id === momentId);
    if (moment) {
      moment.comments.push({
        id: Date.now().toString(),
        author: '我',
        content: commentText.trim(),
        time: Date.now(),
      });
      moments = [...moments];
    }

    commentText = '';
    commentingId = null;
    toast.success('评论已发送');
  }

  // 发布动态
  function postMoment() {
    if (!composeContent.trim()) {
      toast.error('请输入内容');
      return;
    }

    const newMoment = {
      id: Date.now().toString(),
      authorId: null,
      author: '我',
      avatar: '',
      content: composeContent.trim(),
      images: [...composeImages],
      likes: 0,
      liked: false,
      comments: [],
      time: Date.now(),
    };

    moments = [newMoment, ...moments];
    composeContent = '';
    composeImages = [];
    showCompose = false;
    toast.success('动态已发布');
  }

  // 删除动态
  function deleteMoment(momentId) {
    moments = moments.filter((m) => m.id !== momentId);
    toast.success('动态已删除');
  }

  // 让 AI 角色发布动态
  function generateAIMoment() {
    const contacts = contactsStore.list;
    if (contacts.length === 0) {
      toast.error('请先添加 AI 角色');
      return;
    }

    // 随机选择一个角色
    const contact = contacts[Math.floor(Math.random() * contacts.length)];

    // 预设的动态内容
    const templates = [
      '今天的心情特别好！希望大家也能开心每一天 ☀️',
      '分享一个小技巧：保持好奇心，世界会更有趣 💡',
      '刚刚学到了新东西，知识真是让人快乐 📚',
      '天气真好，适合出门走走 🌸',
      '希望今天能帮到更多人！有什么问题随时来问我 😊',
      '在思考一些有趣的问题... 🤔',
      '感谢所有和我交流的朋友，每次对话都让我学到很多 💬',
    ];

    const newMoment = {
      id: Date.now().toString(),
      authorId: contact.id,
      author: contact.name,
      avatar: contact.avatar,
      content: templates[Math.floor(Math.random() * templates.length)],
      images: [],
      likes: Math.floor(Math.random() * 20),
      liked: false,
      comments: [],
      time: Date.now(),
    };

    moments = [newMoment, ...moments];
    toast.success(`${contact.name} 发布了新动态`);
  }
</script>

<div class="moments-page">
  <!-- 发布按钮 -->
  <div class="moments-actions">
    <Button variant="ghost" onclick={() => (showCompose = !showCompose)}>
      {showCompose ? '取消' : '📝 发布动态'}
    </Button>
    <Button variant="ghost" onclick={generateAIMoment}>✨ AI 发布</Button>
  </div>

  <!-- 发布表单 -->
  {#if showCompose}
    <div class="compose-card">
      <textarea
        class="compose-textarea"
        placeholder="分享你的想法..."
        bind:value={composeContent}
        rows="3"
      ></textarea>
      <div class="compose-footer">
        <button class="compose-action" aria-label="添加图片"> 📷 </button>
        <Button variant="primary" size="sm" onclick={postMoment} disabled={!composeContent.trim()}>
          发布
        </Button>
      </div>
    </div>
  {/if}

  <!-- 动态列表 -->
  <div class="moments-list">
    {#each moments as moment (moment.id)}
      <article class="moment-card">
        <div class="moment-header">
          <Avatar src={moment.avatar} alt={moment.author} size="md" />
          <div class="moment-info">
            <span class="author-name">{moment.author}</span>
            <span class="moment-time">{formatTime(moment.time)}</span>
          </div>
          {#if moment.author === '我'}
            <button class="delete-btn" aria-label="删除" onclick={() => deleteMoment(moment.id)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                />
              </svg>
            </button>
          {/if}
        </div>

        <div class="moment-content">
          <p>{moment.content}</p>
        </div>

        {#if moment.images.length > 0}
          <div class="moment-images">
            {#each moment.images as image}
              <img src={image} alt="动态图片" />
            {/each}
          </div>
        {/if}

        <div class="moment-actions">
          <button class="action" class:liked={moment.liked} onclick={() => toggleLike(moment.id)}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill={moment.liked ? 'currentColor' : 'none'}
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
              />
            </svg>
            <span>{moment.likes || ''}</span>
          </button>
          <button class="action" onclick={() => startComment(moment.id)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18z"
              />
            </svg>
            <span>{moment.comments.length || ''}</span>
          </button>
          <button class="action" aria-label="分享">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"
              />
            </svg>
          </button>
        </div>

        <!-- 评论区 -->
        {#if moment.comments.length > 0 || commentingId === moment.id}
          <div class="comments-section">
            {#each moment.comments as comment (comment.id)}
              <div class="comment">
                <span class="comment-author">{comment.author}:</span>
                <span class="comment-content">{comment.content}</span>
              </div>
            {/each}

            {#if commentingId === moment.id}
              <div class="comment-input">
                <input
                  type="text"
                  placeholder="写评论..."
                  bind:value={commentText}
                  onkeydown={(e) => e.key === 'Enter' && submitComment(moment.id)}
                />
                <button
                  class="send-btn"
                  onclick={() => submitComment(moment.id)}
                  disabled={!commentText.trim()}
                >
                  发送
                </button>
              </div>
            {/if}
          </div>
        {/if}
      </article>
    {/each}

    {#if moments.length === 0}
      <EmptyState icon="📷" title="暂无动态" description="还没有人发布朋友圈" />
    {/if}
  </div>
</div>

<style>
  .moments-page {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-background);
    overflow-y: auto;
  }

  /* Actions */
  .moments-actions {
    display: flex;
    justify-content: center;
    gap: 12px;
    padding: 12px 16px;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
  }

  /* Compose */
  .compose-card {
    background: var(--color-surface);
    margin: 8px;
    padding: 12px;
    border-radius: var(--radius-lg);
  }

  .compose-textarea {
    width: 100%;
    padding: 12px;
    font-size: 15px;
    line-height: 1.5;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-background);
    color: var(--color-text);
    resize: none;
  }

  .compose-textarea:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .compose-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 12px;
  }

  .compose-action {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    border-radius: var(--radius-md);
    transition: background var(--transition-fast);
  }

  .compose-action:hover {
    background: var(--color-hover);
  }

  /* List */
  .moments-list {
    flex: 1;
    padding: 8px 0;
  }

  /* Card */
  .moment-card {
    background: var(--color-surface);
    margin-bottom: 8px;
    padding: 16px;
  }

  .moment-header {
    display: flex;
    gap: 12px;
    margin-bottom: 12px;
  }

  .moment-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .author-name {
    font-weight: 600;
    font-size: 15px;
  }

  .moment-time {
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .delete-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
  }

  .delete-btn:hover {
    background: var(--color-hover);
    color: var(--color-danger);
  }

  .moment-content p {
    margin: 0;
    font-size: 15px;
    line-height: 1.5;
    white-space: pre-wrap;
  }

  .moment-images {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    margin-top: 12px;
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .moment-images img {
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
  }

  .moment-actions {
    display: flex;
    gap: 24px;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--color-border);
  }

  .moment-actions .action {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--color-text-secondary);
    font-size: 13px;
    transition: color var(--transition-fast);
  }

  .moment-actions .action:hover {
    color: var(--color-primary);
  }

  .moment-actions .action.liked {
    color: #e74c3c;
  }

  /* Comments */
  .comments-section {
    margin-top: 12px;
    padding: 12px;
    background: var(--color-background);
    border-radius: var(--radius-md);
  }

  .comment {
    font-size: 14px;
    line-height: 1.4;
    margin-bottom: 8px;
  }

  .comment:last-child {
    margin-bottom: 0;
  }

  .comment-author {
    font-weight: 600;
    color: var(--color-primary);
  }

  .comment-content {
    color: var(--color-text);
  }

  .comment-input {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }

  .comment-input input {
    flex: 1;
    padding: 8px 12px;
    font-size: 14px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: var(--color-surface);
    color: var(--color-text);
  }

  .comment-input input:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .send-btn {
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 500;
    color: var(--color-primary);
    border-radius: var(--radius-full);
    transition: background var(--transition-fast);
  }

  .send-btn:hover:not(:disabled) {
    background: var(--color-hover);
  }

  .send-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
