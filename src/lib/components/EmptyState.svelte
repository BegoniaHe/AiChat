<!--
  EmptyState 空状态组件
  用于展示列表为空或无内容时的状态
-->
<script>
  const { icon = 'empty', title = '暂无内容', description = '', children } = $props();
</script>

<div class="empty-state">
  <div class="empty-icon">{icon}</div>
  <h3 class="empty-title">{title}</h3>
  {#if description}
    <p class="empty-description">{description}</p>
  {/if}
  {#if children}
    <div class="empty-actions">
      {@render children()}
    </div>
  {/if}
</div>

<style>
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 32px;
    text-align: center;
  }

  .empty-icon {
    font-size: 48px;
    margin-bottom: 16px;
    opacity: 0.8;
  }

  .empty-title {
    font-size: 17px;
    font-weight: 600;
    color: var(--color-text);
    margin: 0 0 8px;
  }

  .empty-description {
    font-size: 14px;
    color: var(--color-text-secondary);
    margin: 0 0 24px;
    max-width: 240px;
    line-height: 1.5;
  }

  .empty-actions {
    display: flex;
    gap: 12px;
  }
</style>
