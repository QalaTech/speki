import { useState } from 'react';
import type { PeerFeedback, PeerFeedbackCategory } from '../types';
import { Badge, Loading } from '../components/ui';

interface KnowledgeViewProps {
  peerFeedback: PeerFeedback | null;
  isLoading?: boolean;
}

const categoryLabels: Record<PeerFeedbackCategory, string> = {
  architecture: 'Architecture',
  testing: 'Testing',
  api: 'API',
  database: 'Database',
  performance: 'Performance',
  security: 'Security',
  tooling: 'Tooling',
  patterns: 'Patterns',
  gotchas: 'Gotchas',
};

const categoryVariants: Record<PeerFeedbackCategory, 'primary' | 'success' | 'secondary' | 'error' | 'warning' | 'info' | 'ghost' | 'neutral'> = {
  architecture: 'info',
  testing: 'success',
  api: 'secondary',
  database: 'error',
  performance: 'warning',
  security: 'error',
  tooling: 'ghost',
  patterns: 'info',
  gotchas: 'warning',
};

export function KnowledgeView({ peerFeedback, isLoading }: KnowledgeViewProps) {
  const [selectedCategory, setSelectedCategory] = useState<PeerFeedbackCategory | 'all'>('all');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loading size="lg" />
      </div>
    );
  }

  if (!peerFeedback) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-base-content/60">
        <div className="text-5xl mb-4 opacity-50">📚</div>
        <h3 className="text-lg font-semibold mb-2">Knowledge Base</h3>
        <p className="text-sm">No knowledge accumulated yet. Run tasks to build the knowledge base.</p>
      </div>
    );
  }

  const { blocking, suggestions, lessonsLearned } = peerFeedback;

  // Get unique categories from lessons
  const categoriesWithLessons = [...new Set(lessonsLearned.map(l => l.category))];

  // Filter lessons by category
  const filteredLessons = selectedCategory === 'all'
    ? lessonsLearned
    : lessonsLearned.filter(l => l.category === selectedCategory);

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6 overflow-y-auto h-full">
      {/* Blocking Issues */}
      {blocking.length > 0 && (
        <section className="card bg-error/10 border border-error/30">
          <div className="card-body">
            <h3 className="card-title text-error gap-2">
              <span>🚫</span>
              Blocking Issues ({blocking.length})
            </h3>
            <p className="text-sm text-base-content/60 mb-4">Issues that must be resolved before the next task can proceed.</p>
            <div className="flex flex-col gap-3">
              {blocking.map((item, i) => (
                <div key={i} className="card bg-base-100 border border-error/20">
                  <div className="card-body p-3">
                    <div className="text-sm">{item.issue}</div>
                    <div className="flex items-center gap-3 text-xs text-base-content/50 mt-2">
                      <span>Added by {item.addedBy}</span>
                      <span>{formatDate(item.addedAt)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Suggestions for upcoming tasks */}
      {suggestions.length > 0 && (
        <section className="card bg-warning/10 border border-warning/30">
          <div className="card-body">
            <h3 className="card-title text-warning gap-2">
              <span>💡</span>
              Task Suggestions ({suggestions.length})
            </h3>
            <p className="text-sm text-base-content/60 mb-4">Recommendations for specific upcoming tasks.</p>
            <div className="flex flex-col gap-3">
              {suggestions.map((item, i) => (
                <div key={i} className="card bg-base-100 border border-warning/20">
                  <div className="card-body p-3">
                    <Badge variant="ghost" size="sm" className="w-fit mb-2">For {item.forTask}</Badge>
                    <div className="text-sm">{item.suggestion}</div>
                    <div className="flex items-center gap-3 text-xs text-base-content/50 mt-2">
                      <span>Added by {item.addedBy}</span>
                      <span>{formatDate(item.addedAt)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Lessons Learned */}
      <section className="card bg-base-200 border border-base-300">
        <div className="card-body">
          <h3 className="card-title gap-2">
            <span>📖</span>
            Lessons Learned ({lessonsLearned.length})
          </h3>
          <p className="text-sm text-base-content/60 mb-4">Accumulated knowledge from completed tasks. This knowledge persists across all iterations.</p>

          {/* Category Filter */}
          {categoriesWithLessons.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                className={`btn btn-sm ${selectedCategory === 'all' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setSelectedCategory('all')}
              >
                All ({lessonsLearned.length})
              </button>
              {categoriesWithLessons.map(cat => {
                const count = lessonsLearned.filter(l => l.category === cat).length;
                return (
                  <button
                    key={cat}
                    className={`btn btn-sm ${selectedCategory === cat ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setSelectedCategory(cat)}
                  >
                    {categoryLabels[cat]} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {filteredLessons.length > 0 ? (
            <div className="flex flex-col gap-3">
              {filteredLessons.map((item, i) => (
                <div key={i} className="card bg-base-100 border border-base-300">
                  <div className="card-body p-3">
                    <Badge variant={categoryVariants[item.category]} size="sm" className="w-fit mb-2">
                      {categoryLabels[item.category]}
                    </Badge>
                    <div className="text-sm">{item.lesson}</div>
                    <div className="flex items-center gap-3 text-xs text-base-content/50 mt-2">
                      <span>Added by {item.addedBy}</span>
                      <span>{formatDate(item.addedAt)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-base-content/50">
              <p>No lessons learned yet. Complete tasks to accumulate knowledge.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
