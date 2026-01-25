/**
 * Review panel for spec review suggestions - renders as a full-height sidebar.
 */
import {
  ArrowPathIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  DocumentMagnifyingGlassIcon,
  EyeSlashIcon,
  MagnifyingGlassIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { CheckCircleIcon as CheckCircleSolidIcon } from "@heroicons/react/24/solid";
import type { SpecEditorRef } from "../shared/SpecEditor";
import type { SpecSession, Suggestion, SuggestionTag } from "./types";
import { getSuggestionLocation } from "./types";

interface ReviewPanelProps {
  session: SpecSession | null;
  isStartingReview: boolean;
  selectedTagFilters: Set<SuggestionTag>;
  onTagFilterChange: (filters: Set<SuggestionTag>) => void;
  onStartReview: (reuse: boolean) => Promise<void>;
  onDiscussSuggestion: (suggestion: Suggestion) => void;
  onResolveSuggestion: (suggestionId: string) => void;
  onDismissSuggestion: (suggestionId: string) => void;
  editorRef?: React.RefObject<SpecEditorRef | null>;
  onCollapse?: () => void;
}

const severityColors: Record<string, string> = {
  critical: "badge-error",
  major: "badge-warning",
  minor: "badge-info",
  suggestion: "badge-ghost",
};

const statusColors: Record<string, string> = {
  approved: "text-success",
  rejected: "text-error",
  edited: "text-info",
  dismissed: "text-base-content/40",
  resolved: "text-success",
};

export function ReviewPanel({
  session,
  isStartingReview,
  selectedTagFilters,
  onTagFilterChange,
  onStartReview,
  onDiscussSuggestion,
  onResolveSuggestion,
  onDismissSuggestion,
  editorRef,
  onCollapse,
}: ReviewPanelProps) {
  // Get all unique tags from suggestions
  const allTags = new Set<SuggestionTag>();
  session?.suggestions.forEach((s) => s.tags?.forEach((t) => allTags.add(t)));

  // Filter suggestions by selected tags and exclude dismissed/resolved
  const filteredSuggestions =
    session?.suggestions.filter((suggestion) => {
      // Hide dismissed and resolved suggestions
      if (suggestion.status === "dismissed" || suggestion.status === "resolved") return false;
      // Filter by tags if any selected
      if (selectedTagFilters.size === 0) return true;
      return (
        suggestion.tags?.some((tag) => selectedTagFilters.has(tag)) ?? false
      );
    }) ?? [];

  const pendingCount =
    session?.suggestions.filter((s) => s.status === "pending").length ?? 0;
  const totalCount = session?.suggestions.length ?? 0;
  const allAddressed = totalCount > 0 && pendingCount === 0;

  return (
    <div className="flex flex-col h-full w-80 bg-gradient-to-b from-base-200 to-base-200/80 border-l border-base-content/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-base-content/5 bg-base-200/50 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          {onCollapse && (
            <button
              className="btn btn-ghost btn-xs btn-circle hover:bg-base-300/50"
              onClick={onCollapse}
              title="Collapse panel"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          )}
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 ring-1 ring-primary/20">
              <MagnifyingGlassIcon className="h-4 w-4 text-primary" />
            </div>
            <h3 className="text-sm font-semibold text-base-content tracking-tight">
              AI Review
            </h3>
          </div>
        </div>
        {session && (
          <button
            className="btn btn-ghost btn-xs btn-circle hover:bg-primary/10 hover:text-primary transition-all duration-200"
            onClick={() => onStartReview(true)}
            disabled={isStartingReview}
            title="Run a fresh review"
          >
            <ArrowPathIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Check in_progress first, then no review, then has results */}
        {isStartingReview || session?.status === "in_progress" ? (
          // In progress state
          <div className="flex flex-col items-center justify-center h-full text-center gap-4">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 ring-1 ring-primary/20">
              <span className="loading loading-spinner loading-lg text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-base-content">Running AI Review...</p>
              <p className="text-xs text-base-content/50">
                This may take 2-5 minutes
              </p>
            </div>
          </div>
        ) : !session || !session.reviewResult ? (
          // Empty state - no review yet (or completed without results)
          <div className="flex flex-col items-center justify-center h-full text-center gap-4">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-base-300/50 to-base-300/30 ring-1 ring-base-content/5">
              <DocumentMagnifyingGlassIcon className="h-10 w-10 text-base-content/30" />
            </div>
            <div className="space-y-1">
              <h4 className="text-base font-semibold text-base-content">
                No Review Yet
              </h4>
              <p className="text-sm text-base-content/50 max-w-[200px] leading-relaxed">
                Get AI-powered suggestions to improve this spec
              </p>
            </div>
            <button
              className="btn btn-glass-primary btn-sm gap-2 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-all duration-200"
              onClick={() => onStartReview(false)}
              disabled={isStartingReview}
            >
              <MagnifyingGlassIcon className="h-4 w-4" />
              Start Review
            </button>
          </div>
        ) : (
          // Has results (session && session.reviewResult is guaranteed here)
          <div className="flex flex-col gap-4">
            {/* Verdict display */}
            {session.reviewResult?.verdict && (
              <div
                className={`flex items-center gap-3 p-3 rounded-xl border ${
                  allAddressed || session.reviewResult.verdict === "PASS"
                    ? "bg-success/10 border-success/20"
                    : session.reviewResult.verdict === "FAIL"
                      ? "bg-error/10 border-error/20"
                      : "bg-warning/10 border-warning/20"
                }`}
              >
                <div
                  className={`p-2 rounded-lg ${
                    allAddressed || session.reviewResult.verdict === "PASS"
                      ? "bg-success/20"
                      : session.reviewResult.verdict === "FAIL"
                        ? "bg-error/20"
                        : "bg-warning/20"
                  }`}
                >
                  {allAddressed || session.reviewResult.verdict === "PASS" ? (
                    <CheckCircleIcon className="h-5 w-5 text-success" />
                  ) : session.reviewResult.verdict === "FAIL" ? (
                    <XCircleIcon className="h-5 w-5 text-error" />
                  ) : (
                    <DocumentMagnifyingGlassIcon className="h-5 w-5 text-warning" />
                  )}
                </div>
                <div className="flex flex-col">
                  <span
                    className={`text-sm font-semibold ${
                      allAddressed || session.reviewResult.verdict === "PASS"
                        ? "text-success"
                        : session.reviewResult.verdict === "FAIL"
                          ? "text-error"
                          : "text-warning"
                    }`}
                  >
                    {allAddressed
                      ? "All Addressed"
                      : session.reviewResult.verdict === "PASS"
                        ? "Review Passed"
                        : session.reviewResult.verdict === "FAIL"
                          ? "Review Failed"
                          : "Needs Attention"}
                  </span>
                  {session.suggestions.length === 0 &&
                    session.reviewResult.verdict === "PASS" && (
                      <span className="text-xs text-base-content/50">
                        No issues found
                      </span>
                    )}
                  {allAddressed && (
                    <span className="text-xs text-base-content/50">
                      {totalCount} suggestion{totalCount !== 1 ? "s" : ""} resolved
                    </span>
                  )}
                  {!allAddressed && session.suggestions.length > 0 && (
                    <span className="text-xs text-base-content/50">
                      {pendingCount} of {totalCount} pending
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Pending count */}
            {pendingCount > 0 && (
              <div className="text-xs text-base-content/60">
                {pendingCount} pending suggestion{pendingCount !== 1 ? "s" : ""}
              </div>
            )}

            {/* Tag filters */}
            {allTags.size > 0 && (
              <div className="flex flex-wrap gap-1">
                {Array.from(allTags)
                  .sort()
                  .map((tag) => (
                    <button
                      key={tag}
                      className={`badge badge-sm cursor-pointer ${
                        selectedTagFilters.has(tag)
                          ? "badge-primary"
                          : "badge-outline"
                      }`}
                      onClick={() => {
                        const next = new Set(selectedTagFilters);
                        if (next.has(tag)) {
                          next.delete(tag);
                        } else {
                          next.add(tag);
                        }
                        onTagFilterChange(next);
                      }}
                    >
                      {tag}
                    </button>
                  ))}
                {selectedTagFilters.size > 0 && (
                  <button
                    className="badge badge-sm badge-ghost cursor-pointer"
                    onClick={() => onTagFilterChange(new Set())}
                  >
                    Clear
                  </button>
                )}
              </div>
            )}

            {/* Suggestions list */}
            <div className="flex flex-col gap-3">
              {filteredSuggestions.map((suggestion) => {
                const { section, lineStart, lineEnd } =
                  getSuggestionLocation(suggestion);
                const hasLineInfo = lineStart != null;
                const isClickable = section != null || hasLineInfo;

                const handleCardClick = () => {
                  if (editorRef?.current) {
                    if (section) {
                      editorRef.current.scrollToSection(section);
                    } else if (hasLineInfo) {
                      editorRef.current.scrollToLine(
                        lineStart!,
                        lineEnd ?? undefined,
                      );
                    }
                  }
                };

                return (
                  <div
                    key={suggestion.id}
                    className={`card card-compact bg-base-100/80 backdrop-blur-sm border border-base-content/5 shadow-sm hover:shadow-md transition-all duration-200 ${
                      isClickable
                        ? "cursor-pointer hover:bg-base-100 hover:border-primary/20"
                        : ""
                    } ${suggestion.status !== "pending" ? "opacity-50" : ""}`}
                    onClick={isClickable ? handleCardClick : undefined}
                    role={isClickable ? "button" : undefined}
                    tabIndex={isClickable ? 0 : undefined}
                    onKeyDown={
                      isClickable
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ")
                              handleCardClick();
                          }
                        : undefined
                    }
                  >
                    <div className="card-body gap-2">
                      {/* Header */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`badge badge-xs ${severityColors[suggestion.severity] || "badge-ghost"}`}
                        >
                          {suggestion.severity}
                        </span>
                        {section && (
                          <span className="text-xs text-base-content/60 truncate">
                            {section}
                            {lineStart && (
                              <span className="opacity-60">
                                {lineEnd && lineEnd !== lineStart
                                  ? ` L${lineStart}-${lineEnd}`
                                  : ` L${lineStart}`}
                              </span>
                            )}
                          </span>
                        )}
                        {suggestion.status !== "pending" && (
                          <span
                            className={`text-xs ${statusColors[suggestion.status] || ""}`}
                          >
                            {suggestion.status}
                          </span>
                        )}
                      </div>

                      {/* Tags */}
                      {suggestion.tags && suggestion.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {suggestion.tags.map((tag) => (
                            <span
                              key={tag}
                              className="badge badge-xs badge-outline"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Issue text */}
                      <p className="text-sm text-base-content">
                        {suggestion.issue}
                      </p>

                      {/* Actions */}
                      {suggestion.status === "pending" && (
                        <div
                          className="mt-2 pt-2 border-t border-base-content/5 flex items-center gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            className="btn btn-ghost btn-xs gap-1.5 hover:bg-primary/10 hover:text-primary transition-colors"
                            onClick={() => onDiscussSuggestion(suggestion)}
                          >
                            <ChatBubbleLeftRightIcon className="h-4 w-4" />
                            Discuss
                          </button>
                          <button
                            className="btn btn-ghost btn-xs gap-1.5 hover:bg-success/10 hover:text-success transition-colors"
                            onClick={() => onResolveSuggestion(suggestion.id)}
                            title="Mark as resolved"
                          >
                            <CheckCircleSolidIcon className="h-4 w-4" />
                            Resolve
                          </button>
                          <button
                            className="btn btn-ghost btn-xs gap-1.5 hover:bg-base-300/50 text-base-content/50 hover:text-base-content/70 transition-colors"
                            onClick={() => onDismissSuggestion(suggestion.id)}
                            title="Dismiss this suggestion"
                          >
                            <EyeSlashIcon className="h-4 w-4" />
                            Dismiss
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
