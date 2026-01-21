// Project configuration stored in .ralph/config.json
export interface ProjectConfig {
  name: string;
  path: string;
  branchName: string;
  language: string;
  createdAt: string;
  lastRunAt?: string;
  /** Per-project LLM engine overrides */
  llm?: {
    /** Project-specific engine override */
    engine?: string;
    /** Project-specific model override */
    model?: string;
  };
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
  /**
   * Which PRD user stories this task achieves (for tech spec tasks).
   * Used to track completion chain: Task ✓ → User Story ✓ → PRD ✓
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

// CLI type for agent selection
export type CliType = 'codex' | 'claude';

/** Purpose identifier for engine selection - determines which settings to use */
export type EnginePurpose =
  | 'taskRunner'
  | 'decompose'
  | 'specChat'
  | 'condenser'
  | 'specGenerator'
  | 'specReview';

// Reasoning effort levels for Codex models
export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

// Decompose reviewer configuration
export interface DecomposeReviewerConfig {
  /** CLI agent to use for peer review */
  agent: CliType;
  /** Optional model identifier */
  model?: string;
  /** Reasoning effort for Codex models */
  reasoningEffort?: ReasoningEffort;
}

// Spec condenser configuration
export interface CondenserConfig {
  /** CLI agent to use for spec condensing */
  agent: CliType;
  /** Optional model identifier */
  model?: string;
  /** Reasoning effort for Codex models */
  reasoningEffort?: ReasoningEffort;
}

// Spec generator configuration
export interface SpecGeneratorConfig {
  /** CLI agent to use for spec generation */
  agent: CliType;
  /** Optional model identifier */
  model?: string;
  /** Reasoning effort for Codex models */
  reasoningEffort?: ReasoningEffort;
}

// Task runner configuration
export interface TaskRunnerConfig {
  /** CLI agent to use for task execution ('auto' for auto-detection) */
  agent: CliType | 'auto';
  /** Optional model identifier */
  model?: string;
  /** Reasoning effort for Codex models */
  reasoningEffort?: ReasoningEffort;
}

// Spec chat configuration
export interface SpecChatConfig {
  /** CLI agent to use for spec chat */
  agent: CliType;
  /** Optional model identifier */
  model?: string;
  /** Reasoning effort for Codex models */
  reasoningEffort?: ReasoningEffort;
}

// Global settings stored in ~/.qala/config.json
export interface GlobalSettings {
  /** Decompose reviewer - peer review during PRD decomposition */
  decompose: {
    reviewer: DecomposeReviewerConfig;
  };

  /** Spec condenser - optimizes PRD for LLM (token reduction) */
  condenser: CondenserConfig;

  /** Spec generator - drafts PRDs/tech specs from inputs */
  specGenerator: SpecGeneratorConfig;

  /** Task runner - executes user stories */
  taskRunner: TaskRunnerConfig;

  /** Spec chat - interactive chat for spec review */
  specChat: SpecChatConfig;

  /** Execution settings */
  execution: {
    /** Prevent system sleep during execution (default: true) */
    keepAwake: boolean;
  };
}

// =============================================================================
// Server-Sent Events (SSE) Types
// =============================================================================

/** Generic SSE envelope */
export interface SseEnvelope<TEvent extends string, TData> {
  /** Discriminator (used as SSE event name) */
  event: TEvent;
  /** Absolute or workspace path of project */
  projectPath: string;
  /** Event payload */
  data: TData;
  /** ISO timestamp */
  timestamp: string;
}

// Ralph SSE events
export type RalphSseEvent =
  | SseEnvelope<'ralph/status', { status: RalphStatus }>
  | SseEnvelope<'ralph/iteration-start', { iteration: number; maxIterations: number; currentStory?: string | null }>
  | SseEnvelope<'ralph/iteration-end', { iteration: number; storyCompleted: boolean; allComplete: boolean }>
  | SseEnvelope<'ralph/complete', { iterationsRun: number; storiesCompleted: number }>
  | SseEnvelope<'ralph/log', { line: string }>
  | SseEnvelope<'ralph/connected', { message: string }>;

// Decompose SSE events
export type DecomposeSseEvent =
  | SseEnvelope<'decompose/state', DecomposeState>
  | SseEnvelope<'decompose/connected', { message: string }>
  | SseEnvelope<'decompose/log', { line: string }>;

// Tasks (PRD) SSE events
export type TasksSseEvent =
  | SseEnvelope<'tasks/snapshot', PRDData>
  | SseEnvelope<'tasks/updated', PRDData>;

// Peer Feedback SSE events
export type PeerFeedbackSseEvent =
  | SseEnvelope<'peer-feedback/snapshot', PeerFeedback>
  | SseEnvelope<'peer-feedback/updated', PeerFeedback>;

// Projects SSE events
export type ProjectsSseEvent =
  | SseEnvelope<'projects/snapshot', ProjectEntry[]>
  | SseEnvelope<'projects/updated', ProjectEntry[]>;

// Spec Review SSE events
export type SpecReviewSseEvent =
  | SseEnvelope<'spec-review/connected', { message: string }>
  | SseEnvelope<'spec-review/status', { sessionId: string; status: SessionStatus }>
  | SseEnvelope<'spec-review/result', { sessionId: string; verdict: SpecReviewVerdict; suggestions: SuggestionCard[]; logPath?: string }>
  | SseEnvelope<'spec-review/complete', { sessionId: string }>
  | SseEnvelope<'spec-review/chat-stream', { sessionId: string; line: string }>
  | SseEnvelope<'spec-review/log', { sessionId: string; line: string }>
  | SseEnvelope<'spec-review/file-changed', { filePath: string; changeType: 'add' | 'change' | 'unlink' }>;

// Event channel identifier
export type EventChannel = 'ralph' | 'decompose' | 'tasks' | 'peer-feedback' | 'spec-review';

// Unified SSE event (all per-project events)
export type UnifiedSseEvent =
  | RalphSseEvent
  | DecomposeSseEvent
  | TasksSseEvent
  | PeerFeedbackSseEvent
  | SpecReviewSseEvent;

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

// =============================================================================
// Generic Peer Review Types (Agent-Agnostic)
// =============================================================================

/**
 * Generic options for running peer review.
 * Drivers adapt these to their specific format.
 */
export interface ReviewOptions {
  /** The review prompt to send to the engine */
  prompt: string;
  /** Path to write raw output file */
  outputPath: string;
  /** Project path for working directory context */
  projectPath: string;
  /** Optional timeout in milliseconds */
  timeoutMs?: number;
  /** Optional model to use */
  model?: string;
}

/**
 * Generic result from peer review execution.
 * Drivers convert their specific outputs to this format.
 */
export interface ReviewResult {
  /** Whether the review completed successfully */
  success: boolean;
  /** The review feedback (parsed and validated) */
  feedback: ReviewFeedback;
  /** Error message if failed */
  error?: string;
  /** Captured stdout output (raw response) */
  stdout?: string;
  /** Captured stderr output */
  stderr?: string;
  /** Duration in milliseconds */
  durationMs?: number;
}

// =============================================================================
// Normalized Stream Events (Cross-Engine)
// =============================================================================

/**
 * Normalized stream events that all engines must emit.
 * Drivers convert engine-specific outputs to these standardized events.
 */
export type NormalizedEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_call'; id: string; name: string; input: Record<string, unknown>; detail?: string }
  | { type: 'tool_result'; tool_use_id: string; content?: string; is_error?: boolean }
  | { type: 'metadata'; data: Record<string, unknown> }
  | { type: 'complete'; reason?: string }
  | { type: 'error'; message: string };

/**
 * Stream normalizer interface - converts engine-specific output to standard events
 */
export interface StreamNormalizer {
  /** Convert engine-specific stream chunk to normalized events */
  normalize(chunk: string): NormalizedEvent[];
}

// =============================================================================
// Spec Review Types (FR-21)
// =============================================================================

/**
 * Result verdict for spec review analysis.
 */
export type SpecReviewVerdict =
  | 'PASS'
  | 'FAIL'
  | 'NEEDS_IMPROVEMENT'
  | 'SPLIT_RECOMMENDED';

/**
 * Severity level for spec review suggestions.
 */
export type SuggestionSeverity = 'critical' | 'warning' | 'info';

/**
 * Status of a suggestion in the review workflow.
 */
export type SuggestionStatus = 'pending' | 'approved' | 'rejected' | 'edited';

/** Type of suggestion - 'change' has concrete fix, 'comment' is general feedback */
export type SuggestionType = 'change' | 'comment';

/**
 * Domain/concern tags for cross-cutting filtering of suggestions.
 * These are orthogonal to category - a 'clarity' issue can also be tagged 'security'.
 */
export type SuggestionTag =
  | 'security'        // Auth, vulnerabilities, data protection
  | 'performance'     // Speed, optimization, caching
  | 'scalability'     // Load handling, growth
  | 'data'            // Data models, privacy, GDPR
  | 'api'             // API design, contracts
  | 'ux'              // User experience, usability
  | 'accessibility'   // A11y, WCAG compliance
  | 'architecture'    // System design, patterns
  | 'testing'         // Test coverage, strategy
  | 'infrastructure'  // Deployment, DevOps, CI/CD
  | 'error-handling'  // Error cases, edge cases
  | 'documentation';  // Docs, comments, clarity

/** All available suggestion tags */
export const SUGGESTION_TAGS: SuggestionTag[] = [
  'security',
  'performance',
  'scalability',
  'data',
  'api',
  'ux',
  'accessibility',
  'architecture',
  'testing',
  'infrastructure',
  'error-handling',
  'documentation',
];

/**
 * Status of a spec review session.
 */
export type SessionStatus = 'in_progress' | 'completed' | 'needs_attention';

/**
 * Status of a spec in the lifecycle.
 */
export type SpecStatus = 'draft' | 'reviewed' | 'decomposed' | 'active' | 'completed';

/**
 * Type of spec document.
 * - prd: Product Requirements Document (what/why)
 * - tech-spec: Technical Specification (how)
 * - bug: Bug report
 */
export type SpecType = 'prd' | 'tech-spec' | 'bug';

/**
 * Metadata for tracking spec lifecycle information.
 */
export interface SpecMetadata {
  /** ISO timestamp when the spec was created */
  created: string;
  /** ISO timestamp of last modification */
  lastModified: string;
  /** Current status in the spec lifecycle */
  status: SpecStatus;
  /** Path to the spec file */
  specPath: string;
  /** Type of spec (prd, tech-spec, bug). Defaults to 'prd' for legacy specs. */
  type?: SpecType;
  /** Parent spec path (for tech specs linked to PRDs) */
  parent?: string;
  /** Child spec IDs (for PRDs with linked tech specs) */
  children?: string[];
}

/**
 * Individual category result from spec review analysis.
 */
export interface SpecReviewCategory {
  /** Category verdict */
  verdict: SpecReviewVerdict;
  /** List of issues found in this category */
  issues: string[];
}

/**
 * Result from a single focused prompt execution.
 */
export interface FocusedPromptResult {
  /** Name of the focused prompt */
  promptName: string;
  /** Category being analyzed */
  category: string;
  /** Result verdict */
  verdict: SpecReviewVerdict;
  /** Issues discovered */
  issues: string[];
  /** Suggestions generated */
  suggestions: SuggestionCard[];
  /** Raw AI response (for debugging) */
  rawResponse?: string;
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Indicators that a spec may be a "god spec" (too large/complex).
 */
export interface GodSpecIndicators {
  /** Whether this spec is considered a god spec */
  isGodSpec: boolean;
  /** Specific indicators that triggered the detection */
  indicators: string[];
  /** Estimated number of user stories this spec would generate */
  estimatedStories: number;
  /** Distinct feature domains identified in the spec */
  featureDomains: string[];
  /** System boundaries that would be affected */
  systemBoundaries: string[];
}

/**
 * Reference to a child spec created from a split.
 */
export interface SplitSpecRef {
  /** Filename of the split spec */
  filename: string;
  /** Brief description of what this spec covers */
  description: string;
}

/**
 * Proposed spec from a split operation.
 */
export interface ProposedSpec {
  /** Suggested filename for the new spec */
  filename: string;
  /** Description of what this spec covers */
  description: string;
  /** Estimated number of user stories */
  estimatedStories: number;
  /** Sections/content from original spec to include */
  sections: string[];
}

/**
 * Proposal for splitting a god spec into smaller specs.
 */
export interface SplitProposal {
  /** Original spec file path */
  originalFile: string;
  /** Reason for recommending the split */
  reason: string;
  /** Proposed new specs */
  proposedSpecs: ProposedSpec[];
}

/**
 * Codebase context gathered for spec review.
 */
export interface CodebaseContext {
  /** Detected project type (e.g., 'typescript', 'python', 'dotnet') */
  projectType: string;
  /** Existing patterns/conventions discovered */
  existingPatterns: string[];
  /** Files relevant to the spec being reviewed */
  relevantFiles: string[];
}

/**
 * Suggestion card for spec review feedback (FR-21 contract).
 */
export interface SuggestionCard {
  /** Unique identifier */
  id: string;
  /** Category of the suggestion (e.g., 'clarity', 'completeness', 'testability') */
  category: string;
  /** Severity level */
  severity: SuggestionSeverity;
  /** Type of suggestion - 'change' has concrete fix, 'comment' is general feedback. Defaults to 'comment' if not set. */
  type?: SuggestionType;
  /** Section of the spec this applies to */
  section: string;
  /** Starting line number in the spec */
  lineStart?: number;
  /** Ending line number in the spec */
  lineEnd?: number;
  /** Text snippet from the spec */
  textSnippet: string;
  /** Description of the issue */
  issue: string;
  /** Suggested fix */
  suggestedFix: string;
  /** Current status */
  status: SuggestionStatus;
  /** User's edited version (if status is 'edited') */
  userVersion?: string;
  /** ISO timestamp when reviewed */
  reviewedAt?: string;
  /** Domain/concern tags for cross-cutting filtering (e.g., 'security', 'performance') */
  tags?: SuggestionTag[];
}

/**
 * Entry in the change history for revert functionality (FR-21 contract).
 */
export interface ChangeHistoryEntry {
  /** Unique identifier */
  id: string;
  /** ISO timestamp of the change */
  timestamp: string;
  /** Description of what changed */
  description: string;
  /** File path that was changed */
  filePath: string;
  /** Content before the change */
  beforeContent: string;
  /** Content after the change */
  afterContent: string;
  /** Whether this change has been reverted */
  reverted: boolean;
}

/**
 * Chat message in the review conversation (FR-21 contract).
 */
export interface ChatMessage {
  /** Unique identifier */
  id: string;
  /** Message role */
  role: 'user' | 'assistant';
  /** Message content */
  content: string;
  /** ISO timestamp */
  timestamp: string;
  /** Associated suggestion ID (if responding to a suggestion) */
  suggestionId?: string;
}

/**
 * Session file for spec review state persistence (FR-21 contract).
 */
export interface SessionFile {
  /** Unique session identifier */
  sessionId: string;
  /** Path to the spec file being reviewed */
  specFilePath: string;
  /** Session status */
  status: SessionStatus;
  /** ISO timestamp when session started */
  startedAt: string;
  /** ISO timestamp of last update */
  lastUpdatedAt: string;
  /** ISO timestamp when completed (if applicable) */
  completedAt?: string;
  /** Overall review result */
  reviewResult?: SpecReviewResult;
  /** All suggestions generated */
  suggestions: SuggestionCard[];
  /** Change history for revert */
  changeHistory: ChangeHistoryEntry[];
  /** Chat messages */
  chatMessages: ChatMessage[];
  /** Split spec references (if spec was split) */
  splitSpecs?: SplitSpecRef[];
  /** Path to parent spec if this spec was created from a split */
  parentSpecPath?: string;
  /** Path to the review log file */
  logPath?: string;
}

/** Information about a timeout that occurred during review */
export interface TimeoutInfo {
  /** The timeout value in milliseconds that was used */
  timeoutMs: number;
  /** Number of prompts that completed before timeout */
  completedPrompts: number;
  /** Total number of prompts that were planned to run */
  totalPrompts: number;
  /** Names of prompts that completed */
  completedPromptNames: string[];
}

/**
 * Complete result from a spec review operation.
 */
export interface SpecReviewResult {
  /** Overall verdict */
  verdict: SpecReviewVerdict;
  /** Results by category */
  categories: Record<string, SpecReviewCategory>;
  /** Split proposal (if verdict is SPLIT_RECOMMENDED) */
  splitProposal?: SplitProposal;
  /** God spec indicators (if god spec detection was performed) */
  godSpecIndicators?: GodSpecIndicators;
  /** Codebase context used for review */
  codebaseContext: CodebaseContext;
  /** Generated suggestions */
  suggestions: SuggestionCard[];
  /** Path to the review log file */
  logPath: string;
  /** Total duration in milliseconds */
  durationMs: number;
  /** Timeout information if review timed out (contains partial results) */
  timeoutInfo?: TimeoutInfo;
  /** Executive summary from aggregation agent */
  executiveSummary?: string;
  /** Deduplication statistics from aggregation agent */
  deduplicationStats?: {
    before: number;
    after: number;
  };
}


// =============================================================================
// Task Queue Types (Task Queue Restructure)
// =============================================================================

/**
 * Status of a queued task in the execution queue.
 */
export type QueuedTaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'skipped';

/**
 * Reference to a task in a spec's decompose_state.json.
 * The queue stores references only, not duplicate task data.
 */
export interface QueuedTaskReference {
  /** ID of the spec containing this task (e.g., "my-feature.tech") */
  specId: string;
  /** ID of the task within the spec (e.g., "TASK-001") */
  taskId: string;
  /** ISO timestamp when added to queue */
  queuedAt: string;
  /** Current execution status */
  status: QueuedTaskStatus;
  /** ISO timestamp when execution started */
  startedAt?: string;
  /** ISO timestamp when completed */
  completedAt?: string;
}

/**
 * Central task queue stored in .ralph/task-queue.json.
 * Contains references to tasks across all specs for ordered execution.
 */
export interface TaskQueue {
  /** Schema version for future migrations */
  version: 1;
  /** Project name */
  projectName: string;
  /** Git branch for execution */
  branchName: string;
  /** Project language */
  language: string;
  /** Ordered list of task references to execute */
  queue: QueuedTaskReference[];
  /** ISO timestamp when queue was created */
  createdAt: string;
  /** ISO timestamp of last update */
  updatedAt: string;
}

/**
 * Statistics for the task queue.
 */
export interface QueueStats {
  /** Total tasks in queue */
  total: number;
  /** Tasks waiting to be executed */
  queued: number;
  /** Currently running tasks */
  running: number;
  /** Successfully completed tasks */
  completed: number;
  /** Failed tasks */
  failed: number;
  /** Skipped tasks */
  skipped: number;
}

/**
 * Result of processing a task completion through the completion chain.
 */
export interface CompletionChainResult {
  /** Spec ID of the completed task */
  specId: string;
  /** Task ID that was completed */
  taskId: string;
  /** User stories that were marked as achieved */
  achievedStories: Array<{
    prdSpecId: string;
    storyId: string;
  }>;
  /** Whether any PRDs were fully completed */
  completedPrds: string[];
}

/**
 * Progress information for a PRD based on its linked tech specs.
 */
export interface PrdProgress {
  /** PRD spec ID */
  specId: string;
  /** Total user stories in the PRD */
  totalStories: number;
  /** User stories marked as achieved */
  achievedStories: number;
  /** Whether all stories are achieved */
  isComplete: boolean;
  /** IDs of stories still pending */
  pendingStoryIds: string[];
  /** Linked tech spec IDs */
  linkedTechSpecs: string[];
}
