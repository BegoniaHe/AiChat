import { safeInvoke } from '../utils/tauri.js';
import { logger } from '../utils/logger.js';
import { DEFAULT_MEMORY_TEMPLATE } from '../memory/default-template.js';

const initDatabase = async (scopeId = '') => {
  try {
    await safeInvoke('init_database', { scopeId });
    return true;
  } catch (err) {
    logger.debug('memory template db init skipped (tauri not ready?)', err);
    return false;
  }
};

const buildTemplateInput = (template, { isDefault = false, isBuiltin = false } = {}) => {
  const meta = template?.meta || {};
  const schema = {
    meta: {
      id: meta.id,
      name: meta.name,
      version: meta.version,
      author: meta.author,
      description: meta.description,
      tags: Array.isArray(meta.tags) ? meta.tags : [],
    },
    tables: Array.isArray(template?.tables) ? template.tables : [],
  };
  return {
    id: String(meta.id || ''),
    name: String(meta.name || ''),
    author: meta.author ? String(meta.author) : null,
    version: meta.version ? String(meta.version) : null,
    description: meta.description ? String(meta.description) : null,
    schema,
    injection: template?.injection || null,
    is_default: Boolean(isDefault),
    is_builtin: Boolean(isBuiltin),
  };
};

const buildTemplateInputFromRecord = (record, overrides = {}) => {
  const schema = record?.schema && typeof record.schema === 'object' ? record.schema : {};
  return {
    id: String(record?.id || ''),
    name: String(record?.name || ''),
    author: record?.author ? String(record.author) : null,
    version: record?.version ? String(record.version) : null,
    description: record?.description ? String(record.description) : null,
    schema,
    injection: record?.injection ?? null,
    is_default: Object.prototype.hasOwnProperty.call(overrides, 'isDefault')
      ? Boolean(overrides.isDefault)
      : Boolean(record?.is_default),
    is_builtin: Object.prototype.hasOwnProperty.call(overrides, 'isBuiltin')
      ? Boolean(overrides.isBuiltin)
      : Boolean(record?.is_builtin),
  };
};

const buildTemplateDefinitionFromRecord = (record) => {
  const schema = record?.schema && typeof record.schema === 'object' ? record.schema : {};
  return {
    ...schema,
    injection: record?.injection ?? null,
  };
};

export class MemoryTemplateStore {
  constructor({ scopeId = '' } = {}) {
    this.scopeId = String(scopeId || '').trim();
    this.ready = initDatabase(this.scopeId);
  }

  async ensureReady() {
    await this.ready;
  }

  async setScope(scopeId = '') {
    const next = String(scopeId || '').trim();
    if (next === this.scopeId) return this.ready;
    this.scopeId = next;
    this.ready = initDatabase(this.scopeId);
    return this.ready;
  }

  async saveTemplate(input) {
    await this.ensureReady();
    return safeInvoke('save_template', { scopeId: this.scopeId, input });
  }

  async saveTemplateDefinition(template, { isDefault = false, isBuiltin = false } = {}) {
    await this.ensureReady();
    const input = buildTemplateInput(template, { isDefault, isBuiltin });
    if (!input.id || !input.name) throw new Error('template id or name missing');
    return this.saveTemplate(input);
  }

  async getTemplates(query = {}) {
    await this.ensureReady();
    return safeInvoke('get_templates', { scopeId: this.scopeId, query });
  }

  async getTemplateById(id) {
    const list = await this.getTemplates({ id });
    return Array.isArray(list) && list.length ? list[0] : null;
  }

  async updateTemplateInjection(id, injection = {}) {
    await this.ensureReady();
    const record = await this.getTemplateById(id);
    if (!record) throw new Error('template not found');
    const input = buildTemplateInputFromRecord(record, { isDefault: record?.is_default, isBuiltin: record?.is_builtin });
    input.injection = injection || null;
    return this.saveTemplate(input);
  }

  async deleteTemplate(id) {
    await this.ensureReady();
    return safeInvoke('delete_template', { scopeId: this.scopeId, id });
  }

  toTemplateDefinition(record) {
    return buildTemplateDefinitionFromRecord(record);
  }

  async setDefaultTemplate(id) {
    await this.ensureReady();
    const list = await this.getTemplates({});
    if (!Array.isArray(list) || !list.length) return false;
    for (const record of list) {
      const isDefault = String(record?.id || '') === String(id || '');
      const input = buildTemplateInputFromRecord(record, { isDefault });
      if (!input.id || !input.name) continue;
      await this.saveTemplate(input);
    }
    return true;
  }

  async ensureDefaultTemplate(template = DEFAULT_MEMORY_TEMPLATE) {
    const templateId = String(template?.meta?.id || '').trim();
    if (!templateId) return false;
    try {
      const existing = await this.getTemplateById(templateId);
      if (existing) {
        if (existing.is_builtin) {
          await this.saveTemplateDefinition(template, { isDefault: existing.is_default, isBuiltin: true });
          return true;
        }
        return false;
      }
      await this.saveTemplateDefinition(template, { isDefault: true, isBuiltin: true });
      return true;
    } catch (err) {
      logger.warn('ensure default template failed', err);
      return false;
    }
  }
}
