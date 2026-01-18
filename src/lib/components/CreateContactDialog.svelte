<!--
  CreateContactDialog 创建联系人对话框
  包含完整的联系人创建功能
-->
<script>
  import { contactsStore } from '$stores';
  import { toast } from 'svelte-sonner';
  import Avatar from './Avatar.svelte';
  import Button from './Button.svelte';
  import Input from './Input.svelte';

  let { open = $bindable(false), oncreated } = $props();

  // 表单数据
  let formData = $state({
    name: '',
    description: '',
    avatar: '',
    systemPrompt: '',
  });

  // 展开高级选项
  let showAdvanced = $state(false);

  // 预设角色
  const presets = [
    {
      name: '通用助手',
      description: '智能 AI 助手',
      systemPrompt: '你是一个友好、专业的 AI 助手，能够回答各种问题并提供帮助。',
    },
    {
      name: '编程导师',
      description: '编程学习助手',
      systemPrompt:
        '你是一个耐心的编程导师，擅长用简单易懂的方式解释复杂的编程概念。你会循序渐进地引导用户学习，并提供实用的代码示例。',
    },
    {
      name: '写作助手',
      description: '文案创作专家',
      systemPrompt:
        '你是一个专业的写作助手，擅长各类文案创作、文章润色和内容优化。你会根据用户需求提供创意建议和修改意见。',
    },
    {
      name: '翻译官',
      description: '多语言翻译',
      systemPrompt:
        '你是一个专业的翻译助手，精通中文、英文、日文等多种语言。你会提供准确、流畅的翻译，并解释语言背后的文化含义。',
    },
  ];

  // 使用预设
  function usePreset(preset) {
    formData = {
      name: preset.name,
      description: preset.description,
      avatar: formData.avatar,
      systemPrompt: preset.systemPrompt,
    };
    showAdvanced = true;
  }

  // 重置表单
  function resetForm() {
    formData = {
      name: '',
      description: '',
      avatar: '',
      systemPrompt: '',
    };
    showAdvanced = false;
  }

  // 关闭对话框
  function close() {
    open = false;
    resetForm();
  }

  // 创建联系人
  function create() {
    if (!formData.name.trim()) {
      toast.error('请输入名称');
      return;
    }

    const contact = contactsStore.add({
      name: formData.name.trim(),
      description: formData.description.trim() || 'AI 助手',
      avatar: formData.avatar.trim(),
      systemPrompt: formData.systemPrompt.trim(),
    });

    toast.success(`已创建联系人「${contact.name}」`);
    oncreated?.(contact);
    close();
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
  <div
    class="dialog-overlay"
    role="presentation"
    onclick={close}
    onkeydown={(e) => e.key === 'Escape' && close()}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
    <div
      class="dialog"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-labelledby="dialog-title"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <header class="dialog-header">
        <h2 id="dialog-title">创建联系人</h2>
        <button class="close-btn" aria-label="关闭" onclick={close}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
            />
          </svg>
        </button>
      </header>

      <div class="dialog-content">
        <!-- 预设选择 -->
        <div class="presets-section">
          <h3>快速选择预设</h3>
          <div class="preset-list">
            {#each presets as preset}
              <button class="preset-item" onclick={() => usePreset(preset)}>
                <span class="preset-name">{preset.name}</span>
                <span class="preset-desc">{preset.description}</span>
              </button>
            {/each}
          </div>
        </div>

        <div class="divider">
          <span>或自定义</span>
        </div>

        <!-- 基本信息 -->
        <div class="form-section">
          <div class="avatar-preview">
            <Avatar src={formData.avatar} alt={formData.name || '预览'} size="xl" />
          </div>

          <div class="form-group">
            <label for="contact-name">名称 *</label>
            <Input id="contact-name" bind:value={formData.name} placeholder="输入角色名称" />
          </div>

          <div class="form-group">
            <label for="contact-desc">描述</label>
            <Input
              id="contact-desc"
              bind:value={formData.description}
              placeholder="简短描述（可选）"
            />
          </div>
        </div>

        <!-- 高级选项 -->
        <button class="toggle-advanced" onclick={() => (showAdvanced = !showAdvanced)}>
          <span>{showAdvanced ? '收起' : '展开'}高级选项</span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
            class:rotated={showAdvanced}
          >
            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
          </svg>
        </button>

        {#if showAdvanced}
          <div class="advanced-section">
            <div class="form-group">
              <label for="contact-avatar">头像 URL</label>
              <Input id="contact-avatar" bind:value={formData.avatar} placeholder="https://..." />
            </div>

            <div class="form-group">
              <label for="contact-prompt">系统提示词</label>
              <textarea
                id="contact-prompt"
                class="textarea"
                bind:value={formData.systemPrompt}
                placeholder="定义 AI 的角色和行为..."
                rows="4"
              ></textarea>
              <p class="hint">系统提示词会在每次对话开始时发送给 AI，用于定义角色特性</p>
            </div>
          </div>
        {/if}
      </div>

      <footer class="dialog-footer">
        <Button variant="ghost" onclick={close}>取消</Button>
        <Button variant="primary" onclick={create}>创建</Button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .dialog-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    z-index: 1000;
    animation: fadeIn 0.2s ease;
  }

  .dialog {
    width: 100%;
    max-width: 480px;
    max-height: 90vh;
    background: var(--color-surface);
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
    display: flex;
    flex-direction: column;
    animation: slideUp 0.3s ease;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes slideUp {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }

  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--color-border);
  }

  .dialog-header h2 {
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text);
  }

  .close-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    color: var(--color-text-secondary);
    border-radius: var(--radius-md);
    transition: background var(--transition-fast);
  }

  .close-btn:hover {
    background: var(--color-hover);
  }

  .dialog-content {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
  }

  .presets-section h3 {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 12px;
  }

  .preset-list {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .preset-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px;
    background: var(--color-background);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    text-align: left;
    transition: all var(--transition-fast);
  }

  .preset-item:hover {
    border-color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary) 5%, var(--color-background));
  }

  .preset-name {
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text);
  }

  .preset-desc {
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .divider {
    display: flex;
    align-items: center;
    gap: 16px;
    margin: 20px 0;
    color: var(--color-text-muted);
    font-size: 13px;
  }

  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--color-border);
  }

  .form-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .avatar-preview {
    display: flex;
    justify-content: center;
    margin-bottom: 8px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .form-group label {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-secondary);
  }

  .textarea {
    padding: 12px;
    font-family: inherit;
    font-size: 14px;
    line-height: 1.5;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-background);
    color: var(--color-text);
    resize: vertical;
    min-height: 80px;
  }

  .textarea:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .hint {
    font-size: 12px;
    color: var(--color-text-muted);
    margin-top: 4px;
  }

  .toggle-advanced {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    width: 100%;
    padding: 12px;
    margin-top: 16px;
    background: transparent;
    color: var(--color-primary);
    font-size: 14px;
    font-weight: 500;
    border-radius: var(--radius-md);
    transition: background var(--transition-fast);
  }

  .toggle-advanced:hover {
    background: var(--color-hover);
  }

  .toggle-advanced svg {
    transition: transform 0.2s ease;
  }

  .toggle-advanced svg.rotated {
    transform: rotate(180deg);
  }

  .advanced-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--color-border);
    animation: fadeIn 0.2s ease;
  }

  .dialog-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 16px 20px;
    border-top: 1px solid var(--color-border);
  }
</style>
