<script>
  /**
   * MomentsPanel.svelte - 动态/朋友圈展示组件
   * 基于原始 moments-panel.js 重写的 Svelte 5 版本
   */
  import { contactsStore, getMomentsStore } from '$stores';
  import { onMount } from 'svelte';

  // Props
  const {
    userAvatar = '',
    defaultAvatar = '/assets/default-avatar.png',
    onUserComment = null,
  } = $props();

  // State
  let momentsStore = $state(null);
  let moments = $state([]);
  let visibleCount = $state(5);
  let expandedComments = $state(new Set());
  let openComposer = $state(new Set());
  let pendingComment = $state(new Set());
  let replyTargets = $state(new Map());
  const pageSize = 5;

  // Initialize store
  onMount(async () => {
    momentsStore = getMomentsStore();
    await momentsStore.ready;
    loadMoments();
  });

  function loadMoments() {
    if (!momentsStore) return;
    moments = momentsStore.list() || [];
  }

  // HTML escape
  const esc = (s) =>
    String(s ?? '').replace(
      /[&<>"]/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
    );

  // Normalize inline breaks
  const normalizeInlineBreaks = (s) =>
    String(s ?? '')
      .replace(/&lt;br\s*\/?&gt;/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n');

  // Render text with stickers
  function renderTextWithStickers(raw = '') {
    const input = normalizeInlineBreaks(raw);
    if (!input) return '';

    const TOKEN_RE = /\[bqb-([\s\S]+?)\]/gi;
    let output = '';
    let lastIndex = 0;

    const appendText = (text) => {
      if (!text) return;
      output += esc(text).replace(/\n/g, '<br>');
    };

    let match;
    while ((match = TOKEN_RE.exec(input))) {
      appendText(input.slice(lastIndex, match.index));
      const payload = String(match[1] || '').trim();
      if (payload) {
        // For now, just show placeholder for stickers
        if (output && !output.endsWith('<br>')) output += '<br>';
        output += `<span class="moment-sticker-wrap">[表情:${esc(payload)}]</span>`;
        output += '<br>';
      } else {
        appendText(match[0]);
      }
      lastIndex = TOKEN_RE.lastIndex;
    }
    appendText(input.slice(lastIndex));
    return output;
  }

  // Extract media from moment content
  function extractMomentMedia(raw = '') {
    const text = normalizeInlineBreaks(raw);
    const images = [];
    const audios = [];
    const TOKEN_RE = /\[(img|yy)-([\s\S]+?)\]|<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi;
    let output = '';
    let lastIndex = 0;

    let match;
    while ((match = TOKEN_RE.exec(text))) {
      const before = text.slice(lastIndex, match.index);
      output += before;
      lastIndex = TOKEN_RE.lastIndex;

      if (match[3]) {
        // <img src="...">
        images.push({ url: match[3], label: '' });
        continue;
      }

      const type = String(match[1] || '').toLowerCase();
      const payload = String(match[2] || '').trim();
      if (!payload) {
        output += match[0];
        continue;
      }

      if (type === 'yy') {
        audios.push({ url: payload, label: payload });
      } else {
        images.push({ url: payload, label: payload });
      }
    }
    output += text.slice(lastIndex);

    return { text: output.trim(), images, audios };
  }

  // Get avatar for moment author
  function getAvatarForMoment(m) {
    const snap = String(m?.authorAvatar || '').trim();
    if (snap) return snap;

    const authorId = String(m?.authorId || '').trim();
    if (authorId === 'user') return userAvatar || defaultAvatar;

    if (authorId) {
      const c = contactsStore.getContact(authorId);
      if (c?.avatar) return c.avatar;
    }

    const origin = String(m?.originSessionId || '').trim();
    if (origin) {
      const c = contactsStore.getContact(origin);
      if (c?.avatar) return c.avatar;
    }

    return getAvatarByName(m?.author);
  }

  function getAvatarByName(name) {
    const raw = String(name || '').trim();
    if (!raw) return defaultAvatar;
    if (raw === '我' || raw.toLowerCase() === 'user' || raw === '用户') {
      return userAvatar || defaultAvatar;
    }

    // Try exact match
    const c = contactsStore.getContact(raw);
    if (c?.avatar) return c.avatar;

    // Try fuzzy match
    const contacts = contactsStore.listContacts() || [];
    const norm = (s) =>
      String(s || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '');
    const key = norm(raw);

    const match = contacts.find((x) => norm(x?.name) === key || norm(x?.id) === key);
    return match?.avatar || defaultAvatar;
  }

  // Build threaded comments
  function buildThreadedComments(comments = []) {
    const list = Array.isArray(comments) ? comments.filter(Boolean) : [];
    const byId = new Map();
    list.forEach((c) => {
      const id = String(c?.id || '').trim();
      if (id) byId.set(id, c);
    });

    const repliesByParent = new Map();
    const roots = [];

    for (const c of list) {
      const replyTo = String(c?.replyTo || '').trim();
      if (replyTo && byId.has(replyTo)) {
        if (!repliesByParent.has(replyTo)) repliesByParent.set(replyTo, []);
        repliesByParent.get(replyTo).push(c);
      } else {
        roots.push(c);
      }
    }

    return { roots, repliesByParent, byId };
  }

  // Actions
  function toggleComments(momentId) {
    if (expandedComments.has(momentId)) {
      expandedComments.delete(momentId);
    } else {
      expandedComments.add(momentId);
    }
    expandedComments = new Set(expandedComments);
  }

  function toggleComposer(momentId) {
    if (openComposer.has(momentId)) {
      openComposer.delete(momentId);
      replyTargets.delete(momentId);
    } else {
      openComposer.add(momentId);
    }
    openComposer = new Set(openComposer);
    replyTargets = new Map(replyTargets);
  }

  function setReplyTarget(momentId, comment) {
    replyTargets.set(momentId, comment);
    replyTargets = new Map(replyTargets);
    openComposer.add(momentId);
    openComposer = new Set(openComposer);
  }

  function cancelReply(momentId) {
    replyTargets.delete(momentId);
    replyTargets = new Map(replyTargets);
  }

  async function sendComment(momentId, inputEl) {
    const content = inputEl?.value?.trim();
    if (!content || pendingComment.has(momentId)) return;

    pendingComment.add(momentId);
    pendingComment = new Set(pendingComment);

    const replyTarget = replyTargets.get(momentId);

    if (typeof onUserComment === 'function') {
      try {
        await onUserComment({
          momentId,
          content,
          replyTo: replyTarget?.id || null,
          replyToAuthor: replyTarget?.author || null,
        });
      } catch (err) {
        console.error('Comment failed:', err);
      }
    } else {
      // Direct add to store
      const comment = {
        id: `c-${Date.now()}`,
        author: '我',
        content,
        replyTo: replyTarget?.id || null,
        replyToAuthor: replyTarget?.author || null,
        time: new Date().toLocaleString(),
      };
      momentsStore?.addComment?.(momentId, comment);
    }

    inputEl.value = '';
    pendingComment.delete(momentId);
    pendingComment = new Set(pendingComment);
    cancelReply(momentId);
    loadMoments();
  }

  function deleteMoment(momentId) {
    if (!confirm('删除后无法恢复，确定要删除这条动态吗？')) return;
    momentsStore?.remove?.(momentId);
    loadMoments();
  }

  function deleteComment(momentId, commentId) {
    if (!confirm('删除这条评论？')) return;
    momentsStore?.removeComment?.(momentId, commentId);
    loadMoments();
  }

  function loadMore() {
    visibleCount += pageSize;
  }

  // Derived
  const visibleMoments = $derived(moments.slice(0, visibleCount));
  const hasMore = $derived(moments.length > visibleCount);
</script>

<div class="moments-panel">
  {#if moments.length === 0}
    <div class="moments-empty">（暂无动态）</div>
  {:else}
    <div class="moments-list">
      {#each visibleMoments as moment (moment.id)}
        {@const media = extractMomentMedia(moment.content || '')}
        {@const avatar = getAvatarForMoment(moment)}
        {@const comments = Array.isArray(moment.comments) ? moment.comments : []}
        {@const VISIBLE_COMMENTS = 3}
        {@const expanded = expandedComments.has(moment.id)}
        {@const showComposer = openComposer.has(moment.id)}
        {@const replyTarget = replyTargets.get(moment.id)}
        {@const hiddenCount =
          comments.length > VISIBLE_COMMENTS ? comments.length - VISIBLE_COMMENTS : 0}
        {@const visibleComments = expanded
          ? comments
          : hiddenCount > 0
            ? comments.slice(-VISIBLE_COMMENTS)
            : comments}
        {@const { roots: commentRoots, repliesByParent } = buildThreadedComments(visibleComments)}
        {@const pending = pendingComment.has(moment.id)}

        <div class="moment-card" data-moment-id={moment.id}>
          <!-- Header -->
          <div class="moment-header">
            <img src={avatar} alt="" class="moment-avatar" />
            <div class="moment-user-info">
              <div class="moment-username">
                {moment.author || '角色'}
              </div>
              <div class="moment-time">{moment.time || ''}</div>
            </div>
            <button
              class="moment-more"
              aria-label="更多"
              title="更多"
              onclick={() => deleteMoment(moment.id)}
            >
              ⋯
            </button>
          </div>

          <!-- Content -->
          <div class="moment-content">
            {#if media.text}
              <div class="moment-text">
                {@html renderTextWithStickers(media.text)}
              </div>
            {/if}

            {#if media.images.length > 0}
              <div class="moment-images">
                {#each media.images as img}
                  <img src={img.url} alt={img.label} loading="lazy" />
                {/each}
              </div>
            {/if}

            {#if media.audios.length > 0}
              <div class="moment-audios">
                {#each media.audios as audio}
                  <div class="moment-audio-item">
                    <audio controls src={audio.url} preload="none"></audio>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <!-- Stats -->
          <div class="moment-stats">
            <span>浏览{moment.views || 0}次</span>
            <span>评论{comments.length}条</span>
          </div>

          <!-- Footer -->
          <div class="moment-footer">
            <span class="moment-likes">{moment.likes || 0}人已赞</span>
            <button class="moment-action" onclick={() => toggleComposer(moment.id)}> 评论 </button>
          </div>

          <!-- Comments -->
          {#if comments.length > 0}
            <div class="moment-comments">
              {#if !expanded && hiddenCount > 0}
                <div
                  class="moment-comments-toggle"
                  onclick={() => toggleComments(moment.id)}
                  role="button"
                  tabindex="0"
                >
                  展开查看更多评论 ({hiddenCount}条)
                </div>
              {/if}

              {#each commentRoots as comment}
                {@const cid = String(comment?.id || '').trim()}
                {@const author = String(comment?.author || '').trim()}
                {@const content = String(comment?.content || '')}
                {@const replies = cid ? repliesByParent.get(cid) || [] : []}

                <div
                  class="moment-comment"
                  data-comment-id={cid}
                  oncontextmenu={(e) => {
                    e.preventDefault();
                    deleteComment(moment.id, cid);
                  }}
                >
                  <span class="comment-user">
                    <span
                      class="comment-author"
                      role="button"
                      tabindex="0"
                      onclick={() => setReplyTarget(moment.id, comment)}
                    >
                      {author}
                    </span>：
                  </span>
                  <span class="comment-text">
                    {@html renderTextWithStickers(content)}
                  </span>
                </div>

                {#each replies as reply}
                  {@const rid = String(reply?.id || '').trim()}
                  {@const rauthor = String(reply?.author || '').trim()}
                  {@const rcontent = String(reply?.content || '')}
                  {@const toName = String(reply?.replyToAuthor || '').trim() || author}

                  <div
                    class="moment-comment moment-comment-reply"
                    data-comment-id={rid}
                    oncontextmenu={(e) => {
                      e.preventDefault();
                      deleteComment(moment.id, rid);
                    }}
                  >
                    <span class="comment-user">
                      <span
                        class="comment-author"
                        role="button"
                        tabindex="0"
                        onclick={() => setReplyTarget(moment.id, reply)}
                      >
                        {rauthor}
                      </span>
                      回复
                      <span class="comment-replyto">{toName}</span>：
                    </span>
                    <span class="comment-text">
                      {@html renderTextWithStickers(rcontent)}
                    </span>
                  </div>
                {/each}
              {/each}

              {#if expanded && hiddenCount > 0}
                <div
                  class="moment-comments-toggle"
                  onclick={() => toggleComments(moment.id)}
                  role="button"
                  tabindex="0"
                >
                  收起评论
                </div>
              {/if}
            </div>
          {/if}

          <!-- Comment Composer -->
          {#if showComposer}
            <div class="moment-comment-composer">
              {#if replyTarget}
                <div class="moment-replying">
                  <div class="reply-info">
                    回复 <b>{replyTarget.author || ''}</b>：{String(
                      replyTarget.content || ''
                    ).slice(0, 120)}
                  </div>
                  <button class="moment-reply-cancel" onclick={() => cancelReply(moment.id)}>
                    ×
                  </button>
                </div>
              {/if}
              <div class="moment-comment-input-row">
                <input
                  class="moment-comment-input"
                  type="text"
                  placeholder={replyTarget ? `回复 ${replyTarget.author || ''}...` : '写评论...'}
                  disabled={pending}
                  onkeydown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendComment(moment.id, e.target);
                    }
                  }}
                />
                <button
                  class="moment-send-btn"
                  disabled={pending}
                  onclick={(e) => {
                    const input = e.target.parentElement.querySelector('.moment-comment-input');
                    sendComment(moment.id, input);
                  }}
                >
                  {pending ? '发送中…' : '发送'}
                </button>
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>

    {#if hasMore}
      <button class="moments-load-more" onclick={loadMore}> 加载更多 </button>
    {/if}
  {/if}
</div>

<style>
  .moments-panel {
    padding: 16px;
    background: var(--bg-secondary, #f8fafc);
    min-height: 100%;
  }

  .moments-empty {
    padding: 32px 16px;
    color: #64748b;
    text-align: center;
  }

  .moments-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .moment-card {
    background: white;
    border-radius: 12px;
    padding: 16px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .moment-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }

  .moment-avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    object-fit: cover;
  }

  .moment-user-info {
    flex: 1;
    min-width: 0;
  }

  .moment-username {
    font-weight: 600;
    color: #1e293b;
  }

  .moment-time {
    font-size: 12px;
    color: #94a3b8;
  }

  .moment-more {
    border: none;
    background: transparent;
    font-size: 18px;
    color: #94a3b8;
    cursor: pointer;
    padding: 4px 8px;
  }

  .moment-content {
    margin-bottom: 12px;
  }

  .moment-text {
    color: #334155;
    line-height: 1.6;
    word-break: break-word;
  }

  .moment-images {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 8px;
    margin-top: 12px;
  }

  .moment-images img {
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
    border-radius: 8px;
    cursor: pointer;
  }

  .moment-audios {
    margin-top: 12px;
  }

  .moment-audio-item audio {
    width: 100%;
  }

  .moment-stats {
    display: flex;
    gap: 16px;
    font-size: 12px;
    color: #94a3b8;
    margin-bottom: 12px;
  }

  .moment-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 12px;
    border-top: 1px solid #f1f5f9;
  }

  .moment-likes {
    font-size: 14px;
    color: #64748b;
  }

  .moment-action {
    border: none;
    background: transparent;
    color: #2563eb;
    font-weight: 600;
    cursor: pointer;
    padding: 6px 12px;
  }

  .moment-comments {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid #f1f5f9;
  }

  .moment-comments-toggle {
    color: #2563eb;
    font-size: 13px;
    cursor: pointer;
    padding: 8px 0;
  }

  .moment-comment {
    padding: 8px 0;
    font-size: 14px;
  }

  .moment-comment-reply {
    margin-left: 20px;
    padding-left: 10px;
    border-left: 2px solid rgba(0, 0, 0, 0.08);
  }

  .comment-author {
    font-weight: 700;
    color: #2563eb;
    cursor: pointer;
  }

  .comment-replyto {
    font-weight: 700;
  }

  .comment-text {
    color: #334155;
  }

  .moment-comment-composer {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid #f1f5f9;
  }

  .moment-replying {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 8px 10px;
    margin-bottom: 10px;
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 12px;
    background: rgba(248, 250, 252, 0.92);
    font-size: 12px;
    color: #334155;
  }

  .reply-info {
    flex: 1;
    min-width: 0;
    line-height: 1.35;
  }

  .moment-reply-cancel {
    border: none;
    background: transparent;
    color: #ef4444;
    font-weight: 900;
    cursor: pointer;
    padding: 0 4px;
    font-size: 16px;
    line-height: 1;
  }

  .moment-comment-input-row {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .moment-comment-input {
    flex: 1;
    min-width: 0;
    padding: 10px 14px;
    border: 1px solid #e2e8f0;
    border-radius: 20px;
    font-size: 14px;
    outline: none;
  }

  .moment-comment-input:focus {
    border-color: #2563eb;
  }

  .moment-send-btn {
    padding: 10px 20px;
    border: none;
    background: #2563eb;
    color: white;
    border-radius: 20px;
    font-weight: 600;
    cursor: pointer;
  }

  .moment-send-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .moments-load-more {
    display: block;
    width: 100%;
    padding: 12px;
    margin-top: 16px;
    border: 1px solid #e2e8f0;
    background: white;
    border-radius: 8px;
    color: #64748b;
    cursor: pointer;
  }

  .moments-load-more:hover {
    background: #f8fafc;
  }

  :global(.moment-sticker-wrap) {
    color: #f59e0b;
  }
</style>
