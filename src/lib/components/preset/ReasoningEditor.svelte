<script>
    /**
     * Reasoning Editor - Reasoning format (thinking chain) editor
     * @component
     */
    import { appSettingsStore } from "$stores";

    /** @type {{ preset: Object, onUpdate?: (data: Object) => void }} */
    const { preset = {}, onUpdate = () => {} } = $props();

    // Settings from appSettings
    const settings = $state(appSettingsStore?.get?.() || {});

    let reasoningAutoParse = $state(settings.reasoningAutoParse === true);
    let reasoningAutoExpand = $state(settings.reasoningAutoExpand === true);
    let reasoningShowHidden = $state(settings.reasoningShowHidden === true);
    let reasoningAddToPrompts = $state(settings.reasoningAddToPrompts === true);
    let reasoningMaxAdditions = $state(
        Number.isFinite(Number(settings.reasoningMaxAdditions))
            ? settings.reasoningMaxAdditions
            : 1,
    );

    // Preset values
    let prefix = $state(preset.prefix || "");
    let suffix = $state(preset.suffix || "");
    let separator = $state(preset.separator || "");

    $effect(() => {
        prefix = preset.prefix || "";
        suffix = preset.suffix || "";
        separator = preset.separator || "";
    });

    function updateSetting(key, value) {
        appSettingsStore?.update?.({ [key]: value });
        if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("reasoning-settings-changed"));
        }
    }

    function handleMaxAdditionsChange(e) {
        const n = Math.trunc(Number(e.target.value));
        const safe = Number.isFinite(n) ? Math.max(0, n) : 1;
        reasoningMaxAdditions = safe;
        updateSetting("reasoningMaxAdditions", safe);
    }

    export function collectData() {
        return {
            ...preset,
            prefix,
            suffix,
            separator,
        };
    }
</script>

<div class="editor-section">
    <div class="section-header">
        <div class="section-title">推理格式（Reasoning）</div>
        <div class="section-desc">
            与 ST 相同：用于自动解析思维链（prefix/suffix），并可选写回 prompt。
        </div>
    </div>

    <div class="flags-row">
        <label class="flag-checkbox">
            <input
                type="checkbox"
                bind:checked={reasoningAutoParse}
                onchange={() =>
                    updateSetting("reasoningAutoParse", reasoningAutoParse)}
            />
            自动解析推理
        </label>
        <label class="flag-checkbox">
            <input
                type="checkbox"
                bind:checked={reasoningAutoExpand}
                onchange={() =>
                    updateSetting("reasoningAutoExpand", reasoningAutoExpand)}
            />
            自动展开
        </label>
        <label class="flag-checkbox">
            <input
                type="checkbox"
                bind:checked={reasoningShowHidden}
                onchange={() =>
                    updateSetting("reasoningShowHidden", reasoningShowHidden)}
            />
            显示隐藏推理
        </label>
        <label class="flag-checkbox">
            <input
                type="checkbox"
                bind:checked={reasoningAddToPrompts}
                onchange={() =>
                    updateSetting(
                        "reasoningAddToPrompts",
                        reasoningAddToPrompts,
                    )}
            />
            写回提示词
        </label>
    </div>

    <div class="input-row">
        <div class="input-cell">
            <label class="field-label">写回上限（max additions）</label>
            <input
                type="number"
                class="field-input"
                min="0"
                step="1"
                value={reasoningMaxAdditions}
                oninput={handleMaxAdditionsChange}
            />
        </div>
    </div>

    <div class="field-group">
        <label class="field-label">推理前缀（prefix）</label>
        <textarea
            class="field-textarea small"
            bind:value={prefix}
            spellcheck="false"
        ></textarea>
    </div>

    <div class="field-group">
        <label class="field-label">推理后缀（suffix）</label>
        <textarea
            class="field-textarea small"
            bind:value={suffix}
            spellcheck="false"
        ></textarea>
    </div>

    <div class="field-group">
        <label class="field-label">推理分隔（separator）</label>
        <textarea
            class="field-textarea small"
            bind:value={separator}
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

    .flags-row {
        margin-top: 10px;
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
    }

    .flag-checkbox {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: #334155;
        cursor: pointer;
    }

    .flag-checkbox input {
        width: 16px;
        height: 16px;
    }

    .input-row {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 10px;
    }

    .input-cell {
        flex: 1;
        min-width: 160px;
        max-width: 300px;
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

    .field-input {
        width: 100%;
        padding: 10px;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        font-size: 14px;
        box-sizing: border-box;
    }

    .field-textarea {
        width: 100%;
        min-height: 80px;
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

    .field-textarea.small {
        min-height: 60px;
    }

    .field-textarea:focus {
        outline: none;
        border-color: #019aff;
    }
</style>
