import {
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  LockClosedIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { useRef, useState } from "react";
import type { UserStory } from "../../types";
import { ChatMarkdown } from "../chat/ChatMarkdown";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Modal } from "../ui/Modal";
import { SpecEditor, type SpecEditorRef } from "../shared/SpecEditor";
import { toast } from "sonner";

interface UseCaseListProps {
  stories: UserStory[];
  completedIds: Set<string>;
  specType: "prd" | "tech-spec" | "bug";
  isQueued: (id: string) => boolean;
  getQueuePosition: (id: string) => number | null;
  getQueuedTaskStatus: (id: string) => string;
  onAddToQueue: (id: string) => void;
  onRemoveFromQueue: (id: string) => void;
  queueLoading: Set<string>;
  onSaveTask: (task: UserStory) => Promise<void>;
  alwaysExpanded?: boolean;
}

type TaskStatus = "completed" | "blocked" | "running" | "pending";

function getTaskStatus(task: UserStory, completed: Set<string>): TaskStatus {
  if (task.passes || completed.has(task.id)) return "completed";
  const depsBlocked = task.dependencies.some((d) => !completed.has(d));
  if (depsBlocked) return "blocked";
  return "pending";
}

function getComplexityBadge(complexity?: string) {
  if (!complexity) return null;
  const complexityVariants: Record<string, "success" | "warning" | "error" | "ghost"> = {
    low: "success",
    medium: "warning",
    high: "error",
  };
  return (
    <Badge
      variant={complexityVariants[complexity] || "ghost"}
      size="xs"
    />
  );
}

// Convert task to markdown for editing
function taskToMarkdown(task: UserStory): string {
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
}

// Parse markdown back to task fields
function markdownToTask(md: string): Partial<UserStory> {
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
}

interface UseCaseItemProps {
  story: UserStory;
  status: TaskStatus;
  isExpanded: boolean;
  isEditing: boolean;
  onToggle: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (updatedStory: UserStory) => Promise<void>;
  isQueued: boolean;
  queuePosition: number | null;
  queuedStatus: string;
  specType: "prd" | "tech-spec" | "bug";
  onAddToQueue: () => void;
  onRemoveFromQueue: () => void;
  isQueueLoading: boolean;
  completedIds: Set<string>;
  alwaysExpanded?: boolean;
}

function UseCaseItem({
  story,
  status,
  isExpanded,
  isEditing,
  onToggle,
  onStartEdit,
  onCancelEdit,
  onSave,
  isQueued,
  queuePosition,
  queuedStatus,
  specType,
  onAddToQueue,
  onRemoveFromQueue,
  isQueueLoading,
  completedIds,
  alwaysExpanded,
}: UseCaseItemProps) {
  const isCompleted = status === "completed";
  const isBlocked = status === "blocked";
  const isRunning = status === "running" || queuedStatus === "running";
  const showContent = alwaysExpanded || isExpanded;
  const isVisuallyExpanded = !alwaysExpanded && showContent && !isEditing;

  const editorRef = useRef<SpecEditorRef>(null);
  const [editContent, setEditContent] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);

  // Initialize editor content when starting to edit
  const handleStartEdit = () => {
    setEditContent(taskToMarkdown(story));
    onStartEdit();
  };

  const handleSave = async () => {
    setSaveLoading(true);
    try {
      const content = editorRef.current?.getMarkdown?.() || editContent;
      const updates = markdownToTask(content);
      const updatedStory = { ...story, ...updates };
      await onSave(updatedStory);
      toast.success("Task changes saved");
    } catch {
      toast.error("Failed to save task changes");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleCancel = () => {
    setEditContent("");
    onCancelEdit();
  };

  return (
    <div className={`use-case-item group ${isEditing ? "editing" : ""} ${isVisuallyExpanded ? "expanded" : ""}`}>
      {/* Header row with grid layout: checkbox | ID | title | status | actions */}
      <div
        className={`use-case-header grid grid-cols-[auto_auto_1fr_auto_auto] items-center gap-3 py-2.5 ${!alwaysExpanded ? "cursor-pointer" : ""}`}
        onClick={!alwaysExpanded ? onToggle : undefined}
      >
        {/* Checkbox */}
        <div
          className={`use-case-checkbox ${isCompleted ? "checked" : ""} ${isRunning ? "running" : ""} ${isBlocked ? "blocked" : ""}`}
        >
          {isCompleted ? (
            <CheckCircleIcon className="h-3.5 w-3.5" />
          ) : isRunning ? (
            <PlayIcon className="h-3 w-3" />
          ) : isBlocked ? (
            <LockClosedIcon className="h-3 w-3" />
          ) : (
            <ClockIcon className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </div>

        {/* ID - fixed width box */}
        <span className="text-muted-foreground font-mono text-xs px-2 py-1 bg-muted/30 rounded w-[70px] text-center shrink-0">
          {story.id}
        </span>

        {/* Title - flexible, left-aligned */}
        <div className="min-w-0">
          <span className={`font-medium text-sm block ${isCompleted ? "line-through text-muted-foreground" : "text-foreground"}`}>
            {story.title}
          </span>
          {/* Badges row */}
          <div className="flex items-center gap-1.5 mt-0.5">
            {getComplexityBadge(story.complexity)}
            {story.reviewStatus && (
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${
                  story.reviewStatus === "passed"
                    ? "bg-success/10 text-success"
                    : story.reviewStatus === "needs_improvement"
                      ? "bg-warning/10 text-warning"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {story.reviewStatus}
              </span>
            )}
          </div>
        </div>

        {/* Status column - queue badge or Done */}
        <div className="shrink-0 w-[70px] flex justify-center">
          {isQueued ? (
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${
                queuedStatus === "running"
                  ? "bg-primary text-primary-foreground animate-pulse"
                  : queuedStatus === "completed"
                    ? "bg-success text-success-foreground"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {queuedStatus === "running"
                ? "Running"
                : queuedStatus === "completed"
                  ? "Done"
                  : `#${queuePosition}`}
            </span>
          ) : isCompleted ? (
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-success/20 text-success">
              Done
            </span>
          ) : null}
        </div>

        {/* Actions column */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Edit button */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 rounded text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              handleStartEdit();
            }}
            aria-label={`Edit ${story.title}`}
            title="Edit task"
          >
            <PencilIcon className="h-3.5 w-3.5" />
          </Button>

          {/* Chevron - only show when not editing and not always expanded */}
          {!alwaysExpanded && (
            <div className="text-muted-foreground/50">
              {isExpanded ? (
                <ChevronDownIcon className="h-4 w-4" />
              ) : (
                <ChevronRightIcon className="h-4 w-4" />
              )}
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={isEditing}
        onClose={handleCancel}
        title={`Edit - ${story.title}`}
        size="xl"
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-4 text-muted-foreground"
              onClick={handleCancel}
              disabled={saveLoading}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              className="h-8 px-4"
              onClick={handleSave}
              isLoading={saveLoading}
            >
              Save Changes
            </Button>
          </>
        }
      >
        <div className="border border-border/40 rounded-lg bg-card/50">
          <SpecEditor
            ref={editorRef}
            content={editContent}
            onChange={setEditContent}
            readOnly={saveLoading}
            className="h-[500px] overflow-y-auto border-none"
          />
        </div>
      </Modal>

      {/* Content - always visible when alwaysExpanded, otherwise when expanded */}
      {showContent && !isEditing && (
        <div
          className={`use-case-content space-y-3 text-sm ${
            isVisuallyExpanded
              ? "mt-2 rounded-md border border-border/45 bg-background/35 px-3 py-3"
              : "pt-3 pb-3 mt-2 border-t border-border/30"
          } ${!alwaysExpanded ? "animate-in slide-in-from-top-1 duration-150" : ""}`}
        >
          {/* Description */}
          <div className="text-muted-foreground w-full">
            <ChatMarkdown content={story.description} />
          </div>

          {/* Acceptance Criteria */}
          {story.acceptanceCriteria.length > 0 && (
            <div className="space-y-1.5">
              <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                Acceptance Criteria
              </h5>
              <ul className="space-y-1">
                {story.acceptanceCriteria.map((ac, i) => (
                  <li key={i} className="flex items-start gap-2 text-muted-foreground">
                    <CheckCircleIcon className="h-4 w-4 text-success/70 shrink-0 mt-0.5" />
                    <span>{ac}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Dependencies */}
          {story.dependencies.length > 0 && (
            <div className="space-y-1.5">
              <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                Dependencies
              </h5>
              <div className="flex flex-wrap gap-1.5">
                {story.dependencies.map((dep) => (
                  <span
                    key={dep}
                    className={`px-2 py-0.5 rounded text-xs font-mono ${
                      completedIds.has(dep)
                        ? "bg-success/10 text-success"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {dep} {completedIds.has(dep) && "✓"}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {story.notes && (
            <div className="space-y-1.5">
              <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                Notes
              </h5>
              <div className="text-muted-foreground/80 italic">
                <ChatMarkdown content={story.notes} />
              </div>
            </div>
          )}

          {/* Action buttons - queue controls only (edit via pencil icon in header) */}
          {specType === "tech-spec" && !story.passes && (
            <div className="flex gap-2 pt-2">
              {isQueued ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-error hover:bg-error/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveFromQueue();
                  }}
                  isLoading={isQueueLoading || queuedStatus === "running"}
                >
                  Remove from Queue
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-primary hover:bg-primary/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddToQueue();
                  }}
                  isLoading={isQueueLoading}
                >
                  <PlusIcon className="h-3.5 w-3.5 mr-1" /> Add to Queue
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function UseCaseList({
  stories,
  completedIds,
  specType,
  isQueued,
  getQueuePosition,
  getQueuedTaskStatus,
  onAddToQueue,
  onRemoveFromQueue,
  queueLoading,
  onSaveTask,
  alwaysExpanded,
}: UseCaseListProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    // Don't toggle if we're editing
    if (editingId === id) return;

    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const startEditing = (id: string) => {
    setEditingId(id);
    // Ensure the item is expanded when editing
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  const handleSave = async (updatedStory: UserStory) => {
    await onSaveTask(updatedStory);
    setEditingId(null);
  };

  return (
    <div className="use-case-list">
      {stories.map((story) => {
        const status = getTaskStatus(story, completedIds);
        const queued = isQueued(story.id);
        const queuePos = getQueuePosition(story.id);
        const queuedStatus = getQueuedTaskStatus(story.id);

        // Auto-detect running status
        const effectiveStatus = queuedStatus === "running" ? "running" : status;

        return (
          <UseCaseItem
            key={story.id}
            story={story}
            status={effectiveStatus as TaskStatus}
            isExpanded={expanded.has(story.id)}
            isEditing={editingId === story.id}
            onToggle={() => toggleExpand(story.id)}
            onStartEdit={() => startEditing(story.id)}
            onCancelEdit={cancelEditing}
            onSave={handleSave}
            isQueued={queued}
            queuePosition={queuePos}
            queuedStatus={queuedStatus}
            specType={specType}
            onAddToQueue={() => onAddToQueue(story.id)}
            onRemoveFromQueue={() => onRemoveFromQueue(story.id)}
            isQueueLoading={queueLoading.has(story.id)}
            completedIds={completedIds}
            alwaysExpanded={alwaysExpanded}
          />
        );
      })}
    </div>
  );
}
