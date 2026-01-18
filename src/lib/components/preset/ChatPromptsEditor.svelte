<script>
    /**
     * ChatPrompts Editor - Dialogue/Group/Moment prompts editor
     * @component
     */
    import {
        EXT_PROMPT_ROLES,
        EXT_PROMPT_TYPES,
        getInt,
    } from "./preset-types.js";

    /** @type {{ preset: Object, onUpdate?: (data: Object) => void }} */
    const { preset = {}, onUpdate = () => {} } = $props();

    // Dialogue (Private chat)
    let dialogueEnabled = $state(Boolean(preset.dialogue_enabled));
    let dialoguePosition = $state(
        preset.dialogue_position ?? EXT_PROMPT_TYPES.SYSTEM_DEPTH_1,
    );
    let dialogueDepth = $state(preset.dialogue_depth ?? 1);
    let dialogueRole = $state(preset.dialogue_role ?? EXT_PROMPT_ROLES.SYSTEM);
    let dialogueRules = $state(preset.dialogue_rules || "");

    // Moment create
    let momentCreateEnabled = $state(Boolean(preset.moment_create_enabled));
    let momentCreatePosition = $state(
        preset.moment_create_position ?? EXT_PROMPT_TYPES.IN_PROMPT,
    );
    let momentCreateDepth = $state(preset.moment_create_depth ?? 1);
    let momentCreateRole = $state(
        preset.moment_create_role ?? EXT_PROMPT_ROLES.SYSTEM,
    );
    let momentCreateRules = $state(preset.moment_create_rules || "");

    // Moment comment
    let momentCommentEnabled = $state(Boolean(preset.moment_comment_enabled));
    let momentCommentPosition = $state(
        preset.moment_comment_position ?? EXT_PROMPT_TYPES.IN_PROMPT,
    );
    let momentCommentDepth = $state(preset.moment_comment_depth ?? 0);
    let momentCommentRole = $state(
        preset.moment_comment_role ?? EXT_PROMPT_ROLES.SYSTEM,
    );
    let momentCommentRules = $state(preset.moment_comment_rules || "");

    // Group chat
    let groupEnabled = $state(Boolean(preset.group_enabled));
    let groupPosition = $state(
        preset.group_position ?? EXT_PROMPT_TYPES.SYSTEM_DEPTH_1,
    );
    let groupDepth = $state(preset.group_depth ?? 1);
    let groupRole = $state(preset.group_role ?? EXT_PROMPT_ROLES.SYSTEM);
    let groupRules = $state(preset.group_rules || "");

    // Summary
    let summaryEnabled = $state(Boolean(preset.summary_enabled));
    let summaryPosition = $state(
        preset.summary_position ?? EXT_PROMPT_TYPES.SYSTEM_DEPTH_1,
    );
    let summaryRules = $state(preset.summary_rules || "");

    // Collapsed states
    const collapsed = $state({
        dialogue: true,
        momentCreate: true,
        momentComment: true,
        group: true,
        summary: true,
    });

    $effect(() => {
        dialogueEnabled = Boolean(preset.dialogue_enabled);
        dialoguePosition =
            preset.dialogue_position ?? EXT_PROMPT_TYPES.SYSTEM_DEPTH_1;
        dialogueDepth = preset.dialogue_depth ?? 1;
        dialogueRole = preset.dialogue_role ?? EXT_PROMPT_ROLES.SYSTEM;
        dialogueRules = preset.dialogue_rules || "";

        momentCreateEnabled = Boolean(preset.moment_create_enabled);
        momentCreatePosition =
            preset.moment_create_position ?? EXT_PROMPT_TYPES.IN_PROMPT;
        momentCreateDepth = preset.moment_create_depth ?? 1;
        momentCreateRole = preset.moment_create_role ?? EXT_PROMPT_ROLES.SYSTEM;
        momentCreateRules = preset.moment_create_rules || "";

        momentCommentEnabled = Boolean(preset.moment_comment_enabled);
        momentCommentPosition =
            preset.moment_comment_position ?? EXT_PROMPT_TYPES.IN_PROMPT;
        momentCommentDepth = preset.moment_comment_depth ?? 0;
        momentCommentRole =
            preset.moment_comment_role ?? EXT_PROMPT_ROLES.SYSTEM;
        momentCommentRules = preset.moment_comment_rules || "";

        groupEnabled = Boolean(preset.group_enabled);
        groupPosition =
            preset.group_position ?? EXT_PROMPT_TYPES.SYSTEM_DEPTH_1;
        groupDepth = preset.group_depth ?? 1;
        groupRole = preset.group_role ?? EXT_PROMPT_ROLES.SYSTEM;
        groupRules = preset.group_rules || "";

        summaryEnabled = Boolean(preset.summary_enabled);
        summaryPosition =
            preset.summary_position ?? EXT_PROMPT_TYPES.SYSTEM_DEPTH_1;
        summaryRules = preset.summary_rules || "";
    });

    function toggleCollapse(key) {
        collapsed[key] = !collapsed[key];
    }

    const POSITION_OPTIONS_FULL = [
        { v: EXT_PROMPT_TYPES.IN_PROMPT, t: "IN_PROMPT（系统开头）" },
        { v: EXT_PROMPT_TYPES.IN_CHAT, t: "IN_CHAT（按深度插入历史）" },
        { v: EXT_PROMPT_TYPES.BEFORE_PROMPT, t: "BEFORE_PROMPT（最前）" },
        { v: EXT_PROMPT_TYPES.NONE, t: "NONE（不注入）" },
    ];

    const POSITION_OPTIONS_FIXED = [
        {
            v: EXT_PROMPT_TYPES.SYSTEM_DEPTH_1,
            t: "SYSTEM_DEPTH_1（紧跟 chat history，<chat_guide>）",
        },
        { v: EXT_PROMPT_TYPES.NONE, t: "NONE（不注入）" },
    ];

    export function collectData() {
        return {
            ...preset,
            dialogue_enabled: dialogueEnabled,
            dialogue_position: getInt(
                dialoguePosition,
                EXT_PROMPT_TYPES.SYSTEM_DEPTH_1,
            ),
            dialogue_depth: getInt(dialogueDepth, 1),
            dialogue_role: getInt(dialogueRole, EXT_PROMPT_ROLES.SYSTEM),
            dialogue_rules: dialogueRules,

            moment_create_enabled: momentCreateEnabled,
            moment_create_position: getInt(
                momentCreatePosition,
                EXT_PROMPT_TYPES.IN_PROMPT,
            ),
            moment_create_depth: getInt(momentCreateDepth, 1),
            moment_create_role: getInt(
                momentCreateRole,
                EXT_PROMPT_ROLES.SYSTEM,
            ),
            moment_create_rules: momentCreateRules,

            moment_comment_enabled: momentCommentEnabled,
            moment_comment_position: getInt(
                momentCommentPosition,
                EXT_PROMPT_TYPES.IN_PROMPT,
            ),
            moment_comment_depth: getInt(momentCommentDepth, 0),
            moment_comment_role: getInt(
                momentCommentRole,
                EXT_PROMPT_ROLES.SYSTEM,
            ),
            moment_comment_rules: momentCommentRules,

            group_enabled: groupEnabled,
            group_position: getInt(
                groupPosition,
                EXT_PROMPT_TYPES.SYSTEM_DEPTH_1,
            ),
            group_depth: getInt(groupDepth, 1),
            group_role: getInt(groupRole, EXT_PROMPT_ROLES.SYSTEM),
            group_rules: groupRules,

            summary_enabled: summaryEnabled,
            summary_position: getInt(
                summaryPosition,
                EXT_PROMPT_TYPES.SYSTEM_DEPTH_1,
            ),
            summary_rules: summaryRules,
        };
    }
</script>

<div class="editor-section">
    <div class="section-header">
        <div class="section-title">聊天提示词（对话模式）</div>
        <div class="section-desc">
            私聊/群聊/动态提示词都放在这里；其中"私聊/群聊/摘要"固定注入到系统深度=1（历史前，且摘要在聊天提示词下方），避免混入
            &lt;history&gt;。
        </div>
    </div>

    <div class="prompt-list">
        <!-- Dialogue (Private Chat) -->
        <div class="prompt-card" class:disabled={!dialogueEnabled}>
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="card-header" onclick={() => toggleCollapse("dialogue")}>
                <div class="card-left">
                    <span class="collapse-toggle"
                        >{collapsed.dialogue ? "▸" : "▾"}</span
                    >
                    <div class="card-info">
                        <div class="card-title">私聊提示词</div>
                        <div class="card-subtitle">
                            解析 &lt;content&gt; 内的 &lt;{"{{user}}"}和{"{{char}}"}的私聊&gt;，每行
                            - 开头为一条消息
                        </div>
                    </div>
                </div>
                <label
                    class="enable-checkbox"
                    onclick={(e) => e.stopPropagation()}
                >
                    <input type="checkbox" bind:checked={dialogueEnabled} />
                    启用
                </label>
            </div>
            {#if !collapsed.dialogue}
                <div class="card-body">
                    <div class="input-row">
                        <div class="input-cell">
                            <label class="field-label">注入位置</label>
                            <select
                                class="field-select"
                                bind:value={dialoguePosition}
                                disabled
                            >
                                {#each POSITION_OPTIONS_FIXED as opt}
                                    <option value={opt.v}>{opt.t}</option>
                                {/each}
                            </select>
                        </div>
                        <div class="input-cell">
                            <label class="field-label">深度（固定）</label>
                            <input
                                type="number"
                                class="field-input"
                                bind:value={dialogueDepth}
                                disabled
                            />
                        </div>
                        <div class="input-cell">
                            <label class="field-label">角色（固定）</label>
                            <select
                                class="field-select"
                                bind:value={dialogueRole}
                                disabled
                            >
                                <option value={EXT_PROMPT_ROLES.SYSTEM}
                                    >SYSTEM</option
                                >
                                <option value={EXT_PROMPT_ROLES.USER}
                                    >USER</option
                                >
                                <option value={EXT_PROMPT_ROLES.ASSISTANT}
                                    >ASSISTANT</option
                                >
                            </select>
                        </div>
                    </div>
                    <div class="field-group">
                        <label class="field-label">规则内容（纯文本）</label>
                        <textarea
                            class="field-textarea"
                            bind:value={dialogueRules}
                            placeholder="私聊协议提示词（<content> + 私聊标签 + - 行）"
                            spellcheck="false"
                        ></textarea>
                    </div>
                </div>
            {/if}
        </div>

        <!-- Moment Create -->
        <div class="prompt-card" class:disabled={!momentCreateEnabled}>
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
                class="card-header"
                onclick={() => toggleCollapse("momentCreate")}
            >
                <div class="card-left">
                    <span class="collapse-toggle"
                        >{collapsed.momentCreate ? "▸" : "▾"}</span
                    >
                    <div class="card-info">
                        <div class="card-title">动态发布决策提示词</div>
                        <div class="card-subtitle">
                            让模型决定是否要输出
                            moment_start/moment_end（仅用于私聊/群聊场景）
                        </div>
                    </div>
                </div>
                <label
                    class="enable-checkbox"
                    onclick={(e) => e.stopPropagation()}
                >
                    <input type="checkbox" bind:checked={momentCreateEnabled} />
                    启用
                </label>
            </div>
            {#if !collapsed.momentCreate}
                <div class="card-body">
                    <div class="input-row">
                        <div class="input-cell">
                            <label class="field-label">注入位置</label>
                            <select
                                class="field-select"
                                bind:value={momentCreatePosition}
                            >
                                {#each POSITION_OPTIONS_FULL as opt}
                                    <option value={opt.v}>{opt.t}</option>
                                {/each}
                            </select>
                        </div>
                        <div class="input-cell">
                            <label class="field-label">深度（IN_CHAT）</label>
                            <input
                                type="number"
                                class="field-input"
                                bind:value={momentCreateDepth}
                                min="0"
                            />
                        </div>
                        <div class="input-cell">
                            <label class="field-label">角色（IN_CHAT）</label>
                            <select
                                class="field-select"
                                bind:value={momentCreateRole}
                            >
                                <option value={EXT_PROMPT_ROLES.SYSTEM}
                                    >SYSTEM</option
                                >
                                <option value={EXT_PROMPT_ROLES.USER}
                                    >USER</option
                                >
                                <option value={EXT_PROMPT_ROLES.ASSISTANT}
                                    >ASSISTANT</option
                                >
                            </select>
                        </div>
                    </div>
                    <div class="field-group">
                        <label class="field-label">规则内容（纯文本）</label>
                        <textarea
                            class="field-textarea"
                            bind:value={momentCreateRules}
                            placeholder="动态发布决策提示词（决定是否输出 moment_start...moment_end）"
                            spellcheck="false"
                        ></textarea>
                    </div>
                </div>
            {/if}
        </div>

        <!-- Moment Comment -->
        <div class="prompt-card" class:disabled={!momentCommentEnabled}>
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
                class="card-header"
                onclick={() => toggleCollapse("momentComment")}
            >
                <div class="card-left">
                    <span class="collapse-toggle"
                        >{collapsed.momentComment ? "▸" : "▾"}</span
                    >
                    <div class="card-info">
                        <div class="card-title">动态评论回复提示词</div>
                        <div class="card-subtitle">
                            仅用于"动态评论"场景：输出
                            moment_reply_start/moment_reply_end（不输出私聊/群聊）
                        </div>
                    </div>
                </div>
                <label
                    class="enable-checkbox"
                    onclick={(e) => e.stopPropagation()}
                >
                    <input
                        type="checkbox"
                        bind:checked={momentCommentEnabled}
                    />
                    启用
                </label>
            </div>
            {#if !collapsed.momentComment}
                <div class="card-body">
                    <div class="input-row">
                        <div class="input-cell">
                            <label class="field-label">注入位置</label>
                            <select
                                class="field-select"
                                bind:value={momentCommentPosition}
                            >
                                {#each POSITION_OPTIONS_FULL as opt}
                                    <option value={opt.v}>{opt.t}</option>
                                {/each}
                            </select>
                        </div>
                        <div class="input-cell">
                            <label class="field-label">深度（IN_CHAT）</label>
                            <input
                                type="number"
                                class="field-input"
                                bind:value={momentCommentDepth}
                                min="0"
                            />
                        </div>
                        <div class="input-cell">
                            <label class="field-label">角色（IN_CHAT）</label>
                            <select
                                class="field-select"
                                bind:value={momentCommentRole}
                            >
                                <option value={EXT_PROMPT_ROLES.SYSTEM}
                                    >SYSTEM</option
                                >
                                <option value={EXT_PROMPT_ROLES.USER}
                                    >USER</option
                                >
                                <option value={EXT_PROMPT_ROLES.ASSISTANT}
                                    >ASSISTANT</option
                                >
                            </select>
                        </div>
                    </div>
                    <div class="field-group">
                        <label class="field-label">规则内容（纯文本）</label>
                        <textarea
                            class="field-textarea"
                            bind:value={momentCommentRules}
                            placeholder="动态评论回复规则（<content> + moment_reply_*）"
                            spellcheck="false"
                        ></textarea>
                    </div>
                </div>
            {/if}
        </div>

        <!-- Group Chat -->
        <div class="prompt-card" class:disabled={!groupEnabled}>
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="card-header" onclick={() => toggleCollapse("group")}>
                <div class="card-left">
                    <span class="collapse-toggle"
                        >{collapsed.group ? "▸" : "▾"}</span
                    >
                    <div class="card-info">
                        <div class="card-title">群聊提示词</div>
                        <div class="card-subtitle">
                            解析 &lt;content&gt; 内的 &lt;群聊:群名字&gt;（含
                            &lt;成员&gt;/&lt;聊天内容&gt;），并分发到对应群聊
                        </div>
                    </div>
                </div>
                <label
                    class="enable-checkbox"
                    onclick={(e) => e.stopPropagation()}
                >
                    <input type="checkbox" bind:checked={groupEnabled} />
                    启用
                </label>
            </div>
            {#if !collapsed.group}
                <div class="card-body">
                    <div class="input-row">
                        <div class="input-cell">
                            <label class="field-label">注入位置</label>
                            <select
                                class="field-select"
                                bind:value={groupPosition}
                                disabled
                            >
                                {#each POSITION_OPTIONS_FIXED as opt}
                                    <option value={opt.v}>{opt.t}</option>
                                {/each}
                            </select>
                        </div>
                        <div class="input-cell">
                            <label class="field-label">深度（固定）</label>
                            <input
                                type="number"
                                class="field-input"
                                bind:value={groupDepth}
                                disabled
                            />
                        </div>
                        <div class="input-cell">
                            <label class="field-label">角色（固定）</label>
                            <select
                                class="field-select"
                                bind:value={groupRole}
                                disabled
                            >
                                <option value={EXT_PROMPT_ROLES.SYSTEM}
                                    >SYSTEM</option
                                >
                                <option value={EXT_PROMPT_ROLES.USER}
                                    >USER</option
                                >
                                <option value={EXT_PROMPT_ROLES.ASSISTANT}
                                    >ASSISTANT</option
                                >
                            </select>
                        </div>
                    </div>
                    <div class="field-group">
                        <label class="field-label">规则内容（纯文本）</label>
                        <textarea
                            class="field-textarea"
                            bind:value={groupRules}
                            placeholder="群聊协议提示词（<content> + <群聊:群名字> + 发言人--内容--HH:MM）"
                            spellcheck="false"
                        ></textarea>
                    </div>
                </div>
            {/if}
        </div>

        <!-- Summary -->
        <div class="prompt-card" class:disabled={!summaryEnabled}>
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="card-header" onclick={() => toggleCollapse("summary")}>
                <div class="card-left">
                    <span class="collapse-toggle"
                        >{collapsed.summary ? "▸" : "▾"}</span
                    >
                    <div class="card-info">
                        <div class="card-title">摘要提示词</div>
                        <div class="card-subtitle">
                            固定注入到系统深度=1（位于聊天提示词下方）；用于要求模型在回复末尾输出
                            &lt;details&gt;&lt;summary&gt;摘要&lt;/summary&gt;...&lt;/details&gt;
                        </div>
                    </div>
                </div>
                <label
                    class="enable-checkbox"
                    onclick={(e) => e.stopPropagation()}
                >
                    <input type="checkbox" bind:checked={summaryEnabled} />
                    启用
                </label>
            </div>
            {#if !collapsed.summary}
                <div class="card-body">
                    <div class="input-row">
                        <div class="input-cell">
                            <label class="field-label">注入位置</label>
                            <select
                                class="field-select"
                                bind:value={summaryPosition}
                                disabled
                            >
                                {#each POSITION_OPTIONS_FIXED as opt}
                                    <option value={opt.v}>{opt.t}</option>
                                {/each}
                            </select>
                        </div>
                    </div>
                    <div class="field-group">
                        <label class="field-label">规则内容（纯文本）</label>
                        <textarea
                            class="field-textarea"
                            bind:value={summaryRules}
                            placeholder="每次输出结束后，紧跟着输出纯中文摘要（details/summary 格式）"
                            spellcheck="false"
                        ></textarea>
                    </div>
                </div>
            {/if}
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

    .prompt-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .prompt-card {
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 12px;
        background: #fff;
        overflow: hidden;
        transition:
            opacity 0.2s,
            filter 0.2s;
    }

    .prompt-card.disabled {
        opacity: 0.62;
        filter: grayscale(1);
        background: #f1f5f9;
    }

    .prompt-card.disabled .card-header {
        background: #e2e8f0;
    }

    .card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 10px 12px;
        background: rgba(248, 250, 252, 0.85);
        cursor: pointer;
        user-select: none;
    }

    .card-left {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
    }

    .collapse-toggle {
        font-size: 16px;
        color: #64748b;
        width: 18px;
    }

    .card-info {
        min-width: 0;
    }

    .card-title {
        font-weight: 800;
        color: #0f172a;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .card-subtitle {
        color: #64748b;
        font-size: 12px;
    }

    .enable-checkbox {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: #334155;
        cursor: pointer;
    }

    .enable-checkbox input {
        width: 16px;
        height: 16px;
    }

    .card-body {
        padding: 10px 12px;
    }

    .input-row {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
    }

    .input-cell {
        flex: 1;
        min-width: 160px;
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

    .field-input,
    .field-select {
        width: 100%;
        padding: 10px;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        font-size: 14px;
        box-sizing: border-box;
    }

    .field-input:disabled,
    .field-select:disabled {
        background: #f1f5f9;
        color: #64748b;
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
