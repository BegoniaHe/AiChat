<script>
    /**
     * World Panel Component
     * - List and manage worldbooks
     * - Import from ST JSON
     * - Activate/deactivate for session or global
     * - Group chat: per-member world binding
     */
    import {
        contactsStore,
        convertSTWorld,
        getRegexStore,
        getWorldInfoStore,
    } from "$stores";
    import Modal from "../Modal.svelte";
    import WorldEditor from "./WorldEditor.svelte";
    import { downloadJson } from "./world-types.js";

    /** @type {{ scope?: 'session' | 'global', getSessionId?: () => string }} */
    const { scope = "session", getSessionId = null } = $props();

    const store = getWorldInfoStore();
    const regexStore = getRegexStore();

    // Internal state
    let visible = $state(false);
    let currentScope = $state("session");
    let worldNames = $state([]);
    let currentWorldId = $state("");
    let globalWorldId = $state("");
    let sessionId = $state("default");
    let isGroupSession = $state(false);
    let groupMembers = $state([]);
    let groupContact = $state(null);

    // File input
    let fileInput = $state(null);
    let selectedFile = $state(null);
    let selectedFileName = $state("未选择文件");

    // Editor ref
    let editorRef = $state(null);

    // Computed
    const displayNames = $derived(
        worldNames.filter((n) => n !== "__builtin_phone_format__"),
    );
    const currentIndicator = $derived(() => {
        if (currentScope === "global") {
            return `全局当前：${globalWorldId || "未启用"}`;
        }
        if (isGroupSession) {
            return `群聊 ${groupContact?.name || sessionId}：按成员绑定世界书`;
        }
        return `会话 ${sessionId} 当前：${currentWorldId || "未启用"}`;
    });
    const activatedWorldId = $derived(
        currentScope === "global" ? globalWorldId : currentWorldId,
    );

    /**
     * Show panel
     * @param {{ scope?: 'session' | 'global' }} opts
     */
    export async function show(opts = {}) {
        currentScope = opts.scope === "global" ? "global" : "session";
        await refreshList();
        visible = true;
    }

    /**
     * Hide panel
     */
    export function hide() {
        visible = false;
    }

    /**
     * Refresh world list
     */
    async function refreshList() {
        await store.ready;

        // Get session info
        sessionId =
            getSessionId?.() || window.appBridge?.activeSessionId || "default";
        const contact = contactsStore.getContact(sessionId);
        groupContact = contact;
        isGroupSession =
            currentScope === "session" &&
            (Boolean(contact?.isGroup) ||
                String(sessionId).startsWith("group:"));

        if (isGroupSession && Array.isArray(contact?.members)) {
            groupMembers = contact.members;
        } else {
            groupMembers = [];
        }

        // Load worlds list
        worldNames = store.list();

        // Get current world IDs (from appBridge if available)
        const rawGlobal = window.appBridge?.globalWorldId || "";
        const rawCurrent = window.appBridge?.currentWorldId || "";

        globalWorldId =
            rawGlobal === "__builtin_phone_format__" ? "" : rawGlobal;
        currentWorldId =
            rawCurrent === "__builtin_phone_format__" ? "" : rawCurrent;
    }

    /**
     * Get member display info
     */
    function getMemberInfo(memberId) {
        const c = contactsStore.getContact(memberId);
        return {
            name: c?.name || memberId,
            avatar: c?.avatar || "./assets/external/feather-default.png",
        };
    }

    /**
     * Get bound world for a member
     */
    function getBoundWorld(memberId) {
        const raw = window.appBridge?.getWorldForSession?.(memberId) || "";
        return raw === "__builtin_phone_format__" ? "" : raw;
    }

    /**
     * Bind world to member
     */
    function bindWorldToMember(memberId, worldId) {
        const sid = String(memberId || "").trim();
        if (!sid) return;
        window.appBridge?.bindWorldToSession?.(sid, worldId, { silent: true });
        window.dispatchEvent(
            new CustomEvent("worldinfo-changed", {
                detail: { worldId: window.appBridge?.currentWorldId },
            }),
        );
    }

    /**
     * Prompt to select world for member
     */
    function promptSelectWorld(memberId, memberName) {
        const options = displayNames
            .slice()
            .sort((a, b) => String(a).localeCompare(String(b)));
        const hint = options.slice(0, 40).join("\n");
        const currentBound = getBoundWorld(memberId);

        const raw = prompt(
            `为「${memberName}」选择要绑定的世界书名称（输入名称即可）：\n\n（部分列表）\n${hint}\n\n也可直接输入完整名称`,
            currentBound || "",
        );
        const next = String(raw || "").trim();
        if (!next) return;

        if (!options.includes(next)) {
            window.toastr?.warning?.("未找到该世界书名称");
            return;
        }

        bindWorldToMember(memberId, next);
        refreshList();
    }

    /**
     * Activate world
     */
    async function activateWorld(name) {
        if (currentScope === "global") {
            await window.appBridge?.setGlobalWorld?.(name);
        } else {
            await window.appBridge?.setCurrentWorld?.(name);
        }
        window.toastr?.success?.(`已启用世界书：${name}`);
        window.dispatchEvent(
            new CustomEvent("worldinfo-changed", { detail: { worldId: name } }),
        );
        await refreshList();
    }

    /**
     * Deactivate world
     */
    async function deactivateWorld() {
        if (currentScope === "global") {
            await window.appBridge?.setGlobalWorld?.("");
        } else {
            window.appBridge?.bindWorldToSession?.(sessionId, "", {
                silent: false,
            });
        }
        window.toastr?.success?.("已停用世界书");
        await refreshList();
    }

    /**
     * Delete world
     */
    async function deleteWorld(name) {
        if (!confirm(`确定要删除世界书「${name}」吗？此操作不可恢复。`)) return;
        await store.remove(name);
        window.toastr?.success?.("已删除世界书");
        await refreshList();
    }

    /**
     * Export world to clipboard or download
     */
    async function exportWorld(name) {
        const data = store.load(name);
        if (!data) {
            window.toastr?.warning?.("世界书数据为空");
            return;
        }

        const payload = { ...data, name };

        // Append bound regex sets if any
        try {
            await regexStore.ready;
            const sets = regexStore.listLocalSets() || [];
            const bound = sets
                .filter(
                    (s) => s?.bind?.type === "world" && s.bind.worldId === name,
                )
                .map((s) => ({
                    name: s.name,
                    enabled: s.enabled !== false,
                    rules: s.rules || [],
                }));
            if (bound.length) {
                payload.boundRegexSets = bound;
            }
        } catch {}

        const text = JSON.stringify(payload, null, 2);

        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            window.toastr?.success?.("已复制到剪贴板");
        } else {
            downloadJson(payload, `${name}.json`);
            window.toastr?.success?.("已触发下载");
        }
    }

    /**
     * Export current world
     */
    async function exportCurrentWorld() {
        const current = activatedWorldId;
        if (!current) {
            window.toastr?.warning?.("没有可导出的世界书");
            return;
        }
        await exportWorld(current);
    }

    /**
     * Create new world
     */
    async function createNewWorld() {
        const raw = prompt("新建世界书名称", "新世界书");
        const name = String(raw || "").trim();
        if (!name) return;

        if (worldNames.includes(name)) {
            window.toastr?.warning?.("名称已存在，请换一个");
            return;
        }

        const blank = { name, entries: [] };
        await store.save(name, blank);

        // Activate it
        await activateWorld(name);

        // Open editor
        await openEditor(name);
    }

    /**
     * Open world editor
     */
    async function openEditor(name) {
        const data = store.load(name);
        editorRef?.show(name, data);
    }

    /**
     * Handle file selection
     */
    function handleFileSelect(e) {
        const file = e.target?.files?.[0];
        if (file) {
            selectedFile = file;
            selectedFileName = file.name;
        }
    }

    /**
     * Import world from file
     */
    async function importWorld() {
        if (!selectedFile) {
            window.toastr?.warning?.("请选择 ST JSON 文件");
            return;
        }

        try {
            const jsonText = await selectedFile.text();
            const json = JSON.parse(jsonText);

            const nameFromJson = json.name || json.title || "";
            const nameHint = selectedFile.name.replace(/\.json$/i, "");
            const name = nameFromJson || nameHint || "imported";

            const simplified = convertSTWorld(json, name);
            await store.save(name, simplified);

            // Import bound regex sets if present
            const boundSets =
                json?.boundRegexSets ||
                json?.bound_regex_sets ||
                json?.bound_regex_sets_v1 ||
                null;
            if (Array.isArray(boundSets) && boundSets.length) {
                try {
                    const ok = confirm(
                        `检测到世界书包含绑定的正规表达式（${boundSets.length} 组）。是否一并导入并绑定？\n取消：仅导入世界书，不导入正则。`,
                    );

                    if (ok) {
                        await importBoundRegexSets(boundSets, name);
                    }
                } catch (err) {
                    console.warn("导入绑定正则失败", err);
                }
            }

            await refreshList();
            window.toastr?.success?.(`导入成功：${name}`);

            // Reset file input
            selectedFile = null;
            selectedFileName = "未选择文件";
            if (fileInput) fileInput.value = "";
        } catch (err) {
            console.error("导入世界书失败", err);
            window.toastr?.error?.("导入失败，请检查 JSON", "错误");
        }
    }

    /**
     * Import bound regex sets
     */
    async function importBoundRegexSets(boundSets, worldName) {
        await regexStore.ready;

        const ruleSig = (r) => {
            const findRegex = String(r?.findRegex || "").trim();
            const replaceString = String(r?.replaceString ?? "");
            const trim = Array.isArray(r?.trimStrings)
                ? r.trimStrings.map(String).join("\n")
                : "";
            const placement = Array.isArray(r?.placement)
                ? r.placement
                      .map((n) => Number(n))
                      .filter(Number.isFinite)
                      .sort((a, b) => a - b)
                      .join(",")
                : "";
            const disabled = r?.disabled ? "1" : "0";
            const markdownOnly = r?.markdownOnly ? "1" : "0";
            const promptOnly = r?.promptOnly ? "1" : "0";
            const runOnEdit = r?.runOnEdit ? "1" : "0";
            const sub = String(Number(r?.substituteRegex ?? 0));
            const minD =
                r?.minDepth === null ||
                r?.minDepth === undefined ||
                r?.minDepth === ""
                    ? ""
                    : String(r?.minDepth);
            const maxD =
                r?.maxDepth === null ||
                r?.maxDepth === undefined ||
                r?.maxDepth === ""
                    ? ""
                    : String(r?.maxDepth);

            if (!findRegex && !String(r?.pattern || "").trim()) {
                // legacy fallback signature
                const when = String(r?.when || "both");
                const pattern = String(r?.pattern || "").trim();
                const flags =
                    r?.flags === undefined || r?.flags === null
                        ? "g"
                        : String(r?.flags);
                const replacement = String(r?.replacement ?? "");
                return `${when}\u0000${pattern}\u0000${flags}\u0000${replacement}`;
            }

            return [
                findRegex,
                replaceString,
                trim,
                placement,
                disabled,
                markdownOnly,
                promptOnly,
                runOnEdit,
                sub,
                minD,
                maxD,
            ].join("\u0000");
        };

        const existingSigs = new Set();
        try {
            const sets = regexStore.listLocalSets() || [];
            sets.forEach((s) =>
                (Array.isArray(s?.rules) ? s.rules : []).forEach((r) => {
                    existingSigs.add(ruleSig(r));
                }),
            );
        } catch {}

        for (const s of boundSets) {
            const rulesRaw = Array.isArray(s?.rules) ? s.rules : [];
            const rules = [];
            const localSeen = new Set();

            for (const rr of rulesRaw) {
                const sig = ruleSig(rr);
                if (!sig || localSeen.has(sig) || existingSigs.has(sig))
                    continue;
                localSeen.add(sig);
                existingSigs.add(sig);
                rules.push(rr);
            }

            if (!rules.length) continue;

            const setName = String(s?.name || "正则").trim() || "正则";
            await regexStore.upsertLocalSet({
                name: `${setName} (${worldName})`,
                enabled: s?.enabled !== false,
                bind: { type: "world", worldId: worldName },
                rules,
            });
        }

        window.toastr?.success?.("已导入并绑定正则");
        window.dispatchEvent(new CustomEvent("regex-changed"));
    }

    /**
     * Handle editor save
     */
    function handleEditorSaved() {
        refreshList();
    }
</script>

<Modal bind:open={visible} title="世界书管理" size="lg" closable>
    <div class="world-panel-content">
        <!-- Current indicator -->
        <div class="current-indicator">
            {currentIndicator()}
        </div>

        <div class="panel-columns">
            <!-- Left: World list -->
            <div class="list-column">
                <div class="section-title">已保存</div>

                <!-- Group chat: per-member bindings -->
                {#if isGroupSession && groupMembers.length > 0}
                    <div class="group-members-section">
                        <div class="group-title">
                            群聊世界书（按成员绑定，自动合并 A+B+...）
                        </div>
                        <div class="group-desc">
                            提示：在某个成员的私聊里启用世界书，会自动绑定到该成员；群聊会自动使用所有成员已绑定的世界书。
                        </div>
                        <div class="members-list">
                            {#each groupMembers as memberId}
                                {@const info = getMemberInfo(memberId)}
                                {@const bound = getBoundWorld(memberId)}
                                <div class="member-row">
                                    <img
                                        src={info.avatar}
                                        alt=""
                                        class="member-avatar"
                                    />
                                    <div class="member-info">
                                        <div class="member-name">
                                            {info.name}
                                        </div>
                                        <div
                                            class="member-bound"
                                            class:unbound={!bound}
                                        >
                                            {bound
                                                ? `已绑定：${bound}`
                                                : "未绑定世界书"}
                                        </div>
                                    </div>
                                    <div class="member-actions">
                                        <button
                                            class="btn btn-sm"
                                            onclick={() =>
                                                promptSelectWorld(
                                                    memberId,
                                                    info.name,
                                                )}
                                        >
                                            {bound ? "更换" : "绑定"}
                                        </button>
                                        <button
                                            class="btn btn-sm btn-danger"
                                            disabled={!bound}
                                            onclick={() => {
                                                bindWorldToMember(memberId, "");
                                                refreshList();
                                            }}
                                        >
                                            停用
                                        </button>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}

                <!-- World list -->
                <ul class="world-list">
                    {#if displayNames.length === 0}
                        <li class="empty-item">（暂无世界书）</li>
                    {:else}
                        {#each displayNames as name}
                            {@const isActive = name === activatedWorldId}
                            <li
                                class="world-item"
                                class:active={isActive}
                                ondblclick={() => openEditor(name)}
                            >
                                <span class="world-name" title="双击编辑世界书"
                                    >{name}</span
                                >
                                <div class="world-actions">
                                    {#if isGroupSession && currentScope === "session"}
                                        <button class="btn btn-sm" disabled
                                            >（群聊）</button
                                        >
                                    {:else}
                                        <button
                                            class="btn btn-sm"
                                            class:btn-active={isActive}
                                            disabled={isActive}
                                            onclick={() => activateWorld(name)}
                                        >
                                            {isActive ? "当前" : "启用"}
                                        </button>
                                    {/if}
                                    <button
                                        class="btn btn-sm btn-danger"
                                        disabled={!activatedWorldId ||
                                            (isGroupSession &&
                                                currentScope === "session")}
                                        onclick={deactivateWorld}
                                    >
                                        停用
                                    </button>
                                    <button
                                        class="btn btn-sm"
                                        onclick={() => exportWorld(name)}
                                        >导出</button
                                    >
                                    <button
                                        class="btn btn-sm btn-danger-outline"
                                        onclick={() => deleteWorld(name)}
                                        >删除</button
                                    >
                                </div>
                            </li>
                        {/each}
                    {/if}
                </ul>

                <div class="list-actions">
                    <button class="btn btn-primary" onclick={createNewWorld}
                        >新增</button
                    >
                    <button class="btn" onclick={exportCurrentWorld}
                        >导出当前</button
                    >
                </div>
            </div>

            <!-- Right: Import -->
            <div class="import-column">
                <div class="section-title">导入 ST JSON</div>

                <div class="file-picker">
                    <button class="btn" onclick={() => fileInput?.click()}
                        >选择文件</button
                    >
                    <span class="file-name">{selectedFileName}</span>
                    <input
                        type="file"
                        accept=".json,application/json"
                        bind:this={fileInput}
                        onchange={handleFileSelect}
                        hidden
                    />
                </div>

                <div class="import-hint">
                    名称将取自 JSON 的 name 或文件名（无需手动填写）
                </div>

                <div class="import-actions">
                    <button class="btn" onclick={importWorld}>导入</button>
                    <button class="btn" onclick={hide}>关闭</button>
                </div>
            </div>
        </div>
    </div>
</Modal>

<!-- World Editor Modal -->
<WorldEditor bind:this={editorRef} onSaved={handleEditorSaved} />

<style>
    .world-panel-content {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .current-indicator {
        color: #475569;
        font-size: 13px;
        margin-bottom: 4px;
    }

    .panel-columns {
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
    }

    .list-column,
    .import-column {
        flex: 1 1 45%;
        min-width: 200px;
    }

    .section-title {
        font-weight: 700;
        margin-bottom: 8px;
        color: #0f172a;
    }

    /* Group members section */
    .group-members-section {
        padding: 10px;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        background: #f8fafc;
        margin-bottom: 10px;
    }

    .group-title {
        font-weight: 800;
        color: #0f172a;
    }

    .group-desc {
        color: #64748b;
        font-size: 12px;
        margin-top: 4px;
    }

    .members-list {
        margin-top: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .member-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px;
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 12px;
        background: #fff;
    }

    .member-avatar {
        width: 34px;
        height: 34px;
        border-radius: 50%;
        object-fit: cover;
    }

    .member-info {
        flex: 1;
        min-width: 0;
    }

    .member-name {
        font-weight: 800;
        color: #0f172a;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .member-bound {
        color: #0f172a;
        font-size: 12px;
        margin-top: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .member-bound.unbound {
        color: #94a3b8;
    }

    .member-actions {
        display: flex;
        gap: 6px;
        align-items: center;
    }

    /* World list */
    .world-list {
        list-style: none;
        padding: 8px;
        margin: 0;
        border: 1px solid #eee;
        border-radius: 8px;
        max-height: 220px;
        overflow: auto;
    }

    .empty-item {
        color: #888;
        padding: 10px;
    }

    .world-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 8px;
        border-bottom: 1px solid #f0f0f0;
        cursor: pointer;
    }

    .world-item:last-child {
        border-bottom: none;
    }

    .world-item.active {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
    }

    .world-name {
        font-weight: 600;
        cursor: pointer;
    }

    .world-actions {
        display: flex;
        gap: 6px;
    }

    .list-actions {
        display: flex;
        gap: 8px;
        margin-top: 8px;
    }

    /* Import column */
    .file-picker {
        display: flex;
        gap: 8px;
        align-items: center;
        margin-bottom: 8px;
    }

    .file-name {
        font-size: 12px;
        color: #64748b;
    }

    .import-hint {
        color: #94a3b8;
        font-size: 12px;
        margin: 6px 0;
    }

    .import-actions {
        display: flex;
        gap: 8px;
        margin-top: 8px;
        justify-content: flex-end;
    }

    /* Buttons */
    .btn {
        padding: 8px 14px;
        border-radius: 8px;
        border: 1px solid #ddd;
        background: #f5f5f5;
        cursor: pointer;
        font-size: 13px;
        transition: all 0.15s;
    }

    .btn:hover:not(:disabled) {
        background: #e5e5e5;
    }

    .btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .btn-sm {
        padding: 4px 8px;
        font-size: 12px;
        border-radius: 6px;
    }

    .btn-primary {
        background: #019aff;
        color: #fff;
        border-color: #019aff;
    }

    .btn-primary:hover:not(:disabled) {
        background: #0284c7;
    }

    .btn-active {
        opacity: 0.7;
    }

    .btn-danger {
        background: #fee2e2;
        color: #b91c1c;
        border-color: #fecaca;
    }

    .btn-danger:hover:not(:disabled) {
        background: #fecaca;
    }

    .btn-danger-outline {
        background: #fff;
        color: #b91c1c;
        border-color: #fecaca;
    }

    .btn-danger-outline:hover:not(:disabled) {
        background: #fee2e2;
    }
</style>
