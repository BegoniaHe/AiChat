<!--
  App.svelte - 根组件
-->
<script>
    import { Loading, Modal, SettingsPanel, Sidebar } from "$lib/components";
    import { appSettingsStore, uiStore } from "$stores";
    import { Toaster } from "svelte-sonner";
    import { ChatPage, ContactsPage, MomentsPage } from "./pages";

    // Tauri 检测
    const isTauri = typeof window !== "undefined" && window.__TAURI__;

    // 主题应用
    $effect(() => {
        const theme = appSettingsStore.theme;
        if (theme === "auto") {
            const prefersDark = window.matchMedia(
                "(prefers-color-scheme: dark)",
            ).matches;
            document.documentElement.dataset.theme = prefersDark
                ? "dark"
                : "light";
        } else {
            document.documentElement.dataset.theme = theme;
        }
    });

    // 监听系统主题变化
    $effect(() => {
        if (appSettingsStore.theme !== "auto") return;

        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        const handler = (e) => {
            document.documentElement.dataset.theme = e.matches
                ? "dark"
                : "light";
        };

        mediaQuery.addEventListener("change", handler);
        return () => mediaQuery.removeEventListener("change", handler);
    });
</script>

<Toaster position="top-center" richColors />

<!-- 全局组件 -->
<Sidebar />
<SettingsPanel />
<Modal />
<Loading />

<main class="app-container">
    <!-- 顶部操作栏（仅在非聊天页显示） -->
    {#if uiStore.currentPage !== "chat"}
        <header class="top-bar">
            <button
                class="menu-btn"
                aria-label="打开菜单"
                onclick={() => uiStore.toggleSidebar()}
            >
                <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                >
                    <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
                </svg>
            </button>
            <h1 class="page-title">
                {#if uiStore.currentPage === "contacts"}
                    联系人
                {:else if uiStore.currentPage === "moments"}
                    动态
                {:else}
                    AiChat
                {/if}
            </h1>
            <button
                class="settings-btn"
                aria-label="设置"
                onclick={() => uiStore.toggleSettings()}
            >
                <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                >
                    <path
                        d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
                    />
                </svg>
            </button>
        </header>
    {/if}

    <!-- 页面内容 -->
    <div class="page-content">
        {#if uiStore.currentPage === "chat"}
            <ChatPage />
        {:else if uiStore.currentPage === "contacts"}
            <ContactsPage />
        {:else if uiStore.currentPage === "moments"}
            <MomentsPage />
        {/if}
    </div>

    <!-- 底部导航 -->
    <nav class="bottom-nav">
        <button
            class="nav-btn"
            class:active={uiStore.currentPage === "chat"}
            onclick={() => uiStore.setPage("chat")}
        >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path
                    d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"
                />
            </svg>
            <span>聊天</span>
        </button>
        <button
            class="nav-btn"
            class:active={uiStore.currentPage === "contacts"}
            onclick={() => uiStore.setPage("contacts")}
        >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path
                    d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                />
            </svg>
            <span>联系人</span>
        </button>
        <button
            class="nav-btn"
            class:active={uiStore.currentPage === "moments"}
            onclick={() => uiStore.setPage("moments")}
        >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"
                />
            </svg>
            <span>动态</span>
        </button>
    </nav>
</main>

<style>
    /* 根容器 */
    .app-container {
        display: flex;
        flex-direction: column;
        height: 100vh;
        height: 100dvh;
        max-width: 480px;
        margin: 0 auto;
        background: var(--color-background);
        overflow: hidden;
    }

    /* 顶部栏 */
    .top-bar {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        background: var(--color-surface);
        border-bottom: 1px solid var(--color-border);
    }

    .menu-btn,
    .settings-btn {
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        color: var(--color-text-secondary);
        border-radius: var(--radius-md);
        transition: background var(--transition-fast);
    }

    .menu-btn:hover,
    .settings-btn:hover {
        background: var(--color-hover);
    }

    .page-title {
        flex: 1;
        font-size: 18px;
        font-weight: 600;
        color: var(--color-text);
        text-align: center;
    }

    /* 页面内容区 */
    .page-content {
        flex: 1;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }

    /* 底部导航 */
    .bottom-nav {
        display: flex;
        background: var(--color-surface);
        border-top: 1px solid var(--color-border);
        padding: 8px 0;
        padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px));
    }

    .nav-btn {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 8px;
        color: var(--color-text-secondary);
        font-size: 11px;
        transition: color var(--transition-fast);
    }

    .nav-btn:hover {
        color: var(--color-text);
    }

    .nav-btn.active {
        color: var(--color-primary);
    }

    .nav-btn svg {
        opacity: 0.7;
    }

    .nav-btn.active svg {
        opacity: 1;
    }
</style>
