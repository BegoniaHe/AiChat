import { safeInvoke } from '../utils/tauri.js';
import { logger } from '../utils/logger.js';

const initDatabase = async (scopeId = '') => {
  try {
    await safeInvoke('init_database', { scopeId });
    return true;
  } catch (err) {
    logger.debug('memory db init skipped (tauri not ready?)', err);
    return false;
  }
};

export class MemoryTableStore {
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

  async createMemory(input) {
    await this.ensureReady();
    return safeInvoke('create_memory', { scopeId: this.scopeId, input });
  }

  async updateMemory(input) {
    await this.ensureReady();
    return safeInvoke('update_memory', { scopeId: this.scopeId, input });
  }

  async deleteMemory(id) {
    await this.ensureReady();
    return safeInvoke('delete_memory', { scopeId: this.scopeId, id });
  }

  async getMemories(query = {}) {
    await this.ensureReady();
    return safeInvoke('get_memories', { scopeId: this.scopeId, query });
  }

  async batchCreateMemories(memories = []) {
    await this.ensureReady();
    return safeInvoke('batch_create_memories', { scopeId: this.scopeId, memories });
  }

  async batchDeleteMemories(ids = []) {
    await this.ensureReady();
    return safeInvoke('batch_delete_memories', { scopeId: this.scopeId, ids });
  }
}
