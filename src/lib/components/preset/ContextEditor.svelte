<script>
    /**
     * Context Editor - Story String template editor
     * @component
     */
    import {
        EXT_PROMPT_ROLES,
        EXT_PROMPT_TYPES,
        getInt,
    } from "./preset-types.js";

    /** @type {{ preset: Object, onUpdate?: (data: Object) => void }} */
    let { preset = {}, onUpdate = () => {} } = $props();

    let storyString = $state(preset.story_string || "");
    let position = $state(
        preset.story_string_position ?? EXT_PROMPT_TYPES.IN_PROMPT,
    );
    let depth = $state(preset.story_string_depth ?? 1);
    let role = $state(preset.story_string_role ?? EXT_PROMPT_ROLES.SYSTEM);
    let exampleSeparator = $state(preset.example_separator ?? "");
    let chatStart = $state(preset.chat_start ?? "");
    let namesAsStopStrings = $state(Boolean(preset.names_as_stop_strings));
    let useStopStrings = $state(Boolean(preset.use_stop_strings));
    let trimSentences = $state(Boolean(preset.trim_sentences));
    let singleLine = $state(Boolean(preset.single_line));

    $effect(() => {
        storyString = preset.story_string || "";
        position = preset.story_string_position ?? EXT_PROMPT_TYPES.IN_PROMPT;
        depth = preset.story_string_depth ?? 1;
        role = preset.story_string_role ?? EXT_PROMPT_ROLES.SYSTEM;
        exampleSeparator = preset.example_separator ?? "";
        chatStart = preset.chat_start ?? "";
        namesAsStopStrings = Boolean(preset.names_as_stop_strings);
        useStopStrings = Boolean(preset.use_stop_strings);
        trimSentences = Boolean(preset.trim_sentences);
        singleLine = Boolean(preset.single_line);
    });

    export function collectData() {
        return {
            ...preset,
            story_string: storyString,
            story_string_position: getInt(position, EXT_PROMPT_TYPES.IN_PROMPT),
            story_string_depth: getInt(depth, 1),
            story_string_role: getInt(role, EXT_PROMPT_ROLES.SYSTEM),
            example_separator: exampleSeparator,
            chat_start: chatStart,
            names_as_stop_strings: namesAsStopStrings,
            use_stop_strings: useStopStrings,
            trim_sentences: trimSentences,
            single_line: singleLine,
        };
    }
</script>

<div class="editor-section">
    <div class="section-header">
        <div class="section-title">上下文模板（Context Template）</div>
        <div class="section-desc">
            ST 的 story_string 模板，支持 {"{{#if}}"} 与变量（description/personality/scenario/persona/wiBefore
            等）
        </div>
    </div>

    <div class="field-group">
        <label class="field-label">Story String</label>
        <textarea
            class="field-textarea"
            bind:value={storyString}
            placeholder={"{{#if description}}{{description}}{{/if}} ..."}
            spellcheck="false"
        ></textarea>
    </div>

    <div class="input-row">
        <div class="input-cell">
            <label class="field-label">注入位置</label>
            <select class="field-select" bind:value={position}>
                <option value={EXT_PROMPT_TYPES.IN_PROMPT}
                    >IN_PROMPT（系统开头）</option
                >
                <option value={EXT_PROMPT_TYPES.IN_CHAT}
                    >IN_CHAT（按深度插入历史）</option
                >
                <option value={EXT_PROMPT_TYPES.BEFORE_PROMPT}
                    >BEFORE_PROMPT（最前）</option
                >
                <option value={EXT_PROMPT_TYPES.NONE}>NONE（不注入）</option>
            </select>
        </div>
        <div class="input-cell">
            <label class="field-label">深度（IN_CHAT）</label>
            <input
                type="number"
                class="field-input"
                bind:value={depth}
                min="0"
            />
        </div>
        <div class="input-cell">
            <label class="field-label">角色（IN_CHAT）</label>
            <select class="field-select" bind:value={role}>
                <option value={EXT_PROMPT_ROLES.SYSTEM}>SYSTEM</option>
                <option value={EXT_PROMPT_ROLES.USER}>USER</option>
                <option value={EXT_PROMPT_ROLES.ASSISTANT}>ASSISTANT</option>
            </select>
        </div>
    </div>

    <div class="input-row">
        <div class="input-cell">
            <label class="field-label">Example Separator</label>
            <input
                type="text"
                class="field-input"
                bind:value={exampleSeparator}
            />
        </div>
        <div class="input-cell">
            <label class="field-label">Chat Start</label>
            <input type="text" class="field-input" bind:value={chatStart} />
        </div>
    </div>

    <div class="flags-row">
        <label class="flag-checkbox">
            <input type="checkbox" bind:checked={namesAsStopStrings} />
            Names as stop strings
        </label>
        <label class="flag-checkbox">
            <input type="checkbox" bind:checked={useStopStrings} />
            Use stop strings
        </label>
        <label class="flag-checkbox">
            <input type="checkbox" bind:checked={trimSentences} />
            Trim sentences
        </label>
        <label class="flag-checkbox">
            <input type="checkbox" bind:checked={singleLine} />
            Single line
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

    .field-input,
    .field-select {
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
