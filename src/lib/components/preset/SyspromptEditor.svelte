<script>
    /**
     * Sysprompt Editor - System Prompt preset editor
     * @component
     */

    /** @type {{ preset: Object, onUpdate?: (data: Object) => void }} */
    let { preset = {}, onUpdate = () => {} } = $props();

    let content = $state(preset.content || "");
    let postHistory = $state(preset.post_history || "");

    $effect(() => {
        content = preset.content || "";
        postHistory = preset.post_history || "";
    });

    function handleContentChange(e) {
        content = e.target.value;
        emitUpdate();
    }

    function handlePostChange(e) {
        postHistory = e.target.value;
        emitUpdate();
    }

    function emitUpdate() {
        onUpdate({
            ...preset,
            content,
            post_history: postHistory,
        });
    }

    export function collectData() {
        return {
            ...preset,
            content,
            post_history: postHistory,
        };
    }
</script>

<div class="editor-section">
    <div class="section-header">
        <div class="section-title">系统提示词（System Prompt）</div>
        <div class="section-desc">
            与 ST 相同：编辑可见内容（纯文本），支持 {"{{char}}"} / {"{{user}}"}
            宏
        </div>
    </div>

    <div class="field-group">
        <label class="field-label">内容</label>
        <textarea
            class="field-textarea"
            value={content}
            oninput={handleContentChange}
            placeholder="Write {{ char }}..."
            spellcheck="false"
        ></textarea>
    </div>

    <div class="field-group">
        <label class="field-label">Post-History Instructions（可选）</label>
        <textarea
            class="field-textarea"
            value={postHistory}
            oninput={handlePostChange}
            placeholder="（可留空）"
            spellcheck="false"
        ></textarea>
    </div>
</div>

<style>
    .editor-section {
        border: 1px solid rgba(0, 0, 0, 0.06);
        border-radius: 12px;
        padding: 12px;
        background: rgba(248, 250, 252, 0.6);
    }

    .section-header {
        margin-bottom: 12px;
    }

    .section-title {
        font-weight: 800;
        color: #0f172a;
    }

    .section-desc {
        color: #64748b;
        font-size: 12px;
        margin-top: 4px;
    }

    .field-group {
        margin-top: 10px;
    }

    .field-label {
        display: block;
        font-weight: 700;
        color: #0f172a;
        margin-bottom: 6px;
    }

    .field-textarea {
        width: 100%;
        min-height: 140px;
        resize: vertical;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        padding: 10px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            "Liberation Mono", "Courier New", monospace;
        font-size: 12px;
        line-height: 1.45;
        background: #ffffff;
        color: #0f172a;
        box-sizing: border-box;
    }

    .field-textarea:focus {
        outline: none;
        border-color: #019aff;
    }
</style>
