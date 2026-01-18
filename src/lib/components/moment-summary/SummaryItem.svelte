<script>
  /**
   * SummaryItem.svelte - 摘要项组件
   * 显示单条摘要，支持选择和点击复制
   */
  import { formatTime, escapeHtml } from './moment-summary-types.js';

  /**
   * @typedef {Object} Props
   * @property {string} text - 摘要文本
   * @property {number} [at=0] - 时间戳
   * @property {boolean} [batchMode=false] - 是否批量模式
   * @property {boolean} [selected=false] - 是否选中
   * @property {() => void} [onToggle] - 切换选中回调
   * @property {() => void} [onClick] - 点击回调
   */

  /** @type {Props} */
  const { text, at = 0, batchMode = false, selected = false, onToggle, onClick } = $props();

  const time = $derived(formatTime(at));

  function handleClick() {
    if (batchMode) {
      onToggle?.();
    } else {
      onClick?.();
    }
  }

  async function copyToClipboard() {
    try {
      await navigator.clipboard?.writeText?.(text);
      window.toastr?.success?.('已复制摘要');
    } catch {}
  }
</script>

<button class="summary-item" class:batch-mode={batchMode} class:selected onclick={handleClick}>
  {#if batchMode}
    <div class="checkbox" class:checked={selected}>
      {#if selected}✓{/if}
    </div>
  {/if}
  <div class="content">
    <div class="text">{text}</div>
    {#if time}
      <div class="time">{time}</div>
    {/if}
  </div>
</button>

<style>
  .summary-item {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 10px;
    border: none;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    background: #fff;
    width: 100%;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s;
  }

  .summary-item:hover {
    background: #f8fafc;
  }

  .summary-item.selected {
    background: rgba(59, 130, 246, 0.06);
  }

  .checkbox {
    width: 20px;
    height: 20px;
    border-radius: 999px;
    border: 2px solid rgba(0, 0, 0, 0.2);
    margin-top: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-weight: 900;
    font-size: 12px;
    background: transparent;
    box-sizing: border-box;
    flex-shrink: 0;
    transition: all 0.15s;
  }

  .checkbox.checked {
    border-color: #2563eb;
    background: #2563eb;
  }

  .content {
    flex: 1;
    min-width: 0;
  }

  .text {
    color: #0f172a;
    font-size: 13px;
    line-height: 1.35;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .time {
    color: #94a3b8;
    font-size: 11px;
    margin-top: 6px;
  }
</style>
