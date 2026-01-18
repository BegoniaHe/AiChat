<script>
    /**
     * PersonaEditor.svelte - 角色编辑器
     * 编辑或创建 Persona
     */
    import Avatar from "../Avatar.svelte";
    import {
        normalizeHexColor,
        POSITION_OPTIONS,
        ROLE_OPTIONS,
    } from "./persona-types.js";

    /**
     * @typedef {Object} Props
     * @property {import('$stores').Persona | null} persona - 要编辑的角色，null 表示新建
     * @property {boolean} [canDelete=false] - 是否可删除
     * @property {(data: import('$stores').Persona) => void} [onSave] - 保存回调
     * @property {() => void} [onDelete] - 删除回调
     * @property {() => void} [onBack] - 返回回调
     */

    /** @type {Props} */
    let {
        persona = null,
        canDelete = false,
        onSave,
        onDelete,
        onBack,
    } = $props();

    // 本地编辑状态
    let name = $state(persona?.name || "User");
    let avatar = $state(persona?.avatar || "");
    let description = $state(persona?.description || "");
    let userBubbleColor = $state(normalizeHexColor(persona?.userBubbleColor));
    let position = $state(persona?.position ?? 0);
    let depth = $state(persona?.depth ?? 2);
    let role = $state(persona?.role ?? 0);

    // 派生：是否显示深度设置
    const showDepthSettings = $derived(position === 4);

    // 同步 color input 和 text input
    let colorInput = $state(userBubbleColor);

    $effect(() => {
        // 从颜色选择器同步到文本
        userBubbleColor = colorInput;
    });

    function handleColorTextChange(e) {
        const value = e.target.value.trim();
        if (/^#[0-9A-F]{6}$/i.test(value)) {
            colorInput = value;
        }
        userBubbleColor = value;
    }

    // 头像选择
    let fileInput;

    function handleAvatarClick() {
        const useFile = confirm("使用本地图片文件吗？点击「取消」使用 URL。");
        if (useFile) {
            fileInput?.click();
        } else {
            const url = prompt(
                "请输入头像地址",
                avatar || "./assets/external/feather-default.png",
            );
            if (url !== null) {
                avatar = url.trim();
            }
        }
    }

    async function handleFileSelect(e) {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            // 读取并压缩图片
            const dataUrl = await readFileAsDataUrl(file);
            // 可以在这里添加压缩逻辑
            avatar = dataUrl;
        } catch (err) {
            console.error("读取头像失败:", err);
            window.toastr?.error?.("读取头像失败");
        }
    }

    function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
    }

    // 保存
    function handleSave() {
        const trimmedName = name.trim();
        if (!trimmedName) {
            alert("请输入角色名称");
            return;
        }

        const data = {
            id: persona?.id || "",
            name: trimmedName,
            avatar: avatar.trim(),
            description,
            userBubbleColor: normalizeHexColor(userBubbleColor),
            position,
            depth: Math.max(0, Math.trunc(depth || 0)),
            role: Math.max(0, Math.min(2, Math.trunc(role || 0))),
        };

        onSave?.(data);
    }

    // 删除
    function handleDelete() {
        if (!confirm("确定要删除此角色吗？")) return;
        onDelete?.();
    }
</script>

<div class="persona-editor">
    <div class="editor-header">
        <button class="back-btn" onclick={onBack} aria-label="返回">←</button>
        <span class="title">{persona ? "编辑角色" : "新建角色"}</span>
    </div>

    <div class="editor-body">
        <!-- 头像 -->
        <div class="avatar-section">
            <button class="avatar-preview" onclick={handleAvatarClick}>
                <Avatar
                    src={avatar}
                    alt={name}
                    size={80}
                    fallback="./assets/external/feather-default.png"
                />
            </button>
            <button class="change-avatar-btn" onclick={handleAvatarClick}
                >更换头像</button
            >
            <input
                bind:this={fileInput}
                type="file"
                accept="image/*"
                style="display: none;"
                onchange={handleFileSelect}
            />
        </div>

        <!-- 名称 -->
        <div class="field">
            <label for="edit-name">名称 ({"{{user}}"})</label>
            <input
                type="text"
                id="edit-name"
                bind:value={name}
                placeholder="输入角色名称"
            />
        </div>

        <!-- 气泡颜色 -->
        <div class="field">
            <label for="edit-bubble-color">用户气泡颜色</label>
            <div class="color-row">
                <input
                    type="text"
                    id="edit-bubble-color-text"
                    value={userBubbleColor}
                    oninput={handleColorTextChange}
                />
                <input
                    type="color"
                    id="edit-bubble-color"
                    bind:value={colorInput}
                />
            </div>
            <div class="hint">仅影响"我"的气泡背景，字体颜色跟随聊天设置</div>
        </div>

        <!-- 描述 -->
        <div class="field">
            <label for="edit-desc">
                详细描述 ({"{{persona}}"})
                <span class="label-hint"
                    >注入到 System Prompt 或 Character Card 中</span
                >
            </label>
            <textarea
                id="edit-desc"
                bind:value={description}
                placeholder="例如：我是一个富有冒险精神的旅行者..."
            ></textarea>
        </div>

        <!-- 注入设置 -->
        <div class="injection-section">
            <div class="section-title">注入设置（参考 SillyTavern）</div>

            <div class="field">
                <label for="edit-position">插入位置</label>
                <select id="edit-position" bind:value={position}>
                    {#each POSITION_OPTIONS as opt}
                        <option value={opt.value}>{opt.label}</option>
                    {/each}
                </select>
            </div>

            {#if showDepthSettings}
                <div class="depth-row">
                    <div class="field">
                        <label for="edit-depth">深度（0=最后一条）</label>
                        <input
                            type="number"
                            id="edit-depth"
                            bind:value={depth}
                            min="0"
                            step="1"
                        />
                    </div>
                    <div class="field">
                        <label for="edit-role">注入角色</label>
                        <select id="edit-role" bind:value={role}>
                            {#each ROLE_OPTIONS as opt}
                                <option value={opt.value}>{opt.label}</option>
                            {/each}
                        </select>
                    </div>
                </div>
            {/if}

            <div class="hint">
                支持宏：<code>{"{{user}}"}</code> <code>{"{{char}}"}</code>
                <code>{"{{time}}"}</code>
                <code>{"{{date}}"}</code> 以及 <code>{"{{getvar::k}}"}</code> 等。
            </div>
        </div>

        <!-- 删除按钮 -->
        {#if persona && canDelete}
            <button class="delete-btn" onclick={handleDelete}>删除此角色</button
            >
        {/if}
    </div>

    <div class="editor-footer">
        <button class="save-btn" onclick={handleSave}>保存</button>
    </div>
</div>

<style>
    .persona-editor {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #fff;
    }

    .editor-header {
        padding: 12px;
        border-bottom: 1px solid #eee;
        display: flex;
        align-items: center;
        gap: 8px;
        background: #f8f9fa;
    }

    .back-btn {
        width: 44px;
        height: 44px;
        border: none;
        background: transparent;
        font-size: 22px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 12px;
        transition: background 0.15s;
    }

    .back-btn:hover {
        background: #e2e8f0;
    }

    .title {
        font-weight: bold;
        font-size: 16px;
    }

    .editor-body {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
    }

    .avatar-section {
        text-align: center;
        margin-bottom: 20px;
    }

    .avatar-preview {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        border: none;
        padding: 0;
        cursor: pointer;
        background: #eee;
        overflow: hidden;
        margin: 0 auto 10px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .change-avatar-btn {
        font-size: 12px;
        padding: 4px 10px;
        background: #eee;
        border: none;
        border-radius: 10px;
        color: #333;
        cursor: pointer;
    }

    .change-avatar-btn:hover {
        background: #e2e8f0;
    }

    .field {
        margin-bottom: 15px;
    }

    .field label {
        display: block;
        font-size: 12px;
        color: #666;
        margin-bottom: 5px;
    }

    .label-hint {
        color: #999;
        font-size: 11px;
        margin-left: 5px;
    }

    .field input[type="text"],
    .field input[type="number"],
    .field select,
    .field textarea {
        width: 100%;
        padding: 10px;
        border: 1px solid #ddd;
        border-radius: 8px;
        box-sizing: border-box;
        font-family: inherit;
        font-size: 14px;
    }

    .field textarea {
        height: 120px;
        resize: none;
    }

    .color-row {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .color-row input[type="text"] {
        flex: 1;
    }

    .color-row input[type="color"] {
        width: 44px;
        height: 44px;
        border: 1px solid #ddd;
        border-radius: 8px;
        padding: 0;
        cursor: pointer;
    }

    .hint {
        margin-top: 6px;
        font-size: 11px;
        color: #94a3b8;
        line-height: 1.4;
    }

    .hint code {
        background: #f1f5f9;
        padding: 1px 4px;
        border-radius: 3px;
        font-size: 10px;
    }

    .injection-section {
        margin-bottom: 15px;
        padding: 12px;
        border: 1px solid rgba(0, 0, 0, 0.06);
        border-radius: 10px;
        background: rgba(248, 250, 252, 0.8);
    }

    .section-title {
        font-size: 12px;
        font-weight: 700;
        color: #334155;
        margin-bottom: 8px;
    }

    .depth-row {
        display: flex;
        gap: 10px;
    }

    .depth-row .field {
        flex: 1;
    }

    .delete-btn {
        width: 100%;
        padding: 12px;
        background: #fee2e2;
        color: #dc2626;
        border: none;
        border-radius: 8px;
        margin-top: 20px;
        cursor: pointer;
        font-size: 14px;
        transition: background 0.15s;
    }

    .delete-btn:hover {
        background: #fecaca;
    }

    .editor-footer {
        padding: 15px;
        border-top: 1px solid #eee;
        background: #fff;
    }

    .save-btn {
        width: 100%;
        padding: 12px;
        background: #007bff;
        color: white;
        border: none;
        border-radius: 8px;
        font-weight: bold;
        cursor: pointer;
        font-size: 14px;
        transition: background 0.15s;
    }

    .save-btn:hover {
        background: #0056b3;
    }
</style>
