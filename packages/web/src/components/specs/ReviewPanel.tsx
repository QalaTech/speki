/**
 * Review panel for spec review suggestions - renders as a full-height sidebar.
 */
import {
  ArrowPathIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  DocumentMagnifyingGlassIcon,
  SparklesIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { CheckCircleIcon as CheckCircleSolidIcon } from "@heroicons/react/24/solid";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Loading } from "../ui/Loading";
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

const severityVariants: Record<string, "error" | "warning" | "info" | "ghost"> = {
  critical: "error",
  major: "warning",
  minor: "info",
  suggestion: "ghost",
};

const statusColors: Record<string, string> = {
  approved: "text-success",
  rejected: "text-error",
  edited: "text-info",
  dismissed: "text-muted-foreground/40",
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
    <div className="flex flex-col h-full w-80 border-l border-border bg-surface overflow-hidden animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          {onCollapse && (
            <button
              className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all duration-200 active:scale-95"
              onClick={onCollapse}
              title="Collapse panel"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          )}
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-bold text-foreground tracking-tight font-poppins">
              AI Review
            </h3>
            {session?.status === "in_progress" && (
               <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
            )}
          </div>
        </div>
        {session && (
          <button
            className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all duration-200 active:scale-95"
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
          <div className="flex flex-col items-center justify-center h-full text-center gap-4 animate-fade-in">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 ring-1 ring-primary/20 shadow-glow-white">
              <Loading size="lg" className="text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground tracking-tight">Running AI Review...</p>
              <p className="text-xs text-muted-foreground">
                Analyzing your specs for improvements
              </p>
            </div>
          </div>
        ) : !session || !session.reviewResult ? (
          // Empty state - no review yet (or completed without results)
          <div className="flex flex-col items-center justify-center h-full text-center gap-6 animate-fade-in">
            <div className="relative group">
              <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative p-5 rounded-3xl bg-secondary ring-1 ring-border shadow-xl">
                <SparklesIcon className="h-8 w-8 text-primary" />
              </div>
            </div>
            <div className="space-y-2 max-w-[200px]">
              <h4 className="text-base font-bold text-foreground tracking-tight">
                AI Spec Review
              </h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Get instant feedback on your PRD structure, clarity, and completeness.
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              className="rounded-full shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all duration-300 transform hover:-translate-y-0.5"
              onClick={() => onStartReview(false)}
              isLoading={isStartingReview}
            >
              <SparklesIcon className="h-4 w-4" />
              Start Review
            </Button>
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
                      <span className="text-xs text-muted-foreground">
                        No issues found
                      </span>
                    )}
                  {allAddressed && (
                    <span className="text-xs text-muted-foreground">
                      {totalCount} suggestion{totalCount !== 1 ? "s" : ""} resolved
                    </span>
                  )}
                  {!allAddressed && session.suggestions.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {pendingCount} of {totalCount} pending
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Pending count */}
            {pendingCount > 0 && (
              <div className="text-xs text-muted-foreground">
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
                      <Badge
                        variant={selectedTagFilters.has(tag) ? "primary" : "outline"}
                        size="sm"
                        className="cursor-pointer"
                      >
                        {tag}
                      </Badge>
                    </button>
                  ))}
                {selectedTagFilters.size > 0 && (
                  <button onClick={() => onTagFilterChange(new Set())}>
                    <Badge variant="ghost" size="sm" className="cursor-pointer">
                      Clear
                    </Badge>
                  </button>
                )}
              </div>
            )}

            {/* Suggestions list */}
            <div className="flex flex-col gap-3 animate-stagger-in">
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
                    className={`p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-all duration-300 ${
                      isClickable
                        ? "cursor-pointer hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5"
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
                    <div className="gap-2">
                      {/* Header */}
                      <div className="flex flex-col items-start gap-2 flex-wrap">
                        <Badge
                          variant={severityVariants[suggestion.severity] || "ghost"}
                          size="xs"
                        >
                          {suggestion.severity}
                        </Badge>
                        {section && (
                          <span className="text-xs text-muted-foreground truncate">
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
                            <Badge key={tag} variant="outline" size="xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* Issue text */}
                      <p className="text-sm text-foreground">
                        {suggestion.issue}
                      </p>

                      {/* Actions */}
                      {suggestion.status === "pending" && (
                        <div
                          className="mt-2 pt-2 border-t border-border/5 flex items-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-3 rounded-full text-xs hover:bg-primary/10 hover:text-primary"
                            onClick={() => onDiscussSuggestion(suggestion)}
                          >
                            <ChatBubbleLeftRightIcon className="h-3.5 w-3.5" />
                            Discuss
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-3 rounded-full text-xs hover:bg-success/10 hover:text-success"
                            onClick={() => onResolveSuggestion(suggestion.id)}
                          >
                            <CheckCircleSolidIcon className="h-3.5 w-3.5" />
                            Resolve
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-3 rounded-full text-xs hover:bg-foreground/5 text-foreground/40"
                            onClick={() => onDismissSuggestion(suggestion.id)}
                          >
                            Dismiss
                          </Button>
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
