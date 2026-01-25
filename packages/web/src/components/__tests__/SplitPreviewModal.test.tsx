import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@test/render';
import { SplitPreviewModal, SplitPreviewFile } from '../review/SplitPreviewModal';
import type { SplitProposal, ProposedSpec } from '@speki/core';

const mockProposedSpec = (overrides?: Partial<ProposedSpec>): ProposedSpec => ({
  filename: 'auth-spec.md',
  description: 'Authentication features',
  estimatedStories: 8,
  sections: ['Authentication', 'Authorization'],
  ...overrides,
});

const mockSplitProposal = (overrides?: Partial<SplitProposal>): SplitProposal => ({
  originalFile: 'god-spec.md',
  reason: 'Too many concerns',
  proposedSpecs: [
    mockProposedSpec({ filename: 'auth-spec.md', description: 'Authentication features' }),
    mockProposedSpec({ filename: 'user-spec.md', description: 'User management' }),
    mockProposedSpec({ filename: 'notif-spec.md', description: 'Notifications' }),
  ],
  ...overrides,
});

const mockPreviewFile = (overrides?: Partial<SplitPreviewFile>): SplitPreviewFile => ({
  filename: 'auth-spec.md',
  description: 'Authentication features',
  content: '# Authentication\n\nContent here...',
  proposedSpec: mockProposedSpec(),
  ...overrides,
});

const mockPreviewFiles = (): SplitPreviewFile[] => [
  mockPreviewFile({ filename: 'auth-spec.md', description: 'Authentication features' }),
  mockPreviewFile({ filename: 'user-spec.md', description: 'User management', content: '# User Management\n\nContent here...' }),
  mockPreviewFile({ filename: 'notif-spec.md', description: 'Notifications', content: '# Notifications\n\nContent here...' }),
];

describe('SplitPreviewModal', () => {
  const defaultProps = {
    isOpen: true,
    proposal: mockSplitProposal(),
    previewFiles: mockPreviewFiles(),
    onSaveAll: vi.fn(),
    onCancel: vi.fn(),
    isSaving: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('splitPreview_ShowsAllFiles', () => {
    it('should display the modal when isOpen is true', () => {
      render(<SplitPreviewModal {...defaultProps} />);
      expect(screen.getByTestId('split-preview-modal')).toBeInTheDocument();
    });

    it('should not render when isOpen is false', () => {
      render(<SplitPreviewModal {...defaultProps} isOpen={false} />);
      expect(screen.queryByTestId('split-preview-modal')).not.toBeInTheDocument();
    });

    it('should display all proposed files in the file list', () => {
      render(<SplitPreviewModal {...defaultProps} />);

      const fileList = screen.getByTestId('file-list');
      expect(fileList).toHaveTextContent('auth-spec.md');
      expect(fileList).toHaveTextContent('user-spec.md');
      expect(fileList).toHaveTextContent('notif-spec.md');
    });

    it('should display the file count in the header', () => {
      render(<SplitPreviewModal {...defaultProps} />);
      expect(screen.getByText('Files to Create (3)')).toBeInTheDocument();
    });

    it('should display the first file content by default', () => {
      render(<SplitPreviewModal {...defaultProps} />);
      const editor = screen.getByTestId('file-content-editor') as HTMLTextAreaElement;
      expect(editor.value).toContain('# Authentication');
    });
  });

  describe('splitPreview_AllowsEditing', () => {
    it('should allow editing the file content', () => {
      render(<SplitPreviewModal {...defaultProps} />);

      const editor = screen.getByTestId('file-content-editor') as HTMLTextAreaElement;
      fireEvent.change(editor, { target: { value: '# New Content\n\nEdited text...' } });

      expect(editor.value).toBe('# New Content\n\nEdited text...');
    });

    it('should switch files when clicking on file list items', () => {
      render(<SplitPreviewModal {...defaultProps} />);

      // Click on the second file
      fireEvent.click(screen.getByTestId('file-item-1'));

      const editor = screen.getByTestId('file-content-editor') as HTMLTextAreaElement;
      expect(editor.value).toContain('# User Management');
    });

    it('should preserve edits when switching files', () => {
      render(<SplitPreviewModal {...defaultProps} />);

      // Edit the first file
      const editor = screen.getByTestId('file-content-editor') as HTMLTextAreaElement;
      fireEvent.change(editor, { target: { value: '# Edited Auth Content' } });

      // Switch to second file
      fireEvent.click(screen.getByTestId('file-item-1'));

      // Switch back to first file
      fireEvent.click(screen.getByTestId('file-item-0'));

      expect(editor.value).toBe('# Edited Auth Content');
    });

    it('should disable editing when saving', () => {
      render(<SplitPreviewModal {...defaultProps} isSaving={true} />);

      const editor = screen.getByTestId('file-content-editor');
      expect(editor).toBeDisabled();
    });
  });

  describe('splitPreview_SaveAllWritesFiles', () => {
    it('should call onSaveAll with all files when clicking Save All', async () => {
      const onSaveAll = vi.fn().mockResolvedValue(undefined);
      render(<SplitPreviewModal {...defaultProps} onSaveAll={onSaveAll} />);

      fireEvent.click(screen.getByTestId('save-all-button'));

      await waitFor(() => {
        expect(onSaveAll).toHaveBeenCalledTimes(1);
      });

      const savedFiles = onSaveAll.mock.calls[0][0];
      expect(savedFiles).toHaveLength(3);
      expect(savedFiles[0].filename).toBe('auth-spec.md');
    });

    it('should include edited content in saved files', async () => {
      const onSaveAll = vi.fn().mockResolvedValue(undefined);
      render(<SplitPreviewModal {...defaultProps} onSaveAll={onSaveAll} />);

      // Edit the first file
      const editor = screen.getByTestId('file-content-editor') as HTMLTextAreaElement;
      fireEvent.change(editor, { target: { value: '# My Custom Content' } });

      fireEvent.click(screen.getByTestId('save-all-button'));

      await waitFor(() => {
        expect(onSaveAll).toHaveBeenCalledTimes(1);
      });

      const savedFiles = onSaveAll.mock.calls[0][0];
      expect(savedFiles[0].content).toBe('# My Custom Content');
    });

    it('should display error when save fails', async () => {
      const onSaveAll = vi.fn().mockRejectedValue(new Error('Network error'));
      render(<SplitPreviewModal {...defaultProps} onSaveAll={onSaveAll} />);

      fireEvent.click(screen.getByTestId('save-all-button'));

      await waitFor(() => {
        expect(screen.getByTestId('save-error')).toHaveTextContent('Network error');
      });
    });
  });

  describe('splitPreview_CancelDoesNotSave', () => {
    it('should call onCancel when clicking Cancel', () => {
      const onCancel = vi.fn();
      render(<SplitPreviewModal {...defaultProps} onCancel={onCancel} />);

      fireEvent.click(screen.getByTestId('cancel-button'));

      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('should not call onSaveAll when clicking Cancel', () => {
      const onSaveAll = vi.fn();
      const onCancel = vi.fn();
      render(<SplitPreviewModal {...defaultProps} onSaveAll={onSaveAll} onCancel={onCancel} />);

      fireEvent.click(screen.getByTestId('cancel-button'));

      expect(onSaveAll).not.toHaveBeenCalled();
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('should disable cancel button while saving', () => {
      render(<SplitPreviewModal {...defaultProps} isSaving={true} />);

      const cancelButton = screen.getByTestId('cancel-button');
      expect(cancelButton).toBeDisabled();
    });
  });

  describe('splitPreview_UpdatesParentSession', () => {
    it('should show original file reference in footer', () => {
      render(<SplitPreviewModal {...defaultProps} />);

      expect(screen.getByText('Original file: god-spec.md')).toBeInTheDocument();
    });

    it('should show file descriptions in the list', () => {
      render(<SplitPreviewModal {...defaultProps} />);

      const fileList = screen.getByTestId('file-list');
      expect(fileList).toHaveTextContent('Authentication features');
      expect(fileList).toHaveTextContent('User management');
      expect(fileList).toHaveTextContent('Notifications');
    });

    it('should display saving indicator when isSaving is true', () => {
      render(<SplitPreviewModal {...defaultProps} isSaving={true} />);

      expect(screen.getByTestId('save-all-button')).toHaveTextContent('Saving...');
    });
  });
});
