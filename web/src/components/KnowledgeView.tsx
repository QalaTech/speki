import { useState } from 'react';
import type { PeerFeedback, PeerFeedbackCategory } from '../types';

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

const categoryColors: Record<PeerFeedbackCategory, string> = {
  architecture: '#58a6ff',
  testing: '#3fb950',
  api: '#a371f7',
  database: '#f97583',
  performance: '#d29922',
  security: '#f85149',
  tooling: '#8b949e',
  patterns: '#79c0ff',
  gotchas: '#ffa657',
};

export function KnowledgeView({ peerFeedback, isLoading }: KnowledgeViewProps) {
  const [selectedCategory, setSelectedCategory] = useState<PeerFeedbackCategory | 'all'>('all');

  if (isLoading) {
    return (
      <div className="knowledge-view">
        <div className="knowledge-loading">Loading knowledge base...</div>
      </div>
    );
  }

  if (!peerFeedback) {
    return (
      <div className="knowledge-view">
        <div className="knowledge-empty">
          <div className="empty-icon">📚</div>
          <h3>Knowledge Base</h3>
          <p>No knowledge accumulated yet. Run tasks to build the knowledge base.</p>
        </div>
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
    <div className="knowledge-view">
      {/* Blocking Issues */}
      {blocking.length > 0 && (
        <section className="knowledge-section knowledge-blocking">
          <h3>
            <span className="section-icon">🚫</span>
            Blocking Issues ({blocking.length})
          </h3>
          <p className="section-description">Issues that must be resolved before the next task can proceed.</p>
          <div className="knowledge-list">
            {blocking.map((item, i) => (
              <div key={i} className="knowledge-item blocking-item">
                <div className="item-content">{item.issue}</div>
                <div className="item-meta">
                  <span className="item-source">Added by {item.addedBy}</span>
                  <span className="item-date">{formatDate(item.addedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Suggestions for upcoming tasks */}
      {suggestions.length > 0 && (
        <section className="knowledge-section knowledge-suggestions">
          <h3>
            <span className="section-icon">💡</span>
            Task Suggestions ({suggestions.length})
          </h3>
          <p className="section-description">Recommendations for specific upcoming tasks.</p>
          <div className="knowledge-list">
            {suggestions.map((item, i) => (
              <div key={i} className="knowledge-item suggestion-item">
                <div className="item-header">
                  <span className="item-target">For {item.forTask}</span>
                </div>
                <div className="item-content">{item.suggestion}</div>
                <div className="item-meta">
                  <span className="item-source">Added by {item.addedBy}</span>
                  <span className="item-date">{formatDate(item.addedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Lessons Learned */}
      <section className="knowledge-section knowledge-lessons">
        <h3>
          <span className="section-icon">📖</span>
          Lessons Learned ({lessonsLearned.length})
        </h3>
        <p className="section-description">Accumulated knowledge from completed tasks. This knowledge persists across all iterations.</p>

        {/* Category Filter */}
        {categoriesWithLessons.length > 1 && (
          <div className="category-filter">
            <button
              className={`category-btn ${selectedCategory === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('all')}
            >
              All ({lessonsLearned.length})
            </button>
            {categoriesWithLessons.map(cat => {
              const count = lessonsLearned.filter(l => l.category === cat).length;
              return (
                <button
                  key={cat}
                  className={`category-btn ${selectedCategory === cat ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    '--category-color': categoryColors[cat],
                  } as React.CSSProperties}
                >
                  {categoryLabels[cat]} ({count})
                </button>
              );
            })}
          </div>
        )}

        {filteredLessons.length > 0 ? (
          <div className="knowledge-list">
            {filteredLessons.map((item, i) => (
              <div key={i} className="knowledge-item lesson-item">
                <div className="item-header">
                  <span
                    className="category-badge"
                    style={{ backgroundColor: categoryColors[item.category] }}
                  >
                    {categoryLabels[item.category]}
                  </span>
                </div>
                <div className="item-content">{item.lesson}</div>
                <div className="item-meta">
                  <span className="item-source">Added by {item.addedBy}</span>
                  <span className="item-date">{formatDate(item.addedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="knowledge-empty-section">
            <p>No lessons learned yet. Complete tasks to accumulate knowledge.</p>
          </div>
        )}
      </section>
    </div>
  );
}
