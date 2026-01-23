
export type SpecTab = 'preview' | 'decompose';
export type SpecType = 'prd' | 'tech-spec' | 'bug';

interface SpecHeaderProps {
  fileName: string;
  filePath: string;
  activeTab: SpecTab;
  onTabChange: (tab: SpecTab) => void;
  onEdit: () => void;
  reviewStatus?: 'reviewed' | 'pending' | 'god-spec' | 'in-progress' | 'none';
  hasUnsavedChanges?: boolean;
  /** Whether inline edit mode is enabled (hides edit button when true) */
  isEditMode?: boolean;
  /** Spec type (detected from filename or frontmatter) */
  specType?: SpecType;
  /** Progress for PRDs: completed user stories / total */
  progress?: { completed: number; total: number };
  /** Linked tech spec (for PRDs) */
  linkedTechSpec?: { specId: string; name: string };
  /** Parent PRD (for tech specs) */
  parentSpec?: { specId: string; name: string };
  /** Callbacks for PRD actions */
  onCreateTechSpec?: () => void;
  onQuickExecute?: () => void;
  onNavigateToSpec?: (specId: string) => void;
  /** Whether tech spec generation is in progress */
  isGeneratingTechSpec?: boolean;
}

/**
 * Detect spec type from filename
 */
function detectSpecTypeFromFilename(filename: string): SpecType {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.prd.md')) return 'prd';
  if (lower.endsWith('.tech.md')) return 'tech-spec';
  if (lower.endsWith('.bug.md')) return 'bug';
  return 'prd';
}

function getSpecTypeConfig(type: SpecType) {
  const typeBase = "inline-flex items-center gap-1 py-1 px-2.5 text-[11px] font-semibold rounded-md uppercase tracking-[0.02em]";
  switch (type) {
    case 'prd':
      return { icon: '📋', label: 'PRD', className: `${typeBase} bg-[rgba(59,130,246,0.15)] text-[#3b82f6]`, desc: 'Product Requirements' };
    case 'tech-spec':
      return { icon: '🔧', label: 'Tech Spec', className: `${typeBase} bg-[rgba(168,85,247,0.15)] text-[#a855f7]`, desc: 'Technical Specification' };
    case 'bug':
      return { icon: '🐛', label: 'Bug', className: `${typeBase} bg-[rgba(239,68,68,0.15)] text-[#ef4444]`, desc: 'Bug Report' };
  }
}

function getStatusBadge(status?: string) {
  const badgeBase = "inline-flex items-center gap-1 py-1 px-2.5 text-[11px] font-semibold rounded-xl uppercase tracking-[0.02em]";
  switch (status) {
    case 'reviewed':
      return <span className={`${badgeBase} bg-[rgba(35,134,54,0.15)] text-[#3fb950]`}>✓ Reviewed</span>;
    case 'pending':
      return <span className={`${badgeBase} bg-[rgba(210,153,34,0.15)] text-[#d29922]`}>⚠ Needs Review</span>;
    case 'god-spec':
      return <span className={`${badgeBase} bg-[rgba(218,54,51,0.15)] text-[#f85149]`}>🔴 God Spec</span>;
    case 'in-progress':
      return <span className={`${badgeBase} bg-[rgba(163,113,247,0.15)] text-[#a371f7]`}>⏳ In Progress</span>;
    default:
      return null;
  }
}

export function SpecHeader({
  fileName,
  filePath: _filePath,
  activeTab,
  onTabChange,
  onEdit: _onEdit,
  reviewStatus,
  hasUnsavedChanges,
  isEditMode: _isEditMode,
  specType,
  progress,
  linkedTechSpec,
  parentSpec,
  onCreateTechSpec,
  onQuickExecute,
  onNavigateToSpec,
  isGeneratingTechSpec,
}: SpecHeaderProps) {
  // Detect type from filename if not provided
  const effectiveType = specType || detectSpecTypeFromFilename(fileName);
  const typeConfig = getSpecTypeConfig(effectiveType);
  const tabs: { id: SpecTab; label: string; step: number }[] = [
    { id: 'preview', label: 'View / Edit', step: 1 },
    { id: 'decompose', label: effectiveType === 'prd' ? 'User Stories' : 'Tasks', step: 2 },
  ];

  // Calculate progress percentage
  const progressPercent = progress && progress.total > 0
    ? Math.round((progress.completed / progress.total) * 100)
    : 0;

  const actionBtnBase = "inline-flex items-center gap-1.5 py-2 px-3.5 bg-surface-hover border border-border rounded-lg text-text text-[13px] font-medium cursor-pointer transition-all duration-150 whitespace-nowrap hover:bg-bg hover:border-accent hover:text-accent";

  return (
    <>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
      `}</style>
      <div className="bg-surface border-b border-border">
        <div className="flex items-center justify-between py-4 px-5 pb-3">
          <div className="flex items-center gap-2.5">
            <span className={typeConfig.className} title={typeConfig.desc}>
              <span className="text-xs">{typeConfig.icon}</span>
              <span>{typeConfig.label}</span>
            </span>
            <span className="text-base font-semibold text-text">{fileName}</span>
            {hasUnsavedChanges && (
              <span className="text-warning text-xs" title="Unsaved changes">●</span>
            )}
            {getStatusBadge(reviewStatus)}
          </div>

          {/* PRD actions */}
          {effectiveType === 'prd' && (onCreateTechSpec || onQuickExecute) && (
            <div className="flex items-center gap-2">
              {!linkedTechSpec && onCreateTechSpec && progress && progress.total > 0 && !isGeneratingTechSpec && (
                <button
                  className="inline-flex items-center gap-1.5 py-2 px-3.5 bg-primary border border-primary rounded-lg text-white text-[13px] font-medium cursor-pointer transition-all duration-150 whitespace-nowrap hover:bg-primary-hover hover:border-primary-hover"
                  onClick={onCreateTechSpec}
                >
                  🤖 Generate Tech Spec
                </button>
              )}
              {isGeneratingTechSpec && (
                <span className="inline-flex items-center gap-2 py-2 px-3.5 bg-[rgba(136,87,229,0.15)] border border-[rgba(136,87,229,0.3)] rounded-lg text-[#a371f7] text-[13px] font-medium animate-[pulse_1.5s_ease-in-out_infinite]">
                  ⏳ Generating Tech Spec...
                </span>
              )}
              {linkedTechSpec && onNavigateToSpec && (
                <button
                  className={actionBtnBase}
                  onClick={() => onNavigateToSpec(linkedTechSpec.specId)}
                >
                  View: {linkedTechSpec.name}
                </button>
              )}
              {onQuickExecute && !linkedTechSpec && (
                <button
                  className={actionBtnBase}
                  onClick={onQuickExecute}
                >
                  ⚡ Quick Execute
                </button>
              )}
            </div>
          )}
        </div>

        {/* Progress bar for PRDs */}
        {effectiveType === 'prd' && progress && progress.total > 0 && (
          <div className="flex items-center gap-3 px-5 py-2 pb-3">
            <div className="flex-1 max-w-[200px] h-1.5 bg-bg rounded-sm overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-accent to-[#3fb950] rounded-sm transition-[width] duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-xs font-medium text-text-muted tabular-nums">
              {progress.completed}/{progress.total} User Stories ({progressPercent}%)
            </span>
          </div>
        )}

        {/* Parent breadcrumb for tech specs */}
        {effectiveType === 'tech-spec' && parentSpec && onNavigateToSpec && (
          <div className="flex items-center gap-1.5 px-5 py-1.5 pb-2.5 text-xs text-text-muted">
            <span className="text-xs">📋</span>
            <span className="font-medium">Implements:</span>
            <button
              className="bg-transparent border-none py-0.5 px-1.5 rounded text-accent text-xs font-medium cursor-pointer transition-all duration-150 hover:bg-accent/15 hover:underline"
              onClick={() => onNavigateToSpec(parentSpec.specId)}
            >
              {parentSpec.name}
            </button>
          </div>
        )}

        <div className="flex gap-1 px-4" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`flex items-center gap-1.5 py-2.5 px-4 bg-transparent border-none border-b-2 border-transparent text-text-muted text-[13px] font-medium cursor-pointer transition-all duration-150 -mb-px hover:text-text hover:bg-surface-hover ${activeTab === tab.id ? 'text-accent border-b-accent hover:text-accent' : ''}`}
              onClick={() => onTabChange(tab.id)}
              role="tab"
              aria-selected={activeTab === tab.id}
            >
              <span className={`flex items-center justify-center w-5 h-5 bg-white/[0.08] rounded-full text-[11px] font-semibold text-text-muted transition-all duration-150 ${activeTab === tab.id ? 'bg-accent text-white' : ''}`}>{tab.step}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
