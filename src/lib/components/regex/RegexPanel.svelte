<script>
  /**
   * Regex Panel Component
   * - Global and Local regex management
   * - ST-like interface with tabs
   */
  import { getRegexStore, getWorldInfoStore } from '$stores';
  import Modal from '../Modal.svelte';
  import RegexRuleCard from './RegexRuleCard.svelte';
  import { createDefaultRule, formatBind, normalizeScript, PRESET_TYPES } from './regex-types.js';

  const store = getRegexStore();
  const worldStore = getWorldInfoStore();

  // Modal state
  let visible = $state(false);
  let activeTab = $state('global'); // 'global' | 'local'
  let statusMessage = $state('');
  let statusType = $state('info');

  // Global state
  let globalEnabled = $state(true);
  let globalRules = $state([]);

  // Local state
  let localSets = $state([]);
  let activeLocalSetId = $state(null);
  let currentLocalSet = $state(null);
  let localEnabled = $state(true);
  let localRules = $state([]);
  let localName = $state('');

  // Binding state
  let bindType = $state(''); // '' | 'preset' | 'world'
  let bindPresetType = $state('openai');
  let bindPresetId = $state('');
  let bindWorldId = $state('');
  let presetList = $state([]);
  let worldList = $state([]);

  /**
   * Show panel
   */
  export async function show() {
    await store.ready;
    await refreshAll();
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
   * Refresh all data
   */
  async function refreshAll() {
    await store.ready;

    if (activeTab === 'global') {
      await refreshGlobal();
    } else {
      await refreshLocal();
    }
  }

  /**
   * Refresh global rules
   */
  async function refreshGlobal() {
    const g = store.getGlobal();
    globalEnabled = g.enabled !== false;
    globalRules = (Array.isArray(g.rules) ? g.rules : []).map((r) => normalizeScript(r));
  }

  /**
   * Refresh local sets
   */
  async function refreshLocal() {
    localSets = store.listLocalSets();

    // Select first set if none selected
    if (!activeLocalSetId && localSets[0]?.id) {
      activeLocalSetId = localSets[0].id;
    }

    // Load current set
    if (activeLocalSetId) {
      currentLocalSet = store.getLocalSet(activeLocalSetId);
      if (currentLocalSet) {
        localName = currentLocalSet.name || '';
        localEnabled = currentLocalSet.enabled !== false;
        localRules = (Array.isArray(currentLocalSet.rules) ? currentLocalSet.rules : []).map((r) =>
          normalizeScript(r)
        );

        // Load binding
        if (currentLocalSet.bind?.type === 'preset') {
          bindType = 'preset';
          bindPresetType = currentLocalSet.bind.presetType || 'openai';
          bindPresetId = currentLocalSet.bind.presetId || '';
        } else if (currentLocalSet.bind?.type === 'world') {
          bindType = 'world';
          bindWorldId = currentLocalSet.bind.worldId || '';
        } else {
          bindType = '';
        }
      }
    } else {
      currentLocalSet = null;
      localRules = [];
    }

    // Load preset list
    updatePresetList();

    // Load world list
    await updateWorldList();
  }

  /**
   * Update preset list based on selected type
   */
  function updatePresetList() {
    const presets = window.appBridge?.presets?.list?.(bindPresetType) || [];
    presetList = presets;
  }

  /**
   * Update world list
   */
  async function updateWorldList() {
    await worldStore.ready;
    worldList = worldStore.list() || [];
  }

  /**
   * Switch tab
   */
  function switchTab(tab) {
    activeTab = tab;
    refreshAll();
  }

  /**
   * Add new global rule
   */
  function addGlobalRule() {
    globalRules = [...globalRules, createDefaultRule()];
  }

  /**
   * Delete global rule
   */
  function deleteGlobalRule(index) {
    globalRules = globalRules.filter((_, i) => i !== index);
  }

  /**
   * Save global rules
   */
  async function saveGlobal() {
    try {
      await store.setGlobal({
        enabled: globalEnabled,
        rules: globalRules,
      });
      showStatus('已保存全局正则', 'success');
      window.dispatchEvent(new CustomEvent('regex-changed'));
    } catch (err) {
      console.error('保存全局正则失败', err);
      showStatus(err.message || '保存失败', 'error');
    }
  }

  /**
   * Create new local set
   */
  async function createLocalSet() {
    const name = prompt('新建局部正则名称', '新正则');
    if (!name) return;

    const id = await store.upsertLocalSet({
      name,
      enabled: true,
      bind: null,
      rules: [],
    });
    activeLocalSetId = id;
    await refreshLocal();
    showStatus('已新建', 'success');
    window.dispatchEvent(new CustomEvent('regex-changed'));
  }

  /**
   * Delete current local set
   */
  async function deleteLocalSet() {
    if (!activeLocalSetId) return;

    const cur = store.getLocalSet(activeLocalSetId);
    if (!confirm(`删除局部正则「${cur?.name || activeLocalSetId}」？`)) return;

    await store.removeLocalSet(activeLocalSetId);
    activeLocalSetId = null;
    await refreshLocal();
    showStatus('已删除', 'success');
    window.dispatchEvent(new CustomEvent('regex-changed'));
  }

  /**
   * Select a local set
   */
  async function selectLocalSet(id) {
    activeLocalSetId = id;
    await refreshLocal();
  }

  /**
   * Rename current local set
   */
  async function renameLocalSet() {
    if (!currentLocalSet) return;

    const name = prompt('重命名局部正则', currentLocalSet.name || '局部正则');
    if (!name) return;

    await store.upsertLocalSet({ ...currentLocalSet, name });
    await refreshLocal();
    showStatus('已重命名', 'success');
    window.dispatchEvent(new CustomEvent('regex-changed'));
  }

  /**
   * Add new local rule
   */
  function addLocalRule() {
    localRules = [...localRules, createDefaultRule()];
  }

  /**
   * Delete local rule
   */
  function deleteLocalRule(index) {
    localRules = localRules.filter((_, i) => i !== index);
  }

  /**
   * Save local set
   */
  async function saveLocal() {
    if (!activeLocalSetId) return;

    try {
      let bind = null;
      if (bindType === 'preset') {
        bind = {
          type: 'preset',
          presetType: bindPresetType,
          presetId: bindPresetId,
        };
      } else if (bindType === 'world') {
        bind = { type: 'world', worldId: bindWorldId };
      }

      await store.upsertLocalSet({
        id: activeLocalSetId,
        name: localName,
        enabled: localEnabled,
        bind,
        rules: localRules,
      });

      showStatus('已保存局部正则', 'success');
      window.dispatchEvent(new CustomEvent('regex-changed'));
    } catch (err) {
      console.error('保存局部正则失败', err);
      showStatus(err.message || '保存失败', 'error');
    }
  }
</script>

<Modal bind:open={visible} title="正规表达式" size="xl" closable>
  <div class="regex-panel">
    <!-- Header with description -->
    <div class="panel-desc">
      参考 ST：按规则替换输入/输出文本；支持全局与绑定预设/世界书的局部规则
    </div>

    <!-- Tabs -->
    <div class="tabs-bar">
      <div class="tabs">
        <button
          class="tab"
          class:active={activeTab === 'global'}
          onclick={() => switchTab('global')}
        >
          全局正则
        </button>
        <button class="tab" class:active={activeTab === 'local'} onclick={() => switchTab('local')}>
          局部正则
        </button>
      </div>
    </div>

    <!-- Content -->
    <div class="panel-content">
      {#if activeTab === 'global'}
        <!-- Global Tab -->
        <div class="global-content">
          <div class="toolbar">
            <label class="checkbox-label">
              <input type="checkbox" bind:checked={globalEnabled} />
              启用全局正则
            </label>
            <div class="toolbar-actions">
              <button class="btn" onclick={addGlobalRule}>＋ 新增规则</button>
              <button class="btn btn-primary" onclick={saveGlobal}>保存</button>
            </div>
          </div>

          <div class="rules-list">
            {#each globalRules as rule, i (rule.id)}
              <RegexRuleCard bind:rule={globalRules[i]} onDelete={() => deleteGlobalRule(i)} />
            {/each}

            {#if globalRules.length === 0}
              <div class="empty">暂无全局正则规则</div>
            {/if}
          </div>
        </div>
      {:else}
        <!-- Local Tab -->
        <div class="local-content">
          <!-- Left: Set List -->
          <div class="sets-column">
            <div class="sets-header">局部正则集合</div>
            <div class="sets-toolbar">
              <button class="btn" onclick={createLocalSet}>＋ 新建</button>
              <button class="btn btn-danger" onclick={deleteLocalSet}>删除</button>
            </div>
            <div class="sets-list">
              {#if localSets.length === 0}
                <div class="empty">暂无局部正则集合</div>
              {:else}
                {#each localSets as set (set.id)}
                  <button
                    class="set-item"
                    class:active={set.id === activeLocalSetId}
                    onclick={() => selectLocalSet(set.id)}
                  >
                    <div class="set-name">
                      {set.name || set.id}
                    </div>
                    <div class="set-bind">
                      {set.bind ? formatBind(set.bind) : '未绑定（不会自动启用）'}
                    </div>
                  </button>
                {/each}
              {/if}
            </div>
          </div>

          <!-- Right: Editor -->
          <div class="editor-column">
            {#if currentLocalSet}
              <div class="editor-header">
                <div class="editor-info">
                  <div class="editor-title">
                    局部正则：{localName}
                  </div>
                  <div class="editor-desc">绑定到预设或世界书后，切换到对应对象时自动生效</div>
                </div>
                <div class="editor-actions">
                  <button class="btn" onclick={renameLocalSet}>✎ 重命名</button>
                  <button class="btn btn-primary" onclick={saveLocal}>保存</button>
                </div>
              </div>

              <div class="editor-options">
                <label class="checkbox-label">
                  <input type="checkbox" bind:checked={localEnabled} />
                  启用集合
                </label>

                <div class="bind-row">
                  <span class="bind-label">绑定</span>
                  <select bind:value={bindType}>
                    <option value="">不绑定</option>
                    <option value="preset">绑定预设</option>
                    <option value="world">绑定世界书</option>
                  </select>

                  {#if bindType === 'preset'}
                    <select bind:value={bindPresetType} onchange={updatePresetList}>
                      {#each PRESET_TYPES as t}
                        <option value={t.id}>{t.label}</option>
                      {/each}
                    </select>
                    <select bind:value={bindPresetId}>
                      {#each presetList as p}
                        <option value={p.id}>{p.name || p.id}</option>
                      {/each}
                    </select>
                  {/if}

                  {#if bindType === 'world'}
                    <select bind:value={bindWorldId}>
                      {#each worldList as name}
                        <option value={name}>{name}</option>
                      {/each}
                    </select>
                  {/if}
                </div>
              </div>

              <div class="rules-toolbar">
                <div class="rules-title">规则</div>
                <button class="btn" onclick={addLocalRule}>＋ 新增规则</button>
              </div>

              <div class="rules-list">
                {#each localRules as rule, i (rule.id)}
                  <RegexRuleCard bind:rule={localRules[i]} onDelete={() => deleteLocalRule(i)} />
                {/each}

                {#if localRules.length === 0}
                  <div class="empty">暂无规则</div>
                {/if}
              </div>
            {:else}
              <div class="empty">请选择或新建一个局部正则集合</div>
            {/if}
          </div>
        </div>
      {/if}

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
  </div>
</Modal>

<style>
  .regex-panel {
    display: flex;
    flex-direction: column;
    min-height: 400px;
    max-height: 70vh;
  }

  .panel-desc {
    color: #64748b;
    font-size: 12px;
    margin-bottom: 12px;
  }

  /* Tabs */
  .tabs-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 12px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    padding-bottom: 10px;
  }

  .tabs {
    display: flex;
    gap: 8px;
  }

  .tab {
    border: none;
    background: transparent;
    padding: 10px 12px;
    border-radius: 10px;
    cursor: pointer;
    font-size: 14px;
    color: #334155;
    font-weight: 600;
    transition: all 0.15s;
  }

  .tab.active {
    background: #e2e8f0;
    color: #0f172a;
    font-weight: 800;
  }

  .tab:hover:not(.active) {
    background: #f1f5f9;
  }

  /* Content */
  .panel-content {
    flex: 1;
    overflow: auto;
  }

  /* Global Content */
  .global-content {
    display: flex;
    flex-direction: column;
    gap: 12px;
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

  .rules-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  /* Local Content */
  .local-content {
    display: flex;
    gap: 12px;
    align-items: stretch;
    flex-wrap: wrap;
  }

  .sets-column {
    flex: 1;
    min-width: 220px;
    max-width: 320px;
  }

  .sets-header {
    font-weight: 800;
    color: #0f172a;
    margin-bottom: 8px;
  }

  .sets-toolbar {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
  }

  .sets-list {
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 12px;
    overflow: hidden;
  }

  .set-item {
    width: 100%;
    text-align: left;
    padding: 10px 12px;
    border: none;
    cursor: pointer;
    background: #fff;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  }

  .set-item:last-child {
    border-bottom: none;
  }

  .set-item.active {
    background: #e2e8f0;
  }

  .set-item:hover:not(.active) {
    background: #f8fafc;
  }

  .set-name {
    font-weight: 800;
    color: #0f172a;
  }

  .set-bind {
    font-size: 12px;
    color: #64748b;
    margin-top: 2px;
  }

  .editor-column {
    flex: 3;
    min-width: 280px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .editor-header {
    border: 1px solid rgba(0, 0, 0, 0.06);
    border-radius: 12px;
    padding: 12px;
    background: rgba(248, 250, 252, 0.6);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }

  .editor-info {
    flex: 1;
    min-width: 220px;
  }

  .editor-title {
    font-weight: 800;
    color: #0f172a;
  }

  .editor-desc {
    color: #64748b;
    font-size: 12px;
    margin-top: 4px;
  }

  .editor-actions {
    display: flex;
    gap: 8px;
  }

  .editor-options {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    align-items: center;
  }

  .bind-row {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    align-items: center;
  }

  .bind-label {
    font-size: 13px;
    color: #334155;
    font-weight: 700;
  }

  .rules-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .rules-title {
    font-weight: 800;
    color: #0f172a;
  }

  /* Common */
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

  select {
    padding: 8px 10px;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    font-size: 13px;
    min-width: 120px;
  }

  select:focus {
    outline: none;
    border-color: #019aff;
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

  .btn-danger {
    background: #fee2e2;
    color: #b91c1c;
    border-color: #fecaca;
  }

  .btn-danger:hover {
    background: #fecaca;
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
