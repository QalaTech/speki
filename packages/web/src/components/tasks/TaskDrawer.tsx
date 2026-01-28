import type { UserStory } from '../../types';
import { getStoryStatus } from '../../types';
import { TaskInfoPanel } from '../shared/TaskInfoPanel';
import { 
  Drawer, 
  DrawerContent, 
  DrawerHeader, 
  DrawerTitle, 
  DrawerBody 
} from '../ui/Drawer';
import { Button } from '../ui/Button';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface TaskDrawerProps {
  story: UserStory | null;
  completedIds: Set<string>;
  blocksMap: Map<string, string[]>;
  onClose: () => void;
}

const STATUS_CONFIG = {
  completed: { label: 'Completed', color: 'text-success', bg: 'bg-success/10', icon: '✓' },
  ready: { label: 'Ready', color: 'text-info', bg: 'bg-info/10', icon: '▶' },
  blocked: { label: 'Blocked', color: 'text-error', bg: 'bg-error/10', icon: '⏸' },
  pending: { label: 'Pending', color: 'text-muted-foreground/60', bg: 'bg-muted', icon: '○' },
};

const COMPLEXITY_CONFIG = {
  high: { color: 'text-error', bg: 'bg-error/10' },
  medium: { color: 'text-warning', bg: 'bg-warning/10' },
  low: { color: 'text-success', bg: 'bg-success/10' },
};

export function TaskDrawer({ story, completedIds, blocksMap, onClose }: TaskDrawerProps) {
  const isOpen = !!story;
  
  // Always render the Drawer root for Vaul animations, but content conditionally or handle via isOpen
  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()} direction="right">
      <DrawerContent side="right" className="w-[500px] sm:w-[600px]">
        {story && (
          <>
            <DrawerHeader>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {(() => {
                    const status = getStoryStatus(story, completedIds);
                    const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
                    return (
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${statusConfig.bg} ${statusConfig.color}`}>
                        <span>{statusConfig.icon}</span>
                        {statusConfig.label}
                      </span>
                    );
                  })()}
                  {story.complexity && (
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${COMPLEXITY_CONFIG[story.complexity].bg} ${COMPLEXITY_CONFIG[story.complexity].color}`}>
                      {story.complexity}
                    </span>
                  )}
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                    story.priority === 1 ? 'bg-error/10 text-error' :
                    story.priority === 2 ? 'bg-warning/10 text-warning' :
                    'bg-info/10 text-info'
                  }`}>
                    P{story.priority}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 rounded-full hover:bg-muted"
                  onClick={onClose}
                  aria-label="Close drawer"
                >
                  <XMarkIcon className="w-5 h-5" />
                </Button>
              </div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-xs text-muted-foreground/50 bg-muted/50 px-2 py-0.5 rounded">
                  {story.id}
                </span>
              </div>
              <DrawerTitle className="text-xl font-bold text-foreground">
                {story.title}
              </DrawerTitle>
            </DrawerHeader>

            <DrawerBody>
              <TaskInfoPanel
                story={story}
                completedIds={completedIds}
                blocks={blocksMap.get(story.id) || []}
              />
            </DrawerBody>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
