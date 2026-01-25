import { useState, useCallback } from 'react';
import type { SplitProposal, ProposedSpec } from '../../../../src/types/index.js';
import { Alert } from '../ui';

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
      setError(err instanceof Error ? err.message : "Failed to save files");
    }
  }, [files, onSaveAll]);

  const handleFileSelect = useCallback((idx: number): void => {
    setSelectedFileIndex(idx);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="modal modal-open" data-testid="split-preview-modal">
      <div className="modal-box max-w-6xl w-[95%] h-[80vh] max-h-[90vh] flex flex-col p-0" role="dialog" aria-modal="true">
        <header className="py-4 px-6 border-b border-base-300">
          <h2 className="m-0 text-xl font-semibold">Review Split Files</h2>
          <p className="mt-1 mb-0 text-sm text-base-content/60">
            Review and edit the proposed split files before saving.
          </p>
        </header>

        <div className="flex flex-1 overflow-hidden">
          {/* File list sidebar */}
          <nav className="w-[280px] min-w-[200px] border-r border-base-300 overflow-y-auto bg-base-200" data-testid="file-list">
            <h3 className="m-0 py-3 px-4 text-sm font-semibold text-base-content/60 border-b border-base-300">Files to Create ({files.length})</h3>
            <ul className="menu p-0">
              {files.map((file, idx) => (
                <li
                  key={file.filename}
                  className="border-b border-base-300"
                >
                  <button
                    type="button"
                    onClick={() => handleFileSelect(idx)}
                    className={`flex flex-col items-start w-full py-3 px-4 rounded-none ${idx === selectedFileIndex ? "active" : ""}`}
                    data-testid={`file-item-${idx}`}
                  >
                    <span className="text-sm font-medium">{file.filename}</span>
                    <span className="text-xs text-base-content/60 mt-0.5">{file.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Content editor */}
          <div className="flex-1 flex flex-col overflow-hidden" data-testid="file-editor">
            {selectedFile && (
              <>
                <div className="py-3 px-4 border-b border-base-300 bg-base-200">
                  <span className="text-sm font-semibold">{selectedFile.filename}</span>
                </div>
                <textarea
                  value={selectedFile.content}
                  onChange={handleContentChange}
                  className="textarea flex-1 w-full p-4 border-none rounded-none resize-none font-mono text-sm leading-relaxed focus:outline-none disabled:bg-base-200 disabled:text-base-content/50"
                  data-testid="file-content-editor"
                  disabled={isSaving}
                />
              </>
            )}
          </div>
        </div>

        {error && (
          <div className="px-6 py-3" data-testid="save-error">
            <Alert variant="error">{error}</Alert>
          </div>
        )}

        <footer className="flex justify-between items-center py-4 px-6 border-t border-base-300 bg-base-200">
          <div className="text-sm text-base-content/60">
            <span>Original file: {proposal.originalFile}</span>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onCancel}
              disabled={isSaving}
              data-testid="cancel-button"
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-glass-primary"
              onClick={handleSaveAll}
              disabled={isSaving}
              data-testid="save-all-button"
            >
              {isSaving ? "Saving..." : "Save All"}
            </button>
          </div>
        </footer>
      </div>
      <div className="modal-backdrop" onClick={onCancel}>
        <button type="button" className="cursor-default">close</button>
      </div>
    </div>
  );
}
