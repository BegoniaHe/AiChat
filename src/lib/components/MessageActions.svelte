<!--
  MessageActions 消息操作菜单
  用于消息的复制、删除、重新生成等操作
-->
<script>
    import { toast } from "svelte-sonner";
    import ActionSheet from "./ActionSheet.svelte";

    let {
        message = null,
        open = $bindable(false),
        ondelete,
        onregenerate,
        onedit,
    } = $props();

    // 复制消息
    async function copyMessage() {
        if (!message?.content) return;

        try {
            await navigator.clipboard.writeText(message.content);
            toast.success("已复制到剪贴板");
        } catch {
            // 降级方案
            const textarea = document.createElement("textarea");
            textarea.value = message.content;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            document.body.removeChild(textarea);
            toast.success("已复制到剪贴板");
        }
    }

    // 构建操作列表
    const actions = $derived(() => {
        const list = [
            {
                label: "复制",
                icon: "📋",
                onclick: copyMessage,
            },
        ];

        if (message?.role === "assistant" && onregenerate) {
            list.push({
                label: "重新生成",
                icon: "🔄",
                onclick: onregenerate,
            });
        }

        if (message?.role === "user" && onedit) {
            list.push({
                label: "编辑",
                icon: "✏️",
                onclick: onedit,
            });
        }

        if (ondelete) {
            list.push({
                label: "删除",
                icon: "🗑️",
                danger: true,
                onclick: ondelete,
            });
        }

        return list;
    });
</script>

<ActionSheet bind:open title="消息操作" actions={actions()} />
