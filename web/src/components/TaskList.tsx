import { useState, useMemo, useCallback } from 'react';
import type { UserStory } from '../types';
import { TaskCard } from './TaskCard';

interface TaskListProps {
  stories: UserStory[];
  currentStory: string | null;
}

type FilterType = 'all' | 'completed' | 'ready' | 'blocked';
type SortType = 'priority' | 'id' | 'status' | 'dependencies';

export function TaskList({ stories, currentStory }: TaskListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [sort, setSort] = useState<SortType>('priority');

  const completedIds = new Set(stories.filter(s => s.passes).map(s => s.id));

  // Build reverse dependency map: storyId -> list of stories that depend on it
  const blocksMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const story of stories) {
      for (const dep of story.dependencies) {
        if (!map.has(dep)) map.set(dep, []);
        map.get(dep)!.push(story.id);
      }
    }
    return map;
  }, [stories]);

  // Navigate to a specific task
  const scrollToTask = useCallback((taskId: string) => {
    setHighlightedId(taskId);
    setExpandedId(taskId);
    // Clear highlight after animation
    setTimeout(() => setHighlightedId(null), 2000);
    // Scroll to element
    const element = document.getElementById(`task-${taskId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  const getStatus = (story: UserStory) => {
    if (story.passes) return 'completed';
    const depsOk = story.dependencies.every(dep => completedIds.has(dep));
    return depsOk ? 'ready' : 'blocked';
  };

  // Check if a story is currently being worked on
  const isCurrentStory = (story: UserStory) => {
    if (!currentStory) return false;
    return currentStory.startsWith(story.id);
  };

  const filteredStories = stories.filter(story => {
    if (filter === 'all') return true;
    return getStatus(story) === filter;
  });

  const sortedStories = [...filteredStories].sort((a, b) => {
    // Always put currently running story first
    if (isCurrentStory(a) && !isCurrentStory(b)) return -1;
    if (!isCurrentStory(a) && isCurrentStory(b)) return 1;

    if (sort === 'priority') return a.priority - b.priority;
    if (sort === 'id') return a.id.localeCompare(b.id);
    if (sort === 'status') {
      const statusOrder = { ready: 0, blocked: 1, completed: 2 };
      return statusOrder[getStatus(a)] - statusOrder[getStatus(b)];
    }
    if (sort === 'dependencies') {
      // Sort by number of blocking tasks (most blockers first)
      const aBlocks = blocksMap.get(a.id)?.length || 0;
      const bBlocks = blocksMap.get(b.id)?.length || 0;
      return bBlocks - aBlocks;
    }
    return 0;
  });

  return (
    <div className="task-list">
      <div className="task-list-controls">
        <div className="filter-group">
          <label>Filter:</label>
          <select value={filter} onChange={e => setFilter(e.target.value as FilterType)}>
            <option value="all">All ({stories.length})</option>
            <option value="completed">Completed ({stories.filter(s => getStatus(s) === 'completed').length})</option>
            <option value="ready">Ready ({stories.filter(s => getStatus(s) === 'ready').length})</option>
            <option value="blocked">Blocked ({stories.filter(s => getStatus(s) === 'blocked').length})</option>
          </select>
        </div>
        <div className="sort-group">
          <label>Sort:</label>
          <select value={sort} onChange={e => setSort(e.target.value as SortType)}>
            <option value="priority">Priority</option>
            <option value="id">ID</option>
            <option value="status">Status</option>
            <option value="dependencies">Blockers</option>
          </select>
        </div>
        <button
          className="collapse-all-btn"
          onClick={() => setExpandedId(null)}
        >
          Collapse All
        </button>
      </div>

      <div className="task-cards">
        {sortedStories.map(story => (
          <TaskCard
            key={story.id}
            story={story}
            completedIds={completedIds}
            expanded={expandedId === story.id}
            onToggle={() => setExpandedId(expandedId === story.id ? null : story.id)}
            isRunning={isCurrentStory(story)}
            blocks={blocksMap.get(story.id) || []}
            highlighted={highlightedId === story.id}
            onNavigate={scrollToTask}
          />
        ))}
      </div>

      {sortedStories.length === 0 && (
        <div className="no-tasks">
          No tasks match the current filter.
        </div>
      )}
    </div>
  );
}
