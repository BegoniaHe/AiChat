<script>
    /**
     * OpenAI Params Editor - Generation parameters editor
     * @component
     */

    /** @type {{ preset: Object, onUpdate?: (data: Object) => void }} */
    const { preset = {}, onUpdate = () => {} } = $props();

    // Generation parameters
    let maxContext = $state(preset.openai_max_context ?? 131072);
    let temperature = $state(preset.temperature ?? 1);
    let topP = $state(preset.top_p ?? 0.98);
    let topK = $state(preset.top_k ?? 64);
    let maxTokens = $state(preset.openai_max_tokens ?? 8192);
    let presencePenalty = $state(preset.presence_penalty ?? 0);
    let frequencyPenalty = $state(preset.frequency_penalty ?? 0);

    $effect(() => {
        maxContext = preset.openai_max_context ?? 131072;
        temperature = preset.temperature ?? 1;
        topP = preset.top_p ?? 0.98;
        topK = preset.top_k ?? 64;
        maxTokens = preset.openai_max_tokens ?? 8192;
        presencePenalty = preset.presence_penalty ?? 0;
        frequencyPenalty = preset.frequency_penalty ?? 0;
    });

    function syncMaxContext(val) {
        const n = Number(val);
        if (!Number.isFinite(n)) return;
        maxContext = Math.max(0, Math.min(200000, Math.trunc(n)));
    }

    function handleSliderInput(e) {
        syncMaxContext(e.target.value);
    }

    function handleNumInput(e) {
        syncMaxContext(e.target.value);
    }

    export function collectData() {
        return {
            ...preset,
            openai_max_context: maxContext,
            temperature: Number(temperature),
            top_p: Number(topP),
            top_k: Math.trunc(Number(topK)),
            openai_max_tokens: Math.trunc(Number(maxTokens)),
            presence_penalty: Number(presencePenalty),
            frequency_penalty: Number(frequencyPenalty),
        };
    }
</script>

<div class="editor-section">
    <div class="section-header">
        <div class="section-title">生成参数</div>
        <div class="section-desc">
            参照 ST：编辑常用生成参数；提示词区块请到「自定义」tab
            管理（不限制特定 LLM，可自行绑定连接配置）
        </div>
    </div>

    <!-- Max Context -->
    <div class="ctx-block">
        <div class="field-label">最大上下文长度（max_context）</div>
        <div class="ctx-row">
            <div class="ctx-range">
                <input
                    type="range"
                    min="256"
                    max="200000"
                    step="256"
                    value={maxContext}
                    oninput={handleSliderInput}
                />
            </div>
            <div class="ctx-num">
                <input
                    type="number"
                    step="1"
                    class="field-input"
                    value={maxContext}
                    oninput={handleNumInput}
                />
            </div>
        </div>
        <div class="ctx-hint">
            用于限制可用上下文窗口（后续可用于自动裁剪历史）。
        </div>
    </div>

    <!-- Row 1: temperature, top_p, top_k -->
    <div class="input-row">
        <div class="input-cell">
            <label class="field-label">temperature</label>
            <input
                type="number"
                class="field-input"
                step="0.01"
                bind:value={temperature}
            />
        </div>
        <div class="input-cell">
            <label class="field-label">top_p</label>
            <input
                type="number"
                class="field-input"
                step="0.01"
                bind:value={topP}
            />
        </div>
        <div class="input-cell">
            <label class="field-label">top_k</label>
            <input
                type="number"
                class="field-input"
                step="1"
                bind:value={topK}
            />
        </div>
    </div>

    <!-- Row 2: max_tokens, presence, frequency -->
    <div class="input-row">
        <div class="input-cell">
            <label class="field-label"
                >最大输出 token（max_output_tokens）</label
            >
            <input
                type="number"
                class="field-input"
                step="1"
                bind:value={maxTokens}
            />
        </div>
        <div class="input-cell">
            <label class="field-label">presence_penalty</label>
            <input
                type="number"
                class="field-input"
                step="0.01"
                bind:value={presencePenalty}
            />
        </div>
        <div class="input-cell">
            <label class="field-label">frequency_penalty</label>
            <input
                type="number"
                class="field-input"
                step="0.01"
                bind:value={frequencyPenalty}
            />
        </div>
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

    .ctx-block {
        margin-top: 10px;
    }

    .ctx-row {
        display: flex;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
    }

    .ctx-range {
        flex: 2;
        min-width: 200px;
    }

    .ctx-range input[type="range"] {
        width: 100%;
    }

    .ctx-num {
        flex: 1;
        min-width: 160px;
    }

    .ctx-hint {
        color: #64748b;
        font-size: 12px;
        margin-top: 6px;
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

    .field-input:focus {
        outline: none;
        border-color: #019aff;
    }
</style>
