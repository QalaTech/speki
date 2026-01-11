import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GodSpecWarning } from '../GodSpecWarning';
import type { GodSpecIndicators, SplitProposal, ProposedSpec } from '../../../../src/types/index.js';

const mockIndicators = (overrides?: Partial<GodSpecIndicators>): GodSpecIndicators => ({
  isGodSpec: true,
  indicators: ['Too many features', 'Multiple user journeys'],
  estimatedStories: 25,
  featureDomains: ['auth', 'user-management', 'notifications'],
  systemBoundaries: ['API', 'Database', 'Notifications'],
  ...overrides,
});

const mockProposedSpec = (overrides?: Partial<ProposedSpec>): ProposedSpec => ({
  filename: 'auth-spec.md',
  description: 'Authentication and authorization features',
  estimatedStories: 8,
  sections: ['Authentication', 'Authorization'],
  ...overrides,
});

const mockSplitProposal = (overrides?: Partial<SplitProposal>): SplitProposal => ({
  originalFile: 'god-spec.md',
  reason: 'Too many concerns in single spec',
  proposedSpecs: [
    mockProposedSpec({ filename: 'auth-spec.md', estimatedStories: 8 }),
    mockProposedSpec({ filename: 'user-management-spec.md', estimatedStories: 10 }),
    mockProposedSpec({ filename: 'notifications-spec.md', estimatedStories: 7 }),
  ],
  ...overrides,
});

describe('GodSpecWarning', () => {
  describe('GodSpecWarning_DisplaysWarning', () => {
    it('should display warning icon', () => {
      render(<GodSpecWarning indicators={mockIndicators()} />);
      expect(screen.getByTestId('god-spec-warning')).toBeInTheDocument();
      expect(screen.getByText('God Spec Detected')).toBeInTheDocument();
    });

    it('should display explanation text', () => {
      render(<GodSpecWarning indicators={mockIndicators()} />);
      expect(screen.getByText(/This specification covers too many concerns/)).toBeInTheDocument();
    });

    it('should display estimated stories count', () => {
      render(<GodSpecWarning indicators={mockIndicators({ estimatedStories: 42 })} />);
      const estimateEl = screen.getByTestId('estimated-stories');
      expect(estimateEl).toHaveTextContent('42');
    });

    it('should display detected issues', () => {
      render(
        <GodSpecWarning
          indicators={mockIndicators({
            indicators: ['Multiple personas detected', 'High feature count'],
          })}
        />
      );
      const issuesEl = screen.getByTestId('detected-issues');
      expect(issuesEl).toHaveTextContent('Multiple personas detected');
      expect(issuesEl).toHaveTextContent('High feature count');
    });

    it('should not display issues section when indicators array is empty', () => {
      render(<GodSpecWarning indicators={mockIndicators({ indicators: [] })} />);
      expect(screen.queryByTestId('detected-issues')).not.toBeInTheDocument();
    });
  });

  describe('GodSpecWarning_ShowsProposedSplit', () => {
    it('should display proposed split section when proposal is provided', () => {
      render(<GodSpecWarning indicators={mockIndicators()} splitProposal={mockSplitProposal()} />);
      expect(screen.getByTestId('proposed-split')).toBeInTheDocument();
    });

    it('should display all proposed spec filenames', () => {
      render(<GodSpecWarning indicators={mockIndicators()} splitProposal={mockSplitProposal()} />);
      expect(screen.getByText('auth-spec.md')).toBeInTheDocument();
      expect(screen.getByText('user-management-spec.md')).toBeInTheDocument();
      expect(screen.getByText('notifications-spec.md')).toBeInTheDocument();
    });

    it('should display estimated story counts for each spec', () => {
      render(<GodSpecWarning indicators={mockIndicators()} splitProposal={mockSplitProposal()} />);
      expect(screen.getByText('~8 stories')).toBeInTheDocument();
      expect(screen.getByText('~10 stories')).toBeInTheDocument();
      expect(screen.getByText('~7 stories')).toBeInTheDocument();
    });

    it('should use singular "story" when count is 1', () => {
      render(
        <GodSpecWarning
          indicators={mockIndicators()}
          splitProposal={mockSplitProposal({
            proposedSpecs: [mockProposedSpec({ filename: 'small-spec.md', estimatedStories: 1 })],
          })}
        />
      );
      expect(screen.getByText('~1 story')).toBeInTheDocument();
    });

    it('should not display proposed split when no proposal provided', () => {
      render(<GodSpecWarning indicators={mockIndicators()} />);
      expect(screen.queryByTestId('proposed-split')).not.toBeInTheDocument();
    });

    it('should not display proposed split when proposal has empty specs', () => {
      render(
        <GodSpecWarning
          indicators={mockIndicators()}
          splitProposal={mockSplitProposal({ proposedSpecs: [] })}
        />
      );
      expect(screen.queryByTestId('proposed-split')).not.toBeInTheDocument();
    });
  });

  describe('GodSpecWarning_AcceptCreatesSplits', () => {
    it('should display Accept Split button when proposal is available', () => {
      render(<GodSpecWarning indicators={mockIndicators()} splitProposal={mockSplitProposal()} />);
      expect(screen.getByText('Accept Split')).toBeInTheDocument();
    });

    it('should not display Accept Split button when no proposal', () => {
      render(<GodSpecWarning indicators={mockIndicators()} />);
      expect(screen.queryByText('Accept Split')).not.toBeInTheDocument();
    });

    it('should call onAcceptSplit with proposal when Accept Split clicked', () => {
      const onAcceptSplit = vi.fn();
      const proposal = mockSplitProposal();
      render(
        <GodSpecWarning indicators={mockIndicators()} splitProposal={proposal} onAcceptSplit={onAcceptSplit} />
      );
      fireEvent.click(screen.getByTestId('accept-split-button'));
      expect(onAcceptSplit).toHaveBeenCalledWith(proposal);
    });

    it('should not throw when onAcceptSplit is not provided', () => {
      render(<GodSpecWarning indicators={mockIndicators()} splitProposal={mockSplitProposal()} />);
      expect(() => fireEvent.click(screen.getByTestId('accept-split-button'))).not.toThrow();
    });
  });

  describe('GodSpecWarning_SkipDismissesWithWarning', () => {
    it('should always display Skip button', () => {
      render(<GodSpecWarning indicators={mockIndicators()} />);
      expect(screen.getByText('Skip')).toBeInTheDocument();
    });

    it('should display Skip button even when proposal is provided', () => {
      render(<GodSpecWarning indicators={mockIndicators()} splitProposal={mockSplitProposal()} />);
      expect(screen.getByText('Skip')).toBeInTheDocument();
    });

    it('should call onSkip when Skip button clicked', () => {
      const onSkip = vi.fn();
      render(<GodSpecWarning indicators={mockIndicators()} onSkip={onSkip} />);
      fireEvent.click(screen.getByTestId('skip-button'));
      expect(onSkip).toHaveBeenCalled();
    });

    it('should not throw when onSkip is not provided', () => {
      render(<GodSpecWarning indicators={mockIndicators()} />);
      expect(() => fireEvent.click(screen.getByTestId('skip-button'))).not.toThrow();
    });
  });

  describe('GodSpecWarning_ModifyButton', () => {
    it('should display Modify button when proposal is available', () => {
      render(<GodSpecWarning indicators={mockIndicators()} splitProposal={mockSplitProposal()} />);
      expect(screen.getByText('Modify')).toBeInTheDocument();
    });

    it('should not display Modify button when no proposal', () => {
      render(<GodSpecWarning indicators={mockIndicators()} />);
      expect(screen.queryByText('Modify')).not.toBeInTheDocument();
    });

    it('should call onModify with proposal when Modify clicked', () => {
      const onModify = vi.fn();
      const proposal = mockSplitProposal();
      render(
        <GodSpecWarning indicators={mockIndicators()} splitProposal={proposal} onModify={onModify} />
      );
      fireEvent.click(screen.getByTestId('modify-button'));
      expect(onModify).toHaveBeenCalledWith(proposal);
    });

    it('should not throw when onModify is not provided', () => {
      render(<GodSpecWarning indicators={mockIndicators()} splitProposal={mockSplitProposal()} />);
      expect(() => fireEvent.click(screen.getByTestId('modify-button'))).not.toThrow();
    });
  });
});
