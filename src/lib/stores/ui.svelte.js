/**
 * UI 状态 Store
 * 管理全局 UI 状态
 */

function createUIStore() {
  // 当前页面
  let currentPage = $state('chat');

  // 当前选中的联系人
  let selectedContactId = $state(null);

  // 侧边栏状态
  let sidebarOpen = $state(false);

  // 设置面板状态
  let settingsPanelOpen = $state(false);

  // 加载状态
  let loading = $state(false);
  let loadingMessage = $state('');

  // 模态框
  let modalOpen = $state(false);
  let modalComponent = $state(null);
  let modalProps = $state({});

  return {
    // 页面
    get currentPage() {
      return currentPage;
    },
    setPage(page) {
      currentPage = page;
    },

    // 联系人
    get selectedContactId() {
      return selectedContactId;
    },
    selectContact(id) {
      selectedContactId = id;
    },

    // 侧边栏
    get sidebarOpen() {
      return sidebarOpen;
    },
    toggleSidebar() {
      sidebarOpen = !sidebarOpen;
    },
    closeSidebar() {
      sidebarOpen = false;
    },

    // 设置面板
    get settingsPanelOpen() {
      return settingsPanelOpen;
    },
    toggleSettings() {
      settingsPanelOpen = !settingsPanelOpen;
    },
    closeSettings() {
      settingsPanelOpen = false;
    },

    // 加载状态
    get loading() {
      return loading;
    },
    get loadingMessage() {
      return loadingMessage;
    },
    setLoading(isLoading, message = '') {
      loading = isLoading;
      loadingMessage = message;
    },

    // 模态框
    get modalOpen() {
      return modalOpen;
    },
    get modalComponent() {
      return modalComponent;
    },
    get modalProps() {
      return modalProps;
    },
    openModal(component, props = {}) {
      modalComponent = component;
      modalProps = props;
      modalOpen = true;
    },
    closeModal() {
      modalOpen = false;
      modalComponent = null;
      modalProps = {};
    },
  };
}

export const uiStore = createUIStore();
