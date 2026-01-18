<!--
  SettingsPanel 设置面板组件
  API 配置、应用设置等
-->
<script>
  import { appSettingsStore, configStore, uiStore } from '$stores';
  import { toast } from 'svelte-sonner';
  import Button from './Button.svelte';
  import Input from './Input.svelte';

  // 当前编辑的配置
  let editingProfile = $state(null);
  let activeTab = $state('api'); // 'api' | 'appearance' | 'about'

  // 创建编辑副本
  function startEdit(profile) {
    editingProfile = { ...profile };
  }

  // 保存配置
  function saveProfile() {
    if (!editingProfile) return;

    if (editingProfile.id === 'new') {
      configStore.add(editingProfile);
      toast.success('配置已创建');
    } else {
      configStore.update(editingProfile.id, editingProfile);
      toast.success('配置已保存');
    }
    editingProfile = null;
  }

  // 取消编辑
  function cancelEdit() {
    editingProfile = null;
  }

  // 删除配置
  function deleteProfile(id) {
    if (configStore.list.length <= 1) {
      toast.error('至少保留一个配置');
      return;
    }
    configStore.remove(id);
    toast.success('配置已删除');
  }

  // 新建配置
  function createProfile() {
    editingProfile = {
      id: 'new',
      name: '新配置',
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      apiKey: '',
      stream: true,
      temperature: 0.7,
      maxTokens: 4096,
    };
  }

  // 切换主题
  function toggleTheme() {
    const next =
      appSettingsStore.theme === 'light'
        ? 'dark'
        : appSettingsStore.theme === 'dark'
          ? 'auto'
          : 'light';
    appSettingsStore.setTheme(next);
  }

  // 关闭面板
  function closePanel() {
    uiStore.closeSettings();
  }
</script>

{#if uiStore.settingsPanelOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
  <div
    class="settings-overlay"
    role="presentation"
    onclick={closePanel}
    onkeydown={(e) => e.key === 'Escape' && closePanel()}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
    <div
      class="settings-panel"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-labelledby="settings-title"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <!-- 头部 -->
      <header class="panel-header">
        <h2 id="settings-title">设置</h2>
        <button class="close-btn" aria-label="关闭设置" onclick={closePanel}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
            />
          </svg>
        </button>
      </header>

      <!-- 标签页 -->
      <div class="tabs">
        <button class="tab" class:active={activeTab === 'api'} onclick={() => (activeTab = 'api')}>
          API 配置
        </button>
        <button
          class="tab"
          class:active={activeTab === 'appearance'}
          onclick={() => (activeTab = 'appearance')}
        >
          外观
        </button>
        <button
          class="tab"
          class:active={activeTab === 'about'}
          onclick={() => (activeTab = 'about')}
        >
          关于
        </button>
      </div>

      <!-- 内容 -->
      <div class="panel-content">
        {#if activeTab === 'api'}
          <!-- API 配置列表 -->
          {#if !editingProfile}
            <div class="section">
              <div class="section-header">
                <h3>API 配置</h3>
                <Button variant="primary" size="sm" onclick={createProfile}>+ 新建</Button>
              </div>

              <div class="profile-list">
                {#each configStore.list as profile (profile.id)}
                  <div class="profile-card" class:active={configStore.activeId === profile.id}>
                    <div class="profile-info">
                      <span class="profile-name">{profile.name}</span>
                      <span class="profile-meta">
                        {profile.provider} · {profile.model}
                      </span>
                    </div>

                    <div class="profile-actions">
                      {#if configStore.activeId !== profile.id}
                        <Button
                          variant="ghost"
                          size="sm"
                          onclick={() => configStore.setActive(profile.id)}
                        >
                          启用
                        </Button>
                      {:else}
                        <span class="active-badge">当前</span>
                      {/if}
                      <Button variant="ghost" size="sm" onclick={() => startEdit(profile)}>
                        编辑
                      </Button>
                      <Button variant="ghost" size="sm" onclick={() => deleteProfile(profile.id)}>
                        删除
                      </Button>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {:else}
            <!-- 编辑配置 -->
            <div class="section">
              <h3>
                {editingProfile.id === 'new' ? '新建配置' : '编辑配置'}
              </h3>

              <div class="form-grid">
                <div class="form-group">
                  <label for="profile-name">配置名称</label>
                  <Input
                    id="profile-name"
                    bind:value={editingProfile.name}
                    placeholder="输入配置名称"
                  />
                </div>

                <div class="form-group">
                  <label for="profile-provider">服务商</label>
                  <select id="profile-provider" class="select" bind:value={editingProfile.provider}>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="gemini">Google Gemini</option>
                    <option value="deepseek">DeepSeek</option>
                    <option value="custom">自定义</option>
                  </select>
                </div>

                <div class="form-group full-width">
                  <label for="profile-baseurl">API 地址</label>
                  <Input
                    id="profile-baseurl"
                    bind:value={editingProfile.baseUrl}
                    placeholder="https://api.openai.com/v1"
                  />
                </div>

                <div class="form-group full-width">
                  <label for="profile-apikey">API Key</label>
                  <Input
                    id="profile-apikey"
                    type="password"
                    bind:value={editingProfile.apiKey}
                    placeholder="sk-..."
                  />
                </div>

                <div class="form-group">
                  <label for="profile-model">模型</label>
                  <Input
                    id="profile-model"
                    bind:value={editingProfile.model}
                    placeholder="gpt-4o-mini"
                  />
                </div>

                <div class="form-group">
                  <label for="profile-temp">温度</label>
                  <input
                    type="range"
                    id="profile-temp"
                    class="range"
                    min="0"
                    max="2"
                    step="0.1"
                    bind:value={editingProfile.temperature}
                  />
                  <span class="range-value">{editingProfile.temperature}</span>
                </div>

                <div class="form-group">
                  <label for="profile-tokens">最大 Tokens</label>
                  <Input
                    id="profile-tokens"
                    type="number"
                    bind:value={editingProfile.maxTokens}
                    placeholder="4096"
                  />
                </div>

                <div class="form-group">
                  <label class="checkbox-label">
                    <input type="checkbox" bind:checked={editingProfile.stream} />
                    启用流式输出
                  </label>
                </div>
              </div>

              <div class="form-actions">
                <Button variant="ghost" onclick={cancelEdit}>取消</Button>
                <Button variant="primary" onclick={saveProfile}>保存</Button>
              </div>
            </div>
          {/if}
        {:else if activeTab === 'appearance'}
          <!-- 外观设置 -->
          <div class="section">
            <h3>主题</h3>
            <div class="theme-options">
              <button
                class="theme-option"
                class:active={appSettingsStore.theme === 'light'}
                onclick={() => appSettingsStore.setTheme('light')}
              >
                <span class="theme-icon">☀️</span>
                <span>浅色</span>
              </button>
              <button
                class="theme-option"
                class:active={appSettingsStore.theme === 'dark'}
                onclick={() => appSettingsStore.setTheme('dark')}
              >
                <span class="theme-icon">🌙</span>
                <span>深色</span>
              </button>
              <button
                class="theme-option"
                class:active={appSettingsStore.theme === 'auto'}
                onclick={() => appSettingsStore.setTheme('auto')}
              >
                <span class="theme-icon">🌓</span>
                <span>跟随系统</span>
              </button>
            </div>
          </div>

          <div class="section">
            <h3>聊天气泡颜色</h3>
            <div class="color-options">
              <div class="color-group">
                <label for="user-bubble-color">用户气泡</label>
                <input
                  id="user-bubble-color"
                  type="color"
                  value={appSettingsStore.userBubbleColor || '#95EC69'}
                  onchange={(e) => appSettingsStore.setUserBubbleColor(e.target.value)}
                />
              </div>
              <div class="color-group">
                <label for="ai-bubble-color">AI 气泡</label>
                <input
                  id="ai-bubble-color"
                  type="color"
                  value={appSettingsStore.aiBubbleColor || '#FFFFFF'}
                  onchange={(e) => appSettingsStore.setAiBubbleColor(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div class="section">
            <h3>通知</h3>
            <label class="checkbox-label">
              <input
                type="checkbox"
                checked={appSettingsStore.soundEnabled}
                onchange={(e) => appSettingsStore.setSoundEnabled(e.target.checked)}
              />
              消息提示音
            </label>
            <label class="checkbox-label">
              <input
                type="checkbox"
                checked={appSettingsStore.notificationsEnabled}
                onchange={(e) => appSettingsStore.setNotificationsEnabled(e.target.checked)}
              />
              桌面通知
            </label>
          </div>
        {:else if activeTab === 'about'}
          <!-- 关于 -->
          <div class="section about-section">
            <div class="app-logo">AiChat</div>
            <h3>AiChat</h3>
            <p class="version">版本 0.2.0</p>
            <p class="description">
              一款现代化的 AI 聊天应用，支持多种 LLM 服务商，提供流畅的对话体验。
            </p>

            <div class="links">
              <a href="https://github.com/begonia/AiChat" target="_blank" rel="noopener noreferrer">
                GitHub
              </a>
              <a
                href="https://github.com/begonia/AiChat/issues"
                target="_blank"
                rel="noopener noreferrer"
              >
                反馈问题
              </a>
            </div>

            <p class="copyright">© 2024-2026 AiChat</p>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .settings-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 1000;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    animation: fadeIn 0.2s ease;
  }

  .settings-panel {
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

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--color-border);
  }

  .panel-header h2 {
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

  .tabs {
    display: flex;
    gap: 4px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--color-border);
  }

  .tab {
    flex: 1;
    padding: 8px 12px;
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text-secondary);
    background: transparent;
    border-radius: var(--radius-md);
    transition: all var(--transition-fast);
  }

  .tab:hover {
    background: var(--color-hover);
  }

  .tab.active {
    background: var(--color-primary);
    color: white;
  }

  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  .section {
    margin-bottom: 24px;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .section h3 {
    font-size: 15px;
    font-weight: 600;
    color: var(--color-text);
    margin-bottom: 12px;
  }

  .section-header h3 {
    margin-bottom: 0;
  }

  /* 配置列表 */
  .profile-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .profile-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px;
    background: var(--color-background);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
  }

  .profile-card.active {
    border-color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary) 5%, var(--color-background));
  }

  .profile-info {
    flex: 1;
    min-width: 0;
  }

  .profile-name {
    display: block;
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text);
  }

  .profile-meta {
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .profile-actions {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .active-badge {
    font-size: 12px;
    color: var(--color-primary);
    padding: 4px 8px;
    background: color-mix(in srgb, var(--color-primary) 15%, transparent);
    border-radius: var(--radius-sm);
  }

  /* 表单 */
  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .form-group.full-width {
    grid-column: span 2;
  }

  .form-group label {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-secondary);
  }

  .select {
    height: 40px;
    padding: 0 12px;
    font-family: inherit;
    font-size: 14px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-background);
    color: var(--color-text);
    outline: none;
  }

  .select:focus {
    border-color: var(--color-primary);
  }

  .range {
    width: 100%;
    accent-color: var(--color-primary);
  }

  .range-value {
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: var(--color-text);
    cursor: pointer;
    padding: 8px 0;
  }

  .checkbox-label input[type='checkbox'] {
    width: 18px;
    height: 18px;
    accent-color: var(--color-primary);
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--color-border);
  }

  /* 主题选项 */
  .theme-options {
    display: flex;
    gap: 8px;
  }

  .theme-option {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 16px 12px;
    background: var(--color-background);
    border: 2px solid var(--color-border);
    border-radius: var(--radius-md);
    transition: all var(--transition-fast);
  }

  .theme-option:hover {
    border-color: var(--color-text-muted);
  }

  .theme-option.active {
    border-color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary) 5%, var(--color-background));
  }

  .theme-icon {
    font-size: 24px;
  }

  /* 颜色选项 */
  .color-options {
    display: flex;
    gap: 16px;
  }

  .color-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .color-group label {
    font-size: 14px;
    color: var(--color-text-secondary);
  }

  .color-group input[type='color'] {
    width: 40px;
    height: 40px;
    padding: 0;
    border: 2px solid var(--color-border);
    border-radius: var(--radius-md);
    cursor: pointer;
  }

  /* 关于页面 */
  .about-section {
    text-align: center;
    padding: 24px 16px;
  }

  .app-logo {
    font-size: 64px;
    margin-bottom: 16px;
  }

  .about-section h3 {
    font-size: 24px;
    margin-bottom: 8px;
  }

  .version {
    font-size: 14px;
    color: var(--color-text-muted);
    margin-bottom: 16px;
  }

  .description {
    font-size: 14px;
    color: var(--color-text-secondary);
    line-height: 1.6;
    margin-bottom: 24px;
  }

  .links {
    display: flex;
    gap: 16px;
    justify-content: center;
    margin-bottom: 24px;
  }

  .links a {
    color: var(--color-primary);
    text-decoration: none;
    font-size: 14px;
  }

  .links a:hover {
    text-decoration: underline;
  }

  .copyright {
    font-size: 12px;
    color: var(--color-text-muted);
  }
</style>
