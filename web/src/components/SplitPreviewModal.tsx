import { useState, useCallback } from 'react';
import type { SplitProposal, ProposedSpec } from '../../../src/types/index.js';
import './SplitPreviewModal.css';

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
    <div className="split-preview-overlay" data-testid="split-preview-modal">
      <div className="split-preview-modal" role="dialog" aria-modal="true">
        <header className="split-preview-header">
          <h2>Review Split Files</h2>
          <p className="split-preview-subtitle">
            Review and edit the proposed split files before saving.
          </p>
        </header>

        <div className="split-preview-body">
          {/* File list sidebar */}
          <nav className="split-preview-file-list" data-testid="file-list">
            <h3>Files to Create ({files.length})</h3>
            <ul>
              {files.map((file, index) => (
                <li
                  key={file.filename}
                  className={index === selectedFileIndex ? 'selected' : ''}
                >
                  <button
                    type="button"
                    onClick={() => handleFileSelect(index)}
                    className="file-list-item"
                    data-testid={`file-item-${index}`}
                  >
                    <span className="file-name">{file.filename}</span>
                    <span className="file-description">{file.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Content editor */}
          <div className="split-preview-editor" data-testid="file-editor">
            {selectedFile && (
              <>
                <div className="editor-header">
                  <span className="editor-filename">{selectedFile.filename}</span>
                </div>
                <textarea
                  value={selectedFile.content}
                  onChange={handleContentChange}
                  className="editor-textarea"
                  data-testid="file-content-editor"
                  disabled={isSaving}
                />
              </>
            )}
          </div>
        </div>

        {error && (
          <div className="split-preview-error" data-testid="save-error">
            {error}
          </div>
        )}

        <footer className="split-preview-footer">
          <div className="split-preview-info">
            <span>Original file: {proposal.originalFile}</span>
          </div>
          <div className="split-preview-actions">
            <button
              type="button"
              className="cancel-button"
              onClick={onCancel}
              disabled={isSaving}
              data-testid="cancel-button"
            >
              Cancel
            </button>
            <button
              type="button"
              className="save-all-button"
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
