import { ExclamationCircleIcon } from "@heroicons/react/20/solid";
import {
  ArrowTopRightOnSquareIcon,
  BugAntIcon,
  CheckCircleIcon,
  ClipboardDocumentListIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  PencilIcon,
  SparklesIcon,
  WrenchScrewdriverIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

export type SpecTab = "preview" | "decompose";
export type SpecType = "prd" | "tech-spec" | "bug";

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
    icon: <ClipboardDocumentListIcon className="h-4 w-4" />,
    label: "PRD",
    badgeClass: "badge badge-info badge-outline",
    iconColor: "text-info",
    desc: "Product Requirements",
  },
  "tech-spec": {
    icon: <WrenchScrewdriverIcon className="h-4 w-4" />,
    label: "Tech Spec",
    badgeClass: "badge badge-secondary badge-outline",
    iconColor: "text-secondary",
    desc: "Technical Specification",
  },
  bug: {
    icon: <BugAntIcon className="h-4 w-4" />,
    label: "Bug",
    badgeClass: "badge badge-error badge-outline",
    iconColor: "text-error",
    desc: "Bug Report",
  },
};

function StatusBadge({ status }: { status?: string }) {
  const baseClasses = "badge gap-1.5 px-3 py-1 font-medium shadow-sm transition-all duration-200";
  
  switch (status) {
    case "reviewed":
      return (
        <span className={`${baseClasses} badge-success badge-outline hover:shadow-md`}>
          <CheckCircleIcon className="h-3.5 w-3.5" />
          Reviewed
        </span>
      );
    case "pending":
      return (
        <span className={`${baseClasses} badge-warning badge-outline hover:shadow-md`}>
          <ExclamationTriangleIcon className="h-3.5 w-3.5" />
          Needs Review
        </span>
      );
    case "god-spec":
      return (
        <span className={`${baseClasses} badge-error badge-outline hover:shadow-md`}>
          <ExclamationCircleIcon className="h-3.5 w-3.5" />
          God Spec
        </span>
      );
    case "in-progress":
      return (
        <span className={`${baseClasses} badge-info badge-outline hover:shadow-md`}>
          <ClockIcon className="h-3.5 w-3.5" />
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
    <div className="bg-gradient-to-b from-base-200 to-base-200/50 backdrop-blur-sm border-b border-base-content/5 shadow-lg shadow-base-content/5">
      {/* Main header row */}
      <div className="flex items-center justify-between py-4 px-5">
        <div className="flex items-center gap-4">
          {/* Spec type badge */}
          <span 
            className={`${config.badgeClass} gap-1.5 px-3 py-1 font-medium shadow-sm`} 
            title={config.desc}
          >
            <span className={config.iconColor}>{config.icon}</span>
            {config.label}
          </span>

          {/* File name */}
          <h1 className="text-lg font-semibold text-base-content m-0 tracking-tight">
            {fileName}
          </h1>

          {/* Unsaved indicator */}
          {hasUnsavedChanges && (
            <span className="text-warning text-lg animate-pulse" title="Unsaved changes">
              ●
            </span>
          )}

          {/* Status badge */}
          <StatusBadge status={reviewStatus} />
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-3">
          {/* Edit mode controls */}
          {activeTab === "preview" && (
            <div className="flex items-center gap-2">
              {!isEditMode ? (
                <button
                  className="btn btn-ghost btn-sm gap-2 hover:bg-base-300/50 transition-all duration-200"
                  onClick={onEditStart}
                  title="Edit spec"
                >
                  <PencilIcon className="h-4 w-4" />
                  Edit
                </button>
              ) : (
                <>
                  <button
                    className="btn btn-ghost btn-sm gap-2 hover:bg-base-300/50 transition-all duration-200"
                    onClick={onEditCancel}
                    title="Cancel editing"
                  >
                    <XMarkIcon className="h-4 w-4" />
                    Cancel
                  </button>
                  <button
                    className="btn btn-glass-primary btn-sm"
                    onClick={() => {
                      console.log('[SpecHeader] Save button clicked, hasUnsavedChanges:', hasUnsavedChanges, 'onSave:', !!onSave);
                      onSave?.();
                    }}
                    disabled={!hasUnsavedChanges}
                    title={
                      hasUnsavedChanges ? "Save changes" : "No changes to save"
                    }
                  >
                    Save
                  </button>
                </>
              )}
            </div>
          )}

          {/* PRD actions */}
          {effectiveType === "prd" && onCreateTechSpec && (
            <>
              {!linkedTechSpec &&
                progress &&
                progress.total > 0 &&
                !isGeneratingTechSpec && (
                  <button
                    className="btn btn-glass-primary btn-sm gap-2 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-all duration-200"
                    onClick={onCreateTechSpec}
                  >
                    <SparklesIcon className="h-4 w-4" />
                    Generate Tech Spec
                  </button>
                )}

              {isGeneratingTechSpec && (
                <span className="badge badge-secondary gap-2 py-3 px-4 shadow-sm">
                  <span className="loading loading-spinner loading-xs" />
                  Generating Tech Spec...
                </span>
              )}

              {linkedTechSpec && onNavigateToSpec && (
                <button
                  className="btn btn-ghost btn-sm gap-2 hover:bg-base-300/50 transition-all duration-200"
                  onClick={() => onNavigateToSpec(linkedTechSpec.specId)}
                >
                  <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                  {linkedTechSpec.name}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Parent breadcrumb for tech specs */}
      {effectiveType === "tech-spec" && parentSpec && onNavigateToSpec && (
        <div className="flex items-center gap-2 px-5 pb-3 text-sm text-base-content/60">
          <ClipboardDocumentListIcon className="h-4 w-4 text-info" />
          <span>Implements:</span>
          <button
            className="link link-secondary text-sm hover:text-secondary transition-colors"
            onClick={() => onNavigateToSpec(parentSpec.specId)}
          >
            {parentSpec.name}
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="px-5 pb-0">
        <div className="flex gap-1 border-b-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all duration-200 border-b-2 -mb-px ${
                activeTab === tab.id 
                  ? "bg-base-100 text-base-content border-primary shadow-sm" 
                  : "text-base-content/50 border-transparent hover:text-base-content hover:bg-base-300/30"
              }`}
              onClick={() => onTabChange(tab.id)}
              aria-selected={activeTab === tab.id}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

}
