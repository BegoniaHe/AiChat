<script>
    /**
     * Instruct Editor - Instruct mode sequences editor
     * @component
     */

    /** @type {{ preset: Object, onUpdate?: (data: Object) => void }} */
    let { preset = {}, onUpdate = () => {} } = $props();

    let inputSequence = $state(preset.input_sequence ?? "");
    let outputSequence = $state(preset.output_sequence ?? "");
    let systemSequence = $state(preset.system_sequence ?? "");
    let stopSequence = $state(preset.stop_sequence ?? "");
    let wrap = $state(Boolean(preset.wrap));
    let macro = $state(Boolean(preset.macro));
    let skipExamples = $state(Boolean(preset.skip_examples));

    $effect(() => {
        inputSequence = preset.input_sequence ?? "";
        outputSequence = preset.output_sequence ?? "";
        systemSequence = preset.system_sequence ?? "";
        stopSequence = preset.stop_sequence ?? "";
        wrap = Boolean(preset.wrap);
        macro = Boolean(preset.macro);
        skipExamples = Boolean(preset.skip_examples);
    });

    export function collectData() {
        return {
            ...preset,
            input_sequence: inputSequence,
            output_sequence: outputSequence,
            system_sequence: systemSequence,
            stop_sequence: stopSequence,
            wrap,
            macro,
            skip_examples: skipExamples,
        };
    }
</script>

<div class="editor-section">
    <div class="section-header">
        <div class="section-title">Instruct 模板</div>
        <div class="section-desc">
            与 ST 相同：控制序列/包裹/宏（目前仅保存，暂未用于 prompt 构建）
        </div>
    </div>

    <div class="input-row">
        <div class="input-cell">
            <label class="field-label">Input sequence</label>
            <input type="text" class="field-input" bind:value={inputSequence} />
        </div>
        <div class="input-cell">
            <label class="field-label">Output sequence</label>
            <input
                type="text"
                class="field-input"
                bind:value={outputSequence}
            />
        </div>
    </div>

    <div class="input-row">
        <div class="input-cell">
            <label class="field-label">System sequence</label>
            <input
                type="text"
                class="field-input"
                bind:value={systemSequence}
            />
        </div>
        <div class="input-cell">
            <label class="field-label">Stop sequence</label>
            <input type="text" class="field-input" bind:value={stopSequence} />
        </div>
    </div>

    <div class="flags-row">
        <label class="flag-checkbox">
            <input type="checkbox" bind:checked={wrap} />
            Wrap
        </label>
        <label class="flag-checkbox">
            <input type="checkbox" bind:checked={macro} />
            Macro
        </label>
        <label class="flag-checkbox">
            <input type="checkbox" bind:checked={skipExamples} />
            Skip examples
        </label>
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

    .input-row {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 10px;
    }

    .input-cell {
        flex: 1;
        min-width: 160px;
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
</style>
