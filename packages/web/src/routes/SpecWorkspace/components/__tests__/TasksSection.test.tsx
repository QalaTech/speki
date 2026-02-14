import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TasksSection } from '../TasksSection';

// Mock IntersectionObserver
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  window.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
});
import type { UserStory, QueuedTaskReference } from '../../../../types';
import type { SpecType } from '../../../../components/specs/types';

// Mock UseCaseList
vi.mock('../../../../components/specs/UseCaseList', () => ({
  UseCaseList: ({ stories }: { stories: UserStory[] }) => (
    <div data-testid="use-case-list">Stories: {stories.length}</div>
  ),
}));

describe('TasksSection', () => {
  const mockStories: UserStory[] = [
    {
      id: '1',
      title: 'Story 1',
      description: 'Description 1',
      acceptanceCriteria: ['AC1'],
      priority: 1,
      passes: false,
      notes: '',
      dependencies: [],
    },
    {
      id: '2',
      title: 'Story 2',
      description: 'Description 2',
      acceptanceCriteria: ['AC2'],
      priority: 2,
      passes: true,
      notes: '',
      dependencies: [],
    },
  ];

  const defaultProps = {
    stories: mockStories,
    completedIds: new Set(['2']),
    queueTasks: [] as QueuedTaskReference[],
    queueLoading: new Set<string>(),
    specType: 'prd' as SpecType,
    isPrd: true,
    isDecomposing: false,
    isLoadingContent: false,
    isGeneratingTechSpec: false,
    onDecompose: vi.fn(),
    onAddToQueue: vi.fn(),
    onRemoveFromQueue: vi.fn(),
    onAddAllToQueue: vi.fn(),
    onSaveTask: vi.fn(),
    onRunQueue: vi.fn(),
    onCreateTechSpec: vi.fn(),
    onTasksVisibilityChange: vi.fn(),
  };

  it('should render User Stories heading for PRD', () => {
    render(<TasksSection {...defaultProps} />);
    expect(screen.getByText('User Stories')).toBeInTheDocument();
  });

  it('should render Tasks heading for tech spec', () => {
    render(<TasksSection {...defaultProps} specType="tech-spec" isPrd={false} />);
    expect(screen.getByText('Tasks')).toBeInTheDocument();
  });

  it('should show completion count', () => {
    render(<TasksSection {...defaultProps} />);
    expect(screen.getByText('1/2')).toBeInTheDocument();
  });

  it('should show Generate button when no stories', () => {
    render(<TasksSection {...defaultProps} stories={[]} />);
    expect(screen.getByRole('button', { name: /generate stories/i })).toBeInTheDocument();
  });

  it('should call onDecompose when Generate button is clicked', () => {
    const onDecompose = vi.fn();
    render(<TasksSection {...defaultProps} stories={[]} onDecompose={onDecompose} />);

    const button = screen.getByRole('button', { name: /generate stories/i });
    fireEvent.click(button);

    expect(onDecompose).toHaveBeenCalledWith(false);
  });

  it('should show Regenerate button when stories exist', () => {
    render(<TasksSection {...defaultProps} />);
    expect(screen.getByRole('button', { name: /regenerate/i })).toBeInTheDocument();
  });

  it('should show Generate Tech Spec button for PRD with stories', () => {
    render(<TasksSection {...defaultProps} />);
    expect(screen.getByRole('button', { name: /generate tech spec/i })).toBeInTheDocument();
  });

  it('should call onCreateTechSpec when Generate Tech Spec is clicked', () => {
    const onCreateTechSpec = vi.fn();
    render(<TasksSection {...defaultProps} onCreateTechSpec={onCreateTechSpec} />);

    const button = screen.getByRole('button', { name: /generate tech spec/i });
    fireEvent.click(button);

    expect(onCreateTechSpec).toHaveBeenCalledTimes(1);
  });

  it('should show Queue All button for tech spec', () => {
    render(<TasksSection {...defaultProps} specType="tech-spec" isPrd={false} />);
    expect(screen.getByRole('button', { name: /queue all/i })).toBeInTheDocument();
  });

  it('should show Run Queue when stopped with stale running queue entries', () => {
    render(
      <TasksSection
        {...defaultProps}
        specType="tech-spec"
        isPrd={false}
        queueTasks={[
          {
            specId: 'test-spec',
            taskId: '1',
            queuedAt: new Date().toISOString(),
            status: 'running',
          },
        ]}
        ralphStatus={{
          running: false,
          status: 'stopped',
          currentIteration: 0,
          maxIterations: 0,
          currentStory: null,
        }}
      />
    );

    expect(screen.getByRole('button', { name: /run queue/i })).toBeInTheDocument();
  });

  it('should show loading state when decomposing', () => {
    render(<TasksSection {...defaultProps} isDecomposing={true} />);
    expect(screen.getByText(/generating/i)).toBeInTheDocument();
  });

  it('should render UseCaseList when stories exist', () => {
    render(<TasksSection {...defaultProps} />);
    expect(screen.getByTestId('use-case-list')).toBeInTheDocument();
    expect(screen.getByText('Stories: 2')).toBeInTheDocument();
  });

  it('should show empty message when no stories and not decomposing', () => {
    render(<TasksSection {...defaultProps} stories={[]} />);
    expect(screen.getByText(/no user stories yet/i)).toBeInTheDocument();
  });

  it('should not show empty message when decomposing', () => {
    render(<TasksSection {...defaultProps} stories={[]} isDecomposing={true} />);
    expect(screen.queryByText(/no user stories yet/i)).not.toBeInTheDocument();
  });

  it('should show reviewed badge when review verdict is PASS', () => {
    render(<TasksSection {...defaultProps} reviewVerdict="PASS" />);
    expect(screen.getByText('Reviewed')).toBeInTheDocument();
  });

  it('should show review feedback panel when review verdict is FAIL', () => {
    render(
      <TasksSection
        {...defaultProps}
        reviewVerdict="FAIL"
        reviewFeedback={{
          verdict: 'FAIL',
          missingRequirements: ['Missing requirement for integration test'],
        }}
      />
    );
    expect(screen.getByText('Review Feedback')).toBeInTheDocument();
    expect(screen.getByText('Missing requirement for integration test')).toBeInTheDocument();
  });

  it('should show spec status message when decomposition is partial', () => {
    render(
      <TasksSection
        {...defaultProps}
        specStatus="partial"
        specStatusMessage="Some stories still need refinement"
      />
    );
    expect(screen.getByText(/some stories still need refinement/i)).toBeInTheDocument();
  });
});
