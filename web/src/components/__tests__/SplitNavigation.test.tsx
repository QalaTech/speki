import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SplitNavigation } from '../SplitNavigation';
import type { SplitSpecRef } from '../../../../src/types/index.js';

const mockSplitSpecs: SplitSpecRef[] = [
  { filename: 'auth-spec.md', description: 'Authentication features' },
  { filename: 'user-spec.md', description: 'User management' },
  { filename: 'notifications-spec.md', description: 'Notification system' },
];

describe('SplitNavigation', () => {
  describe('splitNav_ParentShowsChildren', () => {
    it('should display banner showing number of child specs', () => {
      render(<SplitNavigation splitSpecs={mockSplitSpecs} onNavigate={vi.fn()} />);

      expect(screen.getByTestId('split-navigation')).toBeInTheDocument();
      expect(screen.getByTestId('split-parent-banner')).toBeInTheDocument();
      expect(screen.getByText('Split into 3 specs:')).toBeInTheDocument();
    });

    it('should display links to all child specs', () => {
      render(<SplitNavigation splitSpecs={mockSplitSpecs} onNavigate={vi.fn()} />);

      expect(screen.getByTestId('split-child-link-auth-spec.md')).toBeInTheDocument();
      expect(screen.getByTestId('split-child-link-user-spec.md')).toBeInTheDocument();
      expect(screen.getByTestId('split-child-link-notifications-spec.md')).toBeInTheDocument();
    });

    it('should handle singular spec count', () => {
      render(
        <SplitNavigation
          splitSpecs={[{ filename: 'single-spec.md', description: 'Only one' }]}
          onNavigate={vi.fn()}
        />
      );

      expect(screen.getByText('Split into 1 spec:')).toBeInTheDocument();
    });

    it('should not render when no split specs', () => {
      const { container } = render(<SplitNavigation splitSpecs={[]} onNavigate={vi.fn()} />);
      expect(container.querySelector('.split-navigation')).not.toBeInTheDocument();
    });
  });

  describe('splitNav_ChildShowsParent', () => {
    it('should display banner showing parent spec link', () => {
      render(
        <SplitNavigation parentSpecPath="/path/to/parent-spec.md" onNavigate={vi.fn()} />
      );

      expect(screen.getByTestId('split-navigation')).toBeInTheDocument();
      expect(screen.getByTestId('split-child-banner')).toBeInTheDocument();
      expect(screen.getByText('Split from:')).toBeInTheDocument();
    });

    it('should display parent filename as link', () => {
      render(
        <SplitNavigation parentSpecPath="/path/to/parent-spec.md" onNavigate={vi.fn()} />
      );

      const parentLink = screen.getByTestId('split-parent-link');
      expect(parentLink).toBeInTheDocument();
      expect(parentLink).toHaveTextContent('parent-spec.md');
    });

    it('should not render when no parent spec path', () => {
      const { container } = render(<SplitNavigation onNavigate={vi.fn()} />);
      expect(container.querySelector('.split-navigation')).not.toBeInTheDocument();
    });
  });

  describe('splitNav_LinksNavigate', () => {
    it('should call onNavigate with child spec filename when child link clicked', () => {
      const onNavigate = vi.fn();
      render(<SplitNavigation splitSpecs={mockSplitSpecs} onNavigate={onNavigate} />);

      const authLink = screen.getByTestId('split-child-link-auth-spec.md');
      fireEvent.click(authLink);

      expect(onNavigate).toHaveBeenCalledWith('auth-spec.md');
    });

    it('should call onNavigate with parent spec path when parent link clicked', () => {
      const onNavigate = vi.fn();
      render(
        <SplitNavigation parentSpecPath="/path/to/parent-spec.md" onNavigate={onNavigate} />
      );

      const parentLink = screen.getByTestId('split-parent-link');
      fireEvent.click(parentLink);

      expect(onNavigate).toHaveBeenCalledWith('/path/to/parent-spec.md');
    });

    it('should display both parent and children banners when spec has both', () => {
      const onNavigate = vi.fn();
      render(
        <SplitNavigation
          splitSpecs={mockSplitSpecs}
          parentSpecPath="/path/to/grandparent.md"
          onNavigate={onNavigate}
        />
      );

      expect(screen.getByTestId('split-parent-banner')).toBeInTheDocument();
      expect(screen.getByTestId('split-child-banner')).toBeInTheDocument();
    });
  });

  describe('splitNav_SessionMaintained', () => {
    it('should pass full spec path for navigation to maintain session context', () => {
      const onNavigate = vi.fn();
      const parentPath = '/full/path/to/parent-spec.md';

      render(<SplitNavigation parentSpecPath={parentPath} onNavigate={onNavigate} />);

      const parentLink = screen.getByTestId('split-parent-link');
      fireEvent.click(parentLink);

      expect(onNavigate).toHaveBeenCalledWith(parentPath);
    });

    it('should preserve description as title attribute for tooltips', () => {
      render(<SplitNavigation splitSpecs={mockSplitSpecs} onNavigate={vi.fn()} />);

      const authLink = screen.getByTestId('split-child-link-auth-spec.md');
      expect(authLink).toHaveAttribute('title', 'Authentication features');
    });

    it('should use filename as fallback title when no description', () => {
      const specsWithoutDesc: SplitSpecRef[] = [
        { filename: 'no-desc-spec.md', description: '' },
      ];

      render(<SplitNavigation splitSpecs={specsWithoutDesc} onNavigate={vi.fn()} />);

      const link = screen.getByTestId('split-child-link-no-desc-spec.md');
      expect(link).toHaveAttribute('title', 'no-desc-spec.md');
    });
  });
});
