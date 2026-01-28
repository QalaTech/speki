import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@test/render';
import { ChangeHistory } from '../review/ChangeHistory';
import type { ChangeHistoryEntry } from '@speki/core';

const mockChange = (overrides: Partial<ChangeHistoryEntry> = {}): ChangeHistoryEntry => ({
  id: 'change-1',
  timestamp: '2026-01-11T10:30:00Z',
  description: 'Updated requirements section with clearer language',
  filePath: '/specs/requirements.md',
  beforeContent: 'The system shall...',
  afterContent: 'The system must respond within 200ms...',
  reverted: false,
  ...overrides,
});

describe('ChangeHistory', () => {
  describe('ChangeHistory_DisplaysChanges', () => {
    it('should display the change history container', () => {
      render(<ChangeHistory changes={[mockChange()]} />);
      expect(screen.getByTestId('change-history')).toBeInTheDocument();
    });

    it('should display a list of changes', () => {
      const changes = [
        mockChange({ id: 'change-1', description: 'First change' }),
        mockChange({ id: 'change-2', description: 'Second change' }),
      ];
      render(<ChangeHistory changes={changes} />);

      const items = screen.getAllByTestId('change-item');
      expect(items).toHaveLength(2);
    });

    it('should display timestamp for each change', () => {
      render(<ChangeHistory changes={[mockChange()]} />);
      expect(screen.getByTestId('change-timestamp')).toBeInTheDocument();
    });

    it('should display description for each change', () => {
      render(<ChangeHistory changes={[mockChange({ description: 'Improved clarity of scope section' })]} />);
      expect(screen.getByTestId('change-description')).toHaveTextContent('Improved clarity of scope section');
    });

    it('should display section affected from file path', () => {
      render(<ChangeHistory changes={[mockChange({ filePath: '/specs/functional-requirements.md' })]} />);
      expect(screen.getByTestId('change-section')).toHaveTextContent('functional-requirements');
    });

    it('should display empty message when no changes', () => {
      render(<ChangeHistory changes={[]} />);
      expect(screen.getByTestId('change-history-empty')).toHaveTextContent('No changes have been applied yet');
    });

    it('should show reverted badge for reverted changes', () => {
      render(<ChangeHistory changes={[mockChange({ reverted: true })]} />);
      expect(screen.getByTestId('change-reverted-badge')).toHaveTextContent('Reverted');
    });

    it('should apply reverted styling to reverted changes', () => {
      render(<ChangeHistory changes={[mockChange({ reverted: true })]} />);
      // Reverted changes have opacity styling
      expect(screen.getByTestId('change-item')).toHaveClass('opacity-70');
    });
  });

  describe('ChangeHistory_RevertRestoresContent', () => {
    it('should render Revert button for non-reverted changes', () => {
      render(<ChangeHistory changes={[mockChange({ reverted: false })]} />);
      expect(screen.getByTestId('revert-button')).toBeInTheDocument();
    });

    it('should not render Revert button for reverted changes', () => {
      render(<ChangeHistory changes={[mockChange({ reverted: true })]} />);
      expect(screen.queryByTestId('revert-button')).not.toBeInTheDocument();
    });

    it('should call onRevert with change id when Revert clicked', () => {
      const onRevert = vi.fn();
      render(<ChangeHistory changes={[mockChange({ id: 'change-abc' })]} onRevert={onRevert} />);

      fireEvent.click(screen.getByTestId('revert-button'));
      expect(onRevert).toHaveBeenCalledWith('change-abc');
    });

    it('should not throw when onRevert is not provided', () => {
      render(<ChangeHistory changes={[mockChange()]} />);
      expect(() => fireEvent.click(screen.getByTestId('revert-button'))).not.toThrow();
    });

    it('should pass change-id as data attribute', () => {
      render(<ChangeHistory changes={[mockChange({ id: 'change-xyz' })]} />);
      expect(screen.getByTestId('change-item')).toHaveAttribute('data-change-id', 'change-xyz');
    });
  });

  describe('ChangeHistory_RevertAllRestoresOriginal', () => {
    it('should render Revert All button when there are unreverted changes', () => {
      render(<ChangeHistory changes={[mockChange({ reverted: false })]} />);
      expect(screen.getByTestId('revert-all-button')).toBeInTheDocument();
    });

    it('should not render Revert All button when all changes are reverted', () => {
      render(<ChangeHistory changes={[mockChange({ reverted: true })]} />);
      expect(screen.queryByTestId('revert-all-button')).not.toBeInTheDocument();
    });

    it('should not render Revert All button when no changes exist', () => {
      render(<ChangeHistory changes={[]} />);
      expect(screen.queryByTestId('revert-all-button')).not.toBeInTheDocument();
    });

    it('should call onRevertAll when Revert All clicked', () => {
      const onRevertAll = vi.fn();
      render(<ChangeHistory changes={[mockChange()]} onRevertAll={onRevertAll} />);

      fireEvent.click(screen.getByTestId('revert-all-button'));
      expect(onRevertAll).toHaveBeenCalled();
    });

    it('should not throw when onRevertAll is not provided', () => {
      render(<ChangeHistory changes={[mockChange()]} />);
      expect(() => fireEvent.click(screen.getByTestId('revert-all-button'))).not.toThrow();
    });

    it('should show Revert All when mix of reverted and unreverted changes', () => {
      const changes = [
        mockChange({ id: 'change-1', reverted: true }),
        mockChange({ id: 'change-2', reverted: false }),
      ];
      render(<ChangeHistory changes={changes} />);
      expect(screen.getByTestId('revert-all-button')).toBeInTheDocument();
    });
  });
});
