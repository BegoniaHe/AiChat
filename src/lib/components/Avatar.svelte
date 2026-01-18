<!--
  Avatar 组件
  显示用户/联系人头像
-->
<script>
  /** @type {string} */
  const { src = '', alt = '', size = 'md', fallback = '' } = $props();

  const sizes = {
    sm: 32,
    md: 40,
    lg: 56,
    xl: 72,
  };

  let hasError = $state(false);

  function handleError() {
    hasError = true;
  }

  const sizeValue = $derived(sizes[size] || sizes.md);
  const showFallback = $derived(!src || hasError);
  const initials = $derived(
    fallback ||
      alt
        .split(' ')
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase() ||
      '?'
  );
</script>

<div
  class="avatar"
  style:width="{sizeValue}px"
  style:height="{sizeValue}px"
  style:font-size="{sizeValue * 0.4}px"
>
  {#if showFallback}
    <span class="fallback">{initials}</span>
  {:else}
    <img {src} {alt} onerror={handleError} />
  {/if}
</div>

<style>
  .avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--color-primary-light, #1e293b);
    color: white;
    overflow: hidden;
    flex-shrink: 0;
  }

  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .fallback {
    font-weight: 600;
    user-select: none;
  }
</style>
