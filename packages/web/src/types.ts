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
 */
export type TaskComplexity = 'low' | 'medium' | 'high';

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
   */
  complexity?: TaskComplexity;
  // Tracking fields for executed tasks
  executedAt?: string;
  inPrd?: boolean;
  /**
   * For tech spec tasks: IDs of parent PRD user stories this task achieves.
   */
  achievesUserStories?: string[];
  /**
   * Review status after AI review agent evaluates the story.
   * - 'pending': Not yet reviewed
   * - 'passed': Review passed, story is ready
   * - 'needs_improvement': Review found issues that should be addressed
   */
  reviewStatus?: 'pending' | 'passed' | 'needs_improvement';
  /**
   * Feedback from the review agent about this story.
   */
  reviewFeedback?: string;
}

export interface PRDData {
  projectName: string;
  branchName: string;
  language: string;
  standardsFile: string;
  description: string;
  userStories: UserStory[];
}

export interface StoryStats {
  total: number;
  completed: number;
  ready: number;
  blocked: number;
}

export function calculateStats(stories: UserStory[]): StoryStats {
  const completedIds = new Set(stories.filter(s => s.passes).map(s => s.id));
  const completed = completedIds.size;

  const depsOk = (story: UserStory) =>
    story.dependencies.every(dep => completedIds.has(dep));

  const incomplete = stories.filter(s => !s.passes);
  const ready = incomplete.filter(depsOk).length;
  const blocked = incomplete.length - ready;

  return {
    total: stories.length,
    completed,
    ready,
    blocked,
  };
}

export function getStoryStatus(story: UserStory, completedIds: Set<string>): 'completed' | 'ready' | 'blocked' {
  if (story.passes) return 'completed';
  const depsOk = story.dependencies.every(dep => completedIds.has(dep));
  return depsOk ? 'ready' : 'blocked';
}

// Ralph execution status
export interface RalphStatus {
  running: boolean;
  status: 'running' | 'starting' | 'stopped';
  pid?: number;
  startedAt?: string;
  currentIteration: number;
  maxIterations: number;
  currentStory: string | null;
}

// Decomposition state
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
  attempt: number;
  path: string;
}

export type DecomposeErrorType = 'CLI_UNAVAILABLE' | 'TIMEOUT' | 'CRASH';

export interface DecomposeState {
  status: DecomposeStatus;
  message: string;
  updatedAt?: string;
  prdFile?: string;
  branch?: string;
  storyCount?: number;
  draftFile?: string;
  verdict?: 'PASS' | 'FAIL' | 'UNKNOWN' | 'SKIPPED';
  feedbackFile?: string;
  logFile?: string;
  error?: string;
  errorType?: DecomposeErrorType;
  attempts?: number;
  reviewLogs?: ReviewLogEntry[];
}

export interface FeedbackItem {
  taskId?: string;
  taskIds?: string[];
  requirement?: string;
  issue?: string;
  reason?: string;
  action?: string;
  prdSection?: string;
  dependsOn?: string;
  severity?: 'critical' | 'warning' | 'info';
  description?: string;
  suggestedFix?: string;
}

export interface TaskGrouping {
  taskIds: string[];
  reason: string;
  complexity: 'low' | 'medium';
}

export interface StandaloneTask {
  taskId: string;
  reason: string;
}

export interface DecomposeFeedback {
  verdict: 'PASS' | 'FAIL' | 'UNKNOWN';
  missingRequirements?: (string | FeedbackItem)[];
  contradictions?: (string | FeedbackItem)[];
  dependencyErrors?: (string | FeedbackItem)[];
  duplicates?: (string | FeedbackItem)[];
  suggestions?: FeedbackItem[];
  taskGroupings?: TaskGrouping[];
  standaloneTasks?: StandaloneTask[];
  issues?: string[];
  reviewLog?: string;
}

export interface PrdFile {
  name: string;
  path: string;
  dir: string;
}

// Log entry for structured log rendering
export interface LogEntry {
  type: 'text' | 'tool' | 'result';
  content: string;
  tool?: string;
  status?: 'success' | 'error' | 'empty';
  id?: string;
}

// Peer feedback types (inter-iteration knowledge base)
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
  issue: string;
  addedBy: string;
  addedAt: string;
}

export interface TaskSuggestion {
  suggestion: string;
  forTask: string;
  addedBy: string;
  addedAt: string;
}

export interface LessonLearned {
  lesson: string;
  category: PeerFeedbackCategory;
  addedBy: string;
  addedAt: string;
}

export interface PeerFeedback {
  blocking: BlockingIssue[];
  suggestions: TaskSuggestion[];
  lessonsLearned: LessonLearned[];
}

// Task Queue Types

export type QueuedTaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'skipped';

export interface QueuedTaskReference {
  specId: string;
  taskId: string;
  queuedAt: string;
  status: QueuedTaskStatus;
  startedAt?: string;
  completedAt?: string;
}

export interface TaskQueue {
  version: 1;
  projectName: string;
  branchName: string;
  language: string;
  queue: QueuedTaskReference[];
  createdAt: string;
  updatedAt: string;
}

export interface QueueStats {
  total: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  skipped: number;
}

export interface QueuedTaskWithData extends QueuedTaskReference {
  task?: UserStory;
}

// =============================================================================
// Settings and Configuration Types
// =============================================================================

/**
 * CLI type for agent selection
 */
export type CliType = 'codex' | 'claude' | 'gemini';

/**
 * Reasoning effort levels for Codex models
 */
export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

/**
 * CLI detection result for a single CLI tool
 */
export interface CliDetectionResult {
  available: boolean;
  version: string;
  command: string;
}

/**
 * Detection results for all CLI tools
 */
export interface AllCliDetectionResults {
  codex: CliDetectionResult;
  claude: CliDetectionResult;
  gemini: CliDetectionResult;
}

/**
 * Model detection result for a single CLI tool
 */
export interface ModelDetectionResult {
  available: boolean;
  models: string[];
  error?: string;
}

/**
 * Model detection results for all CLI tools
 */
export interface AllModelDetectionResults {
  codex: ModelDetectionResult;
  claude: ModelDetectionResult;
  gemini: ModelDetectionResult;
}

/**
 * Configuration for a processing stage (decompose reviewer, condenser, spec generator)
 */
export interface StageConfig {
  /** CLI agent to use */
  agent: CliType;
  /** Optional model identifier */
  model?: string;
  /** Reasoning effort for Codex models */
  reasoningEffort?: ReasoningEffort;
}

/**
 * Configuration for the task runner
 */
export interface TaskRunnerConfig {
  /** CLI agent to use ('auto' for auto-detection) */
  agent: CliType | 'auto';
  /** Optional model identifier */
  model?: string;
  /** Reasoning effort for Codex models */
  reasoningEffort?: ReasoningEffort;
}

/**
 * Configuration for spec chat
 */
export interface SpecChatConfig {
  /** CLI agent to use */
  agent: CliType;
  /** Optional model identifier */
  model?: string;
  /** Reasoning effort for Codex models */
  reasoningEffort?: ReasoningEffort;
}

/**
 * Global settings stored in ~/.qala/config.json
 */
export interface GlobalSettings {
  /** Decompose reviewer - peer review during PRD decomposition */
  decompose: {
    reviewer: StageConfig;
  };
  /** Spec condenser - optimizes PRD for LLM (token reduction) */
  condenser: StageConfig;
  /** Spec generator - drafts PRDs/tech specs from inputs */
  specGenerator: StageConfig;
  /** Task runner - executes user stories */
  taskRunner: TaskRunnerConfig;
  /** Spec chat - interactive chat for spec review */
  specChat: SpecChatConfig;
  /** Execution settings */
  execution: {
    /** Prevent system sleep during execution (default: true) */
    keepAwake: boolean;
    /** Parallel execution configuration */
    parallel?: {
      /** Enable parallel task execution */
      enabled: boolean;
      /** Maximum number of parallel tasks (1-8) */
      maxParallel: number;
    };
  };
}
