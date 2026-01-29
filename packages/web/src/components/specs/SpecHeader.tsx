import {
  BugAntIcon,
  CheckCircleIcon,
  ClipboardDocumentListIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  PencilIcon,
  SparklesIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { Button } from "../ui/Button";
import { SpecStepper, type WorkflowPhase } from "./SpecStepper";

export type SpecTab = "preview" | "decompose";
export type SpecType = "prd" | "tech-spec" | "bug";

// Helper to format filename into readable title
function formatSpecTitle(filename: string): string {
  const cleanName = filename.replace(/\.(prd|tech|bug)\.md$/, '').replace(/\.md$/, '');
  const withoutDate = cleanName.replace(/^\d{8}-/, '');
  return withoutDate
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

interface SpecHeaderProps {
  fileName: string;
  filePath: string;
  activeTab: SpecTab;
  onTabChange: (tab: SpecTab) => void;
  reviewStatus?: "reviewed" | "pending" | "god-spec" | "in-progress" | "none";
  hasUnsavedChanges?: boolean;
  isEditMode?: boolean;
  specType?: SpecType;
  progress?: { completed: number; total: number };
  linkedTechSpec?: { specId: string; name: string };
  parentSpec?: { specId: string; name: string };
  onCreateTechSpec?: () => void;
  onNavigateToSpec?: (specId: string) => void;
  isGeneratingTechSpec?: boolean;
  onEditStart?: () => void;
  onEditCancel?: () => void;
  onSave?: () => void;
  // Workflow props
  currentPhase?: WorkflowPhase;
  hasContent?: boolean;
  hasPlan?: boolean;
  isExecuting?: boolean;
  isCompleted?: boolean;
  onPhaseClick?: (phase: WorkflowPhase) => void;
}

function detectSpecTypeFromFilename(filename: string): SpecType {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".prd.md")) return "prd";
  if (lower.endsWith(".tech.md")) return "tech-spec";
  if (lower.endsWith(".bug.md")) return "bug";
  return "prd";
}

const specTypeConfig: Record<
  SpecType,
  {
    icon: React.ReactNode;
    label: string;
    badgeClass: string;
    iconColor: string;
    desc: string;
  }
> = {
  prd: {
    icon: <ClipboardDocumentListIcon className="h-3.5 w-3.5" />,
    label: "PRD",
    badgeClass: "bg-info/10 text-info ring-1 ring-info/20",
    iconColor: "text-info",
    desc: "Product Requirements",
  },
  "tech-spec": {
    icon: <WrenchScrewdriverIcon className="h-3.5 w-3.5" />,
    label: "TECH SPEC",
    badgeClass: "bg-primary/10 text-primary ring-1 ring-primary/20",
    iconColor: "text-primary",
    desc: "Technical Specification",
  },
  bug: {
    icon: <BugAntIcon className="h-3.5 w-3.5" />,
    label: "BUG",
    badgeClass: "bg-error/10 text-error ring-1 ring-error/20",
    iconColor: "text-error",
    desc: "Bug Report",
  },
};

function StatusBadge({ status }: { status?: string }) {
  const baseClasses = "flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase transition-all duration-200";

  switch (status) {
    case "reviewed":
      return (
        <span className={`${baseClasses} bg-success/10 text-success ring-1 ring-success/20`}>
          <CheckCircleIcon className="h-3 w-3" />
          Reviewed
        </span>
      );
    case "pending":
      return (
        <span className={`${baseClasses} bg-warning/10 text-warning ring-1 ring-warning/20`}>
          <ExclamationTriangleIcon className="h-3 w-3" />
          Pending
        </span>
      );
    case "god-spec":
      return (
        <span className={`${baseClasses} bg-error/10 text-error ring-1 ring-error/20`}>
          <ExclamationTriangleIcon className="h-3 w-3" />
          God Spec
        </span>
      );
    case "in-progress":
      return (
        <span className={`${baseClasses} bg-info/10 text-info ring-1 ring-info/20`}>
          <ClockIcon className="h-3 w-3" />
          In Progress
        </span>
      );
    default:
      return null;
  }
}

export function SpecHeader({
  fileName,
  filePath: _filePath,
  activeTab: _activeTab,
  onTabChange: _onTabChange,
  reviewStatus,
  hasUnsavedChanges,
  isEditMode,
  specType,
  progress,
  linkedTechSpec,
  parentSpec,
  onCreateTechSpec,
  onNavigateToSpec,
  isGeneratingTechSpec,
  onEditStart,
  onEditCancel,
  onSave,
  currentPhase = "write",
  hasContent = false,
  hasPlan = false,
  isExecuting = false,
  isCompleted = false,
  onPhaseClick,
}: SpecHeaderProps) {
  const effectiveType = specType || detectSpecTypeFromFilename(fileName);
  const config = specTypeConfig[effectiveType];

  return (
    <div className="bg-card border-b border-border/50 sticky top-0 z-30">
      {/* Top Section: Breadcrumbs + Title + Status */}
      <div className="flex items-center px-6 pt-5 pb-4">
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase text-muted-foreground/60 mb-0.5">
            <span>Specs</span>
            <span className="text-muted-foreground/30">/</span>
            <span className={config.iconColor}>{config.label}</span>
            {hasUnsavedChanges && (
              <div className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse ml-1" title="Unsaved changes" />
            )}
          </div>
          <div className="flex items-center gap-4">
            <h1 className="text-[20px] font-bold text-foreground m-0 tracking-tight font-poppins truncate">
              {formatSpecTitle(fileName)}
            </h1>
            <div className="shrink-0">
              <StatusBadge status={reviewStatus} />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section: Stepper + Actions */}
      <div className="flex items-center justify-between px-6 pb-4 pt-1">
        {/* Workflow Stepper */}
        <SpecStepper
          currentPhase={currentPhase}
          hasContent={hasContent}
          hasPlan={hasPlan}
          isExecuting={isExecuting}
          isCompleted={isCompleted}
          onPhaseClick={onPhaseClick}
        />

        {/* Primary Actions */}
        <div className="flex items-center gap-3">
          {/* Edit mode controls */}
          {isEditMode ? (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onEditCancel}
                className="rounded-full h-9 px-4 text-xs font-semibold"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => onSave?.()}
                disabled={!hasUnsavedChanges}
                className="rounded-full h-9 px-5 text-xs font-semibold"
              >
                Save
              </Button>
            </div>
          ) : (
            <Button
              variant="accent"
              size="sm"
              onClick={onEditStart}
              className="rounded-full h-9 px-5 text-xs font-semibold"
            >
              <PencilIcon className="h-3.5 w-3.5" />
              Edit
            </Button>
          )}

          {/* PRD actions */}
          {effectiveType === "prd" && onCreateTechSpec && (
            <div className="border-l border-white/5 pl-3 ml-1">
              {!linkedTechSpec &&
                progress &&
                progress.total > 0 &&
                !isGeneratingTechSpec && (
                  <Button
                    size="sm"
                    onClick={onCreateTechSpec}
                    className="rounded-full gap-2 h-9 px-5 text-xs font-semibold"
                  >
                    <SparklesIcon className="h-3.5 w-3.5" />
                    Generate Tech Spec
                  </Button>
                )}

              {isGeneratingTechSpec && (
                <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-[12px] font-bold ring-1 ring-primary/20">
                  <span className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  Generating...
                </div>
              )}

              {linkedTechSpec && onNavigateToSpec && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onNavigateToSpec(linkedTechSpec.specId)}
                  className="rounded-full h-9 px-5 text-xs font-semibold"
                >
                  {linkedTechSpec.name}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Parent implementation breadcrumb (Simplified) */}
      {effectiveType === "tech-spec" && parentSpec && onNavigateToSpec && (
        <div className="flex items-center gap-1.5 px-6 pb-3 text-[11px] font-medium text-muted-foreground/40 border-t border-white/2 pt-2.5">
          <span>Implements</span>
          <button
            className="text-muted-foreground/60 hover:text-secondary transition-colors underline decoration-muted-foreground/10 underline-offset-4"
            onClick={() => onNavigateToSpec(parentSpec.specId)}
          >
            {parentSpec.name}
          </button>
        </div>
      )}
    </div>
  );

}
