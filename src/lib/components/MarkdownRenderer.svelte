<!--
  MarkdownRenderer Markdown 渲染组件
  支持代码高亮、表格、列表等
-->
<script>
    let { content = "", class: className = "" } = $props();

    // 简单的 Markdown 解析
    // 实际项目中可以使用 marked + highlight.js
    const htmlContent = $derived(parseMarkdown(content));

    function parseMarkdown(text) {
        if (!text) return "";

        let html = escapeHtml(text);

        // 代码块 ```
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
            return `<pre class="code-block${lang ? ` language-${lang}` : ""}"><code>${code.trim()}</code></pre>`;
        });

        // 行内代码 `
        html = html.replace(
            /`([^`]+)`/g,
            '<code class="inline-code">$1</code>',
        );

        // 粗体 **
        html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

        // 斜体 *
        html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");

        // 删除线 ~~
        html = html.replace(/~~([^~]+)~~/g, "<del>$1</del>");

        // 标题 #
        html = html.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>');
        html = html.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>');
        html = html.replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>');

        // 无序列表
        html = html.replace(/^- (.+)$/gm, '<li class="md-li">$1</li>');
        html = html.replace(
            /(<li[^>]*>.*<\/li>\n?)+/g,
            '<ul class="md-ul">$&</ul>',
        );

        // 有序列表
        html = html.replace(/^\d+\. (.+)$/gm, '<li class="md-li">$1</li>');

        // 引用 >
        html = html.replace(
            /^> (.+)$/gm,
            '<blockquote class="md-quote">$1</blockquote>',
        );

        // 链接 [text](url)
        html = html.replace(
            /\[([^\]]+)\]\(([^)]+)\)/g,
            '<a href="$2" target="_blank" rel="noopener noreferrer" class="md-link">$1</a>',
        );

        // 水平线 ---
        html = html.replace(/^---$/gm, '<hr class="md-hr">');

        // 换行
        html = html.replace(/\n/g, "<br>");

        return html;
    }

    function escapeHtml(text) {
        const map = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;",
        };
        return text.replace(/[&<>"']/g, (m) => map[m]);
    }
</script>

<div class="markdown-content {className}">
    {@html htmlContent}
</div>

<style>
    .markdown-content {
        font-size: 15px;
        line-height: 1.6;
        color: var(--color-text);
        word-break: break-word;
    }

    .markdown-content :global(.md-h1) {
        font-size: 1.5em;
        font-weight: 600;
        margin: 0.5em 0 0.3em;
    }

    .markdown-content :global(.md-h2) {
        font-size: 1.3em;
        font-weight: 600;
        margin: 0.5em 0 0.3em;
    }

    .markdown-content :global(.md-h3) {
        font-size: 1.1em;
        font-weight: 600;
        margin: 0.5em 0 0.3em;
    }

    .markdown-content :global(.code-block) {
        display: block;
        margin: 0.5em 0;
        padding: 12px;
        background: var(--color-code-bg, #1e1e1e);
        border-radius: var(--radius-md);
        overflow-x: auto;
        font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas,
            monospace;
        font-size: 13px;
        line-height: 1.5;
        color: var(--color-code-text, #d4d4d4);
    }

    .markdown-content :global(.inline-code) {
        padding: 2px 6px;
        background: var(--color-code-inline-bg, rgba(0, 0, 0, 0.1));
        border-radius: var(--radius-sm);
        font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas,
            monospace;
        font-size: 0.9em;
    }

    .markdown-content :global(strong) {
        font-weight: 600;
    }

    .markdown-content :global(em) {
        font-style: italic;
    }

    .markdown-content :global(del) {
        text-decoration: line-through;
        opacity: 0.7;
    }

    .markdown-content :global(.md-ul) {
        margin: 0.5em 0;
        padding-left: 1.5em;
        list-style-type: disc;
    }

    .markdown-content :global(.md-li) {
        margin: 0.25em 0;
    }

    .markdown-content :global(.md-quote) {
        margin: 0.5em 0;
        padding: 0.5em 1em;
        border-left: 3px solid var(--color-primary);
        background: var(--color-hover);
        border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    }

    .markdown-content :global(.md-link) {
        color: var(--color-primary);
        text-decoration: none;
    }

    .markdown-content :global(.md-link:hover) {
        text-decoration: underline;
    }

    .markdown-content :global(.md-hr) {
        margin: 1em 0;
        border: none;
        border-top: 1px solid var(--color-border);
    }
</style>
