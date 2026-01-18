<script>
  /**
   * CompactedRawModal.svelte - 压缩摘要原始回复查看弹窗
   */
  import Modal from '../Modal.svelte';

  /**
   * @typedef {Object} Props
   * @property {boolean} [open=false] - 是否打开
   * @property {string} [value=''] - 原始回复内容
   * @property {() => void} [onClose] - 关闭回调
   */

  /** @type {Props} */
  let { open = $bindable(false), value = '', onClose } = $props();

  function handleClose() {
    open = false;
    onClose?.();
  }
</script>

<Modal {open} onClose={handleClose} title="动态大总结原始回复" maxWidth="720px" maxHeight="80vh">
  <div class="raw-modal">
    <textarea readonly {value}></textarea>
  </div>
</Modal>

<style>
  .raw-modal {
    padding: 10px;
    height: 100%;
    min-height: 300px;
  }

  textarea {
    width: 100%;
    height: 100%;
    min-height: 280px;
    resize: none;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 12px;
    padding: 12px;
    font-size: 13px;
    line-height: 1.4;
    font-family:
      ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
    white-space: pre;
    box-sizing: border-box;
    outline: none;
    background: #f8fafc;
  }
</style>
