<script>
  /**
   * SessionItem.svelte - 会话列表项
   * 显示联系人/会话的基本信息
   */
  import Avatar from '../Avatar.svelte';
  import Badge from '../Badge.svelte';

  /**
   * @typedef {Object} Props
   * @property {string} id - 会话 ID
   * @property {string} name - 显示名称
   * @property {string} [avatar=''] - 头像
   * @property {boolean} [isGroup=false] - 是否群组
   * @property {number} [membersCount=0] - 群成员数
   * @property {string} [snippet=''] - 消息预览
   * @property {string} [time=''] - 时间
   * @property {number} [unread=0] - 未读数
   * @property {boolean} [isCurrent=false] - 是否当前会话
   * @property {() => void} [onSwitch] - 切换回调
   * @property {() => void} [onRename] - 改名回调
   * @property {() => void} [onDelete] - 删除回调
   */

  /** @type {Props} */
  const {
    id,
    name,
    avatar = '',
    isGroup = false,
    membersCount = 0,
    snippet = '',
    time = '',
    unread = 0,
    isCurrent = false,
    onSwitch,
    onRename,
    onDelete,
  } = $props();

  // 显示名称（群组显示成员数）
  const displayName = $derived(isGroup ? `${name}(${membersCount})` : name);
</script>

<div class="session-item" class:current={isCurrent}>
  <div class="info">
    <div class="name-row">
      <span class="name">{displayName}</span>
      {#if unread > 0}
        <Badge count={unread} />
      {/if}
      {#if isGroup}
        <span class="group-badge">群</span>
      {/if}
      {#if isCurrent}
        <span class="current-tag">当前</span>
      {/if}
    </div>
    <div class="snippet-row">
      <span class="snippet">{snippet}</span>
      {#if time}
        <span class="time">{time}</span>
      {/if}
    </div>
  </div>

  <div class="actions">
    <button
      class="action-btn"
      class:primary={isCurrent}
      onclick={onSwitch}
    >
      {isCurrent ? '当前' : '切换'}
    </button>
    <button class="action-btn" onclick={onRename}>改名</button>
    <button class="action-btn danger" onclick={onDelete}>删除</button>
  </div>
</div>

<style>
  .session-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 8px;
    border-bottom: 1px solid #f0f0f0;
  }

  .session-item.current {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
  }

  .info {
    flex: 1;
    min-width: 0;
  }

  .name-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .name {
    font-weight: bold;
    color: #333;
  }

  .group-badge {
    padding: 2px 6px;
    border-radius: 8px;
    background: #e0f2fe;
    color: #0369a1;
    font-size: 11px;
  }

  .current-tag {
    color: #059669;
    font-size: 11px;
  }

  .snippet-row {
    margin-top: 2px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .snippet {
    color: #888;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .time {
    color: #9ca3af;
    font-size: 11px;
    flex-shrink: 0;
  }

  .actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }

  .action-btn {
    padding: 4px 8px;
    border: 1px solid #ddd;
    border-radius: 6px;
    background: #f5f5f5;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.15s;
  }

  .action-btn:hover {
    background: #e5e5e5;
  }

  .action-btn.primary {
    background: #e0f2fe;
    border-color: #bae6fd;
    color: #0369a1;
  }

  .action-btn.danger {
    border-color: #fca5a5;
    background: #fee2e2;
    color: #b91c1c;
  }

  .action-btn.danger:hover {
    background: #fecaca;
  }
</style>
