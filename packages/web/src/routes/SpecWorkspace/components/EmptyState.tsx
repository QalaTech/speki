import { SparklesIcon, PlusIcon } from '@heroicons/react/24/outline';
import { Button } from '../../../components/ui/Button';

interface EmptyStateProps {
  onCreateNew: () => void;
}

export function EmptyState({ onCreateNew }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-96 text-center">
      <div className="p-4 rounded-2xl bg-primary/10 mb-4">
        <SparklesIcon className="w-10 h-10 text-primary" />
      </div>
      <h2 className="text-xl font-semibold text-foreground mb-2">Select a spec</h2>
      <p className="text-muted-foreground text-sm max-w-sm">
        Choose a spec from the sidebar to start editing, or create a new one.
      </p>
      <Button variant="primary" className="mt-6" onClick={onCreateNew}>
        <PlusIcon className="w-4 h-4 mr-2" />
        New Spec
      </Button>
    </div>
  );
}
