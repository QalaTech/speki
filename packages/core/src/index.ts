// Re-export all types
export * from './types/index.js';

// Project management
export { Project, findProjectRoot, getProject } from './project.js';

// Registry
export { Registry } from './registry.js';

// Settings
export {
  loadGlobalSettings,
  saveGlobalSettings,
  getQalaDir,
  getSettingsFilePath,
} from './settings.js';

// CLI detection
export { detectCli, detectAllClis } from './cli-detect.js';
export {
  resolveCliPath,
  checkCliAvailable,
  isCliAvailable,
  getInstallInstructions,
  clearCliPathCache,
  resolveExecutable,
  isExecutableAvailable,
} from './cli-path.js';
export type { CliAvailabilityResult } from './cli-path.js';

// ID Registry
export { IdRegistry } from './id-registry.js';

// Logger
export * as logger from './logger.js';

// Keep Awake
export { preventSleep, allowSleep, isPreventingSleep, getCurrentMethod } from './keep-awake.js';
export type { KeepAwakeResult, SupportedPlatform } from './keep-awake.js';

// LLM Engine
export type {
  Engine,
  EngineAvailability,
  RunChatOptions,
  RunChatResult,
  RunStreamOptions,
  RunStreamResult,
} from './llm/engine.js';
export type { EngineSelection } from './llm/engine-factory.js';
export {
  selectEngine,
  getEngineByName,
  isDefaultEngineAvailable,
} from './llm/engine-factory.js';

// LLM Drivers
export { ClaudeCliEngine } from './llm/drivers/claude-cli.js';
export { CodexCliEngine } from './llm/drivers/codex-cli.js';

// LLM Normalizers
export { ClaudeStreamNormalizer } from './llm/normalizers/claude-normalizer.js';
export { CodexStreamNormalizer } from './llm/normalizers/codex-normalizer.js';

// Decompose
export type { DecomposeOptions, DecomposeResult } from './decompose/runner.js';
export { runDecompose } from './decompose/runner.js';

// Decompose Peer Review
export { runPeerReview } from './decompose/peer-review.js';

// Spec Review
export type { SpecReviewOptions, DecomposeReviewOptions } from './spec-review/runner.js';
export { runSpecReview, runDecomposeReview } from './spec-review/runner.js';
export type { TimeoutInfo } from './types/index.js';

// Spec Review JSON Parser
export {
  extractReviewJson,
  validateFocusedPromptResult,
  validateGodSpecResult,
  validateSplitProposal,
} from './spec-review/json-parser.js';

// Spec Review Change Tracker
export {
  trackChange,
  revertChange,
  revertAll,
  getOriginalContent,
} from './spec-review/change-tracker.js';
export type { RevertResult, RevertAllResult } from './spec-review/change-tracker.js';

// Spec Review Feedback Handler
export {
  handleApproval,
  handleRejection,
  handleEdit,
  createAgentContext,
} from './spec-review/feedback-handler.js';
export type { FeedbackInput, FeedbackResult, AgentContext, RejectionPattern } from './spec-review/feedback-handler.js';

// God Spec Detector
export { detectGodSpec, generateSplitProposal } from './spec-review/god-spec-detector.js';

// Serena MCP
export { installSerenaMcp } from './serena.js';
export type { InstallSerenaResult } from './serena.js';

// Codebase Context
export { gatherCodebaseContext } from './spec-review/codebase-context.js';

// Spec Metadata
export {
  readSpecMetadata,
  writeSpecMetadata,
  initSpecMetadata,
  updateSpecStatus,
  transitionSpecStatus,
  getSpecDir,
  getSpecLogsDir,
  ensureSpecDir,
  extractSpecId,
  findSpecFiles,
  listSpecs,
  detectSpecType,
  detectTypeFromFilename,
  loadDecomposeStateForSpec,
  saveDecomposeStateForSpec,
  loadPRDForSpec,
  savePRDForSpec,
  getParentSpec,
  getChildSpecs,
  linkTechSpecToPrd,
  createTechSpecFromPrd,
  generateTechSpecContent,
  getDecomposeProgressPath,
  parseFrontmatter,
} from './spec-review/spec-metadata.js';
export type { InitSpecMetadataOptions } from './spec-review/spec-metadata.js';

// Review Logger
export { saveReviewLog } from './spec-review/review-logger.js';
export type { ReviewLogInput, ReviewLogPaths } from './spec-review/review-logger.js';

// Session File
export {
  loadSession,
  saveSession,
  getSessionPath,
  getAllSessionStatuses,
  computeContentHash,
} from './spec-review/session-file.js';

// Chat Runner
export { runChatMessageStream, loadSpecContent, isSessionInitialized } from './spec-review/chat-runner.js';
export type { ChatRunnerOptions, ChatResponse } from './spec-review/chat-runner.js';

// Splitter
export { executeSplit, buildSplitContent, buildSplitHeader, extractSection } from './spec-review/splitter.js';

// Aggregator
export { aggregateResults } from './spec-review/aggregator.js';

// Ralph Loop
export type { LoopOptions, LoopResult } from './ralph-loop/runner.js';
export { runRalphLoop } from './ralph-loop/runner.js';

// Loop Limiter
export { calculateLoopLimit } from './ralph-loop/loop-limit.js';

// Task Queue Manager
export {
  initTaskQueue,
  loadTaskQueue,
  saveTaskQueue,
  getOrCreateTaskQueue,
  getQueuePath,
  addTaskToQueue,
  addTasksToQueue,
  removeTaskFromQueue,
  getNextQueuedTask,
  markTaskRunning,
  markTaskQueued,
  markTaskCompleted,
  markTaskFailed,
  markTaskSkipped,
  getQueueStats,
  clearRunningTasks,
  clearCompletedTasks,
  reorderQueue,
  loadTaskFromSpec,
  loadQueueWithTaskData,
  loadQueueAsPRDData,
  isTaskInQueue,
  getTaskQueuePosition,
  reconcileQueueState,
} from './task-queue/queue-manager.js';

// Completion Chain
export {
  processTaskCompletion,
  markUserStoriesAchieved,
  checkUserStoryAchieved,
  calculatePrdProgress,
  getTasksAchievingStory,
  recalculatePrdAchievements,
} from './task-queue/completion-chain.js';

// Tech Spec Generator
export { generateTechSpec } from './tech-spec/generator.js';
export type { TechSpecGenerateOptions, TechSpecGenerateResult } from './tech-spec/generator.js';

// Claude Types
export type {
  AssistantMessage,
  ParsedOutput,
  ResultMessage,
  StreamCallbacks,
  SystemMessage,
  TextBlock,
  ToolCall,
  ToolResultBlock,
  ToolUseBlock,
  UserMessage,
} from './claude/types.js';

// Claude Stream Parser
export {
  parseStream,
  createConsoleCallbacks,
  createSilentCallbacks,
  createProgressCallbacks,
} from './claude/stream-parser.js';

// Claude Runner
export { runClaude, isClaudeAvailable } from './claude/runner.js';
export type { RunOptions, RunResult } from './claude/runner.js';

// Additional CLI detection exports
export {
  detectModels,
  detectAllModels,
  parseCodexVersion,
  parseClaudeVersion,
} from './cli-detect.js';
export type { ModelDetectionResult, AllModelDetectionResults } from './cli-detect.js';

// Task Feedback
export { runTaskFeedback } from './decompose/task-feedback.js';
export type { TaskFeedbackOptions, TaskFeedbackResult } from './decompose/task-feedback.js';
