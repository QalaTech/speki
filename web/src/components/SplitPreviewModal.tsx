import { useState, useCallback } from 'react';
import type { SplitProposal, ProposedSpec } from '../../../src/types/index.js';

export interface SplitPreviewFile {
  /** Proposed filename */
  filename: string;
  /** Description of the split spec */
  description: string;
  /** Generated content for preview/editing */
  content: string;
  /** Original proposed spec for reference */
  proposedSpec: ProposedSpec;
}

export interface SplitPreviewModalProps {
  /** Whether the modal is visible */
  isOpen: boolean;
  /** The split proposal being previewed */
  proposal: SplitProposal;
  /** Files with generated content for preview */
  previewFiles: SplitPreviewFile[];
  /** Callback when user clicks Save All */
  onSaveAll: (files: SplitPreviewFile[]) => Promise<void>;
  /** Callback when user clicks Cancel */
  onCancel: () => void;
  /** Whether a save operation is in progress */
  isSaving?: boolean;
}

export function SplitPreviewModal({
  isOpen,
  proposal,
  previewFiles: initialFiles,
  onSaveAll,
  onCancel,
  isSaving = false,
}: SplitPreviewModalProps): React.ReactElement | null {
  const [files, setFiles] = useState<SplitPreviewFile[]>(initialFiles);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const selectedFile = files[selectedFileIndex];

  const handleContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
      const newContent = e.target.value;
      setFiles((prev) =>
        prev.map((f, i) =>
          i === selectedFileIndex ? { ...f, content: newContent } : f
        )
      );
    },
    [selectedFileIndex]
  );

  const handleSaveAll = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      await onSaveAll(files);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save files');
    }
  }, [files, onSaveAll]);

  const handleFileSelect = useCallback((index: number): void => {
    setSelectedFileIndex(index);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]" data-testid="split-preview-modal">
      <div className="bg-surface rounded-lg shadow-[0_4px_24px_rgba(0,0,0,0.15)] flex flex-col max-w-[1200px] max-h-[90vh] w-[95%] h-[80vh]" role="dialog" aria-modal="true">
        <header className="py-4 px-6 border-b border-border">
          <h2 className="m-0 text-xl font-semibold text-text">Review Split Files</h2>
          <p className="mt-1 mb-0 text-sm text-text-muted">
            Review and edit the proposed split files before saving.
          </p>
        </header>

        <div className="flex flex-1 overflow-hidden">
          {/* File list sidebar */}
          <nav className="w-[280px] min-w-[200px] border-r border-border overflow-y-auto bg-bg" data-testid="file-list">
            <h3 className="m-0 py-3 px-4 text-sm font-semibold text-text-muted border-b border-border">Files to Create ({files.length})</h3>
            <ul className="list-none m-0 p-0">
              {files.map((file, index) => (
                <li
                  key={file.filename}
                  className={`border-b border-border ${index === selectedFileIndex ? 'bg-surface' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => handleFileSelect(index)}
                    className="flex flex-col items-start w-full py-3 px-4 border-none bg-transparent cursor-pointer text-left hover:bg-surface-hover"
                    data-testid={`file-item-${index}`}
                  >
                    <span className="text-sm font-medium text-text">{file.filename}</span>
                    <span className="text-xs text-text-muted mt-0.5">{file.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Content editor */}
          <div className="flex-1 flex flex-col overflow-hidden" data-testid="file-editor">
            {selectedFile && (
              <>
                <div className="py-3 px-4 border-b border-border bg-bg">
                  <span className="text-sm font-semibold text-text">{selectedFile.filename}</span>
                </div>
                <textarea
                  value={selectedFile.content}
                  onChange={handleContentChange}
                  className="flex-1 w-full p-4 border-none resize-none font-mono text-sm leading-relaxed bg-surface text-text focus:outline-none disabled:bg-surface-hover disabled:text-text-muted"
                  data-testid="file-content-editor"
                  disabled={isSaving}
                />
              </>
            )}
          </div>
        </div>

        {error && (
          <div className="py-3 px-6 bg-[#fee2e2] text-[#dc2626] text-sm" data-testid="save-error">
            {error}
          </div>
        )}

        <footer className="flex justify-between items-center py-4 px-6 border-t border-border bg-bg">
          <div className="text-sm text-text-muted">
            <span>Original file: {proposal.originalFile}</span>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              className="py-2 px-4 rounded border border-border bg-surface text-text text-sm font-medium cursor-pointer transition-all duration-150 hover:bg-surface-hover disabled:opacity-60 disabled:cursor-not-allowed"
              onClick={onCancel}
              disabled={isSaving}
              data-testid="cancel-button"
            >
              Cancel
            </button>
            <button
              type="button"
              className="py-2 px-4 rounded border-none bg-primary text-white text-sm font-medium cursor-pointer transition-all duration-150 hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed"
              onClick={handleSaveAll}
              disabled={isSaving}
              data-testid="save-all-button"
            >
              {isSaving ? 'Saving...' : 'Save All'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
