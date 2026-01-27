import type { UserStory } from '../../types';
import { ChatMarkdown } from '../chat/ChatMarkdown';
import { ContextSection } from './ContextSection';

interface TaskInfoPanelProps {
  story: UserStory;
  completedIds: Set<string>;
  /** Tasks that this task blocks (optional) */
  blocks?: string[];
  className?: string;
}

// SVG Icons
const Icons = {
  check: (
    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  ),
  clock: (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  link: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
    </svg>
  ),
  test: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
  notes: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  ),
};

/**
 * Reusable panel for displaying task/story information.
 * Used in LiveExecutionView, TaskDrawer, and spec task views.
 */
export function TaskInfoPanel({ story, completedIds, blocks = [], className = '' }: TaskInfoPanelProps) {
  const missingDeps = story.dependencies.filter(dep => !completedIds.has(dep));
  const status = story.passes ? 'completed' : (missingDeps.length > 0 ? 'blocked' : 'ready');

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Description */}
      <section>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Description
        </h4>
        <div className="prose prose-sm max-w-none text-foreground">
          <ChatMarkdown content={story.description} />
        </div>
      </section>

      {/* Acceptance Criteria */}
      {story.acceptanceCriteria.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Acceptance Criteria
          </h4>
          <ul className="space-y-2">
            {story.acceptanceCriteria.map((criterion, idx) => (
              <li key={idx} className="flex items-start gap-3 text-sm">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                  story.passes ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground/40'
                }`}>
                  {story.passes ? Icons.check : <span className="w-2 h-2 rounded-full bg-current" />}
                </span>
                <span className={story.passes ? 'text-muted-foreground' : 'text-foreground'}>{criterion}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Test Cases */}
      {story.testCases && story.testCases.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            {Icons.test}
            Test Cases
          </h4>
          <div className="space-y-2">
            {story.testCases.map((test, idx) => (
              <code key={idx} className="block text-xs bg-secondary border border-border px-3 py-2 rounded-lg font-mono">
                {test}
              </code>
            ))}
          </div>
        </section>
      )}

      {/* Dependencies */}
      {story.dependencies.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            {Icons.link}
            Dependencies ({story.dependencies.length - missingDeps.length}/{story.dependencies.length})
          </h4>
          <div className="flex flex-wrap gap-2">
            {story.dependencies.map(dep => (
              <span
                key={dep}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
                  completedIds.has(dep)
                    ? 'bg-success/10 text-success'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {completedIds.has(dep) ? Icons.check : Icons.clock}
                {dep}
              </span>
            ))}
          </div>
          {missingDeps.length > 0 && (
            <div className="mt-3 flex items-center gap-2 px-4 py-3 rounded-lg bg-warning/10 border border-warning/20">
              <svg className="w-5 h-5 text-warning shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-sm text-warning">
                Blocked by {missingDeps.length} incomplete {missingDeps.length === 1 ? 'task' : 'tasks'}
              </span>
            </div>
          )}
        </section>
      )}

      {/* Blocks */}
      {blocks.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
            Blocks ({blocks.length})
          </h4>
          <div className="flex flex-wrap gap-2">
            {blocks.map(id => (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-error/10 text-error"
              >
                {id}
              </span>
            ))}
          </div>
          {status !== 'completed' && (
            <div className="mt-3 flex items-center gap-2 px-4 py-3 rounded-lg bg-info/10 border border-info/20">
              <svg className="w-5 h-5 text-info shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-info">
                Completing this will unblock {blocks.length} {blocks.length === 1 ? 'task' : 'tasks'}
              </span>
            </div>
          )}
        </section>
      )}

      {/* Notes */}
      {story.notes && (
        <section>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            {Icons.notes}
            Notes
          </h4>
          <div className="bg-secondary border border-border p-4 rounded-lg">
            <ChatMarkdown content={story.notes} />
          </div>
        </section>
      )}

      {/* Context */}
      {story.context && (
        <section>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Context
          </h4>
          <ContextSection context={story.context} headingLevel="h5" />
        </section>
      )}
    </div>
  );
}
