<script>
    /**
     * GroupPanel.svelte - 联系人分组管理面板
     * 基于原始 group-panel.js 重写的 Svelte 5 版本
     */
    import { getGroupStore } from "$stores";
    import { onMount } from "svelte";
    import Modal from "./Modal.svelte";

    // Props
    let { show = $bindable(false), onGroupChanged = null } = $props();

    // State
    let groupStore = $state(null);
    let groups = $state([]);
    let newGroupName = $state("");
    let selectedParentId = $state("");
    let editingGroup = $state(null);
    let editName = $state("");

    // Initialize store
    onMount(async () => {
        groupStore = getGroupStore();
        await groupStore.ready;
        loadGroups();
    });

    function loadGroups() {
        if (!groupStore) return;
        groups = groupStore.listGroups() || [];
    }

    // Build tree structure
    function buildGroupTree(groupList) {
        const byId = new Map();
        const byParent = new Map();
        const roots = [];

        groupList.forEach((g) => {
            byId.set(g.id, g);
            const pid = String(g.parentId || "").trim();
            if (!byParent.has(pid)) byParent.set(pid, []);
            byParent.get(pid).push(g);
        });

        groupList.forEach((g) => {
            const pid = String(g.parentId || "").trim();
            if (!pid || !byId.has(pid)) {
                roots.push(g);
            }
        });

        roots.sort((a, b) => (a.order || 0) - (b.order || 0));
        byParent.forEach((list) =>
            list.sort((a, b) => (a.order || 0) - (b.order || 0)),
        );

        return { byId, byParent, roots };
    }

    // Flatten tree for display
    function flattenTree(tree) {
        const items = [];

        function pushGroup(group, depth) {
            items.push({ group, depth });
            const children = tree.byParent.get(group.id) || [];
            children.forEach((child) => pushGroup(child, depth + 1));
        }

        (tree.roots || []).forEach((g) => pushGroup(g, 0));
        return items;
    }

    // Create new group
    async function createGroup() {
        const name = newGroupName.trim();
        if (!name) {
            window.toastr?.warning?.("请输入分组名称");
            return;
        }

        try {
            await groupStore?.createGroup?.({
                name,
                parentId: selectedParentId || null,
            });

            newGroupName = "";
            selectedParentId = "";
            loadGroups();
            onGroupChanged?.();
            window.toastr?.success?.(`已创建分组：${name}`);
        } catch (err) {
            console.error("Create group error:", err);
            window.toastr?.error?.("创建失败");
        }
    }

    // Start editing group
    function startEdit(group) {
        editingGroup = group;
        editName = group.name;
    }

    // Save edit
    async function saveEdit() {
        if (!editingGroup) return;

        const name = editName.trim();
        if (!name) {
            window.toastr?.warning?.("分组名称不能为空");
            return;
        }

        try {
            await groupStore?.updateGroup?.(editingGroup.id, { name });
            editingGroup = null;
            editName = "";
            loadGroups();
            onGroupChanged?.();
            window.toastr?.success?.("已保存");
        } catch (err) {
            console.error("Update group error:", err);
            window.toastr?.error?.("保存失败");
        }
    }

    // Cancel edit
    function cancelEdit() {
        editingGroup = null;
        editName = "";
    }

    // Delete group
    async function deleteGroup(groupId) {
        const group = groups.find((g) => g.id === groupId);
        if (!group) return;

        const hasContacts = (group.contacts?.length || 0) > 0;
        const msg = hasContacts
            ? `确定删除「${group.name}」吗？其中的 ${group.contacts.length} 个联系人将移至未分组。`
            : `确定删除「${group.name}」吗？`;

        if (!confirm(msg)) return;

        try {
            await groupStore?.deleteGroup?.(groupId);
            loadGroups();
            onGroupChanged?.();
            window.toastr?.success?.(`已删除分组：${group.name}`);
        } catch (err) {
            console.error("Delete group error:", err);
            window.toastr?.error?.("删除失败");
        }
    }

    // Change parent
    async function changeParent(groupId, newParentId) {
        try {
            await groupStore?.setParent?.(groupId, newParentId || null);
            loadGroups();
            onGroupChanged?.();
        } catch (err) {
            console.error("Set parent error:", err);
            window.toastr?.error?.("设置上级分组失败");
        }
    }

    // Get valid parent options (exclude self and descendants)
    function getValidParentOptions(excludeId) {
        const descendants = new Set();

        function collectDescendants(id) {
            descendants.add(id);
            groups
                .filter((g) => g.parentId === id)
                .forEach((child) => {
                    collectDescendants(child.id);
                });
        }

        if (excludeId) {
            collectDescendants(excludeId);
        }

        return groups.filter((g) => !descendants.has(g.id));
    }

    // Derived
    let tree = $derived(buildGroupTree(groups));
    let flatGroups = $derived(flattenTree(tree));
</script>

<Modal bind:show title="联系人分组" size="large">
    <div class="group-panel">
        <!-- Create new group -->
        <div class="create-section">
            <div class="section-title">新建分组</div>
            <div class="create-form">
                <input
                    type="text"
                    class="name-input"
                    placeholder="输入分组名称"
                    maxlength="15"
                    bind:value={newGroupName}
                    onkeydown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            createGroup();
                        }
                    }}
                />
                <button class="create-btn" onclick={createGroup}>创建</button>
            </div>
            <div class="parent-select-row">
                <label class="parent-label">上级分组（可选）</label>
                <select class="parent-select" bind:value={selectedParentId}>
                    <option value="">无上级分组</option>
                    {#each groups as g}
                        <option value={g.id}>{g.name}</option>
                    {/each}
                </select>
            </div>
        </div>

        <!-- Group list -->
        <div class="list-section">
            <div class="section-title">已有分组</div>

            {#if flatGroups.length === 0}
                <div class="empty-state">暂无分组</div>
            {:else}
                <div class="group-list">
                    {#each flatGroups as { group, depth } (group.id)}
                        {@const count = group.contacts?.length || 0}
                        {@const parentName = group.parentId
                            ? tree.byId.get(group.parentId)?.name
                            : ""}
                        {@const indent = Math.min(depth * 14, 56)}

                        <div class="group-item" style="margin-left: {indent}px">
                            {#if editingGroup?.id === group.id}
                                <!-- Edit mode -->
                                <div class="edit-form">
                                    <input
                                        type="text"
                                        class="edit-input"
                                        bind:value={editName}
                                        maxlength="15"
                                        onkeydown={(e) => {
                                            if (e.key === "Enter") saveEdit();
                                            if (e.key === "Escape")
                                                cancelEdit();
                                        }}
                                    />
                                    <button class="save-btn" onclick={saveEdit}
                                        >保存</button
                                    >
                                    <button
                                        class="cancel-btn"
                                        onclick={cancelEdit}>取消</button
                                    >
                                </div>
                            {:else}
                                <!-- View mode -->
                                <div class="group-info">
                                    <div class="group-name">{group.name}</div>
                                    <div class="group-meta">
                                        {count} 个联系人
                                        {#if parentName}
                                            <span class="parent-info"
                                                >· 上级：{parentName}</span
                                            >
                                        {/if}
                                    </div>
                                </div>
                                <div class="group-actions">
                                    <select
                                        class="parent-dropdown"
                                        value={group.parentId || ""}
                                        onchange={(e) =>
                                            changeParent(
                                                group.id,
                                                e.target.value,
                                            )}
                                    >
                                        <option value="">无上级</option>
                                        {#each getValidParentOptions(group.id) as opt}
                                            <option value={opt.id}
                                                >{opt.name}</option
                                            >
                                        {/each}
                                    </select>
                                    <button
                                        class="edit-btn"
                                        onclick={() => startEdit(group)}
                                    >
                                        编辑
                                    </button>
                                    <button
                                        class="delete-btn"
                                        onclick={() => deleteGroup(group.id)}
                                    >
                                        删除
                                    </button>
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    </div>
</Modal>

<style>
    .group-panel {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 16px;
        max-height: 70vh;
        overflow-y: auto;
    }

    .section-title {
        font-weight: 700;
        color: #0f172a;
        margin-bottom: 12px;
    }

    .create-section {
        padding-bottom: 16px;
        border-bottom: 1px solid #e2e8f0;
    }

    .create-form {
        display: flex;
        gap: 8px;
    }

    .name-input {
        flex: 1;
        padding: 10px 14px;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        font-size: 14px;
        outline: none;
    }

    .name-input:focus {
        border-color: #2563eb;
    }

    .create-btn {
        padding: 10px 18px;
        border: none;
        border-radius: 10px;
        background: #019aff;
        color: white;
        cursor: pointer;
        font-weight: 700;
        white-space: nowrap;
    }

    .create-btn:hover {
        background: #0284c7;
    }

    .parent-select-row {
        margin-top: 12px;
    }

    .parent-label {
        display: block;
        font-size: 12px;
        color: #64748b;
        margin-bottom: 6px;
    }

    .parent-select {
        width: 100%;
        padding: 9px 10px;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        font-size: 14px;
        background: white;
    }

    .list-section {
        flex: 1;
    }

    .empty-state {
        color: #94a3b8;
        text-align: center;
        padding: 20px;
    }

    .group-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .group-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        background: #fafbfc;
    }

    .group-info {
        flex: 1;
        min-width: 0;
    }

    .group-name {
        font-weight: 600;
        color: #0f172a;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .group-meta {
        font-size: 12px;
        color: #94a3b8;
    }

    .parent-info {
        margin-left: 4px;
    }

    .group-actions {
        display: flex;
        gap: 6px;
        flex-shrink: 0;
    }

    .parent-dropdown {
        padding: 6px 8px;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        font-size: 12px;
        background: white;
        max-width: 100px;
    }

    .edit-btn,
    .delete-btn,
    .save-btn,
    .cancel-btn {
        padding: 6px 12px;
        border: none;
        border-radius: 6px;
        font-size: 12px;
        cursor: pointer;
    }

    .edit-btn {
        background: #e2e8f0;
        color: #334155;
    }

    .edit-btn:hover {
        background: #cbd5e1;
    }

    .delete-btn {
        background: #fef2f2;
        color: #ef4444;
    }

    .delete-btn:hover {
        background: #fee2e2;
    }

    .save-btn {
        background: #22c55e;
        color: white;
    }

    .save-btn:hover {
        background: #16a34a;
    }

    .cancel-btn {
        background: #e2e8f0;
        color: #64748b;
    }

    .cancel-btn:hover {
        background: #cbd5e1;
    }

    .edit-form {
        display: flex;
        gap: 8px;
        width: 100%;
    }

    .edit-input {
        flex: 1;
        padding: 8px 12px;
        border: 1px solid #2563eb;
        border-radius: 8px;
        font-size: 14px;
        outline: none;
    }
</style>
