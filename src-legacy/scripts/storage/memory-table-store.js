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
    this.writeChain = Promise.resolve();
  }

  async ensureReady() {
    await this.ready;
  }

  async setScope(scopeId = '') {
    const next = String(scopeId || '').trim();
    if (next === this.scopeId) return this.ready;
    this.scopeId = next;
    this.ready = initDatabase(this.scopeId);
    this.writeChain = Promise.resolve();
    return this.ready;
  }

  queueWrite(task) {
    const run = this.writeChain.then(() => task());
    this.writeChain = run.catch(() => {});
    return run;
  }

  async createMemory(input) {
    return this.queueWrite(async () => {
      await this.ensureReady();
      return safeInvoke('create_memory', { scopeId: this.scopeId, input });
    });
  }

  async updateMemory(input) {
    return this.queueWrite(async () => {
      await this.ensureReady();
      return safeInvoke('update_memory', { scopeId: this.scopeId, input });
    });
  }

  async deleteMemory(id) {
    return this.queueWrite(async () => {
      await this.ensureReady();
      return safeInvoke('delete_memory', { scopeId: this.scopeId, id });
    });
  }

  async getMemories(query = {}) {
    await this.ensureReady();
    return safeInvoke('get_memories', { scopeId: this.scopeId, query });
  }

  async batchCreateMemories(memories = []) {
    return this.queueWrite(async () => {
      await this.ensureReady();
      return safeInvoke('batch_create_memories', { scopeId: this.scopeId, memories });
    });
  }

  async batchDeleteMemories(ids = []) {
    return this.queueWrite(async () => {
      await this.ensureReady();
      return safeInvoke('batch_delete_memories', { scopeId: this.scopeId, ids });
    });
  }
}
