import {
  ArrowPathIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  LockClosedIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  QueueListIcon,
  SparklesIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDecomposeSSE } from "../../hooks/useDecomposeSSE";
import { apiFetch } from "../ui/ErrorContext";
import type { QueuedTaskReference, UserStory } from "../../types";
import { ChatMarkdown } from "../chat/ChatMarkdown";
import { SpecEditor, type SpecEditorRef } from "../shared/SpecEditor";

type SpecType = "prd" | "tech-spec" | "bug";

interface Props {
  specPath: string;
  projectPath: string;
  specType?: SpecType;
  onCreateTechSpec?: () => void;
  onQuickExecute?: () => void;
  isGeneratingTechSpec?: boolean;
}

// Derive specId from specPath (filename without .md extension, but keep .tech/.prd/.bug)
function getSpecId(specPath: string): string {
  const filename = specPath.split("/").pop() || specPath;
  return filename.replace(/\.md$/i, "");
}

export function SpecDecomposeTab({
  specPath,
  projectPath,
  specType = "prd",
}: Props) {
  const specId = useMemo(() => getSpecId(specPath), [specPath]);
  const [stories, setStories] = useState<UserStory[]>([]);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [specStatus, setSpecStatus] = useState<
    "pending" | "partial" | "completed" | null
  >(null);
  const [specStatusMessage, setSpecStatusMessage] = useState<string | null>(
    null,
  );
  const [branch, setBranch] = useState("");
  const [activateLoading, setActivateLoading] = useState(false);

  // Drawer/Editor state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<UserStory | null>(null);
  const [editContent, setEditContent] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const editorRef = useRef<SpecEditorRef>(null);

  // Convert task to markdown for editing
  const taskToMarkdown = (task: UserStory): string => {
    let md = `# ${task.title}\n\n`;
    md += `## Description\n\n${task.description}\n\n`;

    if (task.acceptanceCriteria.length > 0) {
      md += `## Acceptance Criteria\n\n`;
      task.acceptanceCriteria.forEach((ac) => {
        md += `- ${ac}\n`;
      });
      md += "\n";
    }

    if (task.testCases && task.testCases.length > 0) {
      md += `## Test Cases\n\n`;
      task.testCases.forEach((tc) => {
        md += `- \`${tc}\`\n`;
      });
      md += "\n";
    }

    if (task.dependencies.length > 0) {
      md += `## Dependencies\n\n`;
      task.dependencies.forEach((dep) => {
        md += `- ${dep}\n`;
      });
      md += "\n";
    }

    if (task.notes) {
      md += `## Notes\n\n${task.notes}\n`;
    }

    return md;
  };

  // Parse markdown back to task fields
  const markdownToTask = (md: string): Partial<UserStory> => {
    const lines = md.split("\n");
    const updates: Partial<UserStory> = {};

    let currentSection = "";
    let title = "";
    let description: string[] = [];
    let acceptanceCriteria: string[] = [];
    let testCases: string[] = [];
    let dependencies: string[] = [];
    let notes: string[] = [];

    for (const line of lines) {
      if (line.startsWith("# ")) {
        title = line.replace("# ", "").trim();
      } else if (line.startsWith("## Description")) {
        currentSection = "description";
      } else if (line.startsWith("## Acceptance Criteria")) {
        currentSection = "acceptanceCriteria";
      } else if (line.startsWith("## Test Cases")) {
        currentSection = "testCases";
      } else if (line.startsWith("## Dependencies")) {
        currentSection = "dependencies";
      } else if (line.startsWith("## Notes")) {
        currentSection = "notes";
      } else if (line.startsWith("## ")) {
        currentSection = "unknown";
      } else {
        const trimmed = line.trim();
        if (currentSection === "description" && trimmed) {
          description.push(trimmed);
        } else if (
          currentSection === "acceptanceCriteria" &&
          trimmed.startsWith("- ")
        ) {
          acceptanceCriteria.push(trimmed.replace(/^- /, ""));
        } else if (currentSection === "testCases" && trimmed.startsWith("- ")) {
          testCases.push(trimmed.replace(/^- `?|`$/g, ""));
        } else if (
          currentSection === "dependencies" &&
          trimmed.startsWith("- ")
        ) {
          dependencies.push(trimmed.replace(/^- /, ""));
        } else if (currentSection === "notes" && trimmed) {
          notes.push(trimmed);
        }
      }
    }

    if (title) updates.title = title;
    if (description.length > 0) updates.description = description.join("\n");
    if (acceptanceCriteria.length > 0)
      updates.acceptanceCriteria = acceptanceCriteria;
    if (testCases.length > 0) updates.testCases = testCases;
    if (dependencies.length > 0) updates.dependencies = dependencies;
    if (notes.length > 0) updates.notes = notes.join("\n");

    return updates;
  };

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
    } else if (
      decomposeState.status === "COMPLETED" ||
      decomposeState.status === "DECOMPOSED"
    ) {
      setIsLoading(false);
      // Reload data when decompose completes
      loadDecomposeState();
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
      const params = new URLSearchParams({ project: projectPath });

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

  const openTaskEditor = (task: UserStory) => {
    setSelectedTask(task);
    setEditContent(taskToMarkdown(task));
    setDrawerOpen(true);
    setSaveError(null);
    setSaveSuccess(false);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelectedTask(null);
    setEditContent("");
  };

  const handleSaveTask = async () => {
    if (!specId || !selectedTask) return;

    setSaveLoading(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      // Get content from editor
      const content = editorRef.current?.getMarkdown?.() || editContent;
      const updates = markdownToTask(content);

      // Merge updates with original task
      const updatedTask = { ...selectedTask, ...updates };

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
      setSelectedTask(updatedTask);
      setSaveSuccess(true);

      // Auto-close after success
      setTimeout(() => {
        closeDrawer();
      }, 1000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      closeDrawer();
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

  // Helper functions for styling
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircleIcon className="h-3 w-3" />;
      case "blocked":
        return <LockClosedIcon className="h-3 w-3" />;
      case "running":
        return <PlayIcon className="h-3 w-3" />;
      default:
        return <ClockIcon className="h-3 w-3" />;
    }
  };

  const getTaskStatus = (task: UserStory, completed: Set<string>): string => {
    if (task.passes || completed.has(task.id)) return "completed";
    const depsBlocked = task.dependencies.some((d) => !completed.has(d));
    if (depsBlocked) return "blocked";
    return "pending";
  };

  const getComplexityBadge = (complexity?: string) => {
    if (!complexity) return null;
    const complexityClasses: Record<string, string> = {
      low: "badge-success",
      medium: "badge-warning",
      high: "badge-error",
    };
    return (
      <span
        className={`badge badge-xs ${complexityClasses[complexity] || "badge-ghost"}`}
      >
        {complexity}
      </span>
    );
  };

  // Review status classes
  const getReviewStatusClasses = (reviewStatus: string) => {
    const classes: Record<string, string> = {
      passed: "badge badge-success badge-sm",
      needs_improvement: "badge badge-warning badge-sm",
      pending: "badge badge-ghost badge-sm",
    };
    return classes[reviewStatus] || "badge badge-ghost badge-sm";
  };

  // Queue badge classes
  const getQueueBadgeClasses = (queueStatus: string) => {
    const classes: Record<string, string> = {
      running: "badge badge-info badge-sm animate-pulse",
      completed: "badge badge-success badge-sm",
      queued: "badge badge-secondary badge-sm",
    };
    return classes[queueStatus] || "badge badge-ghost badge-sm";
  };

  // Button classes - using DaisyUI
  const btnPrimary = "btn btn-glass-primary gap-2";
  const btnSecondary = "btn btn-outline btn-secondary gap-2";

  return (
    <div className="flex flex-col h-full overflow-hidden p-6">
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-spin-slow {
          animation: spin 1s linear infinite;
        }
        .animate-slide-in {
          animation: slideIn 0.25s ease-out;
        }
        .decompose-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .decompose-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .decompose-scrollbar::-webkit-scrollbar-thumb {
          background: #30363d;
          border-radius: 4px;
        }
        .decompose-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #484f58;
        }
      `}</style>

      {/* Header */}
      <div className="flex-shrink-0 flex items-start justify-between gap-4 pb-4 border-b border-base-300">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-lg font-semibold text-base-content">
            {specType === "prd" ? "User Stories" : "Tasks"}
          </h2>
          <p className="text-base-content/60 text-sm m-0">
            {specType === "prd"
              ? "Break down this PRD into user stories"
              : "Break down this spec into implementable tasks"}
          </p>
          {hasBeenDecomposed && (
            <span className="text-base-content/60 text-xs mt-1">
              {stories.filter((s) => s.passes || completedIds.has(s.id)).length}{" "}
              / {stories.length} completed
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 flex-shrink-0 flex-wrap justify-end">
          {/* Tech spec queue actions */}
          {specType === "tech-spec" && hasBeenDecomposed && (
            <button
              className={btnPrimary}
              onClick={handleAddAllToQueue}
              disabled={
                queueLoading.size > 0 ||
                stories.every((s) => s.passes || isTaskQueued(s.id))
              }
            >
              {queueLoading.size > 0 ? (
                <>
                  <span className="loading loading-spinner loading-xs" />{" "}
                  Adding...
                </>
              ) : (
                <>
                  <QueueListIcon className="h-4 w-4" /> Add All to Queue
                </>
              )}
            </button>
          )}

          {canActivate && (
            <button
              className={btnSecondary}
              onClick={handleActivateAndRun}
              disabled={activateLoading}
            >
              {activateLoading ? (
                <>
                  <span className="loading loading-spinner loading-xs" />{" "}
                  Starting...
                </>
              ) : (
                <>
                  <PlayIcon className="h-4 w-4" /> Run Queue
                </>
              )}
            </button>
          )}
          {hasBeenDecomposed ? (
            <button
              className={btnSecondary}
              onClick={() => handleDecompose(true)}
              disabled={isLoading || activateLoading}
            >
              {isLoading ? (
                <>
                  <span className="loading loading-spinner loading-xs" />{" "}
                  Running...
                </>
              ) : (
                <>
                  <ArrowPathIcon className="h-4 w-4" />{" "}
                  {specType === "prd"
                    ? "Regenerate Stories"
                    : "Regenerate Tasks"}
                </>
              )}
            </button>
          ) : (
            <button
              className={btnPrimary}
              onClick={() => handleDecompose(false)}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <span className="loading loading-spinner loading-xs" />{" "}
                  Running...
                </>
              ) : (
                <>
                  <SparklesIcon className="h-4 w-4" />{" "}
                  {specType === "prd"
                    ? "Generate User Stories"
                    : "Generate Tasks"}
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Branch input */}
      <div className="flex items-center gap-3 py-3">
        <label className="text-base-content/60 text-sm font-medium whitespace-nowrap">
          Branch:
        </label>
        <input
          type="text"
          className="input input-bordered input-sm flex-1 max-w-xs"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          placeholder="ralph/feature"
          disabled={isLoading}
        />
      </div>

      {/* Progress indicator */}
      {isLoading && (
        <div className="alert alert-info my-3">
          <span className="loading loading-spinner loading-sm" />
          <div className="flex flex-col">
            <span className="font-medium">
              {decomposeState?.message ||
                (specType === "prd"
                  ? "Generating user stories..."
                  : "Generating tasks...")}
            </span>
            {!hasBeenDecomposed && (
              <span className="text-xs opacity-70">
                {specType === "prd"
                  ? "Stories will appear here once generation and review complete"
                  : "Tasks will appear here once generation completes"}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="alert alert-error my-3">
          <span>⚠</span>
          <span>{error}</span>
        </div>
      )}

      {/* Spec already completed message */}
      {specStatus === "completed" && stories.length === 0 && (
        <div className="alert alert-success my-3">
          <CheckCircleIcon className="h-5 w-5" />
          <div className="flex flex-col">
            <span className="font-medium">Spec Already Completed</span>
            {specStatusMessage && (
              <span className="text-sm opacity-80">{specStatusMessage}</span>
            )}
          </div>
        </div>
      )}

      {/* Partial completion message */}
      {specStatus === "partial" && (
        <div className="alert alert-warning my-3">
          <ClockIcon className="h-5 w-5" />
          <div className="flex flex-col">
            <span className="font-medium">Partially Completed</span>
            {specStatusMessage && (
              <span className="text-sm opacity-80">{specStatusMessage}</span>
            )}
          </div>
        </div>
      )}

      {/* Task list */}
      {/* Task List */}
      {hasBeenDecomposed && (
        <div className="flex-1 overflow-y-auto decompose-scrollbar flex flex-col gap-4 pt-4">
          {stories.map((story) => {
            const status = getTaskStatus(story, completedIds);
            const isExpanded = expandedTask === story.id;
            const isQueued = isTaskQueued(story.id);

            return (
              <div
                key={story.id}
                className={`card bg-base-200 shadow-sm ${
                  status === "completed"
                    ? "border-l-4 border-l-success opacity-75"
                    : status === "blocked"
                      ? "border-l-4 border-l-warning opacity-60"
                      : status === "running"
                        ? "border-l-4 border-l-info"
                        : "border-l-4 border-l-primary/50"
                } ${isQueued ? "ring-2 ring-info/50" : ""}`}
              >
                {/* Card Header - Always visible */}
                <div
                  className="card-body cursor-pointer hover:bg-base-300/50 transition-colors py-3 px-4"
                  onClick={() => setExpandedTask(isExpanded ? null : story.id)}
                >
                  <div className="flex items-center gap-3">
                    {/* Status indicator */}
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                        status === "completed"
                          ? "bg-success text-success-content"
                          : status === "blocked"
                            ? "bg-warning text-warning-content"
                            : status === "running"
                              ? "bg-info text-info-content animate-pulse"
                              : "bg-base-300 text-base-content/70"
                      }`}
                    >
                      {status === "completed" ? (
                        <CheckCircleIcon className="h-3.5 w-3.5" />
                      ) : status === "blocked" ? (
                        <LockClosedIcon className="h-3.5 w-3.5" />
                      ) : status === "running" ? (
                        <PlayIcon className="h-3.5 w-3.5" />
                      ) : (
                        <ClockIcon className="h-3.5 w-3.5" />
                      )}
                    </div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0 flex items-center gap-3">
                      {/* Badges first */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="badge badge-outline badge-xs font-mono">
                          {story.id}
                        </span>
                        {getComplexityBadge(story.complexity)}
                        {specType === "prd" && story.reviewStatus && (
                          <span
                            className={getReviewStatusClasses(
                              story.reviewStatus,
                            )}
                          >
                            {story.reviewStatus === "passed"
                              ? "✓"
                              : story.reviewStatus === "needs_improvement"
                                ? "⚠"
                                : "○"}
                          </span>
                        )}
                        {isQueued && (
                          <span
                            className={getQueueBadgeClasses(
                              getQueuedTaskStatus(story.id),
                            )}
                          >
                            {getQueuedTaskStatus(story.id) === "running"
                              ? "▶"
                              : getQueuedTaskStatus(story.id) === "completed"
                                ? "✓"
                                : `#${getQueuePosition(story.id)}`}
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <h3 className="card-title text-sm m-0 leading-normal truncate">
                        {story.title}
                      </h3>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        className="btn btn-ghost btn-xs gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          openTaskEditor(story);
                        }}
                        title="Edit task"
                      >
                        <PencilIcon className="h-3.5 w-3.5" />
                        <span className="text-xs">Edit</span>
                      </button>
                      {isExpanded ? (
                        <ChevronDownIcon className="h-4 w-4 text-base-content/50" />
                      ) : (
                        <ChevronRightIcon className="h-4 w-4 text-base-content/50" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t border-base-300 bg-base-300/30 p-6 space-y-6">
                    {/* Description */}
                    <section>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-base-content/50 mb-3">
                        Description
                      </h4>
                      <div className="prose prose-sm max-w-none text-base-content">
                        <ChatMarkdown content={story.description} />
                      </div>
                    </section>

                    {/* Acceptance Criteria */}
                    {story.acceptanceCriteria.length > 0 && (
                      <section>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-base-content/50 mb-3">
                          Acceptance Criteria
                        </h4>
                        <ul className="space-y-3">
                          {story.acceptanceCriteria.map((ac, i) => (
                            <li key={i} className="flex gap-3 text-sm">
                              <CheckCircleIcon className="h-5 w-5 text-success flex-shrink-0" />
                              <span className="text-base-content">{ac}</span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}

                    {/* Dependencies */}
                    {story.dependencies.length > 0 && (
                      <section>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-base-content/50 mb-3">
                          Dependencies
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {story.dependencies.map((dep) => (
                            <span
                              key={dep}
                              className={`badge badge-lg font-mono ${completedIds.has(dep) ? "badge-success" : "badge-outline"}`}
                            >
                              {dep} {completedIds.has(dep) && "✓"}
                            </span>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Notes */}
                    {story.notes && (
                      <section>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-base-content/50 mb-3">
                          Notes
                        </h4>
                        <div className="text-sm text-base-content/70 italic">
                          <ChatMarkdown content={story.notes} />
                        </div>
                      </section>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-3 pt-4 border-t border-base-300">
                      {specType === "tech-spec" &&
                        !story.passes &&
                        (isQueued ? (
                          <button
                            className="btn btn-error btn-outline gap-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveFromQueue(story.id);
                            }}
                            disabled={
                              queueLoading.has(story.id) ||
                              getQueuedTaskStatus(story.id) === "running"
                            }
                          >
                            <XMarkIcon className="h-5 w-5" /> Remove
                          </button>
                        ) : (
                          <button
                            className="btn btn-glass-primary gap-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddToQueue(story.id);
                            }}
                            disabled={queueLoading.has(story.id)}
                          >
                            <PlusIcon className="h-5 w-5" /> Add to Queue
                          </button>
                        ))}
                      <button
                        className="btn btn-ghost gap-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          openTaskEditor(story);
                        }}
                      >
                        <PencilIcon className="h-5 w-5" /> Edit
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!hasBeenDecomposed && !isLoading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 py-12">
          <QueueListIcon className="h-16 w-16 text-base-content/20" />
          <h3 className="text-base-content text-lg font-medium m-0">
            {specType === "prd" ? "No User Stories Yet" : "No Tasks Yet"}
          </h3>
          <p className="text-base-content/60 text-sm m-0 text-center max-w-xs">
            {specType === "prd"
              ? "Generate user stories from this PRD to track implementation progress"
              : "Generate tasks from this spec to track implementation progress"}
          </p>
        </div>
      )}

      {/* Task Editor Drawer */}
      {drawerOpen && selectedTask && (
        <div
          className="fixed inset-0 bg-black/60 z-[1000] flex justify-end"
          onClick={handleBackdropClick}
        >
          <div
            className="w-full max-w-[900px] h-full bg-base-200 border-l-2 border-secondary/30 shadow-2xl flex flex-col animate-slide-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 py-3 px-5 border-b border-base-300 flex-shrink-0">
              <div className="flex items-center gap-3">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    getTaskStatus(selectedTask, completedIds) === "completed"
                      ? "bg-success text-success-content"
                      : getTaskStatus(selectedTask, completedIds) === "blocked"
                        ? "bg-warning text-warning-content"
                        : getTaskStatus(selectedTask, completedIds) ===
                            "running"
                          ? "bg-info text-info-content animate-pulse"
                          : "bg-base-300 text-base-content/70"
                  }`}
                >
                  {getStatusIcon(getTaskStatus(selectedTask, completedIds))}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-base-content font-medium">
                    Edit Task
                  </span>
                  <span className="badge badge-outline font-mono text-xs">
                    {selectedTask.id}
                  </span>
                  {getComplexityBadge(selectedTask.complexity)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={closeDrawer}
                  disabled={saveLoading}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-glass-primary btn-sm"
                  onClick={handleSaveTask}
                  disabled={saveLoading}
                >
                  {saveLoading ? (
                    <>
                      <span className="loading loading-spinner loading-xs" />{" "}
                      Saving...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </button>
              </div>
            </div>

            {/* Status messages */}
            {saveError && (
              <div className="alert alert-error mx-5 mt-3 py-2">
                <span>{saveError}</span>
              </div>
            )}
            {saveSuccess && (
              <div className="alert alert-success mx-5 mt-3 py-2">
                <span>Task saved successfully!</span>
              </div>
            )}

            {/* Editor */}
            <div className="flex-1 overflow-y-auto min-h-0">
              <SpecEditor
                ref={editorRef}
                content={editContent}
                onChange={setEditContent}
                readOnly={saveLoading}
                className="h-full"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
