import { useState, useCallback } from 'react';
import type { SplitProposal, ProposedSpec } from '@speki/core';
import { Alert } from '../ui';
import { Button } from '../ui/Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/Modal';

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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-6xl w-[95%] h-[80vh] max-h-[90vh] flex flex-col p-0" data-testid="split-preview-modal">
        <DialogHeader className="py-4 px-6 border-b border-border">
          <DialogTitle>Review Split Files</DialogTitle>
          <DialogDescription>
            Review and edit the proposed split files before saving.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* File list sidebar */}
          <nav className="w-[280px] min-w-[200px] border-r border-border overflow-y-auto bg-muted" data-testid="file-list">
            <h3 className="m-0 py-3 px-4 text-sm font-semibold text-muted-foreground border-b border-border">Files to Create ({files.length})</h3>
            <ul className="p-0 m-0 list-none">
              {files.map((file, idx) => (
                <li
                  key={file.filename}
                  className="border-b border-border"
                >
                  <button
                    type="button"
                    onClick={() => handleFileSelect(idx)}
                    className={`flex flex-col items-start w-full py-3 px-4 text-left transition-colors ${idx === selectedFileIndex ? "bg-primary/10 text-primary" : "hover:bg-accent"}`}
                    data-testid={`file-item-${idx}`}
                  >
                    <span className="text-sm font-medium">{file.filename}</span>
                    <span className="text-xs text-muted-foreground mt-0.5">{file.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Content editor */}
          <div className="flex-1 flex flex-col overflow-hidden" data-testid="file-editor">
            {selectedFile && (
              <>
                <div className="py-3 px-4 border-b border-border bg-muted">
                  <span className="text-sm font-semibold">{selectedFile.filename}</span>
                </div>
                <textarea
                  value={selectedFile.content}
                  onChange={handleContentChange}
                  className="flex-1 w-full p-4 border-none rounded-none resize-none font-mono text-sm leading-relaxed bg-background text-foreground focus:outline-none focus:ring-0 disabled:bg-muted disabled:text-muted-foreground"
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

        <DialogFooter className="flex justify-between items-center py-4 px-6 border-t border-border bg-muted">
          <div className="text-sm text-muted-foreground">
            <span>Original file: {proposal.originalFile}</span>
          </div>
          <div className="flex gap-3">
            <Button
              variant="ghost"
              onClick={onCancel}
              disabled={isSaving}
              data-testid="cancel-button"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveAll}
              disabled={isSaving}
              isLoading={isSaving}
              data-testid="save-all-button"
              className="shadow-sm shadow-primary/20"
            >
              Save All
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
