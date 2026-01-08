import type { ProjectConfig, PRDData, DecomposeState, RalphStatus } from '../types/index.js';
export declare class Project {
    readonly projectPath: string;
    readonly ralphDir: string;
    constructor(projectPath: string);
    get configPath(): string;
    get prdPath(): string;
    get decomposeStatePath(): string;
    get decomposeFeedbackPath(): string;
    get statusPath(): string;
    get progressPath(): string;
    get peerFeedbackPath(): string;
    get promptPath(): string;
    get decomposePromptPath(): string;
    get tasksDir(): string;
    get logsDir(): string;
    get standardsDir(): string;
    /**
     * Check if .ralph folder exists
     */
    exists(): Promise<boolean>;
    /**
     * Initialize .ralph folder with all required files and directories
     */
    initialize(options: {
        name: string;
        branchName?: string;
        language?: string;
    }): Promise<void>;
    /**
     * Copy template files from the package
     */
    private copyTemplates;
    loadConfig(): Promise<ProjectConfig>;
    saveConfig(config: ProjectConfig): Promise<void>;
    loadPRD(): Promise<PRDData | null>;
    savePRD(prd: PRDData): Promise<void>;
    loadDecomposeState(): Promise<DecomposeState>;
    saveDecomposeState(state: DecomposeState): Promise<void>;
    loadStatus(): Promise<RalphStatus>;
    saveStatus(status: RalphStatus): Promise<void>;
    appendProgress(message: string): Promise<void>;
    readProgress(): Promise<string>;
    listTasks(): Promise<string[]>;
    loadTask(filename: string): Promise<PRDData | null>;
    saveTask(filename: string, task: PRDData): Promise<void>;
    listLogs(): Promise<string[]>;
    /**
     * Get the next iteration number based on existing logs
     */
    getNextIteration(): Promise<number>;
    /**
     * Get the standards file path for a language
     */
    getStandardsPath(language: string): string;
    /**
     * Check if standards file exists for a language
     */
    hasStandards(language: string): Promise<boolean>;
}
/**
 * Find the .ralph directory by walking up from current directory
 */
export declare function findProjectRoot(startDir?: string): Promise<string | null>;
/**
 * Get a Project instance for the current directory or specified path
 */
export declare function getProject(projectPath?: string): Promise<Project | null>;
//# sourceMappingURL=project.d.ts.map