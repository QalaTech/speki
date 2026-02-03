/**
 * Shared types for spec explorer components and hooks.
 */

export type SuggestionTag =
  | 'security'
  | 'performance'
  | 'scalability'
  | 'data'
  | 'api'
  | 'ux'
  | 'accessibility'
  | 'architecture'
  | 'testing'
  | 'infrastructure'
  | 'error-handling'
  | 'documentation';

export interface Suggestion {
  id: string;
  type?: 'change' | 'comment';
  severity: 'critical' | 'warning' | 'info';
  // Data can come in two formats - handle both
  location?: { section: string; lineStart?: number; lineEnd?: number };
  section?: string;
  lineStart?: number | null;
  lineEnd?: number | null;
  issue: string;
  suggestedFix: string;
  status: 'pending' | 'approved' | 'rejected' | 'edited' | 'dismissed' | 'resolved';
  tags?: SuggestionTag[];
}

export interface ReviewResult {
  verdict: 'PASS' | 'FAIL' | 'NEEDS_IMPROVEMENT' | 'SPLIT_RECOMMENDED';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  suggestionId?: string;
}

export interface SpecSession {
  sessionId: string;
  status: 'in_progress' | 'completed' | 'needs_attention';
  suggestions: Suggestion[];
  reviewResult: ReviewResult | null;
  chatMessages: ChatMessage[];
}

export type SpecType = 'prd' | 'tech-spec' | 'bug';

export type ReviewStatus = 'reviewed' | 'pending' | 'god-spec' | 'in-progress' | 'none';

export interface SpecFileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: SpecFileNode[];
  reviewStatus?: ReviewStatus;
  specType?: SpecType;
  /** Progress for PRDs: completed user stories / total */
  progress?: { completed: number; total: number };
  /** Linked child specs (tech specs under PRDs) */
  linkedSpecs?: SpecFileNode[];
  /** Parent spec ID (for tech specs linked to PRDs) */
  parentSpecId?: string;
  /** Whether this is a placeholder for a generating spec */
  isGenerating?: boolean;
}

export interface DiffOverlayState {
  isOpen: boolean;
  suggestion: Suggestion | null;
  originalText: string;
  proposedText: string;
}

export interface GeneratingTechSpecInfo {
  parentPath: string;
  name: string;
}

/**
 * Helper to get location info from a suggestion (handles both formats)
 */
export function getSuggestionLocation(suggestion: Suggestion) {
  return {
    section: suggestion.section ?? suggestion.location?.section,
    lineStart: suggestion.lineStart ?? suggestion.location?.lineStart,
    lineEnd: suggestion.lineEnd ?? suggestion.location?.lineEnd,
  };
}

/**
 * Detect spec type from filename
 */
export function getSpecTypeFromFilename(filename: string): SpecType {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.prd.md')) return 'prd';
  if (lower.endsWith('.tech.md')) return 'tech-spec';
  if (lower.endsWith('.bug.md')) return 'bug';
  return 'prd';
}
