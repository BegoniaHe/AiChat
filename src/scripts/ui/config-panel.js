/**
 * 配置面板 UI
 */

import { ConfigManager } from '../storage/config.js';
import { LLMClient } from '../api/client.js';
import { logger } from '../utils/logger.js';

export class ConfigPanel {
    constructor() {
        this.configManager = new ConfigManager();
        this.element = null;
        this.overlayElement = null;
        this.saveButton = null;
        this.testButton = null;
        this.modelOptions = [];
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
            z-index: 9999;
        `;
        this.overlayElement.onclick = () => this.hide();

        // 创建配置面板
        this.element = document.createElement('div');
        this.element.id = 'config-panel';
        this.element.innerHTML = `
            <div style="padding: 20px; background: white; border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                        width: 96vw; max-width: 760px; max-height: 80vh; overflow-y: auto;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:6px;">
                    <h2 style="margin: 0; color: #0f172a;">API 配置</h2>
                    <span style="color:#64748b; font-size:12px;">(保存後立即生效)</span>
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
                        <button id="toggle-apikey" style="font-size:12px; border:none; background:#f5f5f5; padding:4px 8px; border-radius:6px; cursor:pointer;">顯示</button>
                    </label>
                    <input type="password" id="config-apikey" placeholder="sk-..."
                           style="width: 100%; padding: 10px; border-radius: 5px; border: 1px solid #ddd; font-size: 14px; box-sizing: border-box;">
                    <small id="apikey-help" style="color: #666;">你的 API 密钥将被安全存储</small>
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
                            <button id="toggle-sa" style="font-size:12px; border:none; background:#f5f5f5; padding:4px 8px; border-radius:6px; cursor:pointer;">顯示</button>
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

                <div id="config-status" style="margin-bottom: 15px; padding: 10px; border-radius: 5px; display: none;"></div>

                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button id="config-test" style="padding: 10px 20px; border-radius: 5px; border: 1px solid #ddd;
                                                     background: #f5f5f5; cursor: pointer; font-size: 14px;">
                        测试连接
                    </button>
                    <button id="config-cancel" style="padding: 10px 20px; border-radius: 5px; border: 1px solid #ddd;
                                                       background: #f5f5f5; cursor: pointer; font-size: 14px;">
                        取消
                    </button>
                    <button id="config-save" style="padding: 10px 20px; border-radius: 5px; border: none;
                                                     background: #019aff; color: white; cursor: pointer; font-size: 14px; font-weight: bold;">
                        保存
                    </button>
                </div>
            </div>
        `;
        this.element.style.cssText = `
            display: none;
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 10000;
        `;

        // 阻止点击面板时关闭
        this.element.onclick = (e) => e.stopPropagation();

        // 绑定事件
        this.saveButton = this.element.querySelector('#config-save');
        this.testButton = this.element.querySelector('#config-test');

        this.saveButton.onclick = () => this.onSave();
        this.element.querySelector('#config-cancel').onclick = () => this.hide();
        this.testButton.onclick = () => this.onTest();
        this.element.querySelector('#toggle-apikey').onclick = () => this.toggleApiKey();
        this.element.querySelector('#toggle-sa')?.addEventListener('click', () => this.toggleServiceAccount());
        this.element.querySelector('#refresh-models').onclick = () => this.refreshModels();

        // Provider 切换时更新默认值和字段可见性
        this.element.querySelector('#config-provider').onchange = async (e) => {
            const provider = e.target.value;
            await this.loadProviderConfig(provider);
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

        // API Key 显示为 masked
        if (config.apiKey) {
            apiKeyInput.value = '••••••••••••••••';
            apiKeyInput.dataset.hasKey = 'true';
            apiKeyInput.dataset.originalKey = config.apiKey;
        } else {
            apiKeyInput.value = '';
            apiKeyInput.dataset.hasKey = 'false';
        }

        // 清除 placeholder 提示用户修改
        apiKeyInput.onfocus = function() {
            if (this.dataset.hasKey === 'true' && this.value === '••••••••••••••••') {
                this.value = '';
            }
        };
        apiKeyInput.onblur = function() {
            if (!this.value) {
                this.dataset.hasKey = 'false';
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
                apiKeyHelp.textContent = '你的 API 密钥将被安全存储';
            }
        }
    }

    /**
     * 获取表单数据
     */
    getFormData() {
        const provider = document.getElementById('config-provider').value;
        const apiKeyInput = document.getElementById('config-apikey');
        let apiKey = apiKeyInput.value;

        // 如果显示的是 masked 且用户没改，保留原值
        if (apiKey === '••••••••••••••••' && apiKeyInput.dataset.hasKey === 'true') {
            apiKey = apiKeyInput.dataset.originalKey;
        }

        const formData = {
            provider: provider,
            baseUrl: document.getElementById('config-baseurl').value,
            apiKey: apiKey,
            model: document.getElementById('config-model').value,
            stream: document.getElementById('config-stream').checked,
            timeout: 60000,
            maxRetries: 3
        };

        // Add Vertex AI specific fields
        if (provider === 'vertexai') {
            const region = document.getElementById('config-region')?.value;
            const saInput = document.getElementById('config-serviceaccount');
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
        const input = document.getElementById('config-apikey');
        const btn = document.getElementById('toggle-apikey');
        if (input.type === 'password') {
            input.type = 'text';
            btn.textContent = '隱藏';
        } else {
            input.type = 'password';
            btn.textContent = '顯示';
        }
    }

    toggleServiceAccount() {
        const input = document.getElementById('config-serviceaccount');
        const btn = document.getElementById('toggle-sa');
        if (!input || !btn) return;

        if (input.style.webkitTextSecurity === 'disc' || input.style.webkitTextSecurity === '') {
            input.style.webkitTextSecurity = 'none';
            btn.textContent = '隱藏';
        } else {
            input.style.webkitTextSecurity = 'disc';
            btn.textContent = '顯示';
        }
    }

    /**
     * 显示状态消息
     */
    showStatus(message, type = 'info') {
        const statusEl = document.getElementById('config-status');
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
            if (!formData.apiKey || !formData.baseUrl || !formData.model) {
                this.showStatus('請填寫 Base URL / API Key / 模型', 'error');
                return;
            }
            this.setLoading(true);
            // 验证配置
            await this.configManager.validate(formData);

            // 保存
            await this.configManager.save(formData);

            // 重新初始化客户端
            if (window.appBridge) {
                window.appBridge.client = new LLMClient(formData);
                window.appBridge.config.set(formData);
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
            if (formData.provider === 'vertexai') {
                this.showStatus('Vertex AI 需後端簽名，目前前端未啟用，請改用 Makersuite 或自行代理。', 'error');
                return;
            }

            this.testButton.textContent = '测试中...';
            this.testButton.disabled = true;

            const tempClient = new LLMClient(formData);
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
                this.showStatus('請先填寫 Base URL', 'error');
                return;
            }
            if (!formData.apiKey && formData.provider !== 'vertexai') {
                this.showStatus('請先填寫 API Key', 'error');
                return;
            }
            if (formData.provider === 'vertexai') {
                this.showStatus('Vertex AI 目前需後端簽名，前端未啟用；請改用 Google AI Studio (Makersuite) 或提供後端代理。', 'error');
                modelHelp.textContent = 'Vertex AI 需要後端代理，前端無法直接列出模型';
                modelHelp.style.color = '#721c24';
                return;
            }

            // 设置加载状态
            refreshBtn.textContent = '⟳ 获取中...';
            refreshBtn.disabled = true;
            modelHelp.textContent = '正在从服务器获取可用模型列表...';
            modelHelp.style.color = '#1976d2';

            // 创建临时客户端
            const tempClient = new LLMClient(formData);

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
