<script>
  /**
   * Regex Session Panel Component
   * - Session-scoped regex rules
   * - Only applies in the current chat session
   */
  import { getRegexStore } from '$stores';
  import Modal from '../Modal.svelte';
  import RegexRuleCard from './RegexRuleCard.svelte';
  import { createDefaultRule, normalizeScript } from './regex-types.js';

  /** @type {{ getSessionId?: () => string }} */
  const { getSessionId = null } = $props();

  const store = getRegexStore();

  // Modal state
  let visible = $state(false);
  let statusMessage = $state('');
  let statusType = $state('info');

  // Session state
  let sessionId = $state('default');
  let enabled = $state(true);
  let rules = $state([]);

  /**
   * Show panel
   */
  export async function show() {
    await store.ready;
    await refresh();
    visible = true;
  }

  /**
   * Hide panel
   */
  export function hide() {
    visible = false;
  }

  /**
   * Show status message
   */
  function showStatus(message, type = 'info') {
    statusMessage = message;
    statusType = type;
    setTimeout(() => {
      statusMessage = '';
    }, 2200);
  }

  /**
   * Refresh session rules
   */
  async function refresh() {
    await store.ready;

    sessionId = getSessionId?.() || 'default';
    const state = store.getSession(sessionId);

    enabled = state.enabled !== false;
    rules = (Array.isArray(state.rules) ? state.rules : []).map((r) => normalizeScript(r));
  }

  /**
   * Add new rule
   */
  function addRule() {
    rules = [...rules, createDefaultRule()];
  }

  /**
   * Delete rule
   */
  function deleteRule(index) {
    rules = rules.filter((_, i) => i !== index);
  }

  /**
   * Save session rules
   */
  async function save() {
    if (!sessionId) return;

    try {
      await store.setSession(sessionId, { enabled, rules });
      showStatus('已保存', 'success');
      window.dispatchEvent(new CustomEvent('regex-changed'));
    } catch (err) {
      console.error('保存聊天室正则失败', err);
      showStatus(err.message || '保存失败', 'error');
    }
  }
</script>

<Modal bind:open={visible} title="正规表达式（聊天室）" size="lg" closable>
  <div class="regex-session-panel">
    <!-- Session info -->
    <div class="session-info">
      当前会话：{sessionId}
    </div>

    <!-- Toolbar -->
    <div class="toolbar">
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={enabled} />
        启用本聊天室正则
      </label>
      <div class="toolbar-actions">
        <button class="btn" onclick={addRule}>＋ 新增规则</button>
        <button class="btn btn-primary" onclick={save}>保存</button>
      </div>
    </div>

    <!-- Rules list -->
    <div class="rules-list">
      {#each rules as rule, i (rule.id)}
        <RegexRuleCard bind:rule={rules[i]} onDelete={() => deleteRule(i)} />
      {/each}

      {#if rules.length === 0}
        <div class="empty">暂无聊天室正则规则</div>
      {/if}
    </div>

    <!-- Status Message -->
    {#if statusMessage}
      <div
        class="status-message"
        class:success={statusType === 'success'}
        class:error={statusType === 'error'}
      >
        {statusMessage}
      </div>
    {/if}
  </div>
</Modal>

<style>
  .regex-session-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 300px;
    max-height: 70vh;
  }

  .session-info {
    color: #64748b;
    font-size: 12px;
  }

  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }

  .toolbar-actions {
    display: flex;
    gap: 8px;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #334155;
    cursor: pointer;
  }

  .checkbox-label input {
    width: 16px;
    height: 16px;
  }

  .rules-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow: auto;
    flex: 1;
  }

  .btn {
    padding: 10px 12px;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    background: #fff;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.15s;
  }

  .btn:hover {
    background: #f5f5f5;
  }

  .btn-primary {
    background: #019aff;
    color: #fff;
    border-color: #019aff;
    font-weight: 700;
  }

  .btn-primary:hover {
    background: #0284c7;
  }

  .empty {
    padding: 12px;
    color: #94a3b8;
    text-align: center;
  }

  .status-message {
    margin-top: 12px;
    padding: 10px;
    border-radius: 10px;
    font-size: 13px;
    background: #dbeafe;
    color: #1e40af;
  }

  .status-message.success {
    background: #dcfce7;
    color: #166534;
  }

  .status-message.error {
    background: #fee2e2;
    color: #991b1b;
  }
</style>
