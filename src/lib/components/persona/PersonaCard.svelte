<script>
  /**
   * PersonaCard.svelte - 角色卡片组件
   * 显示单个 Persona，支持选中和编辑
   */
  import Avatar from '../Avatar.svelte';

  /**
   * @typedef {Object} Props
   * @property {import('$stores').Persona} persona - 角色数据
   * @property {boolean} [isActive=false] - 是否激活
   * @property {boolean} [isLocked=false] - 是否会话锁定
   * @property {boolean} [showLockButton=false] - 是否显示锁定按钮
   * @property {() => void} [onSelect] - 选中回调
   * @property {() => void} [onEdit] - 编辑回调
   * @property {() => void} [onLock] - 锁定回调
   */

  /** @type {Props} */
  const {
    persona,
    isActive = false,
    isLocked = false,
    showLockButton = false,
    onSelect,
    onEdit,
    onLock,
  } = $props();

  function handleClick(e) {
    // 忽略按钮点击
    if (e.target.closest('button')) return;
    onSelect?.();
  }

  function handleEdit(e) {
    e.stopPropagation();
    onEdit?.();
  }

  function handleLock(e) {
    e.stopPropagation();
    onLock?.();
  }
</script>

<div
  class="persona-card"
  class:active={isActive}
  onclick={handleClick}
  role="button"
  tabindex="0"
  onkeydown={(e) => e.key === 'Enter' && handleClick(e)}
>
  <div class="avatar-wrap">
    <Avatar
      src={persona.avatar}
      alt={persona.name}
      size={40}
      fallback="./assets/external/feather-default.png"
    />
    {#if isActive}
      <div class="active-badge"></div>
    {/if}
    {#if isLocked}
      <div class="lock-badge" title="此会话已锁定">锁定</div>
    {/if}
  </div>

  <div class="info">
    <div class="name">{persona.name}</div>
    <div class="desc">{persona.description || '暂无描述'}</div>
  </div>

  {#if showLockButton}
    <button
      class="lock-btn"
      class:locked={isLocked}
      title="批量绑定/解绑联系人（含群组）"
      onclick={handleLock}
    >
      🔒
    </button>
  {/if}

  <button class="edit-btn" title="编辑角色" onclick={handleEdit}>✎</button>
</div>

<style>
  .persona-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px;
    background: white;
    border: 1px solid transparent;
    border-radius: 8px;
    margin-bottom: 5px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .persona-card:hover {
    background: #f8fafc;
  }

  .persona-card.active {
    background: #f0f9ff;
    border-color: #bae6fd;
  }

  .avatar-wrap {
    position: relative;
    flex-shrink: 0;
  }

  .active-badge {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 14px;
    height: 14px;
    background: #007bff;
    border-radius: 50%;
    border: 2px solid white;
  }

  .lock-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    width: 18px;
    height: 18px;
    background: #0f172a;
    color: #fff;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    border: 2px solid #fff;
  }

  .info {
    flex: 1;
    min-width: 0;
  }

  .name {
    font-weight: bold;
    color: #333;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .desc {
    font-size: 12px;
    color: #999;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .lock-btn,
  .edit-btn {
    padding: 8px;
    border: none;
    background: transparent;
    color: #999;
    cursor: pointer;
    font-size: 16px;
    flex-shrink: 0;
    border-radius: 8px;
    transition: background 0.15s;
  }

  .lock-btn:hover,
  .edit-btn:hover {
    background: #f1f5f9;
  }

  .lock-btn.locked {
    color: #0f172a;
  }
</style>
