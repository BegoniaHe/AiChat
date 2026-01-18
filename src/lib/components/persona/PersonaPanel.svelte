<script>
  /**
   * PersonaPanel.svelte - 角色管理面板
   * 迁移自: src/scripts/ui/persona-panel.js
   */
  import { chatStore, contactsStore, personaStore } from '$stores';
  import Modal from '../Modal.svelte';
  import PersonaBulkBindModal from './PersonaBulkBindModal.svelte';
  import PersonaCard from './PersonaCard.svelte';
  import PersonaEditor from './PersonaEditor.svelte';

  /**
   * @typedef {Object} Props
   * @property {boolean} [open=false] - 是否打开
   * @property {string} [currentSessionId=''] - 当前会话 ID
   * @property {() => void} [onClose] - 关闭回调
   * @property {() => void} [onChanged] - 角色变更回调
   */

  /** @type {Props} */
  let { open = $bindable(false), currentSessionId = '', onClose, onChanged } = $props();

  // 本地状态
  /** @type {'list' | 'edit'} */
  let view = $state('list');
  /** @type {string | null} */
  let editingId = $state(null);

  // 批量绑定弹窗
  let bulkModalOpen = $state(false);
  let bulkPersonaId = $state('');

  // 派生数据
  const personas = $derived(personaStore.list);
  const activeId = $derived(personaStore.activeId);

  // 会话锁定的 persona ID
  const sessionLockId = $derived.by(() => {
    if (!currentSessionId) return '';
    // 从 chatStore 获取 persona lock（如果有实现）
    try {
      return chatStore.getPersonaLock?.(currentSessionId) || '';
    } catch {
      return '';
    }
  });

  // 当前编辑的 persona
  const editingPersona = $derived.by(() => {
    if (!editingId) return null;
    return personaStore.get(editingId);
  });

  // 可否删除（至少保留一个）
  const canDeleteEditing = $derived(personas.length > 1);

  // 获取所有会话 ID
  function getAllSessionIds() {
    const ids = new Set();
    try {
      const contacts = contactsStore.list || [];
      contacts.forEach((c) => {
        if (c?.id) ids.add(String(c.id));
      });
    } catch {}
    return [...ids].filter(Boolean);
  }

  // 获取绑定此 persona 的会话
  function getBoundSessions(personaId) {
    const bound = new Set();
    const sessionIds = getAllSessionIds();
    sessionIds.forEach((sid) => {
      try {
        const lock = chatStore.getPersonaLock?.(sid);
        if (lock && String(lock) === String(personaId)) {
          bound.add(sid);
        }
      } catch {}
    });
    return bound;
  }

  // 切换到指定 persona
  function selectPersona(id) {
    personaStore.setActive(id);
    onChanged?.();
  }

  // 打开编辑器
  function openEditor(id = null) {
    editingId = id;
    view = 'edit';
  }

  // 关闭编辑器
  function closeEditor() {
    view = 'list';
    editingId = null;
  }

  // 保存编辑
  function handleSave(data) {
    if (editingId) {
      // 更新
      personaStore.update(editingId, data);
    } else {
      // 新建
      const newPersona = personaStore.add(data);
      personaStore.setActive(newPersona.id);
    }
    closeEditor();
    onChanged?.();
  }

  // 删除
  function handleDelete() {
    if (!editingId) return;
    personaStore.remove(editingId);
    closeEditor();
    onChanged?.();
  }

  // 打开批量绑定弹窗
  function openBulkModal(personaId) {
    bulkPersonaId = personaId;
    bulkModalOpen = true;
  }

  // 保存批量绑定
  function handleBulkSave(selected) {
    if (!bulkPersonaId) return;

    const sessionIds = getAllSessionIds();
    let changed = 0;

    sessionIds.forEach((sid) => {
      const want = selected.has(sid);
      const cur = chatStore.getPersonaLock?.(sid) || '';

      if (want) {
        if (cur !== bulkPersonaId) {
          chatStore.setPersonaLock?.(sid, bulkPersonaId);
          changed++;
        }
      } else {
        if (cur === bulkPersonaId) {
          chatStore.clearPersonaLock?.(sid);
          changed++;
        }
      }
    });

    window.toastr?.success?.(`已应用 ${changed} 项绑定变更`);
    bulkModalOpen = false;
    bulkPersonaId = '';
    onChanged?.();
  }

  // 解除当前会话锁定
  function unlockCurrentSession() {
    if (!currentSessionId) return;
    chatStore.clearPersonaLock?.(currentSessionId);
    onChanged?.();
  }

  // 关闭面板
  function handleClose() {
    closeEditor();
    open = false;
    onClose?.();
  }
</script>

<Modal {open} onClose={handleClose} title="用户角色 (Personas)" maxWidth="420px" maxHeight="640px">
  <div class="persona-panel">
    {#if view === 'list'}
      <!-- 会话锁定状态栏 -->
      {#if currentSessionId}
        <div class="session-lock-bar">
          <div class="lock-info">
            <div class="session-name">
              当前会话：{currentSessionId}
            </div>
            <div class="lock-status">
              {#if sessionLockId}
                已锁定 Persona：{personaStore.get(sessionLockId)?.name || sessionLockId}
              {:else}
                未锁定（使用全局 Persona）
              {/if}
            </div>
          </div>
          {#if sessionLockId}
            <button class="unlock-btn" onclick={unlockCurrentSession}>解除锁定</button>
          {/if}
        </div>
      {/if}

      <!-- 角色列表 -->
      <div class="list-container">
        {#each personas as p (p.id)}
          {@const isLocked = sessionLockId === p.id}
          <PersonaCard
            persona={p}
            isActive={p.id === activeId}
            {isLocked}
            showLockButton={true}
            onSelect={() => selectPersona(p.id)}
            onEdit={() => openEditor(p.id)}
            onLock={() => openBulkModal(p.id)}
          />
        {/each}
      </div>

      <!-- 底部按钮 -->
      <div class="footer">
        <button class="create-btn" onclick={() => openEditor()}>+ 新建角色</button>
      </div>
    {:else}
      <!-- 编辑器视图 -->
      <PersonaEditor
        persona={editingPersona}
        canDelete={canDeleteEditing}
        onSave={handleSave}
        onDelete={handleDelete}
        onBack={closeEditor}
      />
    {/if}
  </div>
</Modal>

<!-- 批量绑定弹窗 -->
<PersonaBulkBindModal
  open={bulkModalOpen}
  persona={personaStore.get(bulkPersonaId)}
  sessionIds={getAllSessionIds()}
  boundSessions={getBoundSessions(bulkPersonaId)}
  onSave={handleBulkSave}
  onClose={() => {
    bulkModalOpen = false;
    bulkPersonaId = '';
  }}
/>

<style>
  .persona-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 400px;
  }

  .session-lock-bar {
    padding: 10px 15px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    background: #fff;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .lock-info {
    flex: 1;
    min-width: 0;
  }

  .session-name {
    font-weight: 800;
    color: #0f172a;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .lock-status {
    color: #64748b;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .unlock-btn {
    border: 1px solid #e2e8f0;
    background: #fff;
    border-radius: 10px;
    padding: 6px 10px;
    cursor: pointer;
    font-size: 12px;
    flex-shrink: 0;
    transition: background 0.15s;
  }

  .unlock-btn:hover {
    background: #f8fafc;
  }

  .list-container {
    flex: 1;
    overflow-y: auto;
    padding: 10px;
  }

  .footer {
    padding: 15px;
    border-top: 1px solid #eee;
    background: #fff;
    text-align: center;
  }

  .create-btn {
    background: #007bff;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 20px;
    font-size: 14px;
    cursor: pointer;
    width: 100%;
    box-shadow: 0 2px 5px rgba(0, 123, 255, 0.3);
    transition: background 0.15s;
  }

  .create-btn:hover {
    background: #0056b3;
  }
</style>
