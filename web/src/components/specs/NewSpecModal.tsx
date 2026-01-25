/**
 * Modal for creating a new spec file.
 */
import type { SpecType } from './types';

interface NewSpecModalProps {
  name: string;
  type: SpecType;
  isCreating: boolean;
  onNameChange: (name: string) => void;
  onTypeChange: (type: SpecType) => void;
  onCreate: () => void;
  onCancel: () => void;
}

export function NewSpecModal({
  name,
  type,
  isCreating,
  onNameChange,
  onTypeChange,
  onCreate,
  onCancel,
}: NewSpecModalProps) {
  const sanitizedName = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'name';
  const extension = type === 'prd' ? 'prd' : type === 'tech-spec' ? 'tech' : 'bug';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-base-100 rounded-xl shadow-2xl border border-base-300 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-base-300">
          <h3 className="text-lg font-semibold text-base-content">Create New Spec</h3>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Type Selector */}
          <div>
            <label className="block text-sm font-medium text-base-content mb-2">Spec Type</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-colors ${
                  type === 'prd'
                    ? 'border-primary bg-primary/10'
                    : 'border-base-300 hover:border-base-content/30'
                }`}
                onClick={() => onTypeChange('prd')}
              >
                <span className="text-xl">📋</span>
                <span className="text-sm font-medium">PRD</span>
                <span className="text-xs text-base-content/60">What &amp; Why</span>
              </button>
              <button
                type="button"
                className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-colors ${
                  type === 'tech-spec'
                    ? 'border-primary bg-primary/10'
                    : 'border-base-300 hover:border-base-content/30'
                }`}
                onClick={() => onTypeChange('tech-spec')}
              >
                <span className="text-xl">🔧</span>
                <span className="text-sm font-medium">Tech Spec</span>
                <span className="text-xs text-base-content/60">How</span>
              </button>
              <button
                type="button"
                className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-colors ${
                  type === 'bug'
                    ? 'border-primary bg-primary/10'
                    : 'border-base-300 hover:border-base-content/30'
                }`}
                onClick={() => onTypeChange('bug')}
              >
                <span className="text-xl">🐛</span>
                <span className="text-sm font-medium">Bug</span>
                <span className="text-xs text-base-content/60">Issue</span>
              </button>
            </div>
          </div>

          {/* Name Input */}
          <div>
            <label className="block text-sm font-medium text-base-content mb-2">
              Spec Name
            </label>
            <input
              type="text"
              className="input input-bordered w-full"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="e.g., user-authentication, payment-flow"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim()) {
                  onCreate();
                }
                if (e.key === 'Escape') {
                  onCancel();
                }
              }}
            />
            <p className="mt-2 text-xs text-base-content/60">
              File will be created as: specs/YYYYMMDD-HHMMSS-{sanitizedName}.{extension}.md
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-base-300 flex justify-end gap-3">
          <button
            className="btn btn-ghost"
            onClick={onCancel}
            disabled={isCreating}
          >
            Cancel
          </button>
          <button
            className="btn btn-glass-primary"
            onClick={onCreate}
            disabled={!name.trim() || isCreating}
          >
            {isCreating ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                Creating...
              </>
            ) : (
              'Create'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
