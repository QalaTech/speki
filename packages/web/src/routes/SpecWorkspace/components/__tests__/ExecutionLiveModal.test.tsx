import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@test/render';
import { ExecutionLiveModal } from '../ExecutionLiveModal';
import type { RalphStatus, UserStory, QueuedTaskReference, PeerFeedback } from '../../../types';
import type { ParsedEntry } from '../../../utils/parseJsonl';

function mockRalphStatus(overrides: Partial<RalphStatus> = {}): RalphStatus {
  return {
    running: true,
    status: 'running',
    currentIteration: 1,
    maxIterations: 5,
    currentStory: 'story-1: Test Story',
    ...overrides,
  };
}

function mockUserStory(overrides: Partial<UserStory> = {}): UserStory {
  return {
    id: 'story-1',
    title: 'Test Story',
    description: 'A test story',
    acceptanceCriteria: ['Criteria 1'],
    priority: 1,
    passes: false,
    notes: '',
    dependencies: [],
    ...overrides,
  };
}

function mockQueueTask(overrides: Partial<QueuedTaskReference> = {}): QueuedTaskReference {
  return {
    specId: 'spec-1',
    taskId: 'story-1',
    queuedAt: new Date().toISOString(),
    status: 'queued',
    ...overrides,
  };
}

function mockPeerFeedback(overrides: Partial<PeerFeedback> = {}): PeerFeedback {
  return {
    blocking: [],
    suggestions: [],
    lessonsLearned: [
      {
        lesson: 'Always keep API payloads typed.',
        category: 'api',
        addedBy: 'ralph',
        addedAt: '2024-01-01T10:00:00.000Z',
      },
      {
        lesson: 'Add integration coverage for retry behavior.',
        category: 'testing',
        addedBy: 'ralph',
        addedAt: '2024-01-02T12:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

describe('ExecutionLiveModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    ralphStatus: mockRalphStatus(),
    logEntries: [],
    onStopExecution: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render modal with correct title when running', () => {
      render(<ExecutionLiveModal {...defaultProps} />);
      
      expect(screen.getByText('Live Execution')).toBeInTheDocument();
    });

    it('should render modal with correct title when stopped', () => {
      render(
        <ExecutionLiveModal 
          {...defaultProps} 
          ralphStatus={mockRalphStatus({ running: false, status: 'stopped' })} 
        />
      );
      
      expect(screen.getByText('Execution Log')).toBeInTheDocument();
    });

    it('should display iteration counter when running', () => {
      render(
        <ExecutionLiveModal 
          {...defaultProps} 
          ralphStatus={mockRalphStatus({ currentIteration: 3 })} 
        />
      );
      
      expect(screen.getByText('Iteration 3')).toBeInTheDocument();
    });

    it('should display stopped status when not running', () => {
      render(
        <ExecutionLiveModal 
          {...defaultProps} 
          ralphStatus={mockRalphStatus({ running: false, status: 'stopped' })} 
        />
      );
      
      expect(screen.getByText('Execution stopped')).toBeInTheDocument();
    });

    it('should render live activity and lessons tab labels', () => {
      render(<ExecutionLiveModal {...defaultProps} />);

      expect(screen.getByRole('button', { name: /live activity/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /lessons learned/i })).toBeInTheDocument();
    });
  });

  describe('lessons learned tab', () => {
    it('should trigger lessons refresh when tab is clicked', () => {
      const onRefreshLessons = vi.fn();
      render(
        <ExecutionLiveModal
          {...defaultProps}
          peerFeedback={mockPeerFeedback()}
          onRefreshLessons={onRefreshLessons}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /lessons learned/i }));

      expect(onRefreshLessons).toHaveBeenCalledTimes(1);
    });

    it('should switch to lessons tab and render lessons', () => {
      render(
        <ExecutionLiveModal
          {...defaultProps}
          peerFeedback={mockPeerFeedback()}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /lessons learned/i }));

      expect(screen.getByText(/Lessons Learned \(2\)/i)).toBeInTheDocument();
      expect(screen.getByText('Always keep API payloads typed.')).toBeInTheDocument();
      expect(screen.getByText('Add integration coverage for retry behavior.')).toBeInTheDocument();
    });

    it('should show empty lessons state when no lessons are available', () => {
      render(
        <ExecutionLiveModal
          {...defaultProps}
          peerFeedback={mockPeerFeedback({ lessonsLearned: [] })}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /lessons learned/i }));

      expect(screen.getByText(/No lessons learned yet/i)).toBeInTheDocument();
    });
  });

  describe('stop/resume buttons', () => {
    it('should show stop button when running', () => {
      render(<ExecutionLiveModal {...defaultProps} ralphStatus={mockRalphStatus({ running: true })} />);
      
      expect(screen.getByText('Stop')).toBeInTheDocument();
    });

    it('should call onStopExecution when stop button is clicked', () => {
      const onStopExecution = vi.fn();
      render(
        <ExecutionLiveModal 
          {...defaultProps} 
          ralphStatus={mockRalphStatus({ running: true })}
          onStopExecution={onStopExecution}
        />
      );
      
      fireEvent.click(screen.getByText('Stop'));
      
      expect(onStopExecution).toHaveBeenCalledTimes(1);
    });

    it('should show resume button when stopped and has queued tasks', () => {
      const onResumeExecution = vi.fn();
      const queueTasks = [mockQueueTask({ status: 'queued' })];
      
      render(
        <ExecutionLiveModal 
          {...defaultProps} 
          ralphStatus={mockRalphStatus({ running: false, status: 'stopped' })}
          onResumeExecution={onResumeExecution}
          queueTasks={queueTasks}
        />
      );
      
      expect(screen.getByText('Resume')).toBeInTheDocument();
    });

    it('should not show resume button when running', () => {
      const onResumeExecution = vi.fn();
      const queueTasks = [mockQueueTask({ status: 'queued' })];
      
      render(
        <ExecutionLiveModal 
          {...defaultProps} 
          ralphStatus={mockRalphStatus({ running: true })}
          onResumeExecution={onResumeExecution}
          queueTasks={queueTasks}
        />
      );
      
      expect(screen.queryByText('Resume')).not.toBeInTheDocument();
    });

    it('should call onResumeExecution when resume button is clicked', () => {
      const onResumeExecution = vi.fn();
      const queueTasks = [mockQueueTask({ status: 'queued' })];
      
      render(
        <ExecutionLiveModal 
          {...defaultProps} 
          ralphStatus={mockRalphStatus({ running: false, status: 'stopped' })}
          onResumeExecution={onResumeExecution}
          queueTasks={queueTasks}
        />
      );
      
      fireEvent.click(screen.getByText('Resume'));
      
      expect(onResumeExecution).toHaveBeenCalledTimes(1);
    });
  });

  describe('task queue list', () => {
    it('should display empty state when no tasks', () => {
      render(<ExecutionLiveModal {...defaultProps} />);
      
      expect(screen.getByText('No tasks in queue')).toBeInTheDocument();
    });

    it('should not show completed tasks when execution is stopped', () => {
      const stories = [mockUserStory({ id: 'story-1', title: 'Completed Story' })];
      const queueTasks = [mockQueueTask({ taskId: 'story-1', status: 'completed' })];

      render(
        <ExecutionLiveModal
          {...defaultProps}
          ralphStatus={mockRalphStatus({ running: false, status: 'stopped', currentStory: 'story-1: Completed Story' })}
          stories={stories}
          queueTasks={queueTasks}
        />
      );

      expect(screen.getByText('No tasks in queue')).toBeInTheDocument();
      expect(screen.queryByText('Completed Story')).not.toBeInTheDocument();
    });

    it('should display spec ID as group header', () => {
      const stories = [mockUserStory({ id: 'story-1' })];
      const queueTasks = [mockQueueTask({ taskId: 'story-1', specId: 'auth-spec' })];
      
      render(
        <ExecutionLiveModal 
          {...defaultProps} 
          stories={stories}
          queueTasks={queueTasks}
        />
      );
      
      expect(screen.getByText('auth-spec')).toBeInTheDocument();
    });

    it('should show RUNNING badge for current story', () => {
      const stories = [mockUserStory({ id: 'story-1', title: 'Running Story' })];
      const queueTasks = [mockQueueTask({ taskId: 'story-1' })];
      
      render(
        <ExecutionLiveModal 
          {...defaultProps} 
          ralphStatus={mockRalphStatus({ currentStory: 'story-1: Running Story' })}
          stories={stories}
          queueTasks={queueTasks}
        />
      );
      
      expect(screen.getByText('RUNNING')).toBeInTheDocument();
    });

    it('should display story ID', () => {
      const stories = [mockUserStory({ id: 'US-123' })];
      const queueTasks = [mockQueueTask({ taskId: 'US-123' })];
      
      render(
        <ExecutionLiveModal 
          {...defaultProps} 
          stories={stories}
          queueTasks={queueTasks}
        />
      );
      
      expect(screen.getByText('US-123')).toBeInTheDocument();
    });

    it('should call remove handler with spec and task IDs', () => {
      const onRemoveTaskFromQueue = vi.fn();
      const stories = [mockUserStory({ id: 'story-1', title: 'Queued Story' })];
      const queueTasks = [mockQueueTask({ taskId: 'story-1', specId: 'auth-spec', status: 'queued' })];

      render(
        <ExecutionLiveModal
          {...defaultProps}
          ralphStatus={mockRalphStatus({ running: false, status: 'stopped', currentStory: null })}
          stories={stories}
          queueTasks={queueTasks}
          onRemoveTaskFromQueue={onRemoveTaskFromQueue}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /remove story-1 from queue/i }));

      expect(onRemoveTaskFromQueue).toHaveBeenCalledWith('auth-spec', 'story-1');
    });

    it('should not show remove button for running task', () => {
      const onRemoveTaskFromQueue = vi.fn();
      const stories = [mockUserStory({ id: 'story-1', title: 'Running Story' })];
      const queueTasks = [mockQueueTask({ taskId: 'story-1', specId: 'auth-spec', status: 'running' })];

      render(
        <ExecutionLiveModal
          {...defaultProps}
          stories={stories}
          queueTasks={queueTasks}
          onRemoveTaskFromQueue={onRemoveTaskFromQueue}
        />
      );

      expect(screen.queryByRole('button', { name: /remove story-1 from queue/i })).not.toBeInTheDocument();
    });
  });

  describe('task selection', () => {
    it('should select task when clicked', () => {
      const stories = [
        mockUserStory({ id: 'story-1', title: 'First Story' }),
        mockUserStory({ id: 'story-2', title: 'Second Story' }),
      ];
      const queueTasks = [
        mockQueueTask({ taskId: 'story-1', specId: 'spec-1' }),
        mockQueueTask({ taskId: 'story-2', specId: 'spec-1' }),
      ];
      
      render(
        <ExecutionLiveModal 
          {...defaultProps} 
          stories={stories}
          queueTasks={queueTasks}
        />
      );
      
      // Click on second story
      fireEvent.click(screen.getByText('Second Story'));
      
      // Selected story title should be in the detail view
      expect(screen.getAllByText('Second Story').length).toBeGreaterThanOrEqual(1);
    });

    it('should auto-select current story', () => {
      const stories = [
        mockUserStory({ id: 'story-1', title: 'First Story' }),
        mockUserStory({ id: 'story-2', title: 'Second Story' }),
      ];
      const queueTasks = [
        mockQueueTask({ taskId: 'story-2', specId: 'spec-1' }),
      ];
      
      render(
        <ExecutionLiveModal 
          {...defaultProps} 
          ralphStatus={mockRalphStatus({ currentStory: 'story-2: Second Story' })}
          stories={stories}
          queueTasks={queueTasks}
        />
      );
      
      // Second story should have the Live badge (in detail header)
      expect(screen.getByText('Live')).toBeInTheDocument();
    });
  });

  describe('log display', () => {
    it('should display chat log view when task selected', () => {
      const stories = [mockUserStory({ id: 'story-1' })];
      const queueTasks = [mockQueueTask({ taskId: 'story-1' })];
      const logEntries: ParsedEntry[] = [{ type: 'text', content: 'Log message 1' }];
      
      render(
        <ExecutionLiveModal 
          {...defaultProps} 
          stories={stories}
          queueTasks={queueTasks}
          logEntries={logEntries}
        />
      );
      
      expect(screen.getByText('Log message 1')).toBeInTheDocument();
    });

    it('should show placeholder for non-running task when another is running', () => {
      const stories = [
        mockUserStory({ id: 'story-1', title: 'Running Story' }),
        mockUserStory({ id: 'story-2', title: 'Pending Story' }),
      ];
      const queueTasks = [
        mockQueueTask({ taskId: 'story-1', specId: 'spec-1' }),
        mockQueueTask({ taskId: 'story-2', specId: 'spec-1' }),
      ];
      
      render(
        <ExecutionLiveModal 
          {...defaultProps} 
          ralphStatus={mockRalphStatus({ currentStory: 'story-1: Running Story' })}
          stories={stories}
          queueTasks={queueTasks}
        />
      );
      
      // Click on pending story
      fireEvent.click(screen.getByText('Pending Story'));
      
      expect(screen.getByText('Logs are currently only available for the active task.')).toBeInTheDocument();
    });
  });

  describe('navigation', () => {
    it('should call onNavigateToSpec when spec header is clicked', () => {
      const onNavigateToSpec = vi.fn();
      const stories = [mockUserStory({ id: 'story-1' })];
      const queueTasks = [mockQueueTask({ taskId: 'story-1', specId: 'auth-spec' })];
      
      render(
        <ExecutionLiveModal 
          {...defaultProps} 
          stories={stories}
          queueTasks={queueTasks}
          onNavigateToSpec={onNavigateToSpec}
        />
      );
      
      fireEvent.click(screen.getByText('auth-spec'));
      
      expect(onNavigateToSpec).toHaveBeenCalledWith('auth-spec');
    });

    it('should call onClose when clicking the footer close button', () => {
      const onClose = vi.fn();
      render(<ExecutionLiveModal {...defaultProps} onClose={onClose} />);
      
      // Get the Close button in the footer (not the sr-only one)
      const closeButtons = screen.getAllByText('Close');
      const footerCloseButton = closeButtons.find(btn => 
        btn.tagName.toLowerCase() === 'button' && !btn.classList.contains('sr-only')
      );
      
      if (footerCloseButton) {
        fireEvent.click(footerCloseButton);
      }
      
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('grouping and sorting', () => {
    it('should group stories by spec ID', () => {
      const stories = [
        mockUserStory({ id: 'story-1' }),
        mockUserStory({ id: 'story-2' }),
      ];
      const queueTasks = [
        mockQueueTask({ taskId: 'story-1', specId: 'auth-spec' }),
        mockQueueTask({ taskId: 'story-2', specId: 'user-spec' }),
      ];
      
      render(
        <ExecutionLiveModal 
          {...defaultProps} 
          stories={stories}
          queueTasks={queueTasks}
        />
      );
      
      expect(screen.getByText('auth-spec')).toBeInTheDocument();
      expect(screen.getByText('user-spec')).toBeInTheDocument();
    });

    it('should sort groups with running task first', () => {
      const stories = [
        mockUserStory({ id: 'story-1' }),
        mockUserStory({ id: 'story-2' }),
      ];
      const queueTasks = [
        mockQueueTask({ taskId: 'story-1', specId: 'user-spec' }),
        mockQueueTask({ taskId: 'story-2', specId: 'auth-spec' }),
      ];
      
      render(
        <ExecutionLiveModal 
          {...defaultProps}
          ralphStatus={mockRalphStatus({ currentStory: 'story-2: Story 2' })}
          stories={stories}
          queueTasks={queueTasks}
        />
      );
      
      // auth-spec has the running story, should be highlighted
      const authSpec = screen.getByText('auth-spec');
      expect(authSpec).toHaveClass('text-primary');
    });
  });
});
