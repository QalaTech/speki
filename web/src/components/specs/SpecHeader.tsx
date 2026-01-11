import './SpecHeader.css';

export type SpecTab = 'preview' | 'decompose' | 'review';

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
}: SpecHeaderProps) {
  const tabs: { id: SpecTab; label: string; step: number }[] = [
    { id: 'preview', label: 'View / Edit', step: 1 },
    { id: 'review', label: 'Review', step: 2 },
    { id: 'decompose', label: 'Decompose', step: 3 },
  ];

  return (
    <div className="spec-header">
      <div className="spec-header-top">
        <div className="spec-header-file">
          <span className="spec-header-filename">{fileName}</span>
          {hasUnsavedChanges && (
            <span className="spec-header-unsaved" title="Unsaved changes">●</span>
          )}
          {getStatusBadge(reviewStatus)}
        </div>
      </div>

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
