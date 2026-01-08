// Project configuration stored in .ralph/config.json
export interface ProjectConfig {
  name: string;
  path: string;
  branchName: string;
  language: string;
  createdAt: string;
  lastRunAt?: string;
}

// Entry in the central registry ~/.qala/projects.json
export interface ProjectEntry {
  name: string;
  path: string;
  status: ProjectStatus;
  lastActivity: string;
  pid?: number;
}

export type ProjectStatus = 'idle' | 'running' | 'decomposing' | 'error';

// Central registry structure
export interface ProjectRegistry {
  version: number;
  projects: Record<string, ProjectEntry>;
}

// Global qala configuration ~/.qala/config.json
export interface GlobalConfig {
  defaultLanguage?: string;
  dashboardPort?: number;
}

// PRD and User Story types (matching existing web/src/types.ts)
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
  // Tracking fields for executed tasks
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

// Decompose state (matching existing)
export type DecomposeStatus =
  | 'IDLE'
  | 'STARTING'
  | 'INITIALIZING'
  | 'DECOMPOSING'
  | 'DECOMPOSED'
  | 'REVIEWING'
  | 'REVISING'
  | 'COMPLETED'
  | 'ERROR';

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

// Ralph execution status (matching .ralph-status.json)
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
