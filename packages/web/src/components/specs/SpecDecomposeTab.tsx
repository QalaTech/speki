import {
  ArrowPathIcon,
  PlayIcon,
  QueueListIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useMemo, useState } from "react";
import { useDecomposeSSE } from "../../hooks/useDecomposeSSE";
import { apiFetch } from "../ui/ErrorContext";
import type { QueuedTaskReference, UserStory, DecomposeFeedback, FeedbackItem } from "../../types";
import { Button } from "../ui/Button";
import { Alert } from "../ui/Alert";
import { Badge } from "../ui/Badge";
import { TaskListSkeleton } from "../shared/SpecSkeleton";
import { toast } from "sonner";
import { UseCaseList } from "./UseCaseList";

type SpecType = "prd" | "tech-spec" | "bug";

interface Props {
  specPath: string;
  projectPath: string;
  specType?: SpecType;
  onCreateTechSpec?: () => void;
  onQuickExecute?: () => void;
  isGeneratingTechSpec?: boolean;
  onDecomposeComplete?: () => void;
  onRunQueue?: () => void;
}

// Derive specId from specPath (filename without .md extension, but keep .tech/.prd/.bug)
function getSpecId(specPath: string): string {
  const filename = specPath.split("/").pop() || specPath;
  return filename.replace(/\.md$/i, "");
}

function formatFeedbackItem(item: string | FeedbackItem): string {
  if (typeof item === "string") return item;
  const parts: string[] = [];
  if (item.severity) parts.push(`[${item.severity.toUpperCase()}]`);
  if (item.taskId) parts.push(`[${item.taskId}]`);
  if (item.taskIds) parts.push(`[${item.taskIds.join(", ")}]`);
  if (item.requirement) parts.push(item.requirement);
  if (item.description) parts.push(item.description);
  if (item.issue) parts.push(item.issue);
  if (item.reason) parts.push(item.reason);
  if (item.action) parts.push(`Action: ${item.action}`);
  if (item.suggestedFix) parts.push(`Fix: ${item.suggestedFix}`);
  if (item.prdSection) parts.push(`(PRD: ${item.prdSection})`);
  if (item.dependsOn) parts.push(`depends on: ${item.dependsOn}`);
  return parts.join(" ");
}

function FeedbackSection({ label, items, icon }: { label: string; items?: (string | FeedbackItem)[]; icon: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
        <span>{icon}</span> {label}
        <Badge variant="ghost" size="xs">{items.length}</Badge>
      </div>
      <ul className="space-y-1.5 text-sm">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 items-start">
            <span className="text-muted-foreground/40 mt-0.5">•</span>
            <span className="text-foreground/80">{formatFeedbackItem(item)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReviewFeedbackPanel({ feedback }: { feedback: DecomposeFeedback }) {
  const hasFeedback =
    (feedback.missingRequirements?.length ?? 0) > 0 ||
    (feedback.contradictions?.length ?? 0) > 0 ||
    (feedback.dependencyErrors?.length ?? 0) > 0 ||
    (feedback.duplicates?.length ?? 0) > 0 ||
    (feedback.suggestions?.length ?? 0) > 0 ||
    (feedback.issues?.length ?? 0) > 0;

  if (!hasFeedback) return null;

  return (
    <div className="bg-muted border border-error/20 rounded-lg p-4 my-3 space-y-4">
      <div className="text-sm font-bold text-error/80">Review Feedback</div>
      <FeedbackSection label="Missing Requirements" items={feedback.missingRequirements} icon="⚠" />
      <FeedbackSection label="Contradictions" items={feedback.contradictions} icon="⊘" />
      <FeedbackSection label="Dependency Errors" items={feedback.dependencyErrors} icon="⛓" />
      <FeedbackSection label="Duplicates" items={feedback.duplicates} icon="⧉" />
      <FeedbackSection label="Suggestions" items={feedback.suggestions} icon="💡" />
      {feedback.issues && feedback.issues.length > 0 && (
        <FeedbackSection label="Other Issues" items={feedback.issues} icon="ℹ" />
      )}
    </div>
  );
}

export function SpecDecomposeTab({
  specPath,
  projectPath,
  specType = "prd",
  onDecomposeComplete,
  onRunQueue,
}: Props) {
  const specId = useMemo(() => getSpecId(specPath), [specPath]);
  const [stories, setStories] = useState<UserStory[]>([]);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [specStatus, setSpecStatus] = useState<
    "pending" | "partial" | "completed" | null
  >(null);
  const [specStatusMessage, setSpecStatusMessage] = useState<string | null>(
    null,
  );
  const [branch] = useState("");
  const [activateLoading, setActivateLoading] = useState(false);

  // Review feedback state
  const [reviewFeedback, setReviewFeedback] = useState<DecomposeFeedback | null>(null);
  const [reviewVerdict, setReviewVerdict] = useState<'PASS' | 'FAIL' | 'UNKNOWN' | 'SKIPPED' | null>(null);


  // Queue state
  const [queueTasks, setQueueTasks] = useState<QueuedTaskReference[]>([]);
  const [queueLoading, setQueueLoading] = useState<Set<string>>(new Set());

  // Get decompose state from SSE
  const decomposeState = useDecomposeSSE(projectPath);

  // Load initial state
  useEffect(() => {
    if (specId) {
      loadDecomposeState();
      loadQueueTasks();
    }
  }, [specId]);

  // Listen for SSE updates - only for this spec
  useEffect(() => {
    if (!decomposeState) return;

    // Only react to events for this spec (prdFile matches specPath)
    const isForThisSpec =
      decomposeState.prdFile === specPath ||
      decomposeState.prdFile?.endsWith(specPath) ||
      specPath.endsWith(decomposeState.prdFile || "");

    if (!isForThisSpec) return;

    if (decomposeState.error) {
      setError(decomposeState.error);
      setIsLoading(false);
    }
    const activeStatuses = [
      "STARTING",
      "INITIALIZING",
      "DECOMPOSING",
      "REVIEWING",
      "REVISING",
    ];
    if (activeStatuses.includes(decomposeState.status)) {
      setIsLoading(true);
      // Load tasks when entering review phase so they display during review
      if (decomposeState.status === 'REVIEWING' || decomposeState.status === 'REVISING') {
        loadDecomposeState();
      }
    } else if (
      decomposeState.status === "COMPLETED" ||
      decomposeState.status === "DECOMPOSED"
    ) {
      setIsLoading(false);
      // Reload data when decompose completes
      loadDecomposeState();
      // Notify parent so it can update button visibility
      onDecomposeComplete?.();
    }
  }, [decomposeState, specPath]);

  const loadDecomposeState = async () => {
    try {
      const params = new URLSearchParams({
        specPath: specPath,
        project: projectPath,
      });
      const res = await apiFetch(`/api/decompose/draft?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (data.draft) {
          setStories(data.draft.userStories || []);
          setSpecStatus(data.draft.status || null);
          setSpecStatusMessage(data.draft.statusMessage || null);
          // completedIds is populated from queue tasks in loadQueueTasks
        }
      }

      // Load decompose state (verdict and active status)
      const stateRes = await apiFetch(`/api/decompose/state?${params}`);
      if (stateRes.ok) {
        const stateData = await stateRes.json();
        setReviewVerdict(stateData.verdict || null);
        // Restore loading state if decomposition is in progress
        const activeStatuses = ['STARTING', 'INITIALIZING', 'DECOMPOSING', 'REVIEWING', 'REVISING'];
        if (activeStatuses.includes(stateData.status)) {
          setIsLoading(true);
        }
      }

      // Load review feedback
      const feedbackRes = await apiFetch(`/api/decompose/feedback?${params}`);
      if (feedbackRes.ok) {
        const feedbackData = await feedbackRes.json();
        setReviewFeedback(feedbackData.feedback || null);
      }
    } catch (err) {
      console.error("Failed to load decompose state:", err);
    }
  };

  const loadQueueTasks = async () => {
    try {
      const params = new URLSearchParams({ project: projectPath });
      const res = await apiFetch(`/api/queue/with-tasks?${params}`);
      if (res.ok) {
        const data = await res.json();
        // Filter tasks for this specific spec
        const allTasks = data.queue || [];
        const specTasks = allTasks.filter(
          (t: QueuedTaskReference) => t.specId === specId,
        );
        setQueueTasks(specTasks);

        // Update completedIds from queue status
        const completed = new Set<string>(
          specTasks
            .filter((t: QueuedTaskReference) => t.status === "completed")
            .map((t: QueuedTaskReference) => t.taskId),
        );
        setCompletedIds(completed);
      }
    } catch (err) {
      console.error("Failed to load queue tasks:", err);
    }
  };

  const handleDecompose = async (force: boolean = false) => {
    if (!specPath) return;

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ project: projectPath });
      const res = await apiFetch(`/api/decompose/start?${params}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prdFile: specPath,
          forceRedecompose: force,
          branchName: branch || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Decompose failed");
      }

      // SSE will update the state
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsLoading(false);
    }
  };

  const handleActivateAndRun = async () => {
    if (!specId) return;

    setActivateLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ project: projectPath, specPath });

      // Activate the spec first
      await apiFetch(`/api/decompose/activate?${params}`, {
        method: "POST",
      });

      // Then start the queue
      await apiFetch(`/api/queue/quick-start?${params}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specId }),
      });

      // Navigate to execution view
      onRunQueue?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setActivateLoading(false);
    }
  };

  const handleAddToQueue = async (taskId: string) => {
    if (!specId) return;

    setQueueLoading((prev) => new Set(prev).add(taskId));

    try {
      const params = new URLSearchParams({ project: projectPath });
      const res = await apiFetch(`/api/queue/add?${params}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specId, taskId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add to queue");
      }

      // Refresh queue tasks
      await loadQueueTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setQueueLoading((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  };

  const handleRemoveFromQueue = async (taskId: string) => {
    if (!specId) return;

    setQueueLoading((prev) => new Set(prev).add(taskId));

    try {
      const params = new URLSearchParams({ project: projectPath });
      const res = await apiFetch(`/api/queue/${specId}/${taskId}?${params}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove from queue");
      }

      // Refresh queue tasks
      await loadQueueTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setQueueLoading((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  };

  const handleAddAllToQueue = async () => {
    if (!specId) return;

    // Get all unqueued, incomplete tasks
    const tasksToAdd = stories.filter((s) => !s.passes && !isTaskQueued(s.id));

    for (const task of tasksToAdd) {
      await handleAddToQueue(task.id);
    }
  };

  const handleSaveTask = async (updatedTask: UserStory) => {
    if (!specId) return;

    try {
      // Call API to update task
      const params = new URLSearchParams({ project: projectPath });
      const res = await apiFetch(`/api/decompose/update-task?${params}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specId, task: updatedTask }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save task");
      }

      // Update in local state
      setStories((prev) =>
        prev.map((s) => (s.id === updatedTask.id ? updatedTask : s)),
      );
      toast.success("Task saved successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save task");
      throw err; // Re-throw so the component knows save failed
    }
  };


  const isTaskQueued = (taskId: string) =>
    queueTasks.some((t) => t.taskId === taskId);
  const getQueuePosition = (taskId: string) => {
    const pending = queueTasks.filter(
      (t) => t.status === "queued" || t.status === "running",
    );
    const idx = pending.findIndex((t) => t.taskId === taskId);
    return idx >= 0 ? idx + 1 : null;
  };
  const getQueuedTaskStatus = (taskId: string) =>
    queueTasks.find((t) => t.taskId === taskId)?.status || "pending";

  const hasBeenDecomposed = stories.length > 0;
  const canActivate =
    specType === "tech-spec" &&
    hasBeenDecomposed &&
    queueTasks.some((t) => t.status === "queued");

  // Calculate review status for inline display
  const completedCount = stories.filter((s) => s.passes || completedIds.has(s.id)).length;
  const reviewStatusText = reviewVerdict === 'PASS'
    ? 'Reviewed'
    : reviewVerdict === 'FAIL'
      ? 'Needs revision'
      : null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Error display */}
      {error && (
        <Alert variant="error" className="my-2 shrink-0">
          {error}
        </Alert>
      )}

      {/* Review feedback details - only show if failed */}
      {reviewFeedback && reviewVerdict === 'FAIL' && (
        <div className="shrink-0">
          <ReviewFeedbackPanel feedback={reviewFeedback} />
        </div>
      )}

      {/* Seamless document content - full width, no wrapper */}
      <div className="flex-1 overflow-y-auto decompose-scrollbar">
        {/* Header styled like prose h2 - matching markdown editor */}
        <div className="flex items-baseline gap-3 mb-3 pb-[0.5em] border-b border-border/70">
          <h2 className="m-0 text-[1.5em] font-semibold font-[Poppins,system-ui,sans-serif] tracking-[-0.02em] leading-tight" style={{ color: '#7AB0F9' }}>
            {specType === "prd" ? "Use Cases" : "Tasks"}
          </h2>
          {hasBeenDecomposed && (
            <>
              <span className="text-muted-foreground text-sm">
                {completedCount}/{stories.length}
              </span>
              {reviewStatusText && (
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  reviewVerdict === 'PASS'
                    ? 'bg-success/10 text-success'
                    : 'bg-warning/10 text-warning'
                }`}>
                  {reviewStatusText}
                </span>
              )}
            </>
          )}
          {/* Action buttons - subtle, inline */}
          <div className="flex-1" />
          {isLoading ? (
            <div className="flex items-center gap-2 text-primary text-xs h-6 px-2">
              <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span>
                {decomposeState?.status === 'REVIEWING' || decomposeState?.status === 'REVISING'
                  ? 'Reviewing...'
                  : 'Generating...'}
              </span>
            </div>
          ) : hasBeenDecomposed ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDecompose(true)}
              isLoading={activateLoading}
              disabled={activateLoading}
              className="h-6 text-[10px] text-muted-foreground hover:text-foreground px-2"
            >
              {!activateLoading && <ArrowPathIcon className="h-3 w-3 mr-1" />}
              Regenerate
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDecompose(false)}
              className="h-6 text-[10px] text-primary px-2"
            >
              <SparklesIcon className="h-3 w-3 mr-1" />
              Generate
            </Button>
          )}
          {/* Queue actions for tech specs */}
          {specType === "tech-spec" && hasBeenDecomposed && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleAddAllToQueue}
                isLoading={queueLoading.size > 0}
                disabled={stories.every((s) => s.passes || isTaskQueued(s.id))}
                  className="h-6 text-[10px] text-muted-foreground hover:text-foreground px-2"
                >
                  <QueueListIcon className="h-3 w-3 mr-1" />
                  Queue All
                </Button>
                {canActivate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleActivateAndRun}
                    isLoading={activateLoading}
                    className="h-6 text-[10px] text-primary px-2"
                  >
                    <PlayIcon className="h-3 w-3 mr-1" />
                    Run
                  </Button>
                )}
              </>
            )}
          </div>

        {/* Loading skeleton */}
        {isLoading && !hasBeenDecomposed && (
          <TaskListSkeleton />
        )}

        {/* Use case list - collapsible by default */}
        {hasBeenDecomposed && (
          <UseCaseList
            stories={stories}
            completedIds={completedIds}
            specType={specType}
            isQueued={isTaskQueued}
            getQueuePosition={getQueuePosition}
            getQueuedTaskStatus={getQueuedTaskStatus}
            onAddToQueue={handleAddToQueue}
            onRemoveFromQueue={handleRemoveFromQueue}
            queueLoading={queueLoading}
            onSaveTask={handleSaveTask}
          />
        )}

        {/* Empty state - minimal */}
        {!hasBeenDecomposed && !isLoading && (
          <p className="text-muted-foreground text-sm italic py-4">
            No {specType === "prd" ? "use cases" : "tasks"} yet. Click Generate to create them from this spec.
          </p>
        )}

        {/* Status messages */}
        {specStatus === "completed" && stories.length === 0 && (
          <p className="text-success text-sm">
            ✓ {specStatusMessage || "Spec completed"}
          </p>
        )}
        {specStatus === "partial" && (
          <p className="text-warning text-sm">
            ○ {specStatusMessage || "Partially completed"}
          </p>
        )}
      </div>
    </div>
  );
}
