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
} from "@heroicons/react/24/outline";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerBody,
  DrawerFooter,
} from "../ui/Drawer";
import { useDecomposeSSE } from "../../hooks/useDecomposeSSE";
import { apiFetch } from "../ui/ErrorContext";
import type { QueuedTaskReference, UserStory } from "../../types";
import { ChatMarkdown } from "../chat/ChatMarkdown";
import { SpecEditor, type SpecEditorRef } from "../shared/SpecEditor";
import { Button } from "../ui/Button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";
import { Alert } from "../ui/Alert";
import { TaskListSkeleton } from "../shared/SpecSkeleton";
import { toast } from "sonner";

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
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelectedTask(null);
    setEditContent("");
  };

  const handleSaveTask = async () => {
    if (!specId || !selectedTask) return;

    setSaveLoading(true);

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
      toast.success("Task saved successfully");
      setDrawerOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save task");
    } finally {
      setSaveLoading(false);
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
      </span>
    );
  };

  // Button classes - using new Button component variants
  // Removing legacy btn classes

  return (
    <div className="flex flex-col h-full overflow-hidden pt-[17px] pb-4 px-6">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between gap-4 pb-4 border-b border-border/10">
        <div className="flex items-center gap-3">
          <h2 className="m-0 text-base font-semibold text-foreground">
            {specType === "prd" ? "User Stories" : "Tasks"}
          </h2>
          {hasBeenDecomposed && (
            <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-medium">
              {stories.filter((s) => s.passes || completedIds.has(s.id)).length} / {stories.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0 flex-wrap justify-end">
          {/* Tech spec queue actions */}
          {specType === "tech-spec" && hasBeenDecomposed && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleAddAllToQueue}
              isLoading={queueLoading.size > 0}
              disabled={stories.every((s) => s.passes || isTaskQueued(s.id))}
              className="rounded-full shadow-lg shadow-primary/10"
            >
              <QueueListIcon className="h-4 w-4" />
              Add All to Queue
            </Button>
          )}

          {canActivate && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleActivateAndRun}
              isLoading={activateLoading}
              className="rounded-full"
            >
              <PlayIcon className="h-4 w-4" />
              Run Queue
            </Button>
          )}
          {hasBeenDecomposed ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleDecompose(true)}
              isLoading={activateLoading}
              disabled={activateLoading}
              className="rounded-full"
            >
              {!activateLoading && <ArrowPathIcon className="h-4 w-4" />}
              {specType === "prd" ? "Regenerate Stories" : "Regenerate Tasks"}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleDecompose(false)}
              isLoading={isLoading}
              className="rounded-full shadow-lg shadow-primary/20"
            >
              {!isLoading && <SparklesIcon className="h-4 w-4" />}
              {specType === "prd" ? "Generate User Stories" : "Generate Tasks"}
            </Button>
          )}
        </div>
      </div>

      {/* Branch input - compact inline */}
      <div className="flex items-center gap-2 py-2">
        <span className="text-muted-foreground text-xs font-medium">Branch:</span>
        <input
          type="text"
          className="bg-transparent border-b border-border/20 py-0.5 px-0 text-xs focus:outline-none focus:border-primary/50 transition-colors max-w-[200px] text-foreground font-mono"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          placeholder="ralph/feature"
          disabled={isLoading}
        />
      </div>

      {/* Progress indicator */}
      {isLoading && !hasBeenDecomposed && (
        <div className="flex-1">
          <TaskListSkeleton />
        </div>
      )}

      {isLoading && hasBeenDecomposed && (
        <div className="flex items-center gap-3 py-4 px-6 rounded-2xl bg-primary/5 text-primary text-sm font-semibold animate-pulse border border-primary/10 mb-4">
          <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span>{decomposeState?.message || "Running decomposition..."}</span>
        </div>
      )}

      {/* Error display */}
      {error && (
        <Alert variant="error" className="my-3">
          {error}
        </Alert>
      )}
      
      {/* Spec already completed message */}
      {specStatus === "completed" && stories.length === 0 && (
        <Alert variant="success" title="Spec Already Completed" className="my-3">
          {specStatusMessage}
        </Alert>
      )}
      
      {/* Partial completion message */}
      {specStatus === "partial" && (
        <Alert variant="warning" title="Partially Completed" className="my-3">
          {specStatusMessage}
        </Alert>
      )}

      {/* Task List */}
      {hasBeenDecomposed && (
        <div className="flex-1 overflow-y-auto decompose-scrollbar flex flex-col gap-4 pt-4 animate-stagger-in">
          {stories.map((story) => {
            const status = getTaskStatus(story, completedIds);
            const isExpanded = expandedTask === story.id;
            const isQueued = isTaskQueued(story.id);

            return (
              <Collapsible
                key={story.id}
                open={isExpanded}
                onOpenChange={(open) => setExpandedTask(open ? story.id : null)}
              >
                <div
                  className={`rounded-2xl bg-card border border-border/50 overflow-hidden transition-all duration-200 hover:shadow-lg hover:border-border/80 ${
                    status === "completed"
                      ? "opacity-60 bg-success/5 border-success/20"
                      : status === "running"
                        ? "ring-2 ring-primary/30 bg-primary/5 border-primary/30"
                        : status === "blocked"
                          ? "opacity-60 bg-muted/20 border-border/20"
                          : "bg-muted/10 border-border/40"
                  } ${isQueued && status !== "running" ? "ring-1 ring-primary/20" : ""}`}
                >
                  {/* Card Header - Collapsible Trigger */}
                  <CollapsibleTrigger asChild>
                    <div className="py-4 px-5 cursor-pointer hover:bg-muted/40 active:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        {/* Status indicator */}
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                            status === "completed"
                              ? "bg-success text-success-foreground"
                              : status === "blocked"
                                ? "bg-muted text-muted-foreground"
                                : status === "running"
                                  ? "bg-primary text-primary-foreground animate-pulse"
                                  : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {status === "completed" ? (
                            <CheckCircleIcon className="h-4 w-4" />
                          ) : status === "blocked" ? (
                            <LockClosedIcon className="h-4 w-4" />
                          ) : status === "running" ? (
                            <PlayIcon className="h-4 w-4" />
                          ) : (
                            <ClockIcon className="h-4 w-4" />
                          )}
                        </div>

                        {/* ID Badge */}
                        <span className="px-2 py-0.5 rounded-lg bg-muted text-muted-foreground font-mono text-xs shrink-0">
                          {story.id}
                        </span>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {getComplexityBadge(story.complexity)}
                          {specType === "prd" && story.reviewStatus && (
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ring-1 ${
                                story.reviewStatus === "passed"
                                  ? "bg-success/10 text-success ring-success/20"
                                  : story.reviewStatus === "needs_improvement"
                                    ? "bg-warning/10 text-warning ring-warning/20"
                                    : "bg-muted text-muted-foreground ring-border/10"
                              }`}
                            >
                              {story.reviewStatus}
                            </span>
                          )}
                        </div>

                        {/* Title */}
                        <h3 className="flex-1 text-sm font-semibold m-0 truncate text-foreground">
                          {story.title}
                        </h3>

                        {/* Queue status badge */}
                        {isQueued && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              getQueuedTaskStatus(story.id) === "running"
                                ? "bg-primary text-primary-foreground animate-pulse"
                                : getQueuedTaskStatus(story.id) === "completed"
                                  ? "bg-success text-success-foreground"
                                  : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {getQueuedTaskStatus(story.id) === "running"
                              ? "Running"
                              : getQueuedTaskStatus(story.id) === "completed"
                                ? "Done"
                                : `#${getQueuePosition(story.id)}`}
                          </span>
                        )}

                        {/* Edit button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 rounded-full text-muted-foreground hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            openTaskEditor(story);
                          }}
                          aria-label={`Edit ${story.title}`}
                          title="Edit task"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </Button>

                        {/* Chevron */}
                        <div className="text-muted-foreground">
                          {isExpanded ? (
                            <ChevronDownIcon className="h-5 w-5" />
                          ) : (
                            <ChevronRightIcon className="h-5 w-5" />
                          )}
                        </div>
                      </div>
                    </div>
                  </CollapsibleTrigger>

                  {/* Expanded Content */}
                  <CollapsibleContent>
                    <div className="border-t border-border/20 bg-muted/10 p-5 space-y-5">


                      {/* Description */}
                      <section>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                          Description
                        </h4>
                        <div className="prose prose-sm max-w-none text-foreground">
                          <ChatMarkdown content={story.description} />
                        </div>
                      </section>

                      {/* Acceptance Criteria */}
                      {story.acceptanceCriteria.length > 0 && (
                        <section>
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                            Acceptance Criteria
                          </h4>
                          <ul className="space-y-2">
                            {story.acceptanceCriteria.map((ac, i) => (
                              <li key={i} className="flex gap-2 text-sm">
                                <CheckCircleIcon className="h-5 w-5 text-success shrink-0 mt-0.5" />
                                <span className="text-foreground/90">{ac}</span>
                              </li>
                            ))}
                          </ul>
                        </section>
                      )}

                      {/* Dependencies */}
                      {story.dependencies.length > 0 && (
                        <section>
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                            Dependencies
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {story.dependencies.map((dep) => (
                              <span
                                key={dep}
                                className={`px-2.5 py-1 rounded-full text-xs font-mono ${
                                  completedIds.has(dep) 
                                    ? "bg-success/10 text-success" 
                                    : "bg-muted text-muted-foreground"
                                }`}
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
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                            Notes
                          </h4>
                          <div className="text-sm text-muted-foreground italic">
                            <ChatMarkdown content={story.notes} />
                          </div>
                        </section>
                      )}

                      {/* Action Buttons */}
                      <div className="flex gap-3 pt-4 border-t border-border/20">
                        {specType === "tech-spec" &&
                          !story.passes &&
                          (isQueued ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              className="rounded-full text-error hover:bg-error/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveFromQueue(story.id);
                              }}
                              isLoading={queueLoading.has(story.id) || getQueuedTaskStatus(story.id) === "running"}
                            >
                              Remove from Queue
                            </Button>
                          ) : (
                            <Button
                              variant="primary"
                              size="sm"
                              className="rounded-full"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddToQueue(story.id);
                              }}
                              isLoading={queueLoading.has(story.id)}
                            >
                              <PlusIcon className="h-4 w-4" /> Add to Queue
                            </Button>
                          ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-full text-muted-foreground hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            openTaskEditor(story);
                          }}
                        >
                          <PencilIcon className="h-4 w-4" /> Edit Details
                        </Button>
                      </div>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!hasBeenDecomposed && !isLoading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16">
          <QueueListIcon className="h-12 w-12 text-muted-foreground/30" />
          <h3 className="text-foreground text-sm font-medium m-0">
            {specType === "prd" ? "No User Stories Yet" : "No Tasks Yet"}
          </h3>
          <p className="text-muted-foreground text-xs m-0 text-center max-w-xs mb-2">
            {specType === "prd"
              ? "Generate user stories from this PRD to track implementation progress"
              : "Generate tasks from this spec to track implementation progress"}
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={() => handleDecompose(false)}
            isLoading={isLoading}
            className="rounded-full"
          >
            <SparklesIcon className="h-4 w-4" />
            Generate
          </Button>
        </div>
      )}

      {/* Task Editor Drawer - Bottom Sheet */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent side="bottom" className="max-h-[85vh]">
          <DrawerHeader className="flex-row items-center">
            <div className="flex items-center gap-3 flex-1">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  selectedTask && getTaskStatus(selectedTask, completedIds) === "completed"
                    ? "bg-success text-success-content"
                    : selectedTask && getTaskStatus(selectedTask, completedIds) === "blocked"
                      ? "bg-warning text-warning-content"
                      : selectedTask && getTaskStatus(selectedTask, completedIds) === "running"
                        ? "bg-info text-info-content animate-pulse"
                        : "bg-base-300 text-base-content/70"
                }`}
              >
                {selectedTask ? getStatusIcon(getTaskStatus(selectedTask, completedIds)) : null}
              </span>
              <DrawerTitle>Edit Task</DrawerTitle>
              <div className="flex items-center gap-2">
                <span className="badge badge-outline font-mono text-xs">
                  {selectedTask?.id}
                </span>
                {getComplexityBadge(selectedTask?.complexity)}
              </div>
            </div>
          </DrawerHeader>

          {/* Editor */}
          <DrawerBody className="p-0">
            <SpecEditor
              ref={editorRef}
              content={editContent}
              onChange={setEditContent}
              readOnly={saveLoading}
              className="h-full border-none"
            />
          </DrawerBody>

          {/* Action Footer */}
          <DrawerFooter>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full h-9 px-6 text-foreground/50 hover:text-foreground active-press font-semibold"
              onClick={closeDrawer}
              disabled={saveLoading}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              className="rounded-full h-9 px-6 shadow-lg shadow-primary/20 font-semibold"
              onClick={handleSaveTask}
              isLoading={saveLoading}
            >
              Save Changes
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
