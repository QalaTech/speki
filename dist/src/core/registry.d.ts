import type { ProjectRegistry, ProjectEntry, ProjectStatus, GlobalConfig } from '../types/index.js';
export declare class Registry {
    /**
     * Ensure ~/.qala directory and files exist
     */
    static ensureExists(): Promise<void>;
    /**
     * Load the registry from disk
     */
    static load(): Promise<ProjectRegistry>;
    /**
     * Save the registry to disk
     */
    static save(registry: ProjectRegistry): Promise<void>;
    /**
     * Register a new project
     */
    static register(projectPath: string, name: string): Promise<void>;
    /**
     * Unregister a project
     */
    static unregister(projectPath: string): Promise<boolean>;
    /**
     * Get all registered projects
     */
    static list(): Promise<ProjectEntry[]>;
    /**
     * Get a specific project by path
     */
    static get(projectPath: string): Promise<ProjectEntry | null>;
    /**
     * Check if a project is registered
     */
    static isRegistered(projectPath: string): Promise<boolean>;
    /**
     * Update a project's status
     */
    static updateStatus(projectPath: string, status: ProjectStatus, pid?: number): Promise<void>;
    /**
     * Update last activity timestamp
     */
    static touch(projectPath: string): Promise<void>;
    /**
     * Get global config
     */
    static getConfig(): Promise<GlobalConfig>;
    /**
     * Save global config
     */
    static saveConfig(config: GlobalConfig): Promise<void>;
    /**
     * Get the qala directory path
     */
    static getQalaDir(): string;
}
//# sourceMappingURL=registry.d.ts.map