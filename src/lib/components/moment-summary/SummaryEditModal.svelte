<script>
  /**
   * SummaryEditModal.svelte - 摘要编辑弹窗
   */
  import Modal from '../Modal.svelte';

  /**
   * @typedef {Object} Props
   * @property {boolean} [open=false] - 是否打开
   * @property {string} [value=''] - 初始值
   * @property {string} [title='编辑摘要'] - 标题
   * @property {(value: string) => void} [onSave] - 保存回调
   * @property {() => void} [onClose] - 关闭回调
   */

  /** @type {Props} */
  let {
    open = $bindable(false),
    value = '',
    title = '编辑摘要',
    onSave,
    onClose,
  } = $props();

  let text = $state(value);

  // 同步外部值
  $effect(() => {
    if (open) {
      text = value;
    }
  });

  function handleSave() {
    onSave?.(text);
  }

  function handleClose() {
    open = false;
    onClose?.();
  }
</script>

<Modal {open} onClose={handleClose} {title} maxWidth="640px">
  <div class="edit-modal">
    <textarea
      bind:value={text}
      placeholder="输入摘要内容..."
    ></textarea>
    <div class="actions">
      <button class="cancel-btn" onclick={handleClose}>取消</button>
      <button class="save-btn" onclick={handleSave}>保存</button>
    </div>
  </div>
</Modal>

<style>
  .edit-modal {
    padding: 12px;
  }

  textarea {
    width: 100%;
    min-height: 180px;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 10px;
    font-size: 13px;
    line-height: 1.4;
    resize: vertical;
    font-family: inherit;
    box-sizing: border-box;
  }

  textarea:focus {
    outline: none;
    border-color: #2563eb;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 10px;
  }

  .cancel-btn {
    padding: 8px 12px;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    background: #f8fafc;
    cursor: pointer;
    transition: background 0.15s;
  }

  .cancel-btn:hover {
    background: #e2e8f0;
  }

  .save-btn {
    padding: 8px 14px;
    border: none;
    border-radius: 10px;
    background: #019aff;
    color: #fff;
    cursor: pointer;
    font-weight: 700;
    transition: background 0.15s;
  }

  .save-btn:hover {
    background: #0077cc;
  }
</style>
