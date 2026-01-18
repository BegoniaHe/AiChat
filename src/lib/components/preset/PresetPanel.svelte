<script>
  /**
   * Preset Panel - Main preset management component
   * ST-like preset system with tabs, import/export, and modular editors
   * @component
   */
  import { LLMClient } from '$api';
  import { presetStore } from '$stores';
  import { onMount } from 'svelte';
  import ChatPromptsEditor from './ChatPromptsEditor.svelte';
  import ContextEditor from './ContextEditor.svelte';
  import InstructEditor from './InstructEditor.svelte';
  import OpenAIBlocksEditor from './OpenAIBlocksEditor.svelte';
  import OpenAIParamsEditor from './OpenAIParamsEditor.svelte';
  import {
    PRESET_TYPES,
    deepClone,
    detectPresetType,
    downloadJson,
    extractStRegexBindingSets,
    getRuleSignature,
  } from './preset-types.js';
  import ReasoningEditor from './ReasoningEditor.svelte';
  import SyspromptEditor from './SyspromptEditor.svelte';

  /** @type {{ visible?: boolean, onClose?: () => void }} */
  let { visible = $bindable(false), onClose = () => {} } = $props();

  let activeType = $state('sysprompt');
  let presets = $state([]);
  let activePresetId = $state('');
  let enabled = $state(true);
  let statusMessage = $state('');
  let statusType = $state('info');
  let statusVisible = $state(false);

  // Drafts keyed by `${storeType}:${presetId}` so changes across tabs aren't lost
  const drafts = $state(new Map());

  // Editor references
  let syspromptEditor = $state(null);
  let chatPromptsEditor = $state(null);
  let contextEditor = $state(null);
  let instructEditor = $state(null);
  let reasoningEditor = $state(null);
  let openaiParamsEditor = $state(null);
  let openaiBlocksEditor = $state(null);

  // Import file input ref
  let importInput = $state(null);

  // Get the store type for current tab
  function getStoreType() {
    // "自定义"tab 是 OpenAI preset 的区块视图
    if (activeType === 'custom') return 'openai';
    if (activeType === 'chatprompts') return 'sysprompt';
    return activeType;
  }

  function getDraftKey(storeType, presetId) {
    const st = String(storeType || '').trim();
    const id = String(presetId || '').trim();
    if (!st || !id) return null;
    return `${st}:${id}`;
  }

  function getTypeLabel(type) {
    const hit = PRESET_TYPES.find((t) => t.id === type);
    return hit?.label || String(type || '');
  }

  // Check if can init LLM client
  function canInitClient(cfg) {
    const c = cfg || {};
    const hasKey = typeof c.apiKey === 'string' && c.apiKey.trim().length > 0;
    const hasVertexSa =
      c.provider === 'vertexai' &&
      typeof c.vertexaiServiceAccount === 'string' &&
      c.vertexaiServiceAccount.trim().length > 0;
    return hasKey || hasVertexSa;
  }

  // Apply bound config if any (only for openai store)
  async function applyBoundConfigIfAny() {
    const storeType = getStoreType();
    if (storeType !== 'openai') return;

    const preset = presetStore.getActive?.('openai') || {};
    const boundId = preset?.boundProfileId;
    if (!boundId) return;

    const cm = window.appBridge?.config;
    if (!cm?.setActiveProfile) return;

    const currentId = cm.getActiveProfileId?.();
    if (currentId && currentId === boundId) return;

    try {
      const runtime = await cm.setActiveProfile(boundId);
      const cfg = runtime || cm.get?.();
      if (window.appBridge) {
        window.appBridge.config.set(cfg);
        window.appBridge.client = canInitClient(cfg) ? new LLMClient(cfg) : null;
      }
      window.dispatchEvent(
        new CustomEvent('preset-bound-config-applied', {
          detail: { profileId: boundId },
        })
      );
    } catch (err) {
      console.warn('应用预设绑定的 API 配置失败', err);
    }
  }

  // Show status message
  function showStatus(message, type = 'info') {
    statusMessage = message;
    statusType = type;
    statusVisible = true;
    setTimeout(() => {
      statusVisible = false;
    }, 3500);
  }

  // Refresh preset list and editor
  async function refreshAll() {
    const storeType = getStoreType();

    presets = presetStore.list?.(storeType) || [];
    activePresetId = presetStore.getActiveId?.(storeType) || '';
    enabled = presetStore.getEnabled?.(storeType) ?? true;
  }

  // Get current preset data (from draft or store)
  function getCurrentPreset() {
    const storeType = getStoreType();
    const presetId = presetStore.getActiveId?.(storeType);
    const key = getDraftKey(storeType, presetId);

    if (key && drafts.has(key)) {
      return drafts.get(key);
    }
    return presetStore.getActive?.(storeType) || {};
  }

  // Capture current editor data as draft
  function captureDraft() {
    try {
      const storeType = getStoreType();
      const presetId = presetStore.getActiveId?.(storeType);
      const key = getDraftKey(storeType, presetId);
      if (!key) return;

      const base = drafts.has(key)
        ? drafts.get(key)
        : deepClone(presetStore.getActive?.(storeType) || {});

      const next = collectEditorData(base);
      drafts.set(key, next);
    } catch (err) {
      console.debug('captureDraft failed', err);
    }
  }

  // Collect data from active editor
  function collectEditorData(base) {
    const current = deepClone(base || {});

    if (activeType === 'sysprompt' && syspromptEditor?.collectData) {
      return { ...current, ...syspromptEditor.collectData() };
    }
    if (activeType === 'chatprompts' && chatPromptsEditor?.collectData) {
      return { ...current, ...chatPromptsEditor.collectData() };
    }
    if (activeType === 'context' && contextEditor?.collectData) {
      return { ...current, ...contextEditor.collectData() };
    }
    if (activeType === 'instruct' && instructEditor?.collectData) {
      return { ...current, ...instructEditor.collectData() };
    }
    if (activeType === 'reasoning' && reasoningEditor?.collectData) {
      return { ...current, ...reasoningEditor.collectData() };
    }
    if (activeType === 'openai' && openaiParamsEditor?.collectData) {
      const data = openaiParamsEditor.collectData();
      data.boundProfileId =
        window.appBridge?.config?.getActiveProfileId?.() || current.boundProfileId || null;
      return { ...current, ...data };
    }
    if (activeType === 'custom' && openaiBlocksEditor?.collectData) {
      const data = openaiBlocksEditor.collectData();
      data.boundProfileId =
        window.appBridge?.config?.getActiveProfileId?.() || current.boundProfileId || null;
      return { ...current, ...data };
    }

    return current;
  }

  // Tab change handler
  async function handleTabChange(type) {
    if (type === activeType) return;
    captureDraft();
    activeType = type;
    await refreshAll();
  }

  // Preset select change handler
  async function handlePresetChange(e) {
    captureDraft();
    await presetStore.setActive?.(getStoreType(), e.target.value);
    activePresetId = e.target.value;
    await applyBoundConfigIfAny();
    window.dispatchEvent(new CustomEvent('preset-changed'));
  }

  // Enable toggle handler
  async function handleEnableChange(e) {
    await presetStore.setEnabled?.(getStoreType(), !!e.target.checked);
    enabled = e.target.checked;
    showStatus('已更新启用状态', 'success');
    window.dispatchEvent(new CustomEvent('preset-changed'));
  }

  // Save handler
  async function onSave() {
    try {
      const storeType = getStoreType();
      const presetId = presetStore.getActiveId?.(storeType);
      const base = presetStore.getActive?.(storeType) || {};
      const data = collectEditorData(base);

      await presetStore.upsert?.(storeType, { id: presetId, data });

      // Clear draft after save
      const key = getDraftKey(storeType, presetId);
      if (key) drafts.delete(key);

      showStatus('已保存预设', 'success');
      window.dispatchEvent(new CustomEvent('preset-changed'));
      await refreshAll();
    } catch (err) {
      console.error('保存预设失败', err);
      showStatus('保存失败', 'error');
    }
  }

  // New preset handler
  async function onNew() {
    const name = prompt('新预设名称', '新预设');
    if (!name) return;

    try {
      const storeType = getStoreType();
      const id = await presetStore.upsert?.(storeType, {
        name,
        data: { name },
      });
      await presetStore.setActive?.(storeType, id);
      await refreshAll();
      showStatus('已创建预设', 'success');
      window.dispatchEvent(new CustomEvent('preset-changed'));
    } catch (err) {
      console.error('创建预设失败', err);
      showStatus('创建失败', 'error');
    }
  }

  // Rename preset handler
  async function onRename() {
    const storeType = getStoreType();
    const preset = presetStore.getActive?.(storeType) || {};
    const name = prompt('重命名预设', preset.name || '');
    if (!name || name === preset.name) return;

    try {
      const presetId = presetStore.getActiveId?.(storeType);
      await presetStore.upsert?.(storeType, {
        id: presetId,
        name,
        data: { ...preset, name },
      });
      await refreshAll();
      showStatus('已重命名预设', 'success');
      window.dispatchEvent(new CustomEvent('preset-changed'));
    } catch (err) {
      console.error('重命名预设失败', err);
      showStatus('重命名失败', 'error');
    }
  }

  // Delete preset handler
  async function onDelete() {
    const storeType = getStoreType();
    const preset = presetStore.getActive?.(storeType) || {};
    if (!confirm(`确定删除预设「${preset.name || ''}」？`)) return;

    try {
      const presetId = presetStore.getActiveId?.(storeType);
      await presetStore.remove?.(storeType, presetId);

      // Clear draft
      const key = getDraftKey(storeType, presetId);
      if (key) drafts.delete(key);

      await refreshAll();
      showStatus('已删除预设', 'success');
      window.dispatchEvent(new CustomEvent('preset-changed'));
    } catch (err) {
      console.error('删除预设失败', err);
      showStatus('删除失败', 'error');
    }
  }

  // Get existing local rule signatures for dedup
  function getExistingLocalRuleSigs() {
    const sigs = new Set();
    try {
      const sets = window.appBridge?.regex?.listLocalSets?.() || [];
      sets.forEach((s) => {
        (Array.isArray(s?.rules) ? s.rules : []).forEach((r) => {
          sigs.add(getRuleSignature(r));
        });
      });
    } catch {}
    return sigs;
  }

  // Import from file
  async function handleImport() {
    if (importInput) {
      importInput.value = '';
      importInput.click();
    }
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    let text = '';
    try {
      text = await file.text();
    } catch (err) {
      showStatus('读取文件失败', 'error');
      return;
    }

    let json = null;
    try {
      json = JSON.parse(text);
    } catch (err) {
      showStatus('JSON 格式错误', 'error');
      return;
    }

    const detected = detectPresetType(json);

    // Full store import
    if (detected === 'store') {
      const replace = confirm(
        '检测到「整套预设设定档」。确定要导入并覆盖当前设置吗？（取消=合并导入）'
      );
      if (replace) {
        await presetStore.importState?.(json, { mode: 'replace' });
      } else {
        await presetStore.importState?.(json, { mode: 'merge' });
      }
      await refreshAll();
      showStatus('已导入预设设定档', 'success');
      window.dispatchEvent(new CustomEvent('preset-changed'));
      return;
    }

    const currentStoreType = getStoreType();
    const detectedType = detected && detected !== 'store' ? detected : null;
    let importType = detectedType || currentStoreType;

    if (detectedType && detectedType !== currentStoreType) {
      const ok = confirm(
        `检测到预设格式为「${getTypeLabel(detectedType)}」。要导入到该类型吗？（取消=导入到当前tab）`
      );
      if (!ok) {
        importType = currentStoreType;
      } else {
        importType = detectedType;
      }
    }

    // Switch tab after deciding import target
    activeType = importType === 'openai' ? 'custom' : importType;

    const fileBaseName = String(file?.name || '')
      .replace(/\.[^/.]+$/, '')
      .trim();
    const defaultName = String(json?.name || '').trim() || fileBaseName || '导入预设';
    const name = prompt('导入预设名称', defaultName);
    if (!name) return;

    let boundSets =
      json?.boundRegexSets || json?.bound_regex_sets || json?.bound_regex_sets_v1 || null;
    const data = { ...json, name };
    delete data.boundRegexSets;
    delete data.bound_regex_sets;
    delete data.bound_regex_sets_v1;

    // Extract ST RegexBinding if present
    if (!Array.isArray(boundSets) || !boundSets.length) {
      const stSets = extractStRegexBindingSets(json);
      if (stSets.length) boundSets = stSets;
    }

    const presetId = await presetStore.upsert?.(importType, { name, data });

    // Import bound regex sets if present
    if (Array.isArray(boundSets) && boundSets.length) {
      try {
        const ok = confirm(
          `检测到预设包含绑定的正规表达式（${boundSets.length} 组）。是否一并导入并绑定？\n取消：仅导入预设，不导入正则。`
        );
        if (!ok) {
          await refreshAll();
          showStatus('已导入预设（未导入绑定正则）', 'success');
          window.dispatchEvent(new CustomEvent('preset-changed'));
          return;
        }

        await window.appBridge?.regex?.ready;
        const existingSigs = getExistingLocalRuleSigs();

        for (const s of boundSets) {
          const rulesRaw = Array.isArray(s?.rules) ? s.rules : [];
          const rules = [];
          const localSeen = new Set();

          for (const rr of rulesRaw) {
            const sig = getRuleSignature(rr);
            if (!sig || localSeen.has(sig) || existingSigs.has(sig)) continue;
            localSeen.add(sig);
            existingSigs.add(sig);
            rules.push(rr);
          }

          if (!rules.length) continue;
          const setName = String(s?.name || '正则').trim() || '正则';
          await window.appBridge.regex.upsertLocalSet({
            name: `${setName} (${name})`,
            enabled: s?.enabled !== false,
            bind: {
              type: 'preset',
              presetType: importType,
              presetId,
            },
            rules,
          });
        }
        window.dispatchEvent(new CustomEvent('regex-changed'));
      } catch (err) {
        console.warn('导入绑定正则失败', err);
      }
    }

    await refreshAll();
    showStatus('已导入预设', 'success');
    window.dispatchEvent(new CustomEvent('preset-changed'));
  }

  // Export current preset
  async function handleExportCurrent() {
    const type = getStoreType();
    const preset = presetStore.getActive?.(type) || {};
    const name = String(preset.name || type).replace(/[\\/:*?"<>|]+/g, '_');
    const prefix = type === 'openai' ? 'preset' : type;
    const payload = { ...(preset || {}) };

    // Include bound regex sets if any
    try {
      await window.appBridge?.regex?.ready;
      const sets = window.appBridge?.regex?.listLocalSets?.() || [];
      const bindType = type;
      const bindId = presetStore.getActiveId?.(type);
      if (bindType && bindId) {
        const bound = sets
          .filter(
            (s) =>
              s?.bind?.type === 'preset' &&
              s.bind.presetType === bindType &&
              s.bind.presetId === bindId
          )
          .map((s) => ({
            name: s.name,
            enabled: s.enabled !== false,
            rules: s.rules || [],
          }));
        if (bound.length) payload.boundRegexSets = bound;
      }
    } catch {}

    downloadJson(`${prefix}-${name}.json`, payload);
    showStatus('已导出当前预设', 'success');
  }

  // Export all presets
  async function handleExportAll() {
    const state = presetStore.getState?.() || {};
    downloadJson(`preset-store.json`, state);
    showStatus('已导出全部预设', 'success');
  }

  // Close handler
  function handleClose() {
    visible = false;
    onClose?.();
  }

  // Get status colors
  function getStatusColors(type) {
    const colors = {
      success: { bg: '#dcfce7', fg: '#166534' },
      error: { bg: '#fee2e2', fg: '#991b1b' },
      info: { bg: '#dbeafe', fg: '#1e40af' },
    };
    return colors[type] || colors.info;
  }

  // Initialize on mount
  onMount(async () => {
    if (presetStore.ready) {
      await presetStore.ready;
    }
    await refreshAll();
  });

  // Refresh when visible changes
  $effect(() => {
    if (visible) {
      refreshAll();
    }
  });

  // Derived: current preset
  const currentPreset = $derived(getCurrentPreset());
</script>

{#if visible}
  <div class="overlay" onclick={handleClose}></div>
  <div class="panel" onclick={(e) => e.stopPropagation()}>
    <!-- Header -->
    <div class="header">
      <div class="header-info">
        <div class="header-title">预设（Preset）</div>
        <div class="header-desc">参照 SillyTavern：选择/编辑提示词与生成参数，影响 prompt 构建</div>
      </div>
      <div class="header-actions">
        <button class="btn-action" onclick={handleImport}>导入</button>
        <button class="btn-action" onclick={handleExportCurrent}>导出</button>
        <button class="btn-action" onclick={handleExportAll}>导出全部</button>
        <button class="btn-close" onclick={handleClose}>×</button>
      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs-row">
      <div class="tabs">
        {#each PRESET_TYPES as tab}
          <button
            class="preset-tab"
            class:active={activeType === tab.id}
            onclick={() => handleTabChange(tab.id)}
          >
            {tab.label}
          </button>
        {/each}
      </div>
      <label class="enable-label">
        <input type="checkbox" checked={enabled} onchange={handleEnableChange} />
        启用
      </label>
    </div>

    <!-- Content -->
    <div class="content">
      <!-- Preset selector -->
      <div class="selector-row">
        <div class="selector-cell">
          <div class="field-label">预设</div>
          <select class="field-select" value={activePresetId} onchange={handlePresetChange}>
            {#each presets as p}
              <option value={p.id}>{p.name || p.id}</option>
            {/each}
          </select>
        </div>
        <div class="action-btns">
          <button class="btn-secondary" onclick={onNew}>＋ 新建</button>
          <button class="btn-secondary" onclick={onRename}>✎ 重命名</button>
          <button class="btn-danger" onclick={onDelete}>🗑 删除</button>
        </div>
      </div>

      <!-- Editor area -->
      <div class="editor-area">
        {#if activeType === 'sysprompt'}
          <SyspromptEditor preset={currentPreset} bind:this={syspromptEditor} />
        {:else if activeType === 'chatprompts'}
          <ChatPromptsEditor preset={currentPreset} bind:this={chatPromptsEditor} />
        {:else if activeType === 'context'}
          <ContextEditor preset={currentPreset} bind:this={contextEditor} />
        {:else if activeType === 'instruct'}
          <InstructEditor preset={currentPreset} bind:this={instructEditor} />
        {:else if activeType === 'reasoning'}
          <ReasoningEditor preset={currentPreset} bind:this={reasoningEditor} />
        {:else if activeType === 'openai'}
          <OpenAIParamsEditor preset={currentPreset} bind:this={openaiParamsEditor} />
        {:else if activeType === 'custom'}
          <OpenAIBlocksEditor preset={currentPreset} bind:this={openaiBlocksEditor} />
        {/if}
      </div>

      <!-- Status -->
      {#if statusVisible}
        <div
          class="status"
          style="background: {getStatusColors(statusType).bg}; color: {getStatusColors(statusType)
            .fg};"
        >
          {statusMessage}
        </div>
      {/if}

      <!-- Footer buttons -->
      <div class="footer-btns">
        <button class="btn-secondary" onclick={handleClose}>取消</button>
        <button class="btn-primary" onclick={onSave}>保存</button>
      </div>
    </div>

    <!-- Hidden import input -->
    <input
      bind:this={importInput}
      type="file"
      accept=".json,application/json"
      style="display: none;"
      onchange={handleImportFile}
    />
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 20000;
  }

  .panel {
    position: fixed;
    top: calc(10px + env(safe-area-inset-top, 0px));
    left: calc(10px + env(safe-area-inset-left, 0px));
    right: calc(10px + env(safe-area-inset-right, 0px));
    height: calc(100vh - 20px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
    height: calc(100dvh - 20px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
    box-sizing: border-box;
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
    z-index: 21000;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .header {
    padding: 14px 16px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    background: rgba(248, 250, 252, 0.92);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .header-info {
    min-width: 0;
  }

  .header-title {
    font-weight: 800;
    color: #0f172a;
  }

  .header-desc {
    color: #64748b;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .btn-action {
    border: 1px solid #e2e8f0;
    background: #fff;
    padding: 6px 10px;
    border-radius: 10px;
    cursor: pointer;
    font-size: 12px;
  }

  .btn-action:hover {
    background: #f8fafc;
  }

  .btn-close {
    border: none;
    background: transparent;
    font-size: 22px;
    cursor: pointer;
    color: #0f172a;
  }

  .tabs-row {
    padding: 10px 16px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }

  .tabs {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .preset-tab {
    border: none;
    background: transparent;
    padding: 10px 12px;
    border-radius: 10px;
    cursor: pointer;
    font-size: 14px;
    color: #334155;
    font-weight: 600;
  }

  .preset-tab:hover {
    background: #f1f5f9;
  }

  .preset-tab.active {
    background: #e2e8f0;
    color: #0f172a;
    font-weight: 800;
  }

  .enable-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #334155;
    cursor: pointer;
  }

  .enable-label input {
    width: 16px;
    height: 16px;
  }

  .content {
    padding: 14px 16px;
    overflow: auto;
    flex: 1;
    min-height: 0;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
  }

  .selector-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }

  .selector-cell {
    flex: 1;
    min-width: 240px;
  }

  .field-label {
    font-weight: 700;
    margin-bottom: 6px;
    color: #0f172a;
  }

  .field-select {
    width: 100%;
    padding: 10px;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    font-size: 14px;
  }

  .action-btns {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .btn-secondary {
    padding: 10px 12px;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    background: #f8fafc;
    cursor: pointer;
  }

  .btn-secondary:hover {
    background: #e2e8f0;
  }

  .btn-danger {
    padding: 10px 12px;
    border: 1px solid #fecaca;
    border-radius: 10px;
    background: #fee2e2;
    color: #b91c1c;
    cursor: pointer;
  }

  .btn-danger:hover {
    background: #fecaca;
  }

  .editor-area {
    margin-top: 12px;
  }

  .status {
    margin-top: 12px;
    padding: 10px;
    border-radius: 10px;
    font-size: 13px;
  }

  .footer-btns {
    margin-top: 12px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
  }

  .btn-primary {
    padding: 10px 18px;
    border: none;
    border-radius: 10px;
    background: #019aff;
    color: #fff;
    cursor: pointer;
    font-weight: 700;
  }

  .btn-primary:hover {
    background: #0086e5;
  }
</style>
