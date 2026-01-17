/**
 * 配置面板 UI
 */

import { ConfigManager } from '../storage/config.js';
import { LLMClient } from '../api/client.js';
import { logger } from '../utils/logger.js';

const canInitClient = (cfg) => {
    const c = cfg || {};
    const hasKey = typeof c.apiKey === 'string' && c.apiKey.trim().length > 0;
    const hasVertexSa = c.provider === 'vertexai' && typeof c.vertexaiServiceAccount === 'string' && c.vertexaiServiceAccount.trim().length > 0;
    return hasKey || hasVertexSa;
};

export class ConfigPanel {
    constructor() {
        this.configManager = new ConfigManager();
        this.element = null;
        this.overlayElement = null;
        this.saveButton = null;
        this.testButton = null;
        this.modelOptions = [];
        this.keyOverlay = null;
        this.keyModal = null;
        this.isRefreshingProfile = false; // 防止刷新时触发 onchange
    }

    /**
     * 初始化并显示配置面板
     */
    async show() {
        if (!this.element) {
            this.createUI();
        }

        // 加载当前配置到表单
        let config = await this.configManager.load();
        if (!config) {
            logger.warn('配置为空，使用默认配置');
            config = this.configManager.getDefault();
        }
        this.refreshProfileOptions();
        this.populateForm(config);

        this.element.style.display = 'block';
        this.overlayElement.style.display = 'block';
    }

    /**
     * 隐藏配置面板
     */
    hide() {
        if (this.element) {
            this.element.style.display = 'none';
            this.overlayElement.style.display = 'none';
        }
    }

    /**
     * 创建 UI 元素
     */
    createUI() {
        // 创建遮罩层
        this.overlayElement = document.createElement('div');
        this.overlayElement.id = 'config-overlay';
        this.overlayElement.style.cssText = `
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 20000;
        `;
        this.overlayElement.onclick = () => this.hide();

        // 创建配置面板
        this.element = document.createElement('div');
        this.element.id = 'config-panel';
        this.element.innerHTML = `
            <div style="padding: 20px; background: white; border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                        width: 96vw; max-width: 760px; max-height: calc(100vh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 20px); overflow-y: auto;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:6px;">
                    <h2 style="margin: 0; color: #0f172a;">API 配置</h2>
                    <span style="color:#64748b; font-size:12px;">(保存后立即生效)</span>
                </div>

                <div style="margin-bottom: 15px;">
                    <label style="display: flex; align-items:center; justify-content:space-between; margin-bottom: 5px; font-weight: bold;">
                        <span>连线设置档</span>
                        <div style="display:flex; gap:6px;">
                            <button id="profile-new" title="新建设置档" style="font-size:12px; border:none; background:#f5f5f5; padding:4px 8px; border-radius:6px; cursor:pointer;">＋</button>
                            <button id="profile-rename" title="重命名" style="font-size:12px; border:none; background:#f5f5f5; padding:4px 8px; border-radius:6px; cursor:pointer;">✎</button>
                            <button id="profile-delete" title="删除" style="font-size:12px; border:none; background:#fee2e2; color:#b91c1c; padding:4px 8px; border-radius:6px; cursor:pointer;">🗑</button>
                        </div>
                    </label>
                    <select id="config-profile" style="width: 100%; padding: 10px; border-radius: 5px; border: 1px solid #ddd; font-size: 14px;"></select>
                    <small style="color: #666;">可保存多个配置并快速切换（清除缓存也不丢）</small>
                </div>

                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">服务商</label>
                    <select id="config-provider" style="width: 100%; padding: 10px; border-radius: 5px; border: 1px solid #ddd; font-size: 14px;">
                        <option value="openai">OpenAI</option>
                        <option value="makersuite">Google AI Studio (Makersuite)</option>
                        <option value="vertexai">Google Vertex AI</option>
                        <option value="deepseek">Deepseek</option>
                        <option value="anthropic">Anthropic (Claude)</option>
                        <option value="custom">自定义 API</option>
                    </select>
                </div>

                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">API Base URL</label>
                    <input type="text" id="config-baseurl" placeholder="https://api.openai.com/v1"
                           style="width: 100%; padding: 10px; border-radius: 5px; border: 1px solid #ddd; font-size: 14px; box-sizing: border-box;">
                    <small style="color: #666;">填写 API 的基础 URL</small>
                </div>

                <div style="margin-bottom: 15px;">
                    <label style="display: flex; align-items:center; justify-content:space-between; margin-bottom: 5px; font-weight: bold;">
                        <span>API Key</span>
                        <div style="display:flex; gap:6px; align-items:center;">
                            <button id="toggle-apikey" style="font-size:12px; border:none; background:#f5f5f5; padding:4px 8px; border-radius:6px; cursor:pointer;">显示</button>
                            <button id="manage-keys" title="管理已保存的 Key" style="font-size:12px; border:none; background:#f5f5f5; padding:4px 8px; border-radius:6px; cursor:pointer;">🔑</button>
                        </div>
                    </label>
                    <input type="password" id="config-apikey" placeholder="sk-..."
                           style="width: 100%; padding: 10px; border-radius: 5px; border: 1px solid #ddd; font-size: 14px; box-sizing: border-box;">
                    <small id="apikey-help" style="color: #666;">保存后 Key 以遮罩显示（不可复制）；用 🔑 管理多个 Key</small>
                </div>

                <div id="vertexai-fields" style="display: none;">
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px; font-weight: bold;">Region</label>
                        <select id="config-region" style="width: 100%; padding: 10px; border-radius: 5px; border: 1px solid #ddd; font-size: 14px;">
                            <option value="us-central1">us-central1</option>
                            <option value="us-east1">us-east1</option>
                            <option value="us-west1">us-west1</option>
                            <option value="europe-west1">europe-west1</option>
                            <option value="asia-southeast1">asia-southeast1</option>
                        </select>
                        <small style="color: #666;">Vertex AI 区域</small>
                    </div>

                    <div style="margin-bottom: 15px;">
                        <label style="display: flex; align-items:center; justify-content:space-between; margin-bottom: 5px; font-weight: bold;">
                            <span>Service Account JSON</span>
                            <button id="toggle-sa" style="font-size:12px; border:none; background:#f5f5f5; padding:4px 8px; border-radius:6px; cursor:pointer;">显示</button>
                        </label>
                        <textarea id="config-serviceaccount" placeholder='{"type": "service_account", "project_id": "your-project", ...}'
                                  style="width: 100%; padding: 10px; border-radius: 5px; border: 1px solid #ddd; font-size: 12px; box-sizing: border-box; font-family: monospace; min-height: 100px; resize: vertical;"></textarea>
                        <small style="color: #666;">GCP Service Account JSON（Project ID 会自动从 JSON 中提取）。不填则使用 API Key（快速模式）</small>
                    </div>
                </div>

                <div style="margin-bottom: 15px;">
                    <label style="display: flex; align-items:center; justify-content:space-between; margin-bottom: 5px; font-weight: bold;">
                        <span>模型</span>
                        <button id="refresh-models" style="font-size:12px; border:none; background:#e3f2fd; color:#1976d2; padding:4px 8px; border-radius:6px; cursor:pointer;">
                            ⟳ 刷新列表
                        </button>
                    </label>
                    <div style="position: relative; display: flex; flex-direction: column; gap: 8px;">
                        <input type="text" id="config-model" list="model-list" placeholder="gpt-3.5-turbo"
                               style="width: 100%; padding: 10px 12px; border-radius: 5px; border: 1px solid #ddd; font-size: 14px; box-sizing: border-box;">
                        <datalist id="model-list"></datalist>
                        <div id="model-options"
                             style="display:none; max-height: 180px; overflow-y: auto; padding:8px; border:1px solid #e5e7eb; border-radius:6px; background:#f8fafc; gap:6px; flex-wrap: wrap;">
                        </div>
                    </div>
                    <small id="model-help" style="color: #666;">要使用的模型 ID（可输入或从列表选择）</small>
                </div>

                <div style="margin-bottom: 20px;">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                        <input type="checkbox" id="config-stream" style="width: 18px; height: 18px;">
                        <span style="font-weight: bold;">启用流式响应</span>
                    </label>
                    <small style="color: #666; margin-left: 26px;">实时显示 AI 的回复过程</small>
                </div>

                <div style="margin-bottom: 20px;">
                    <label style="display:flex; align-items:center; justify-content:space-between; gap:10px; font-weight:bold; margin-bottom:6px;">
                        <span>请求超时（秒）</span>
                        <input id="config-timeout" type="number" min="10" max="300" step="5" value="60" inputmode="numeric"
                               style="width: 120px; padding: 8px 10px; border-radius: 8px; border: 1px solid #ddd; font-size: 14px; text-align:right;">
                    </label>
                    <small style="color:#666;">超过该时间将中止请求并报错（10–300 秒，上限 5 分钟）</small>
                </div>

                <div id="config-status" style="margin-bottom: 15px; padding: 10px; border-radius: 5px; display: none;"></div>

                <!-- 调试信息按钮（左上角小按钮） -->
                <div style="margin-bottom: 10px;">
                    <button id="config-debug" style="padding: 6px 12px; border-radius: 6px; border: 1px solid #e2e8f0;
                                                     background: #f8fafc; cursor: pointer; font-size: 12px; color: #64748b;">
                        🔍 调试信息
                    </button>
                </div>

                <!-- 主要操作按钮 -->
                <div style="display: flex; gap: 8px; justify-content: flex-end;">
                    <button id="config-test" style="padding: 10px 16px; border-radius: 8px; border: 1px solid #e2e8f0;
                                                     background: #ffffff; cursor: pointer; font-size: 14px; color: #475569; min-width: 90px;">
                        测试连接
                    </button>
                    <button id="config-cancel" style="padding: 10px 16px; border-radius: 8px; border: 1px solid #e2e8f0;
                                                       background: #f8fafc; cursor: pointer; font-size: 14px; color: #475569; min-width: 70px;">
                        取消
                    </button>
                    <button id="config-save" style="padding: 10px 16px; border-radius: 8px; border: none;
                                                     background: #019aff; color: white; cursor: pointer; font-size: 14px; font-weight: 600; min-width: 70px;">
                        保存
                    </button>
                </div>
            </div>
        `;
        this.element.style.cssText = `
            display: none;
            position: fixed;
            top: calc(env(safe-area-inset-top, 0px) + 10px);
            left: 50%;
            transform: translateX(-50%);
            z-index: 21000;
        `;

        // 阻止点击面板时关闭
        this.element.onclick = (e) => e.stopPropagation();

        // 绑定事件
        this.saveButton = this.element.querySelector('#config-save');
        this.testButton = this.element.querySelector('#config-test');

        this.saveButton.onclick = () => this.onSave();
        this.element.querySelector('#config-cancel').onclick = () => this.hide();
        this.testButton.onclick = () => this.onTest();
        this.element.querySelector('#config-debug').onclick = () => this.showDebugInfo();
        this.element.querySelector('#toggle-apikey').onclick = () => this.toggleApiKey();
        this.element.querySelector('#manage-keys').onclick = () => this.openKeyManager();
        this.element.querySelector('#profile-new').onclick = () => this.createProfile();
        this.element.querySelector('#profile-rename').onclick = () => this.renameProfile();
        this.element.querySelector('#profile-delete').onclick = () => this.deleteProfile();
        this.element.querySelector('#toggle-sa')?.addEventListener('click', () => this.toggleServiceAccount());
        this.element.querySelector('#refresh-models').onclick = () => this.refreshModels();

        // 连线设置档切换
        this.element.querySelector('#config-profile').onchange = async (e) => {
            // 防止刷新选项时触发 onchange
            if (this.isRefreshingProfile) {
                logger.debug('忽略配置选择器的 onchange（刷新中）');
                return;
            }

            const profileId = e.target.value;
            logger.info(`用户切换配置: ${profileId.slice(0, 20)}...`);
            await this.configManager.setActiveProfile(profileId);
            const config = await this.configManager.load();
            this.populateForm(config);
            if (window.appBridge) {
                window.appBridge.config.set(config);
                window.appBridge.client = canInitClient(config) ? new LLMClient(config) : null;
            }
        };

        // Provider 切换时更新默认值和字段可见性
        this.element.querySelector('#config-provider').onchange = async (e) => {
            const provider = e.target.value;
            this.updateDefaultsForProvider(provider);
            this.updateFieldVisibility(provider);
        };

        document.body.appendChild(this.overlayElement);
        document.body.appendChild(this.element);
    }

    /**
     * 获取指定 provider 的默认配置
     */
    getProviderDefaults(provider) {
        const defaults = {
            openai: {
                baseUrl: 'https://api.openai.com/v1',
                model: 'gpt-3.5-turbo',
                urlHelp: 'OpenAI API 基础 URL'
            },
            makersuite: {
                baseUrl: 'https://generativelanguage.googleapis.com',
                model: 'gemini-2.0-flash-exp',
                urlHelp: 'Google AI Studio API URL'
            },
            vertexai: {
                baseUrl: 'https://us-central1-aiplatform.googleapis.com',
                model: 'gemini-2.0-flash-exp',
                urlHelp: 'Vertex AI API URL (根据 Region 自动调整)'
            },
            deepseek: {
                baseUrl: 'https://api.deepseek.com/v1',
                model: 'deepseek-chat',
                urlHelp: 'Deepseek API URL'
            },
            anthropic: {
                baseUrl: 'https://api.anthropic.com/v1',
                model: 'claude-3-5-sonnet-20241022',
                urlHelp: 'Anthropic API 基础 URL'
            },
            custom: {
                baseUrl: 'http://localhost:8000/v1',
                model: 'default',
                urlHelp: '自定义 API 的基础 URL'
            }
        };

        return defaults[provider] || defaults.openai;
    }

    resetFormForProvider(provider) {
        const panel = this.element || document;
        const baseEl = panel.querySelector('#config-baseurl');
        const modelEl = panel.querySelector('#config-model');
        const apiKeyEl = panel.querySelector('#config-apikey');
        const streamEl = panel.querySelector('#config-stream');
        const regionEl = panel.querySelector('#config-region');
        const saEl = panel.querySelector('#config-serviceaccount');
        const datalist = panel.querySelector('#model-list');

        const defaults = this.getProviderDefaults(provider);

        if (baseEl) {
            baseEl.value = defaults.baseUrl;
            baseEl.placeholder = defaults.baseUrl;
        }
        if (modelEl) {
            modelEl.value = defaults.model;
            modelEl.placeholder = defaults.model;
        }
        if (apiKeyEl) {
            apiKeyEl.value = '';
            apiKeyEl.dataset.hasKey = 'false';
            apiKeyEl.dataset.originalKey = '';
        }
        if (streamEl) {
            streamEl.checked = true;
        }
        if (regionEl) {
            regionEl.value = 'us-central1';
        }
        if (saEl) {
            saEl.value = '';
            saEl.dataset.hasKey = 'false';
            saEl.dataset.originalKey = '';
            saEl.style.webkitTextSecurity = 'none';
        }
        if (datalist) {
            datalist.innerHTML = '';
        }
        this.clearModelOptions();
    }

    clearModelOptions() {
        const container = (this.element || document).querySelector('#model-options');
        if (container) {
            container.innerHTML = '';
            container.style.display = 'none';
        }
        this.modelOptions = [];
    }

    renderModelOptions(models = []) {
        const container = (this.element || document).querySelector('#model-options');
        if (!container) return;

        if (!models.length) {
            this.clearModelOptions();
            return;
        }

        this.modelOptions = models;
        container.innerHTML = '';
        container.style.display = 'flex';

        models.forEach(modelId => {
            const chip = document.createElement('button');
            chip.textContent = modelId;
            chip.type = 'button';
            chip.style.cssText = `
                border: 1px solid #cbd5e1;
                background: white;
                border-radius: 6px;
                padding: 6px 10px;
                font-size: 12px;
                cursor: pointer;
                white-space: nowrap;
            `;
            chip.onclick = () => {
                const modelInput = (this.element || document).querySelector('#config-model');
                if (modelInput) {
                    modelInput.value = modelId;
                }
            };
            container.appendChild(chip);
        });
    }

    /**
     * 加载特定 provider 的配置
     */
    async loadProviderConfig(provider) {
        try {
            // 每次切换先回到该 provider 的默认值，避免泄漏其他 provider 的配置
            this.resetFormForProvider(provider);

            // 从 localStorage 加载所有配置
            const stored = localStorage.getItem('llm_configs');
            if (!stored) {
                this.updateDefaultsForProvider(provider);
                this.updateFieldVisibility(provider);
                return; // 没有存储的配置，使用默认值
            }

            const allConfigs = JSON.parse(stored);
            const providerConfig = allConfigs[provider];

            if (!providerConfig) {
                this.updateDefaultsForProvider(provider);
                this.updateFieldVisibility(provider);
                return; // 该 provider 没有配置，使用默认值
            }

            // 解密配置
            const config = { ...providerConfig, provider };

            // 解密 API Key
            if (config._encrypted && config.apiKey) {
                try {
                    config.apiKey = atob(config.apiKey);
                } catch (e) {
                    logger.error('解密 API Key 失败:', e);
                }
                delete config._encrypted;
            }

            // 解密 Service Account JSON
            if (config._saEncrypted && config.vertexaiServiceAccount) {
                try {
                    config.vertexaiServiceAccount = atob(config.vertexaiServiceAccount);
                } catch (e) {
                    logger.error('解密 Service Account 失败:', e);
                }
                delete config._saEncrypted;
            }

            // 填充表单
            const panel = this.element || document;
            const baseEl = panel.querySelector('#config-baseurl');
            const modelEl = panel.querySelector('#config-model');
            const streamEl = panel.querySelector('#config-stream');
            const apiKeyInput = panel.querySelector('#config-apikey');

            if (baseEl) baseEl.value = config.baseUrl || '';
            if (modelEl) modelEl.value = config.model || '';
            if (streamEl) streamEl.checked = config.stream !== false;

            // API Key 显示为 masked
            if (apiKeyInput) {
                if (config.apiKey) {
                    apiKeyInput.value = '••••••••••••••••';
                    apiKeyInput.dataset.hasKey = 'true';
                    apiKeyInput.dataset.originalKey = config.apiKey;
                } else {
                    apiKeyInput.value = '';
                    apiKeyInput.dataset.hasKey = 'false';
                }
            }

            // 填充 Vertex AI 特定字段
            if (provider === 'vertexai') {
                const regionInput = panel.querySelector('#config-region');
                const saInput = panel.querySelector('#config-serviceaccount');

                if (regionInput) {
                    regionInput.value = config.vertexaiRegion || 'us-central1';
                }

                if (saInput) {
                    if (config.vertexaiServiceAccount) {
                        saInput.value = '••••••••••••••••';
                        saInput.dataset.hasKey = 'true';
                        saInput.dataset.originalKey = config.vertexaiServiceAccount;
                        saInput.style.webkitTextSecurity = 'disc';
                    } else {
                        saInput.value = '';
                        saInput.dataset.hasKey = 'false';
                        saInput.style.webkitTextSecurity = 'none';
                    }
                }
            }

            logger.info(`已加载 ${provider} 的配置`);
            this.updateFieldVisibility(provider);

        } catch (e) {
            logger.error('加载 provider 配置失败:', e);
        }
    }

    /**
     * 填充表单
     */
    populateForm(config) {
        if (!this.element) {
            this.createUI();
        }
        const panel = this.element || document;
        const providerEl = panel.querySelector('#config-provider');
        const baseEl = panel.querySelector('#config-baseurl');
        const modelEl = panel.querySelector('#config-model');
        const streamEl = panel.querySelector('#config-stream');
        const apiKeyInput = panel.querySelector('#config-apikey');
        if (!providerEl || !baseEl || !modelEl || !streamEl || !apiKeyInput) {
            logger.error('配置面板元素缺失，填充表单中止');
            return;
        }

        providerEl.value = config.provider || 'openai';
        baseEl.value = config.baseUrl || '';
        modelEl.value = config.model || '';
        streamEl.checked = config.stream !== false;
        const timeoutEl = panel.querySelector('#config-timeout');
        if (timeoutEl) {
            const ms = Number(config.timeout);
            const sec = Number.isFinite(ms) ? Math.round(ms / 1000) : 60;
            timeoutEl.value = String(Math.min(300, Math.max(10, sec)));
        }

        // Profile selector
        this.refreshProfileOptions();

        // API Key：仅显示遮罩（不把明文塞进 DOM / dataset）
        const masked = this.getMaskedActiveKey();
        if (masked) {
            apiKeyInput.value = masked;
            apiKeyInput.dataset.hasKey = 'true';
            apiKeyInput.dataset.masked = masked;
        } else {
            apiKeyInput.value = '';
            apiKeyInput.dataset.hasKey = 'false';
            apiKeyInput.dataset.masked = '';
        }

        apiKeyInput.onfocus = function() {
            if (this.dataset.hasKey === 'true' && this.dataset.masked && this.value === this.dataset.masked) {
                this.value = '';
            }
        };
        apiKeyInput.onblur = function() {
            if (!this.value && this.dataset.masked) {
                this.value = this.dataset.masked;
                this.dataset.hasKey = 'true';
            }
        };

        // 填充 Vertex AI 特定字段
        if (config.provider === 'vertexai') {
            const regionInput = panel.querySelector('#config-region');
            const saInput = panel.querySelector('#config-serviceaccount');

            if (regionInput) {
                regionInput.value = config.vertexaiRegion || 'us-central1';
            }

            // Mask Service Account JSON
            if (saInput) {
                if (config.vertexaiServiceAccount) {
                    saInput.value = '••••••••••••••••';
                    saInput.dataset.hasKey = 'true';
                    saInput.dataset.originalKey = config.vertexaiServiceAccount;
                    saInput.style.webkitTextSecurity = 'disc';
                } else {
                    saInput.value = '';
                    saInput.dataset.hasKey = 'false';
                    saInput.style.webkitTextSecurity = 'none';
                }

                // Clear on focus
                saInput.onfocus = function() {
                    if (this.dataset.hasKey === 'true' && this.value === '••••••••••••••••') {
                        this.value = '';
                        this.style.webkitTextSecurity = 'none';
                    }
                };
                saInput.onblur = function() {
                    if (!this.value) {
                        this.dataset.hasKey = 'false';
                    }
                };
            }
        }

        // 更新字段可见性
        this.updateFieldVisibility(config.provider || 'openai');
    }

    refreshProfileOptions() {
        const panel = this.element || document;
        const select = panel.querySelector('#config-profile');
        if (!select) return;

        // 设置标志防止触发 onchange
        this.isRefreshingProfile = true;

        try {
            const profiles = this.configManager.getProfiles?.() || [];
            const activeId = this.configManager.getActiveProfileId?.();
            select.innerHTML = '';
            profiles.forEach((p) => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                select.appendChild(opt);
            });
            if (activeId) {
                select.value = activeId;
                logger.debug(`刷新配置选择器，当前: ${activeId.slice(0, 20)}...`);
            }
        } finally {
            // 延迟重置标志，确保 onchange 事件不会触发
            setTimeout(() => {
                this.isRefreshingProfile = false;
            }, 100);
        }
    }

    getMaskedActiveKey() {
        const active = this.configManager.getActiveProfile?.();
        if (!active?.activeKeyId) return '';
        const keys = this.configManager.listKeys?.(active.id) || [];
        const key = keys.find(k => k.id === active.activeKeyId);
        return key?.preview || '';
    }

    /**
     * 更新不同 provider 的默认值
     */
    updateDefaultsForProvider(provider) {
        const defaults = this.getProviderDefaults(provider);
        const panel = this.element || document;
        const baseUrlInput = panel.querySelector('#config-baseurl');
        const modelInput = panel.querySelector('#config-model');

        if (baseUrlInput) {
            // 自动填写 Base URL（如果当前为空或为其他服务商的默认值）
            const currentUrl = baseUrlInput.value.trim();
            const allDefaults = ['openai','makersuite','vertexai','deepseek','anthropic','custom'].map(p => this.getProviderDefaults(p).baseUrl);
            const isDefaultUrl = allDefaults.includes(currentUrl);
            if (!currentUrl || isDefaultUrl) {
                baseUrlInput.value = defaults.baseUrl;
            }
            baseUrlInput.placeholder = defaults.baseUrl;

            const helpText = baseUrlInput.nextElementSibling;
            if (helpText && helpText.tagName === 'SMALL') {
                helpText.textContent = defaults.urlHelp;
            }
        }

        if (modelInput) {
            // 自动填写模型（如果当前为空或为其他服务商的默认值）
            const currentModel = modelInput.value.trim();
            const allDefaults = ['openai','makersuite','vertexai','deepseek','anthropic','custom'].map(p => this.getProviderDefaults(p).model);
            const isDefaultModel = allDefaults.includes(currentModel);
            if (!currentModel || isDefaultModel) {
                modelInput.value = defaults.model;
            }
            modelInput.placeholder = defaults.model;
        }
    }

    /**
     * 更新字段可见性（根据服务商）
     */
    updateFieldVisibility(provider) {
        const panel = this.element || document;
        const vertexaiFields = panel.querySelector('#vertexai-fields');
        const apiKeyHelp = panel.querySelector('#apikey-help');

        if (provider === 'vertexai') {
            vertexaiFields.style.display = 'block';
            if (apiKeyHelp) {
                apiKeyHelp.textContent = 'Vertex AI 需 Service Account 后端签名；纯前端建议改用 Google AI Studio (Makersuite)';
            }
        } else {
            vertexaiFields.style.display = 'none';
            if (apiKeyHelp) {
                apiKeyHelp.textContent = '保存后 Key 以遮罩显示（不可复制）；用 🔑 管理多个 Key';
            }
        }
    }

    /**
     * 获取表单数据
     */
    getFormData() {
        const panel = this.element || document;

        // 在部分移动端输入法下，点击按钮时输入可能还在 composition 状态；先 blur 提交文本
        try {
            const activeEl = panel?.ownerDocument?.activeElement || document.activeElement;
            if (activeEl && panel?.contains?.(activeEl) && typeof activeEl.blur === 'function') {
                activeEl.blur();
            }
        } catch {}

        const provider = panel.querySelector('#config-provider')?.value;
        const apiKeyInput = panel.querySelector('#config-apikey');
        const rawKey = (apiKeyInput?.value || '').trim();
        const masked = apiKeyInput?.dataset?.masked || '';
        // apiKey 为 null => 不修改 key（继续使用已保存的 active key）
        const apiKey = (!rawKey || (masked && rawKey === masked)) ? null : rawKey;

        const formData = {
            provider: provider,
            baseUrl: (panel.querySelector('#config-baseurl')?.value || '').trim(),
            apiKey: apiKey,
            model: (panel.querySelector('#config-model')?.value || '').trim(),
            stream: Boolean(panel.querySelector('#config-stream')?.checked),
            timeout: (() => {
                const secRaw = (panel.querySelector('#config-timeout')?.value || '').trim();
                const sec = Number(secRaw);
                const clamped = Number.isFinite(sec) ? Math.min(300, Math.max(10, Math.trunc(sec))) : 60;
                return clamped * 1000;
            })(),
            maxRetries: 3
        };

        // Add Vertex AI specific fields
        if (provider === 'vertexai') {
            const region = panel.querySelector('#config-region')?.value;
            const saInput = panel.querySelector('#config-serviceaccount');
            let serviceAccount = saInput?.value;

            // Handle masked Service Account JSON
            if (serviceAccount === '••••••••••••••••' && saInput?.dataset.hasKey === 'true') {
                serviceAccount = saInput.dataset.originalKey;
            }

            if (region) formData.vertexaiRegion = region;
            if (serviceAccount && serviceAccount.trim()) {
                formData.vertexaiServiceAccount = serviceAccount;
            }
        }

        return formData;
    }

    toggleApiKey() {
        const panel = this.element || document;
        const input = panel.querySelector('#config-apikey');
        const btn = panel.querySelector('#toggle-apikey');
        if (input.type === 'password') {
            input.type = 'text';
            btn.textContent = '隱藏';
        } else {
            input.type = 'password';
            btn.textContent = '显示';
        }
    }

    toggleServiceAccount() {
        const panel = this.element || document;
        const input = panel.querySelector('#config-serviceaccount');
        const btn = panel.querySelector('#toggle-sa');
        if (!input || !btn) return;

        if (input.style.webkitTextSecurity === 'disc' || input.style.webkitTextSecurity === '') {
            input.style.webkitTextSecurity = 'none';
            btn.textContent = '隱藏';
        } else {
            input.style.webkitTextSecurity = 'disc';
            btn.textContent = '显示';
        }
    }

    async createProfile() {
        const name = prompt('新设置档名称', '新配置');
        if (!name) return;
        await this.configManager.createProfile(name);
        const config = await this.configManager.load();
        this.refreshProfileOptions();
        this.populateForm(config);
        window.toastr?.success(`已创建：${name}`);
    }

    async renameProfile() {
        const active = this.configManager.getActiveProfile?.();
        if (!active) return;
        const name = prompt('重命名设置档', active.name || '');
        if (!name) return;
        await this.configManager.renameProfile(active.id, name);
        this.refreshProfileOptions();
        window.toastr?.success('已重命名');
    }

    async deleteProfile() {
        const profiles = this.configManager.getProfiles?.() || [];
        if (profiles.length <= 1) {
            window.toastr?.warning('至少保留一个设置档');
            return;
        }
        const active = this.configManager.getActiveProfile?.();
        if (!active) return;
        if (!confirm(`删除设置档「${active.name}」？此操作不可恢复。`)) return;
        await this.configManager.deleteProfile(active.id);
        const config = await this.configManager.load();
        this.refreshProfileOptions();
        this.populateForm(config);
    }

    openKeyManager() {
        if (!this.keyOverlay) {
            this.createKeyManagerUI();
        }
        this.refreshKeyManagerList();
        this.keyOverlay.style.display = 'block';
        this.keyModal.style.display = 'block';
    }

    closeKeyManager() {
        if (this.keyOverlay) this.keyOverlay.style.display = 'none';
        if (this.keyModal) this.keyModal.style.display = 'none';
    }

    createKeyManagerUI() {
        this.keyOverlay = document.createElement('div');
        this.keyOverlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index: 20000;';
        this.keyOverlay.onclick = () => this.closeKeyManager();

        this.keyModal = document.createElement('div');
        this.keyModal.style.cssText = `
            display:none; position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
            width:min(560px,92vw); max-height:80vh; overflow:auto;
            background:#fff; border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,0.25);
            z-index: 21000; padding:16px;
        `;
        this.keyModal.onclick = (e) => e.stopPropagation();
        this.keyModal.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                <div>
                    <div style="font-weight:800; color:#0f172a;">🔑 Key 管理</div>
                    <div style="color:#64748b; font-size:12px;">Key 以遮罩显示，不可复制；可保存多个并切换当前使用</div>
                </div>
                <button id="keymgr-close" style="font-size:18px; border:none; background:transparent; cursor:pointer;">×</button>
            </div>
            <div style="margin-top:12px; border-top:1px solid #eee; padding-top:12px;">
                <div style="font-weight:700; margin-bottom:6px;">已保存的 Keys</div>
                <ul id="keymgr-list" style="list-style:none; padding:0; margin:0; border:1px solid #eee; border-radius:10px; overflow:hidden;"></ul>
            </div>
            <div style="margin-top:12px; border-top:1px solid #eee; padding-top:12px;">
                <div style="font-weight:700; margin-bottom:6px;">新增 Key</div>
                <div style="display:flex; gap:8px; align-items:center;">
                    <input id="keymgr-input" type="password" placeholder="贴上 API Key" style="flex:1; padding:10px; border:1px solid #ddd; border-radius:10px;">
                    <button id="keymgr-add" style="padding:10px 12px; border:1px solid #ddd; border-radius:10px; background:#f5f5f5; cursor:pointer;">保存</button>
                </div>
                <small style="color:#94a3b8;">保存后将自動设为当前 Key</small>
            </div>
        `;

        this.keyModal.querySelector('#keymgr-close').onclick = () => this.closeKeyManager();
        this.keyModal.querySelector('#keymgr-add').onclick = async () => {
            const input = this.keyModal.querySelector('#keymgr-input');
            const key = (input?.value || '').trim();
            if (!key) {
                window.toastr?.warning('请输入 Key');
                return;
            }
            const active = this.configManager.getActiveProfile?.();
            try {
                const keyId = await this.configManager.addKey(active?.id, key, 'API Key');
                await this.configManager.setActiveKey(active?.id, keyId);
                input.value = '';
                this.refreshKeyManagerList();
                this.syncMaskedKeyToForm();
                await this.syncRuntimeToAppBridge();
                window.toastr?.success('Key 已保存并设为当前');
            } catch (err) {
                window.toastr?.error(err.message || '保存 Key 失败');
            }
        };

        document.body.appendChild(this.keyOverlay);
        document.body.appendChild(this.keyModal);
    }

    syncMaskedKeyToForm() {
        const masked = this.getMaskedActiveKey();
        const apiKeyInput = (this.element || document).querySelector('#config-apikey');
        if (!apiKeyInput) return;
        apiKeyInput.value = masked || '';
        apiKeyInput.dataset.masked = masked || '';
        apiKeyInput.dataset.hasKey = masked ? 'true' : 'false';
    }

    async syncRuntimeToAppBridge() {
        const runtime = await this.configManager.load();
        if (window.appBridge) {
            window.appBridge.config.set(runtime);
            window.appBridge.client = canInitClient(runtime) ? new LLMClient(runtime) : null;
        }
    }

    refreshKeyManagerList() {
        const list = this.keyModal?.querySelector('#keymgr-list');
        if (!list) return;
        const active = this.configManager.getActiveProfile?.();
        const keys = this.configManager.listKeys?.(active?.id) || [];
        list.innerHTML = '';
        if (!keys.length) {
            const li = document.createElement('li');
            li.style.cssText = 'padding:10px 12px; color:#94a3b8;';
            li.textContent = '（尚无 Key）';
            list.appendChild(li);
            return;
        }
        keys.forEach((k) => {
            const li = document.createElement('li');
            li.style.cssText = 'padding:10px 12px; border-bottom:1px solid #f1f5f9; display:flex; align-items:center; justify-content:space-between; gap:10px;';
            const left = document.createElement('div');
            const isActive = active?.activeKeyId === k.id;
            left.innerHTML = `<div style="font-weight:700; color:#0f172a;">${k.preview || '••••'}</div><div style="color:#64748b; font-size:12px;">${k.label || 'API Key'}${isActive ? ' · 当前' : ''}</div>`;
            const right = document.createElement('div');
            right.style.display = 'flex';
            right.style.gap = '6px';

            const useBtn = document.createElement('button');
            useBtn.textContent = isActive ? '当前' : '使用';
            useBtn.disabled = isActive;
            useBtn.style.cssText = 'padding:6px 10px; border:1px solid #ddd; border-radius:10px; background:#f5f5f5; cursor:pointer;';
            useBtn.onclick = async () => {
                await this.configManager.setActiveKey(active?.id, k.id);
                this.refreshKeyManagerList();
                this.syncMaskedKeyToForm();
                await this.syncRuntimeToAppBridge();
            };

            const delBtn = document.createElement('button');
            delBtn.textContent = '删除';
            delBtn.style.cssText = 'padding:6px 10px; border:1px solid #fca5a5; border-radius:10px; background:#fee2e2; color:#b91c1c; cursor:pointer;';
            delBtn.onclick = async () => {
                if (!confirm('删除该 Key？')) return;
                await this.configManager.removeKey(active?.id, k.id);
                this.refreshKeyManagerList();
                this.syncMaskedKeyToForm();
                await this.syncRuntimeToAppBridge();
            };

            right.appendChild(useBtn);
            right.appendChild(delBtn);
            li.appendChild(left);
            li.appendChild(right);
            list.appendChild(li);
        });
    }

    /**
     * 显示状态消息
     */
    showStatus(message, type = 'info') {
        const statusEl = (this.element || document).querySelector('#config-status');
        if (!statusEl) return;
        const colors = {
            success: '#d4edda',
            error: '#f8d7da',
            info: '#d1ecf1'
        };
        const textColors = {
            success: '#155724',
            error: '#721c24',
            info: '#0c5460'
        };

        statusEl.style.display = 'block';
        statusEl.style.background = colors[type];
        statusEl.style.color = textColors[type];
        statusEl.textContent = message;

        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 5000);
    }

    /**
     * 保存配置
     */
    async onSave() {
        const formData = this.getFormData();

        try {
            if (!formData.baseUrl || !formData.model) {
                this.showStatus('请填写 Base URL / 模型', 'error');
                return;
            }

            // Key：允許「已保存 Key（🔑）」但输入框仍显示遮罩（formData.apiKey 会是 null）
            const active = this.configManager.getActiveProfile?.();
            const keys = this.configManager.listKeys?.(active?.id) || [];
            const hasTypedKey = typeof formData.apiKey === 'string' && formData.apiKey.trim().length > 0;
            const hasSavedKey = keys.length > 0;
            if (!hasTypedKey && !hasSavedKey && formData.provider !== 'vertexai') {
                this.showStatus('请先用 🔑 保存至少一个 API Key，或在此栏贴上 Key 后保存', 'error');
                return;
            }
            this.setLoading(true);
            // 验证配置
            await this.configManager.validate({ ...formData, apiKey: hasTypedKey ? formData.apiKey.trim() : null });

            // 保存
            await this.configManager.save(formData);

            // 重新初始化客户端
            if (window.appBridge) {
                const runtime = await this.configManager.load();
                window.appBridge.client = canInitClient(runtime) ? new LLMClient(runtime) : null;
                window.appBridge.config.set(runtime);

                // 若保存后仍拿不到 key（解密/保存失败），給出明確提示并不自動关闭
                if (!canInitClient(runtime)) {
                    this.showStatus('已保存，但当前 Key 不可用（请用 🔑 重新保存 Key）', 'error');
                    return;
                }
            }

            this.showStatus('配置保存成功！', 'success');
            logger.info('配置保存成功');

            setTimeout(() => this.hide(), 1500);
        } catch (e) {
            this.showStatus(`保存失败: ${e.message}`, 'error');
            logger.error('保存配置失败:', e);
        } finally {
            this.setLoading(false);
        }
    }

    /**
     * 测试连接
     */
    async onTest() {
        const formData = this.getFormData();
        const originalText = this.testButton.textContent;

        try {
            this.testButton.textContent = '测试中...';
            this.testButton.disabled = true;

            if (formData.provider === 'vertexai') {
                if (!formData.vertexaiServiceAccount || !String(formData.vertexaiServiceAccount).trim()) {
                    this.showStatus('请填写 Vertex AI Service Account（JSON）后再测试连接', 'error');
                    return;
                }
                const tempClient = new LLMClient({ ...formData, apiKey: '' });
                const result = await tempClient.healthCheck();
                if (result.ok) {
                    this.showStatus('✓ 连接成功！', 'success');
                    logger.info('API 连接测试成功');
                } else {
                    this.showStatus(`连接失败: ${result.error}`, 'error');
                    logger.warn('API 连接测试失败:', result.error);
                }
                return;
            }

            const runtime = await this.configManager.load();
            const existingKey = (runtime?.apiKey || '').trim();
            const keyToUse = (typeof formData.apiKey === 'string') ? formData.apiKey.trim() : existingKey;
            if (!keyToUse) {
                this.showStatus('请先用 🔑 保存至少一个 API Key，或在此栏贴上 Key', 'error');
                return;
            }
            const tempClient = new LLMClient({ ...formData, apiKey: keyToUse });
            const result = await tempClient.healthCheck();

            if (result.ok) {
                this.showStatus('✓ 连接成功！', 'success');
                logger.info('API 连接测试成功');
            } else {
                this.showStatus(`连接失败: ${result.error}`, 'error');
                logger.warn('API 连接测试失败:', result.error);
            }
        } catch (e) {
            this.showStatus(`测试失败: ${e.message}`, 'error');
            logger.error('API 连接测试异常:', e);
        } finally {
            this.testButton.textContent = originalText;
            this.testButton.disabled = false;
        }
    }

    async showDebugInfo() {
        try {
            const { getDebugPanel } = await import('./debug-panel.js');
            const panel = getDebugPanel();

            panel.log('=== 配置调试信息 ===');
            panel.showConfigStatus(this.configManager);

            // 显示 localStorage 和 Tauri KV 的状态
            try {
                const lsData = localStorage.getItem('llm_profiles_v1');
                if (lsData) {
                    const parsed = JSON.parse(lsData);
                    panel.log(`localStorage activeProfileId: ${parsed.activeProfileId || '无'}`);
                } else {
                    panel.log('localStorage: 无数据', 'warn');
                }
            } catch (err) {
                panel.log(`localStorage 读取失败: ${err.message}`, 'error');
            }

            panel.log('=== 调试面板已打开 ===');
            panel.toggle(); // 确保面板显示

            window.toastr?.success('调试信息已输出到屏幕底部');
        } catch (err) {
            window.toastr?.error('显示调试信息失败');
            logger.error('显示调试信息失败:', err);
        }
    }

    setLoading(isLoading) {
        if (!this.saveButton) return;
        this.saveButton.disabled = isLoading;
        this.testButton.disabled = isLoading;
        this.saveButton.textContent = isLoading ? '保存中...' : '保存';
    }

    /**
     * 刷新模型列表
     */
    async refreshModels() {
        const formData = this.getFormData();
        const refreshBtn = document.getElementById('refresh-models');
        const modelHelp = document.getElementById('model-help');
        const originalText = refreshBtn.textContent;
        const originalHelpText = modelHelp.textContent;

        try {
            // 验证必填字段
            if (!formData.baseUrl) {
                this.showStatus('请先填写 Base URL', 'error');
                return;
            }
            const runtime = await this.configManager.load();
            const existingKey = (runtime?.apiKey || '').trim();
            const keyToUse = (typeof formData.apiKey === 'string') ? formData.apiKey.trim() : existingKey;
            if (!keyToUse && formData.provider !== 'vertexai') {
                this.showStatus('请先用 🔑 保存至少一个 API Key，或在此栏贴上 Key', 'error');
                return;
            }
            if (formData.provider === 'vertexai') {
                if (!formData.vertexaiServiceAccount || !String(formData.vertexaiServiceAccount).trim()) {
                    this.showStatus('请填写 Vertex AI Service Account（JSON）后再刷新列表', 'error');
                    return;
                }
            }

            // 设置加载状态
            refreshBtn.textContent = '⟳ 获取中...';
            refreshBtn.disabled = true;
            modelHelp.textContent = '正在从服务器获取可用模型列表...';
            modelHelp.style.color = '#1976d2';

            // 创建临时客户端
            const tempClient = new LLMClient({ ...formData, apiKey: formData.provider === 'vertexai' ? '' : keyToUse });

            // 获取模型列表
            logger.info(`正在获取 ${formData.provider} 的模型列表...`);
            const models = await tempClient.listModels();

            if (!models || models.length === 0) {
                throw new Error('未获取到模型列表');
            }

            // 填充到 datalist
            const datalist = document.getElementById('model-list');
            datalist.innerHTML = '';

            models.forEach(modelId => {
                const option = document.createElement('option');
                option.value = modelId;
                datalist.appendChild(option);
            });
            this.renderModelOptions(models);

            // 成功提示
            this.showStatus(`✓ 成功获取 ${models.length} 个可用模型`, 'success');
            modelHelp.textContent = `已加载 ${models.length} 个模型（可输入或从列表选择）`;
            modelHelp.style.color = '#155724';
            logger.info(`成功获取 ${models.length} 个模型:`, models);

            // 3秒后恢复原始提示
            setTimeout(() => {
                modelHelp.textContent = originalHelpText;
                modelHelp.style.color = '#666';
            }, 3000);

        } catch (e) {
            this.showStatus(`获取模型列表失败: ${e.message}`, 'error');
            logger.error('获取模型列表失败:', e);
            modelHelp.textContent = '获取失败，请检查配置后重试';
            modelHelp.style.color = '#721c24';

            // 5秒后恢复原始提示
            setTimeout(() => {
                modelHelp.textContent = originalHelpText;
                modelHelp.style.color = '#666';
            }, 5000);
        } finally {
            refreshBtn.textContent = originalText;
            refreshBtn.disabled = false;
        }
    }
}
