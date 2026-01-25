import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReviewPanel } from '../ReviewPanel';
import type {
  SpecReviewResult,
  GodSpecIndicators,
  SuggestionCard,
} from '../../../../src/types/index.js';

const createMockSuggestion = (overrides: Partial<SuggestionCard> = {}): SuggestionCard => ({
  id: 'sug-1',
  category: 'clarity',
  severity: 'warning',
  section: 'Requirements',
  textSnippet: 'The system shall...',
  issue: 'Requirement is ambiguous',
  suggestedFix: 'Add specific metrics',
  status: 'pending',
  ...overrides,
});

const createMockReviewResult = (
  overrides: Partial<SpecReviewResult> = {}
): SpecReviewResult => ({
  verdict: 'PASS',
  categories: {},
  codebaseContext: {
    projectType: 'nodejs',
    existingPatterns: [],
    relevantFiles: [],
  },
  suggestions: [],
  logPath: '/logs/review.log',
  durationMs: 5000,
  ...overrides,
});

const createMockGodSpecIndicators = (
  overrides: Partial<GodSpecIndicators> = {}
): GodSpecIndicators => ({
  isGodSpec: true,
  indicators: ['Too many feature sections', 'Multiple user journeys'],
  estimatedStories: 25,
  featureDomains: ['auth', 'billing'],
  systemBoundaries: ['api', 'database'],
  ...overrides,
});

describe('ReviewPanel', () => {
  describe('ReviewPanel_RendersContainer', () => {
    it('should render review panel container', () => {
      render(<ReviewPanel />);

      expect(screen.getByTestId('review-panel')).toBeInTheDocument();
    });

    it('should show empty state when no review result', () => {
      render(<ReviewPanel />);

      expect(screen.getByTestId('verdict-empty')).toBeInTheDocument();
      expect(screen.getByText('No review results yet')).toBeInTheDocument();
    });

    it('should show loading state when reviewing', () => {
      render(<ReviewPanel isReviewing={true} />);

      expect(screen.getByText('Reviewing...')).toBeInTheDocument();
    });
  });

  describe('ReviewPanel_DisplaysVerdict', () => {
    it('should display PASS verdict prominently', () => {
      const result = createMockReviewResult({ verdict: 'PASS' });

      render(<ReviewPanel reviewResult={result} />);

      const verdictDisplay = screen.getByTestId('verdict-display');
      expect(verdictDisplay).toBeInTheDocument();
      expect(screen.getByText('Verdict:')).toBeInTheDocument();
      expect(screen.getByText('Pass')).toBeInTheDocument();
      // Check that badge has success variant class
      const badge = screen.getByText('Pass');
      expect(badge).toHaveClass('badge');
      expect(badge).toHaveClass('badge-success');
    });

    it('should display FAIL verdict prominently', () => {
      const result = createMockReviewResult({ verdict: 'FAIL' });

      render(<ReviewPanel reviewResult={result} />);

      expect(screen.getByText('Fail')).toBeInTheDocument();
      const badge = screen.getByText('Fail');
      expect(badge).toHaveClass('badge');
      expect(badge).toHaveClass('badge-error');
    });

    it('should display NEEDS_IMPROVEMENT verdict prominently', () => {
      const result = createMockReviewResult({ verdict: 'NEEDS_IMPROVEMENT' });

      render(<ReviewPanel reviewResult={result} />);

      expect(screen.getByText('Needs Improvement')).toBeInTheDocument();
      const badge = screen.getByText('Needs Improvement');
      expect(badge).toHaveClass('badge');
      expect(badge).toHaveClass('badge-warning');
    });

    it('should display SPLIT_RECOMMENDED verdict prominently', () => {
      const result = createMockReviewResult({ verdict: 'SPLIT_RECOMMENDED' });

      render(<ReviewPanel reviewResult={result} />);

      expect(screen.getByText('Split Recommended')).toBeInTheDocument();
      const badge = screen.getByText('Split Recommended');
      expect(badge).toHaveClass('badge');
      expect(badge).toHaveClass('badge-info');
    });

    it('should have verdict section visible at top', () => {
      const result = createMockReviewResult({ verdict: 'PASS' });

      render(<ReviewPanel reviewResult={result} />);

      const verdictSection = screen.getByTestId('verdict-section');
      expect(verdictSection).toBeInTheDocument();
    });
  });

  describe('ReviewPanel_ContainsSuggestionArea', () => {
    it('should render suggestions section', () => {
      render(<ReviewPanel />);

      expect(screen.getByTestId('suggestions-area')).toBeInTheDocument();
      expect(screen.getByText('Suggestions')).toBeInTheDocument();
    });

    it('should show suggestions count when available', () => {
      const suggestions = [
        createMockSuggestion({ id: 'sug-1' }),
        createMockSuggestion({ id: 'sug-2' }),
        createMockSuggestion({ id: 'sug-3' }),
      ];
      const result = createMockReviewResult({ suggestions });

      render(<ReviewPanel reviewResult={result} />);

      expect(screen.getByTestId('suggestions-list')).toBeInTheDocument();
      expect(screen.getByText('3 suggestion(s) available')).toBeInTheDocument();
    });

    it('should show no suggestions message when empty', () => {
      const result = createMockReviewResult({ suggestions: [] });

      render(<ReviewPanel reviewResult={result} />);

      expect(screen.getByText('No suggestions available')).toBeInTheDocument();
    });

    it('should show god spec warning when applicable', () => {
      const godSpecIndicators = createMockGodSpecIndicators();

      render(<ReviewPanel godSpecIndicators={godSpecIndicators} />);

      expect(screen.getByTestId('god-spec-warning')).toBeInTheDocument();
      expect(screen.getByText('God Spec Detected')).toBeInTheDocument();
      expect(screen.getByText('Estimated stories: 25')).toBeInTheDocument();
    });

    it('should not show god spec warning when isGodSpec is false', () => {
      const godSpecIndicators = createMockGodSpecIndicators({ isGodSpec: false });

      render(<ReviewPanel godSpecIndicators={godSpecIndicators} />);

      expect(screen.queryByTestId('god-spec-warning')).not.toBeInTheDocument();
    });

    it('should display god spec indicators list', () => {
      const godSpecIndicators = createMockGodSpecIndicators({
        indicators: ['Large file size', 'Multiple personas'],
      });

      render(<ReviewPanel godSpecIndicators={godSpecIndicators} />);

      expect(screen.getByText('Large file size')).toBeInTheDocument();
      expect(screen.getByText('Multiple personas')).toBeInTheDocument();
    });
  });

  describe('ReviewPanel_ContainsChatArea', () => {
    it('should render chat section', () => {
      render(<ReviewPanel />);

      expect(screen.getByTestId('chat-area')).toBeInTheDocument();
      expect(screen.getByText('Chat')).toBeInTheDocument();
    });

    it('should render chat messages area', () => {
      render(<ReviewPanel />);

      expect(screen.getByTestId('chat-messages')).toBeInTheDocument();
      expect(screen.getByText('Chat messages will appear here')).toBeInTheDocument();
    });

    it('should render chat input with placeholder', () => {
      render(<ReviewPanel />);

      const input = screen.getByTestId('chat-input');
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('placeholder', 'Ask a question about the review...');
    });

    it('should have accessible chat input', () => {
      render(<ReviewPanel />);

      const input = screen.getByTestId('chat-input');
      expect(input).toHaveAttribute('aria-label', 'Chat input');
    });

    it('should call onChatSubmit when Enter is pressed with message', () => {
      const onChatSubmit = vi.fn();

      render(<ReviewPanel onChatSubmit={onChatSubmit} />);

      const input = screen.getByTestId('chat-input') as HTMLTextAreaElement;
      fireEvent.change(input, { target: { value: 'What is this issue about?' } });
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

      expect(onChatSubmit).toHaveBeenCalledWith('What is this issue about?');
      expect(input.value).toBe('');
    });

    it('should not call onChatSubmit when Shift+Enter is pressed', () => {
      const onChatSubmit = vi.fn();

      render(<ReviewPanel onChatSubmit={onChatSubmit} />);

      const input = screen.getByTestId('chat-input') as HTMLTextAreaElement;
      fireEvent.change(input, { target: { value: 'Multi\nline' } });
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });

      expect(onChatSubmit).not.toHaveBeenCalled();
    });

    it('should not call onChatSubmit when input is empty', () => {
      const onChatSubmit = vi.fn();

      render(<ReviewPanel onChatSubmit={onChatSubmit} />);

      const input = screen.getByTestId('chat-input');
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

      expect(onChatSubmit).not.toHaveBeenCalled();
    });
  });
});
