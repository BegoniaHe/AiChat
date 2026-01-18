<script>
    /**
     * ContactListItem.svelte - 联系人列表项
     * 显示单个联系人/会话信息
     */
    import Avatar from "../Avatar.svelte";
    import Badge from "../Badge.svelte";

    /**
     * @typedef {Object} Props
     * @property {string} id - 联系人 ID
     * @property {string} name - 显示名称
     * @property {string} [avatar=''] - 头像 URL
     * @property {boolean} [isGroup=false] - 是否群组
     * @property {number} [membersCount=0] - 成员数量（群组）
     * @property {string} [snippet=''] - 最后消息摘要
     * @property {string} [time=''] - 最后消息时间
     * @property {number} [unread=0] - 未读数
     * @property {boolean} [isCurrent=false] - 是否当前选中
     * @property {() => void} [onSwitch] - 切换回调
     * @property {() => void} [onRename] - 改名回调
     * @property {() => void} [onDelete] - 删除回调
     */

    /** @type {Props} */
    let {
        id,
        name,
        avatar = "",
        isGroup = false,
        membersCount = 0,
        snippet = "",
        time = "",
        unread = 0,
        isCurrent = false,
        onSwitch,
        onRename,
        onDelete,
    } = $props();

    // 显示名称（群组带成员数）
    const displayName = $derived(isGroup ? `${name}(${membersCount})` : name);
</script>

<div class="contact-item" class:current={isCurrent}>
    <div class="info">
        <Avatar
            src={avatar}
            alt={name}
            size={36}
            fallback="./assets/external/feather-default.png"
        />
        <div class="text">
            <div class="name-row">
                <strong class="name">{displayName}</strong>
                {#if unread > 0}
                    <Badge count={unread} />
                {/if}
                {#if isGroup}
                    <span class="group-tag">群</span>
                {/if}
                {#if isCurrent}
                    <span class="current-tag">当前</span>
                {/if}
            </div>
            <div class="snippet-row">
                <span class="snippet">{snippet}</span>
                {#if time}
                    <span class="time">{time}</span>
                {/if}
            </div>
        </div>
    </div>

    <div class="actions">
        <button class="btn" class:current-btn={isCurrent} onclick={onSwitch}>
            {isCurrent ? "当前" : "切换"}
        </button>
        <button class="btn" onclick={onRename}>改名</button>
        <button class="btn delete-btn" onclick={onDelete}>删除</button>
    </div>
</div>

<style>
    .contact-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 10px;
        border-bottom: 1px solid #f0f0f0;
        gap: 10px;
    }

    .contact-item.current {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        margin-bottom: 4px;
    }

    .info {
        display: flex;
        align-items: center;
        gap: 10px;
        flex: 1;
        min-width: 0;
    }

    .text {
        flex: 1;
        min-width: 0;
    }

    .name-row {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
    }

    .name {
        font-weight: 700;
        color: #333;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .group-tag {
        padding: 2px 6px;
        border-radius: 8px;
        background: #e0f2fe;
        color: #0369a1;
        font-size: 11px;
    }

    .current-tag {
        color: #059669;
        font-size: 11px;
    }

    .snippet-row {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 2px;
    }

    .snippet {
        color: #888;
        font-size: 12px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex: 1;
        min-width: 0;
    }

    .time {
        color: #9ca3af;
        font-size: 11px;
        flex-shrink: 0;
    }

    .actions {
        display: flex;
        gap: 6px;
        flex-shrink: 0;
    }

    .btn {
        padding: 4px 8px;
        border: 1px solid #ddd;
        border-radius: 6px;
        background: #f5f5f5;
        cursor: pointer;
        font-size: 12px;
        transition: background 0.15s;
    }

    .btn:hover {
        background: #e2e8f0;
    }

    .btn.current-btn {
        background: #e0f2fe;
        border-color: #7dd3fc;
        color: #0369a1;
    }

    .delete-btn {
        border-color: #fca5a5;
        background: #fee2e2;
        color: #b91c1c;
    }

    .delete-btn:hover {
        background: #fecaca;
    }
</style>
