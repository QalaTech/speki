import { homedir } from 'os';
import { join } from 'path';
import { mkdir, readFile, writeFile, access } from 'fs/promises';
import type { ProjectRegistry, ProjectEntry, ProjectStatus, GlobalConfig } from '../types/index.js';

const QALA_DIR = join(homedir(), '.qala');
const PROJECTS_FILE = join(QALA_DIR, 'projects.json');
const CONFIG_FILE = join(QALA_DIR, 'config.json');

const REGISTRY_VERSION = 1;

export class Registry {
  /**
   * Ensure ~/.qala directory and files exist
   */
  static async ensureExists(): Promise<void> {
    try {
      await access(QALA_DIR);
    } catch {
      await mkdir(QALA_DIR, { recursive: true });
    }

    try {
      await access(PROJECTS_FILE);
    } catch {
      const initialRegistry: ProjectRegistry = {
        version: REGISTRY_VERSION,
        projects: {},
      };
      await writeFile(PROJECTS_FILE, JSON.stringify(initialRegistry, null, 2));
    }

    try {
      await access(CONFIG_FILE);
    } catch {
      const initialConfig: GlobalConfig = {};
      await writeFile(CONFIG_FILE, JSON.stringify(initialConfig, null, 2));
    }
  }

  /**
   * Load the registry from disk
   */
  static async load(): Promise<ProjectRegistry> {
    await this.ensureExists();
    const content = await readFile(PROJECTS_FILE, 'utf-8');
    return JSON.parse(content) as ProjectRegistry;
  }

  /**
   * Save the registry to disk
   */
  static async save(registry: ProjectRegistry): Promise<void> {
    await this.ensureExists();
    await writeFile(PROJECTS_FILE, JSON.stringify(registry, null, 2));
  }

  /**
   * Register a new project
   */
  static async register(projectPath: string, name: string): Promise<void> {
    const registry = await this.load();

    const normalizedPath = projectPath.replace(/[/\\]$/, ''); // Remove trailing slash

    registry.projects[normalizedPath] = {
      name,
      path: normalizedPath,
      status: 'idle',
      lastActivity: new Date().toISOString(),
    };

    await this.save(registry);
  }

  /**
   * Unregister a project
   */
  static async unregister(projectPath: string): Promise<boolean> {
    const registry = await this.load();
    const normalizedPath = projectPath.replace(/[/\\]$/, '');

    if (normalizedPath in registry.projects) {
      delete registry.projects[normalizedPath];
      await this.save(registry);
      return true;
    }
    return false;
  }

  /**
   * Get all registered projects
   */
  static async list(): Promise<ProjectEntry[]> {
    const registry = await this.load();
    return Object.values(registry.projects);
  }

  /**
   * Get a specific project by path
   */
  static async get(projectPath: string): Promise<ProjectEntry | null> {
    const registry = await this.load();
    const normalizedPath = projectPath.replace(/[/\\]$/, '');
    return registry.projects[normalizedPath] ?? null;
  }

  /**
   * Check if a project is registered
   */
  static async isRegistered(projectPath: string): Promise<boolean> {
    const entry = await this.get(projectPath);
    return entry !== null;
  }

  /**
   * Update a project's status
   */
  static async updateStatus(
    projectPath: string,
    status: ProjectStatus,
    pid?: number
  ): Promise<void> {
    const registry = await this.load();
    const normalizedPath = projectPath.replace(/[/\\]$/, '');

    if (normalizedPath in registry.projects) {
      registry.projects[normalizedPath].status = status;
      registry.projects[normalizedPath].lastActivity = new Date().toISOString();
      if (pid !== undefined) {
        registry.projects[normalizedPath].pid = pid;
      } else if (status === 'idle') {
        delete registry.projects[normalizedPath].pid;
      }
      await this.save(registry);
    }
  }

  /**
   * Update last activity timestamp
   */
  static async touch(projectPath: string): Promise<void> {
    const registry = await this.load();
    const normalizedPath = projectPath.replace(/[/\\]$/, '');

    if (normalizedPath in registry.projects) {
      registry.projects[normalizedPath].lastActivity = new Date().toISOString();
      await this.save(registry);
    }
  }

  /**
   * Get global config
   */
  static async getConfig(): Promise<GlobalConfig> {
    await this.ensureExists();
    const content = await readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(content) as GlobalConfig;
  }

  /**
   * Save global config
   */
  static async saveConfig(config: GlobalConfig): Promise<void> {
    await this.ensureExists();
    await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
  }

  /**
   * Get the qala directory path
   */
  static getQalaDir(): string {
    return QALA_DIR;
  }
}
