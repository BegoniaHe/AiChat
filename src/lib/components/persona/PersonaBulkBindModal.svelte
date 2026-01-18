<script>
    /**
     * PersonaBulkBindModal.svelte - 批量绑定/解绑 Modal
     * 将 Persona 批量绑定到多个会话/联系人
     */
    import { contactsStore } from "$stores";
    import Avatar from "../Avatar.svelte";
    import Modal from "../Modal.svelte";
    import SearchInput from "../SearchInput.svelte";

    /**
     * @typedef {Object} Props
     * @property {boolean} open - 是否打开
     * @property {import('$stores').Persona | null} persona - 角色
     * @property {string[]} sessionIds - 所有会话 ID
     * @property {Set<string>} boundSessions - 已绑定的会话 ID
     * @property {(selected: Set<string>) => void} [onSave] - 保存回调
     * @property {() => void} [onClose] - 关闭回调
     */

    /** @type {Props} */
    const {
        open = false,
        persona = null,
        sessionIds = [],
        boundSessions = new Set(),
        onSave,
        onClose,
    } = $props();

    // 本地状态
    let searchTerm = $state("");
    let selected = $state(new Set(boundSessions));

    // 重置选择状态
    $effect(() => {
        if (open) {
            selected = new Set(boundSessions);
            searchTerm = "";
        }
    });

    // 构建联系人列表
    const items = $derived.by(() => {
        return sessionIds.map((id) => {
            const contact = contactsStore.get(id);
            const name = contact?.name || id;
            const avatar = contact?.avatar || "";
            const isGroup =
                Boolean(contact?.isGroup) || id.startsWith("group:");
            return { id, name, avatar, isGroup };
        });
    });

    // 过滤并排序
    const filteredItems = $derived.by(() => {
        const term = searchTerm.trim().toLowerCase();
        return items
            .filter((it) => {
                if (!term) return true;
                const hay = `${it.name} ${it.id}`.toLowerCase();
                return hay.includes(term);
            })
            .sort((a, b) => {
                // 群组优先
                const ga = a.isGroup ? 0 : 1;
                const gb = b.isGroup ? 0 : 1;
                if (ga !== gb) return ga - gb;
                return a.name.localeCompare(b.name);
            });
    });

    // 统计
    const selectedCount = $derived(selected.size);
    const totalCount = $derived(sessionIds.length);

    function toggleItem(id) {
        const newSelected = new Set(selected);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        selected = newSelected;
    }

    function selectAll() {
        selected = new Set(sessionIds);
    }

    function selectNone() {
        selected = new Set();
    }

    function handleSave() {
        onSave?.(selected);
    }
</script>

<Modal
    {open}
    {onClose}
    title="批量绑定/解绑"
    maxWidth="520px"
    maxHeight="720px"
>
    <div class="bulk-modal">
        <div class="meta">
            Persona：{persona?.name || "未知"}
        </div>

        <div class="search-bar">
            <SearchInput
                placeholder="搜索联系人/群组..."
                bind:value={searchTerm}
            />
            <div class="actions">
                <button class="action-btn" onclick={selectAll}>全选</button>
                <button class="action-btn" onclick={selectNone}>全不选</button>
                <span class="count">已选 {selectedCount} / {totalCount}</span>
            </div>
        </div>

        <div class="list">
            {#if filteredItems.length === 0}
                <div class="empty">未找到匹配的联系人/群组</div>
            {:else}
                {#each filteredItems as item (item.id)}
                    {@const checked = selected.has(item.id)}
                    <button
                        class="list-item"
                        class:selected={checked}
                        onclick={() => toggleItem(item.id)}
                    >
                        <input
                            type="checkbox"
                            {checked}
                            onclick={(e) => e.stopPropagation()}
                            onchange={() => toggleItem(item.id)}
                        />
                        <Avatar
                            src={item.avatar}
                            alt={item.name}
                            size={36}
                            fallback="./assets/external/feather-default.png"
                        />
                        <div class="item-info">
                            <div class="item-name">
                                {item.name}
                                {#if item.isGroup}
                                    <span class="group-tag">群组</span>
                                {/if}
                            </div>
                            <div class="item-id">{item.id}</div>
                        </div>
                    </button>
                {/each}
            {/if}
        </div>

        <div class="footer">
            <button class="cancel-btn" onclick={onClose}>取消</button>
            <button class="save-btn" onclick={handleSave}>保存绑定</button>
        </div>
    </div>
</Modal>

<style>
    .bulk-modal {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 400px;
    }

    .meta {
        padding: 10px 16px;
        font-size: 12px;
        color: #64748b;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    }

    .search-bar {
        padding: 12px 16px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    }

    .actions {
        margin-top: 8px;
        display: flex;
        gap: 8px;
        align-items: center;
    }

    .action-btn {
        border: 1px solid #e2e8f0;
        background: #fff;
        border-radius: 10px;
        padding: 8px 10px;
        font-size: 13px;
        cursor: pointer;
        transition: background 0.15s;
    }

    .action-btn:hover {
        background: #f8fafc;
    }

    .count {
        margin-left: auto;
        color: #64748b;
        font-size: 12px;
    }

    .list {
        flex: 1;
        min-height: 0;
        overflow: auto;
        -webkit-overflow-scrolling: touch;
        padding: 10px 12px;
    }

    .empty {
        padding: 18px 10px;
        color: #94a3b8;
        text-align: center;
    }

    .list-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px;
        border: 1px solid rgba(0, 0, 0, 0.06);
        border-radius: 12px;
        margin-bottom: 8px;
        background: #fff;
        width: 100%;
        text-align: left;
        cursor: pointer;
        transition: background 0.15s;
    }

    .list-item:hover {
        background: #f8fafc;
    }

    .list-item.selected {
        background: rgba(37, 99, 235, 0.06);
    }

    .list-item input[type="checkbox"] {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
    }

    .item-info {
        flex: 1;
        min-width: 0;
    }

    .item-name {
        font-weight: 800;
        color: #0f172a;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .group-tag {
        font-size: 10px;
        padding: 2px 6px;
        background: #e0f2fe;
        color: #0369a1;
        border-radius: 4px;
        font-weight: normal;
    }

    .item-id {
        color: #64748b;
        font-size: 12px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .footer {
        padding: 12px;
        border-top: 1px solid rgba(0, 0, 0, 0.08);
        display: flex;
        gap: 10px;
    }

    .cancel-btn {
        flex: 1;
        border: 1px solid #e2e8f0;
        background: #fff;
        border-radius: 12px;
        padding: 12px;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.15s;
    }

    .cancel-btn:hover {
        background: #f8fafc;
    }

    .save-btn {
        flex: 2;
        border: none;
        background: #2563eb;
        color: #fff;
        border-radius: 12px;
        padding: 12px;
        font-weight: 900;
        cursor: pointer;
        transition: background 0.15s;
    }

    .save-btn:hover {
        background: #1d4ed8;
    }
</style>
