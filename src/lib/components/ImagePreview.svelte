<!--
  ImagePreview 图片预览组件
  支持缩放和拖动
-->
<script>
  let { src = '', alt = '', open = $bindable(false) } = $props();

  let scale = $state(1);
  let translateX = $state(0);
  let translateY = $state(0);

  function handleClose() {
    scale = 1;
    translateX = 0;
    translateY = 0;
    open = false;
  }

  function handleKeydown(e) {
    if (e.key === 'Escape') {
      handleClose();
    } else if (e.key === '+' || e.key === '=') {
      scale = Math.min(scale + 0.25, 5);
    } else if (e.key === '-') {
      scale = Math.max(scale - 0.25, 0.5);
    } else if (e.key === '0') {
      scale = 1;
      translateX = 0;
      translateY = 0;
    }
  }

  function handleWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    scale = Math.min(Math.max(scale + delta, 0.5), 5);
  }

  // 拖动
  let dragging = $state(false);
  let startX = $state(0);
  let startY = $state(0);

  function handleMouseDown(e) {
    if (scale > 1) {
      dragging = true;
      startX = e.clientX - translateX;
      startY = e.clientY - translateY;
    }
  }

  function handleMouseMove(e) {
    if (dragging) {
      translateX = e.clientX - startX;
      translateY = e.clientY - startY;
    }
  }

  function handleMouseUp() {
    dragging = false;
  }

  // 双击缩放
  function handleDoubleClick() {
    if (scale === 1) {
      scale = 2;
    } else {
      scale = 1;
      translateX = 0;
      translateY = 0;
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open && src}
  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
  <div
    class="preview-overlay"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label="图片预览"
    onclick={handleClose}
    onkeydown={handleKeydown}
    onwheel={handleWheel}
    onmousedown={handleMouseDown}
    onmousemove={handleMouseMove}
    onmouseup={handleMouseUp}
    onmouseleave={handleMouseUp}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
    <img
      class="preview-image"
      {src}
      {alt}
      style:transform="translate({translateX}px, {translateY}px) scale({scale})"
      style:cursor={scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in'}
      onclick={(e) => e.stopPropagation()}
      ondblclick={handleDoubleClick}
      draggable="false"
    />

    <button class="close-btn" aria-label="关闭" onclick={handleClose}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path
          d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
        />
      </svg>
    </button>

    <div class="zoom-controls">
      <button
        aria-label="缩小"
        onclick={(e) => {
          e.stopPropagation();
          scale = Math.max(scale - 0.25, 0.5);
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 13H5v-2h14v2z" />
        </svg>
      </button>
      <span class="zoom-level">{Math.round(scale * 100)}%</span>
      <button
        aria-label="放大"
        onclick={(e) => {
          e.stopPropagation();
          scale = Math.min(scale + 0.25, 5);
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
        </svg>
      </button>
    </div>
  </div>
{/if}

<style>
  .preview-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.95);
    z-index: 1200;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.2s ease;
  }

  .preview-image {
    max-width: 95vw;
    max-height: 90vh;
    object-fit: contain;
    transition: transform 0.1s ease;
    user-select: none;
  }

  .close-btn {
    position: fixed;
    top: 16px;
    right: 16px;
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 50%;
    color: white;
    transition: background var(--transition-fast);
  }

  .close-btn:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .zoom-controls {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 12px;
    background: rgba(0, 0, 0, 0.6);
    padding: 8px 16px;
    border-radius: var(--radius-full);
  }

  .zoom-controls button {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 50%;
    color: white;
    transition: background var(--transition-fast);
  }

  .zoom-controls button:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .zoom-level {
    color: white;
    font-size: 14px;
    min-width: 50px;
    text-align: center;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
