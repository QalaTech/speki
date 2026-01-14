import './SpecHeader.css';

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
  switch (type) {
    case 'prd':
      return { icon: '📋', label: 'PRD', className: 'spec-type--prd', desc: 'Product Requirements' };
    case 'tech-spec':
      return { icon: '🔧', label: 'Tech Spec', className: 'spec-type--tech-spec', desc: 'Technical Specification' };
    case 'bug':
      return { icon: '🐛', label: 'Bug', className: 'spec-type--bug', desc: 'Bug Report' };
  }
}

function getStatusBadge(status?: string) {
  switch (status) {
    case 'reviewed':
      return <span className="spec-header-badge spec-header-badge--reviewed">✓ Reviewed</span>;
    case 'pending':
      return <span className="spec-header-badge spec-header-badge--pending">⚠ Needs Review</span>;
    case 'god-spec':
      return <span className="spec-header-badge spec-header-badge--god-spec">🔴 God Spec</span>;
    case 'in-progress':
      return <span className="spec-header-badge spec-header-badge--in-progress">⏳ In Progress</span>;
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

  return (
    <div className="spec-header">
      <div className="spec-header-top">
        <div className="spec-header-file">
          <span className={`spec-header-type ${typeConfig.className}`} title={typeConfig.desc}>
            <span className="spec-header-type-icon">{typeConfig.icon}</span>
            <span className="spec-header-type-label">{typeConfig.label}</span>
          </span>
          <span className="spec-header-filename">{fileName}</span>
          {hasUnsavedChanges && (
            <span className="spec-header-unsaved" title="Unsaved changes">●</span>
          )}
          {getStatusBadge(reviewStatus)}
        </div>

        {/* PRD actions */}
        {effectiveType === 'prd' && (onCreateTechSpec || onQuickExecute) && (
          <div className="spec-header-actions">
            {!linkedTechSpec && onCreateTechSpec && (
              <button
                className="spec-header-action-btn spec-header-action-btn--primary"
                onClick={onCreateTechSpec}
              >
                🔧 Create Tech Spec
              </button>
            )}
            {linkedTechSpec && onNavigateToSpec && (
              <button
                className="spec-header-action-btn"
                onClick={() => onNavigateToSpec(linkedTechSpec.specId)}
              >
                View: {linkedTechSpec.name}
              </button>
            )}
            {onQuickExecute && !linkedTechSpec && (
              <button
                className="spec-header-action-btn"
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
        <div className="spec-header-progress">
          <div className="spec-header-progress-bar">
            <div
              className="spec-header-progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="spec-header-progress-text">
            {progress.completed}/{progress.total} User Stories ({progressPercent}%)
          </span>
        </div>
      )}

      {/* Parent breadcrumb for tech specs */}
      {effectiveType === 'tech-spec' && parentSpec && onNavigateToSpec && (
        <div className="spec-header-parent">
          <span className="spec-header-parent-icon">📋</span>
          <span className="spec-header-parent-label">Implements:</span>
          <button
            className="spec-header-parent-link"
            onClick={() => onNavigateToSpec(parentSpec.specId)}
          >
            {parentSpec.name}
          </button>
        </div>
      )}

      <div className="spec-header-tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`spec-header-tab ${activeTab === tab.id ? 'spec-header-tab--active' : ''}`}
            onClick={() => onTabChange(tab.id)}
            role="tab"
            aria-selected={activeTab === tab.id}
          >
            <span className="spec-header-tab-step">{tab.step}</span>
            <span className="spec-header-tab-label">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
