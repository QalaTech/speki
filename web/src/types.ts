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
}

export interface DecomposeFeedback {
  verdict: 'PASS' | 'FAIL' | 'UNKNOWN';
  missingRequirements?: (string | FeedbackItem)[];
  contradictions?: (string | FeedbackItem)[];
  dependencyErrors?: (string | FeedbackItem)[];
  duplicates?: (string | FeedbackItem)[];
  suggestions?: FeedbackItem[];
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
