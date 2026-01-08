export interface ProjectConfig {
    name: string;
    path: string;
    branchName: string;
    language: string;
    createdAt: string;
    lastRunAt?: string;
}
export interface ProjectEntry {
    name: string;
    path: string;
    status: ProjectStatus;
    lastActivity: string;
    pid?: number;
}
export type ProjectStatus = 'idle' | 'running' | 'decomposing' | 'error';
export interface ProjectRegistry {
    version: number;
    projects: Record<string, ProjectEntry>;
}
export interface GlobalConfig {
    defaultLanguage?: string;
    dashboardPort?: number;
}
export interface UserStory {
    id: string;
    title: string;
    description: string;
    acceptanceCriteria: string[];
    testCases?: string[];
    priority: number;
    passes: boolean;
    notes: string;
    dependencies: string[];
    executedAt?: string;
    inPrd?: boolean;
}
export interface PRDData {
    projectName: string;
    branchName: string;
    language: string;
    standardsFile: string;
    description: string;
    userStories: UserStory[];
}
export type DecomposeStatus = 'IDLE' | 'STARTING' | 'INITIALIZING' | 'DECOMPOSING' | 'DECOMPOSED' | 'REVIEWING' | 'REVISING' | 'COMPLETED' | 'ERROR';
export interface ReviewLogEntry {
    timestamp: string;
    action: string;
    details?: string;
}
export interface DecomposeState {
    status: DecomposeStatus;
    message: string;
    prdFile?: string;
    draftFile?: string;
    verdict?: 'PASS' | 'FAIL' | 'UNKNOWN' | 'SKIPPED';
    reviewLogs?: ReviewLogEntry[];
    error?: string;
}
export interface RalphStatus {
    status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
    currentIteration?: number;
    maxIterations?: number;
    currentStory?: string;
    startedAt?: string;
    lastUpdateAt?: string;
    pid?: number;
    error?: string;
}
//# sourceMappingURL=index.d.ts.map