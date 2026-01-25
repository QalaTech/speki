/**
 * IdRegistry - Global task ID registry for project-scoped unique IDs
 *
 * Ensures US-XXX and TS-XXX IDs are unique across all specs in a project.
 * Stored in .speki/id-registry.json
 */

import { mkdir, readFile, writeFile, readdir } from 'fs/promises';
import { join } from 'path';
import type { IdPrefix, IdRegistryData } from '../types/index.js';

const REGISTRY_VERSION = 1;
const REGISTRY_FILENAME = 'id-registry.json';

/**
 * Get the path to the ID registry file
 */
function getRegistryPath(projectPath: string): string {
  return join(projectPath, '.speki', REGISTRY_FILENAME);
}

/**
 * Create an empty registry with default values
 */
function createEmptyRegistry(): IdRegistryData {
  return {
    version: REGISTRY_VERSION,
    counters: {
      US: 1,
      TS: 1,
    },
    allocated: {},
  };
}

/**
 * Scan existing specs to build initial registry from decompose_state.json files
 */
async function scanExistingSpecs(projectPath: string): Promise<IdRegistryData> {
  const registry = createEmptyRegistry();
  const specsDir = join(projectPath, '.speki', 'specs');

  try {
    const specIds = await readdir(specsDir);

    for (const specId of specIds) {
      const statePath = join(specsDir, specId, 'decompose_state.json');
      try {
        const content = await readFile(statePath, 'utf-8');
        const prd = JSON.parse(content);

        if (prd.userStories && Array.isArray(prd.userStories)) {
          for (const story of prd.userStories) {
            if (story.id) {
              const parsed = IdRegistry.parseId(story.id);
              if (parsed) {
                // Track allocation
                registry.allocated[story.id] = specId;

                // Update counter to be at least max + 1
                if (parsed.num >= registry.counters[parsed.prefix]) {
                  registry.counters[parsed.prefix] = parsed.num + 1;
                }
              }
            }
          }
        }
      } catch {
        // Spec doesn't have decompose_state.json, skip
      }
    }
  } catch {
    // No specs directory yet, return empty registry
  }

  return registry;
}

export class IdRegistry {
  /**
   * Ensure the registry file exists, creating it if needed
   * On first creation, scans existing specs to populate the registry
   */
  static async ensureExists(projectPath: string): Promise<void> {
    const registryPath = getRegistryPath(projectPath);
    const spekiDir = join(projectPath, '.speki');

    // Ensure .speki directory exists
    await mkdir(spekiDir, { recursive: true });

    try {
      await readFile(registryPath, 'utf-8');
      // File exists, nothing to do
    } catch {
      // File doesn't exist, scan existing specs and create
      const registry = await scanExistingSpecs(projectPath);
      await writeFile(registryPath, JSON.stringify(registry, null, 2));
    }
  }

  /**
   * Load the registry from disk
   */
  static async load(projectPath: string): Promise<IdRegistryData> {
    await this.ensureExists(projectPath);
    const registryPath = getRegistryPath(projectPath);
    const content = await readFile(registryPath, 'utf-8');
    return JSON.parse(content) as IdRegistryData;
  }

  /**
   * Save the registry to disk
   */
  static async save(projectPath: string, registry: IdRegistryData): Promise<void> {
    await this.ensureExists(projectPath);
    const registryPath = getRegistryPath(projectPath);
    await writeFile(registryPath, JSON.stringify(registry, null, 2));
  }

  /**
   * Format a task ID from prefix and number
   * @example formatId('US', 1) => 'US-001'
   */
  static formatId(prefix: IdPrefix, num: number): string {
    return `${prefix}-${String(num).padStart(3, '0')}`;
  }

  /**
   * Parse a task ID into its components
   * @example parseId('US-001') => { prefix: 'US', num: 1 }
   * @returns null if the ID is invalid
   */
  static parseId(id: string): { prefix: IdPrefix; num: number } | null {
    const match = id.match(/^(US|TS)-(\d+)$/);
    if (!match) {
      return null;
    }
    return {
      prefix: match[1] as IdPrefix,
      num: parseInt(match[2], 10),
    };
  }

  /**
   * Get the next available ID for a prefix
   * Does NOT reserve the ID - use reserveIds for that
   */
  static async getNextId(projectPath: string, prefix: IdPrefix): Promise<string> {
    const registry = await this.load(projectPath);
    return this.formatId(prefix, registry.counters[prefix]);
  }

  /**
   * Get the next available number for a prefix (without formatting)
   */
  static async getNextNumber(projectPath: string, prefix: IdPrefix): Promise<number> {
    const registry = await this.load(projectPath);
    return registry.counters[prefix];
  }

  /**
   * Reserve a batch of IDs atomically
   * Returns the reserved IDs and updates the counter
   */
  static async reserveIds(
    projectPath: string,
    prefix: IdPrefix,
    count: number
  ): Promise<string[]> {
    const registry = await this.load(projectPath);
    const startNum = registry.counters[prefix];
    const ids: string[] = [];

    for (let i = 0; i < count; i++) {
      ids.push(this.formatId(prefix, startNum + i));
    }

    // Update counter
    registry.counters[prefix] = startNum + count;
    await this.save(projectPath, registry);

    return ids;
  }

  /**
   * Register IDs as allocated to a specific spec
   * Throws if any ID is already allocated to a different spec
   */
  static async registerIds(
    projectPath: string,
    ids: string[],
    specId: string
  ): Promise<void> {
    const registry = await this.load(projectPath);

    // Check for conflicts
    for (const id of ids) {
      if (registry.allocated[id] && registry.allocated[id] !== specId) {
        throw new Error(
          `ID ${id} is already allocated to spec '${registry.allocated[id]}', cannot allocate to '${specId}'`
        );
      }
    }

    // Register all IDs
    for (const id of ids) {
      registry.allocated[id] = specId;

      // Also ensure counter is past this ID
      const parsed = this.parseId(id);
      if (parsed && parsed.num >= registry.counters[parsed.prefix]) {
        registry.counters[parsed.prefix] = parsed.num + 1;
      }
    }

    await this.save(projectPath, registry);
  }

  /**
   * Check if an ID is already allocated
   */
  static async isIdAllocated(projectPath: string, id: string): Promise<boolean> {
    const registry = await this.load(projectPath);
    return id in registry.allocated;
  }

  /**
   * Get the spec that owns an ID, or null if not allocated
   */
  static async getIdOwner(projectPath: string, id: string): Promise<string | null> {
    const registry = await this.load(projectPath);
    return registry.allocated[id] ?? null;
  }

  /**
   * Get all allocated IDs, optionally filtered by prefix
   */
  static async listAllocatedIds(
    projectPath: string,
    prefix?: IdPrefix
  ): Promise<Array<{ id: string; specId: string }>> {
    const registry = await this.load(projectPath);
    const result: Array<{ id: string; specId: string }> = [];

    for (const [id, specId] of Object.entries(registry.allocated)) {
      if (!prefix || id.startsWith(prefix)) {
        result.push({ id, specId });
      }
    }

    // Sort by ID
    result.sort((a, b) => {
      const parsedA = this.parseId(a.id);
      const parsedB = this.parseId(b.id);
      if (!parsedA || !parsedB) return a.id.localeCompare(b.id);
      if (parsedA.prefix !== parsedB.prefix) {
        return parsedA.prefix.localeCompare(parsedB.prefix);
      }
      return parsedA.num - parsedB.num;
    });

    return result;
  }

  /**
   * Get the registry path for a project (useful for debugging)
   */
  static getRegistryPath(projectPath: string): string {
    return getRegistryPath(projectPath);
  }
}
