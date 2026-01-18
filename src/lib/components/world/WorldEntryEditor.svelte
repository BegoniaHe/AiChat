<script>
    /**
     * World Entry Editor Component
     * - Edit a single world entry with all fields
     * - Two-way binding with entry object
     */
    import {
        POSITION_OPTIONS,
        ROLE_OPTIONS,
        SELECTIVE_LOGIC_OPTIONS,
        normalizeArray,
        toNumber,
    } from "./world-types.js";

    /** @type {{ entry: import('./world-types.js').WorldEntry, onEntryChange?: () => void }} */
    let { entry = $bindable(), onEntryChange } = $props();

    /** Update entry and notify parent */
    function updateEntry() {
        onEntryChange?.();
    }

    /** Handle key array input */
    function handleKeyInput(value) {
        entry.key = normalizeArray(value);
        entry.triggers = entry.key;
        updateEntry();
    }

    /** Handle keysecondary array input */
    function handleSecondaryInput(value) {
        entry.keysecondary = normalizeArray(value);
        entry.secondary = entry.keysecondary;
        updateEntry();
    }

    /** Handle number input with bounds */
    function handleNumber(field, value, min = null, max = null) {
        let v = toNumber(value, 0);
        if (min != null) v = Math.max(min, v);
        if (max != null) v = Math.min(max, v);
        entry[field] = v;
        updateEntry();
    }

    /** Handle override checkbox (null when unchecked) */
    function handleOverrideCheck(field, checked) {
        entry[field] = checked ? true : null;
        updateEntry();
    }

    /** Handle scan depth input */
    function handleScanDepth(value) {
        const v = String(value).trim();
        entry.scanDepth = v === "" ? null : toNumber(v, null);
        updateEntry();
    }
</script>

<div class="world-entry-form">
    <!-- Title / Memo -->
    <div class="form-group">
        <label for="we-comment">标题 / Memo</label>
        <input
            type="text"
            id="we-comment"
            bind:value={entry.comment}
            oninput={() => {
                entry.title = entry.comment;
                updateEntry();
            }}
            placeholder="条目标题（可选）"
        />
    </div>

    <!-- Content -->
    <div class="form-group">
        <label for="we-content">内容</label>
        <textarea
            id="we-content"
            bind:value={entry.content}
            oninput={updateEntry}
            placeholder="条目内容"
            rows="6"
        ></textarea>
    </div>

    <!-- Keywords Row -->
    <div class="form-row">
        <div class="form-col">
            <label for="we-key">主触发关键词（key）</label>
            <textarea
                id="we-key"
                value={(entry.key || []).join(", ")}
                oninput={(e) => handleKeyInput(e.target.value)}
                placeholder="用逗号或换行分隔"
                rows="2"
            ></textarea>
        </div>
        <div class="form-col">
            <label for="we-keysecondary">副触发关键词（keysecondary）</label>
            <textarea
                id="we-keysecondary"
                value={(entry.keysecondary || []).join(", ")}
                oninput={(e) => handleSecondaryInput(e.target.value)}
                placeholder="用逗号或换行分隔"
                rows="2"
            ></textarea>
        </div>
    </div>

    <!-- Position / Depth / Order Row -->
    <div class="form-row">
        <div class="form-col">
            <label for="we-position">位置（position）</label>
            <select
                id="we-position"
                bind:value={entry.position}
                onchange={updateEntry}
            >
                {#each POSITION_OPTIONS as opt}
                    <option value={opt.value}>{opt.label}</option>
                {/each}
            </select>
        </div>
        <div class="form-col">
            <label for="we-depth">深度（depth）</label>
            <input
                type="number"
                id="we-depth"
                bind:value={entry.depth}
                oninput={() => handleNumber("depth", entry.depth, 0, 1000)}
                min="0"
                max="1000"
            />
        </div>
        <div class="form-col">
            <label for="we-order">顺序 / Order</label>
            <input
                type="number"
                id="we-order"
                bind:value={entry.order}
                oninput={() => {
                    entry.priority = entry.order;
                    updateEntry();
                }}
                min="-9999"
                max="9999"
            />
        </div>
    </div>

    <!-- Probability / Role Row -->
    <div class="form-row">
        <div class="form-col">
            <label for="we-probability">触发概率（Trigger %）</label>
            <input
                type="number"
                id="we-probability"
                bind:value={entry.probability}
                oninput={() =>
                    handleNumber("probability", entry.probability, 0, 100)}
                min="0"
                max="100"
            />
        </div>
        <div class="form-col">
            <label>&nbsp;</label>
            <div class="checkbox-group">
                <label class="checkbox-label">
                    <input
                        type="checkbox"
                        bind:checked={entry.useProbability}
                        onchange={updateEntry}
                    />
                    启用概率
                </label>
            </div>
        </div>
        {#if Number(entry.position) === 4}
            <div class="form-col">
                <label for="we-role">插入角色（role）</label>
                <select
                    id="we-role"
                    bind:value={entry.role}
                    onchange={updateEntry}
                >
                    {#each ROLE_OPTIONS as opt}
                        <option value={opt.value}>{opt.label}</option>
                    {/each}
                </select>
            </div>
        {/if}
    </div>

    <!-- Status Section -->
    <div class="form-section">
        <label>状态（绿灯 / 蓝灯等）</label>
        <div class="checkbox-group">
            <label class="checkbox-label">
                <input
                    type="checkbox"
                    bind:checked={entry.disable}
                    onchange={updateEntry}
                />
                禁用（红灯）
            </label>
            <label class="checkbox-label">
                <input
                    type="checkbox"
                    bind:checked={entry.constant}
                    onchange={updateEntry}
                />
                常驻（蓝灯）
            </label>
            <label class="checkbox-label">
                <input
                    type="checkbox"
                    bind:checked={entry.selective}
                    onchange={updateEntry}
                />
                选择性触发（绿灯）
            </label>
            <label class="checkbox-label">
                <input
                    type="checkbox"
                    bind:checked={entry.ignoreBudget}
                    onchange={updateEntry}
                />
                忽略预算
            </label>
            <label class="checkbox-label">
                <input
                    type="checkbox"
                    bind:checked={entry.excludeRecursion}
                    onchange={updateEntry}
                />
                不参与递归
            </label>
            <label class="checkbox-label">
                <input
                    type="checkbox"
                    bind:checked={entry.preventRecursion}
                    onchange={updateEntry}
                />
                阻止递归
            </label>
        </div>

        <label style="margin-top: 8px;">选择性逻辑（Selective Logic）</label>
        <select
            id="we-selectiveLogic"
            bind:value={entry.selectiveLogic}
            onchange={updateEntry}
        >
            {#each SELECTIVE_LOGIC_OPTIONS as opt}
                <option value={opt.value}>{opt.label}</option>
            {/each}
        </select>
    </div>

    <!-- Match Source Section -->
    <div class="form-section">
        <label>匹配来源（Match）</label>
        <div class="checkbox-group">
            <label class="checkbox-label">
                <input
                    type="checkbox"
                    bind:checked={entry.matchPersonaDescription}
                    onchange={updateEntry}
                />
                Persona 描述
            </label>
            <label class="checkbox-label">
                <input
                    type="checkbox"
                    bind:checked={entry.matchCharacterDescription}
                    onchange={updateEntry}
                />
                角色描述
            </label>
            <label class="checkbox-label">
                <input
                    type="checkbox"
                    bind:checked={entry.matchCharacterPersonality}
                    onchange={updateEntry}
                />
                角色性格
            </label>
            <label class="checkbox-label">
                <input
                    type="checkbox"
                    bind:checked={entry.matchCharacterDepthPrompt}
                    onchange={updateEntry}
                />
                角色深度提示
            </label>
            <label class="checkbox-label">
                <input
                    type="checkbox"
                    bind:checked={entry.matchScenario}
                    onchange={updateEntry}
                />
                场景
            </label>
            <label class="checkbox-label">
                <input
                    type="checkbox"
                    bind:checked={entry.matchCreatorNotes}
                    onchange={updateEntry}
                />
                作者注释
            </label>
        </div>
    </div>

    <!-- Group Section -->
    <div class="form-section">
        <div class="form-row">
            <div class="form-col">
                <label for="we-group">纳入组（group）</label>
                <input
                    type="text"
                    id="we-group"
                    bind:value={entry.group}
                    oninput={updateEntry}
                    placeholder="逗号分隔多个组"
                />
            </div>
            <div class="form-col">
                <label for="we-groupWeight">组权重（groupWeight）</label>
                <input
                    type="number"
                    id="we-groupWeight"
                    bind:value={entry.groupWeight}
                    oninput={() =>
                        handleNumber("groupWeight", entry.groupWeight, 0, 9999)}
                    min="0"
                    max="9999"
                />
            </div>
        </div>
        <div class="checkbox-group" style="margin-top: 6px;">
            <label class="checkbox-label">
                <input
                    type="checkbox"
                    bind:checked={entry.groupOverride}
                    onchange={updateEntry}
                />
                允许覆盖同组
            </label>
            <label class="checkbox-label">
                <input
                    type="checkbox"
                    checked={entry.caseSensitive === true}
                    onchange={(e) =>
                        handleOverrideCheck("caseSensitive", e.target.checked)}
                />
                区分大小写（覆盖）
            </label>
            <label class="checkbox-label">
                <input
                    type="checkbox"
                    checked={entry.matchWholeWords === true}
                    onchange={(e) =>
                        handleOverrideCheck(
                            "matchWholeWords",
                            e.target.checked,
                        )}
                />
                全词匹配（覆盖）
            </label>
            <label class="checkbox-label">
                <input
                    type="checkbox"
                    checked={entry.useGroupScoring === true}
                    onchange={(e) =>
                        handleOverrideCheck(
                            "useGroupScoring",
                            e.target.checked,
                        )}
                />
                组打分（覆盖）
            </label>
        </div>

        <label style="margin-top: 6px;">扫描深度覆盖（scanDepth，可空）</label>
        <input
            type="number"
            id="we-scanDepth"
            value={entry.scanDepth ?? ""}
            oninput={(e) => handleScanDepth(e.target.value)}
            placeholder="留空使用全局设置"
            min="0"
            max="1000"
        />
    </div>
</div>

<style>
    .world-entry-form {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 12px;
    }

    .form-group {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .form-section {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 10px;
        background: #f8fafc;
        border-radius: 8px;
        border: 1px solid #e2e8f0;
    }

    .form-row {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
    }

    .form-col {
        flex: 1;
        min-width: 120px;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    label {
        font-size: 12px;
        font-weight: 600;
        color: #475569;
    }

    input[type="text"],
    input[type="number"],
    textarea,
    select {
        width: 100%;
        padding: 8px 10px;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        font-size: 13px;
        background: #fff;
        transition: border-color 0.15s;
    }

    input[type="text"]:focus,
    input[type="number"]:focus,
    textarea:focus,
    select:focus {
        outline: none;
        border-color: #019aff;
    }

    textarea {
        resize: vertical;
        min-height: 60px;
    }

    .checkbox-group {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 16px;
    }

    .checkbox-label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        font-weight: 400;
        color: #334155;
        cursor: pointer;
    }

    .checkbox-label input[type="checkbox"] {
        width: 16px;
        height: 16px;
        cursor: pointer;
    }
</style>
