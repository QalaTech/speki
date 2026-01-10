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

/**
 * Suggestions for implementation (guidance, not mandates)
 */
export interface ContextSuggestions {
  schemas?: Record<string, string>;
  examples?: Record<string, string>;
  patterns?: Record<string, string>;
  prompts?: Record<string, string>;
}

/**
 * Requirements that must be implemented exactly
 */
export interface ContextRequirements {
  apiContracts?: Record<string, string>;
}

/**
 * Contextual information for a user story.
 * Supports both new nested format (suggestions/requirements) and legacy flat format.
 */
export interface StoryContext {
  // New nested format
  /** Implementation suggestions (use your judgment) */
  suggestions?: ContextSuggestions;
  /** Requirements that must be followed exactly */
  requirements?: ContextRequirements;

  // Legacy flat format (kept for backwards compatibility)
  /** TypeScript/JSON schemas to implement exactly as specified */
  schemas?: Record<string, string>;
  /** Prompt templates to implement exactly as specified */
  prompts?: Record<string, string>;
  /** Data contracts (API payloads, responses) to implement */
  dataContracts?: Record<string, string>;
  /** Code examples to follow */
  examples?: Record<string, string>;
  /** File paths Claude should read for additional context */
  references?: string[];
}

/**
 * Task complexity level - determines execution strategy.
 * - low: Safe to group with other low-complexity tasks
 * - medium: Execute individually, but quick
 * - high: Execute individually, may need multiple iterations
 */
export type TaskComplexity = 'low' | 'medium' | 'high';

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
  /**
   * Contextual information from the PRD that Claude should implement verbatim.
   * Includes schemas, prompts, data contracts, etc.
   */
  context?: StoryContext;
  /**
   * Task complexity level - set by decompose agent.
   * Used by reviewer to suggest groupings and by executor to batch tasks.
   */
  complexity?: TaskComplexity;
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

export type DecomposeErrorType = 'CLI_UNAVAILABLE' | 'TIMEOUT' | 'CRASH';

export interface DecomposeState {
  status: DecomposeStatus;
  message: string;
  prdFile?: string;
  draftFile?: string;
  verdict?: 'PASS' | 'FAIL' | 'UNKNOWN' | 'SKIPPED';
  reviewLogs?: ReviewLogEntry[];
  error?: string;
  errorType?: DecomposeErrorType;
  startedAt?: string;
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

// CLI type for reviewer selection
export type CliType = 'codex' | 'claude';

// Reviewer configuration
export interface ReviewerConfig {
  cli: CliType;
}

// Execution configuration
export interface ExecutionConfig {
  /** Prevent system sleep during execution (default: true) */
  keepAwake: boolean;
}

// Global settings stored in ~/.qala/config.json
export interface GlobalSettings {
  reviewer: ReviewerConfig;
  execution: ExecutionConfig;
}

// CLI detection result
export interface CliDetectionResult {
  available: boolean;
  version: string;
  command: string;
}

// Detection results for all CLIs
export interface AllCliDetectionResults {
  codex: CliDetectionResult;
  claude: CliDetectionResult;
}

// Current task context - focused context for a single iteration
export interface TaskReference {
  id: string;
  title: string;
}

export interface CurrentTaskContext {
  /** Project metadata */
  project: {
    name: string;
    branch: string;
  };
  /** The current task to work on (full details) */
  currentTask: UserStory;
  /** Completed dependencies (just refs for context) */
  completedDependencies: TaskReference[];
  /** Tasks that are blocked by this task (downstream) */
  blocks: TaskReference[];
  /** Available standards files in .ralph/standards/ */
  availableStandards: string[];
  /** Path to progress file */
  progressFile: string;
  /** Path to PRD file (for updating passes: true) */
  prdFile: string;
  /** Path to peer feedback file */
  peerFeedbackFile: string;
}

// Inter-iteration peer feedback (managed by Ralph agent)
export type PeerFeedbackCategory =
  | 'architecture'
  | 'testing'
  | 'api'
  | 'database'
  | 'performance'
  | 'security'
  | 'tooling'
  | 'patterns'
  | 'gotchas';

export interface BlockingIssue {
  /** Description of the blocking issue */
  issue: string;
  /** Task ID that added this item */
  addedBy: string;
  /** ISO timestamp when added */
  addedAt: string;
}

export interface TaskSuggestion {
  /** The suggestion/recommendation */
  suggestion: string;
  /** Target task ID this suggestion applies to */
  forTask: string;
  /** Task ID that added this item */
  addedBy: string;
  /** ISO timestamp when added */
  addedAt: string;
}

export interface LessonLearned {
  /** Description of the lesson */
  lesson: string;
  /** Category for filtering/organization */
  category: PeerFeedbackCategory;
  /** Task ID that added this item */
  addedBy: string;
  /** ISO timestamp when added */
  addedAt: string;
}

export interface PeerFeedback {
  /** Issues that must be addressed before the next task */
  blocking: BlockingIssue[];
  /** Recommendations for specific upcoming tasks */
  suggestions: TaskSuggestion[];
  /** Accumulated knowledge base (never deleted) */
  lessonsLearned: LessonLearned[];
}

// Peer review feedback schema (decomposition validation)
/**
 * Task grouping suggestion from peer review.
 * Simple tasks can be grouped together to reduce iterations.
 */
export interface TaskGrouping {
  /** Task IDs that can be executed together */
  taskIds: string[];
  /** Why these tasks can be grouped */
  reason: string;
  /** Estimated complexity: low = safe to group, medium = use judgment */
  complexity: 'low' | 'medium';
}

/**
 * Task that should remain standalone due to complexity.
 */
export interface StandaloneTask {
  /** Task ID */
  taskId: string;
  /** Why this task should not be grouped */
  reason: string;
}

export interface ReviewFeedback {
  verdict: 'PASS' | 'FAIL';
  missingRequirements: string[];
  contradictions: string[];
  dependencyErrors: string[];
  duplicates: string[];
  suggestions: string[];
  /**
   * Suggested task groupings for efficiency.
   * Simple, low-risk tasks can be executed together to reduce token cost.
   */
  taskGroupings?: TaskGrouping[];
  /**
   * Tasks that must remain standalone due to complexity or risk.
   * These should not be grouped with other tasks.
   */
  standaloneTasks?: StandaloneTask[];
}
