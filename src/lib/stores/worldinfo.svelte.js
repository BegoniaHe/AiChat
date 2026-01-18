/**
 * World Info / World Book Store (Svelte 5 version)
 * - Stores worldbook data with Tauri KV + localStorage fallback
 * - Provides ST JSON conversion
 */

import { safeInvoke } from '$utils/tauri';

const STORAGE_KEY = 'worldinfo_store';

// Helpers
const normalizeArray = (val) => {
    if (Array.isArray(val)) return val.map(v => String(v).trim()).filter(Boolean);
    if (typeof val === 'string') return val.split(/[,，\n\r]/).map(s => s.trim()).filter(Boolean);
    return [];
};

const toNumber = (val, def) => {
    const n = Number(val);
    return Number.isFinite(n) ? n : def;
};

/**
 * Convert SillyTavern world JSON to simplified format
 */
export function convertSTWorld(stJson = {}, name = 'imported') {
    const rawEntries = stJson.entries || [];
    const entriesList = Array.isArray(rawEntries) ? rawEntries : Object.values(rawEntries);

    const entries = entriesList.map((e, idx) => {
        const preserved = { ...(e || {}) };

        const uid = Number.isInteger(preserved.uid) ? preserved.uid : null;
        const id = preserved.id ?? (uid != null ? String(uid) : `entry-${idx}`);
        const comment = preserved.comment ?? preserved.title ?? `entry-${idx}`;
        const key = normalizeArray(preserved.key ?? preserved.triggers);
        const keysecondary = normalizeArray(preserved.keysecondary ?? preserved.secondary);
        const order = toNumber(preserved.order ?? preserved.priority, 100);
        const depth = toNumber(preserved.depth, 4);
        const position = toNumber(preserved.position, 0);
        const probability = toNumber(preserved.probability, 100);
        const useProbability = preserved.useProbability !== false;

        return {
            ...preserved,
            id,
            uid,
            comment,
            title: comment,
            content: preserved.content || '',
            key,
            triggers: key,
            keysecondary,
            secondary: keysecondary,
            order,
            priority: order,
            depth,
            position,
            selective: preserved.selective !== false,
            selectiveLogic: toNumber(preserved.selectiveLogic, 0),
            disable: Boolean(preserved.disable),
            constant: Boolean(preserved.constant),
            ignoreBudget: Boolean(preserved.ignoreBudget),
            excludeRecursion: Boolean(preserved.excludeRecursion),
            preventRecursion: Boolean(preserved.preventRecursion),
            matchPersonaDescription: Boolean(preserved.matchPersonaDescription),
            matchCharacterDescription: Boolean(preserved.matchCharacterDescription),
            matchCharacterPersonality: Boolean(preserved.matchCharacterPersonality),
            matchCharacterDepthPrompt: Boolean(preserved.matchCharacterDepthPrompt),
            matchScenario: Boolean(preserved.matchScenario),
            matchCreatorNotes: Boolean(preserved.matchCreatorNotes),
            delayUntilRecursion: toNumber(preserved.delayUntilRecursion, 0),
            probability,
            useProbability,
            group: preserved.group || '',
            groupOverride: Boolean(preserved.groupOverride),
            groupWeight: toNumber(preserved.groupWeight, 100),
            scanDepth: preserved.scanDepth ?? null,
            caseSensitive: preserved.caseSensitive ?? null,
            matchWholeWords: preserved.matchWholeWords ?? null,
            useGroupScoring: preserved.useGroupScoring ?? null,
            automationId: preserved.automationId || '',
            role: toNumber(preserved.role, 0),
            sticky: preserved.sticky ?? null,
            cooldown: preserved.cooldown ?? null,
            delay: preserved.delay ?? null,
            vectorized: Boolean(preserved.vectorized),
            addMemo: Boolean(preserved.addMemo),
        };
    });

    return { name, entries };
}

/**
 * WorldInfoStore - Svelte 5 reactive store for worldbooks
 */
export class WorldInfoStore {
    // Reactive state
    #cache = $state({});
    #isLoaded = $state(false);
    #loading = $state(false);

    ready;

    constructor() {
        this.ready = this._loadCache();
    }

    // Getters
    get cache() { return this.#cache; }
    get isLoaded() { return this.#isLoaded; }
    get loading() { return this.#loading; }

    /**
     * Load cache from storage
     */
    async _loadCache() {
        this.#loading = true;

        // Try Tauri KV first
        try {
            const kv = await safeInvoke('load_kv', { name: STORAGE_KEY });
            if (kv && typeof kv === 'object' && Object.keys(kv).length) {
                this.#cache = kv;
                this.#isLoaded = true;
                this.#loading = false;
                return kv;
            }
        } catch (err) {
            console.warn('WorldInfo Tauri load failed, trying localStorage:', err);
        }

        // Fallback to localStorage
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                this.#cache = JSON.parse(raw);
                this.#isLoaded = true;
                this.#loading = false;
                return this.#cache;
            }
        } catch (err) {
            console.warn('WorldInfo localStorage load failed:', err);
        }

        this.#cache = {};
        this.#isLoaded = true;
        this.#loading = false;
        return this.#cache;
    }

    /**
     * List all worldbook names
     */
    list() {
        return Object.keys(this.#cache);
    }

    /**
     * Load a worldbook by name
     */
    load(name) {
        return this.#cache[name] || null;
    }

    /**
     * Get a specific entry from a worldbook
     */
    getEntry(worldName, entryId) {
        const world = this.#cache[worldName];
        if (!world || !Array.isArray(world.entries)) return null;
        return world.entries.find(e => e.id === entryId || String(e.uid) === String(entryId)) || null;
    }

    /**
     * Save a worldbook
     */
    async save(name, data) {
        this.#cache[name] = data;

        // Persist to localStorage immediately
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#cache));
        } catch { }

        // Try Tauri KV
        try {
            await safeInvoke('save_kv', { name: STORAGE_KEY, data: this.#cache });
        } catch (err) {
            console.warn('WorldInfo Tauri save failed:', err);
        }
    }

    /**
     * Remove a worldbook
     */
    async remove(name) {
        delete this.#cache[name];

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#cache));
        } catch { }

        try {
            await safeInvoke('save_kv', { name: STORAGE_KEY, data: this.#cache });
        } catch (err) {
            console.warn('WorldInfo Tauri save failed:', err);
        }
    }

    /**
     * Save multiple worldbooks at once
     */
    async saveMany(map) {
        this.#cache = { ...this.#cache, ...map };

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#cache));
        } catch { }

        try {
            await safeInvoke('save_kv', { name: STORAGE_KEY, data: this.#cache });
        } catch (err) {
            console.warn('WorldInfo Tauri save failed:', err);
        }
    }

    /**
     * Import from SillyTavern JSON format
     */
    async importSTWorld(stJson, name = 'imported') {
        const converted = convertSTWorld(stJson, name);
        await this.save(name, converted);
        return converted;
    }

    /**
     * Export worldbook to ST-compatible format
     */
    exportSTWorld(name) {
        const world = this.load(name);
        if (!world) return null;

        // Convert back to ST format (entries as object keyed by uid)
        const entries = {};
        (world.entries || []).forEach((e, idx) => {
            const uid = e.uid ?? idx;
            entries[uid] = {
                ...e,
                uid,
                key: e.key || e.triggers || [],
                keysecondary: e.keysecondary || e.secondary || [],
            };
        });

        return {
            entries,
            name: world.name || name,
        };
    }

    /**
     * Search entries across all worldbooks by trigger keywords
     */
    searchByTrigger(keyword, options = {}) {
        const {
            caseSensitive = false,
            includeDisabled = false,
            worldNames = null, // null = search all
        } = options;

        const results = [];
        const searchKey = caseSensitive ? keyword : keyword.toLowerCase();
        const worldsToSearch = worldNames || Object.keys(this.#cache);

        for (const worldName of worldsToSearch) {
            const world = this.#cache[worldName];
            if (!world || !Array.isArray(world.entries)) continue;

            for (const entry of world.entries) {
                if (entry.disable && !includeDisabled) continue;

                const triggers = [...(entry.key || []), ...(entry.keysecondary || [])];
                const match = triggers.some(t => {
                    const trigger = caseSensitive ? t : t.toLowerCase();
                    return trigger.includes(searchKey) || searchKey.includes(trigger);
                });

                if (match) {
                    results.push({ worldName, entry });
                }
            }
        }

        return results;
    }

    /**
     * Get all constant entries (always active)
     */
    getConstantEntries(worldNames = null) {
        const results = [];
        const worldsToSearch = worldNames || Object.keys(this.#cache);

        for (const worldName of worldsToSearch) {
            const world = this.#cache[worldName];
            if (!world || !Array.isArray(world.entries)) continue;

            for (const entry of world.entries) {
                if (entry.constant && !entry.disable) {
                    results.push({ worldName, entry });
                }
            }
        }

        // Sort by order/priority
        results.sort((a, b) => (a.entry.order || 100) - (b.entry.order || 100));

        return results;
    }
}

// Singleton instance
let worldInfoStoreInstance = null;

/**
 * Get or create the worldinfo store instance
 */
export function getWorldInfoStore() {
    if (!worldInfoStoreInstance) {
        worldInfoStoreInstance = new WorldInfoStore();
    }
    return worldInfoStoreInstance;
}
