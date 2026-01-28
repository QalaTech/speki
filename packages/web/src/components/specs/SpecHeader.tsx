import {
  BugAntIcon,
  CheckCircleIcon,
  ClipboardDocumentListIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  ListBulletIcon,
  PencilIcon,
  SparklesIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { Button } from "../ui/Button";

export type SpecTab = "preview" | "decompose";
export type SpecType = "prd" | "tech-spec" | "bug";

// Helper to format filename into readable title
function formatSpecTitle(filename: string): string {
  // Remove extension
  const cleanName = filename.replace(/\.(prd|tech|bug)\.md$/, '').replace(/\.md$/, '');
  
  // Remove date prefix if present (e.g., "20240320-")
  const withoutDate = cleanName.replace(/^\d{8}-/, '');
  
  // Replace dashes/underscores with spaces and title case
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
  // Edit mode controls
  onEditStart?: () => void;
  onEditCancel?: () => void;
  onSave?: () => void;
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
  activeTab,
  onTabChange,
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
}: SpecHeaderProps) {
  const effectiveType = specType || detectSpecTypeFromFilename(fileName);
  const config = specTypeConfig[effectiveType];

  const tabs: { id: SpecTab; label: string }[] = [
    { id: "preview", label: "View / Edit" },
    {
      id: "decompose",
      label: effectiveType === "prd" ? "User Stories" : "Tasks",
    },
  ];

  return (
    <div className="bg-card border-b border-border/50 sticky top-0 z-30">
      {/* Top Section: Breadcrumbs + Title + Status */}
      <div className="flex items-center px-6 pt-5 pb-4">
        <div className="flex flex-col min-w-0">
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

      {/* Bottom Section: Tabs + Actions */}
      <div className="flex items-center justify-between px-6 pb-4 pt-1">
        {/* Navigation Tabs */}
        <div className="flex p-1 bg-white/3 rounded-full border border-white/5 shadow-inner shrink-0">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const isPreview = tab.id === "preview";
            
            return (
              <button
                key={tab.id}
                className={`flex items-center justify-center gap-2 px-4 py-1.5 rounded-full text-[12px] font-semibold transition-all duration-300 active:scale-[0.96] ${
                  isActive 
                    ? "bg-white/10 text-foreground border border-white/10 shadow-sm" 
                    : "bg-transparent text-muted-foreground border border-transparent hover:text-foreground hover:bg-white/5"
                }`}
                onClick={() => onTabChange(tab.id)}
              >
                {isPreview ? (
                  isEditMode ? <PencilIcon className="h-3.5 w-3.5" /> : <EyeIcon className="h-3.5 w-3.5" />
                ) : (
                  <ListBulletIcon className="h-3.5 w-3.5" />
                )}
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Primary Actions */}
        <div className="flex items-center gap-3">
          {/* Edit mode controls */}
          {activeTab === "preview" && (
            <div className="flex items-center gap-2">
              {!isEditMode ? (
                <Button
                  variant="accent"
                  size="sm"
                  onClick={onEditStart}
                  className="rounded-full h-9 px-5 text-xs font-semibold"
                >
                  <PencilIcon className="h-3.5 w-3.5" />
                  Edit
                </Button>
              ) : (
                <>
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
                </>
              )}
            </div>
          )}

          {/* PRD actions */}
          {effectiveType === "prd" && onCreateTechSpec && (
            <div className={`${activeTab === "preview" ? "border-l border-white/5 pl-3 ml-1" : ""}`}>
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
