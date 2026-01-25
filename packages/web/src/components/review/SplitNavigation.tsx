import type { SplitSpecRef } from '@speki/core';

export interface SplitNavigationProps {
  /** Child specs if this is a parent that was split */
  splitSpecs?: SplitSpecRef[];
  /** Parent spec path if this is a child from a split */
  parentSpecPath?: string;
  /** Called when user clicks a navigation link */
  onNavigate: (specPath: string) => void;
}

export function SplitNavigation({
  splitSpecs,
  parentSpecPath,
  onNavigate,
}: SplitNavigationProps): React.ReactElement | null {
  const hasChildren = splitSpecs && splitSpecs.length > 0;
  const hasParent = Boolean(parentSpecPath);

  if (!hasChildren && !hasParent) {
    return null;
  }

  function getFilenameFromPath(path: string): string {
    const lastSlash = path.lastIndexOf('/');
    return lastSlash === -1 ? path : path.slice(lastSlash + 1);
  }

  return (
    <div className="mb-4" data-testid="split-navigation">
      {hasChildren && (
        <div
          className="flex flex-wrap items-center gap-2 py-3 px-4 rounded-md text-sm mb-2 last:mb-0 bg-blue-50 border border-blue-500 text-blue-800"
          data-testid="split-parent-banner"
        >
          <span className="text-base" aria-hidden="true">
            &#x1F4C4;
          </span>
          <span className="font-medium">
            Split into {splitSpecs.length} spec{splitSpecs.length !== 1 ? 's' : ''}:
          </span>
          <div className="flex flex-wrap gap-2">
            {splitSpecs.map((spec) => (
              <button
                key={spec.filename}
                type="button"
                className="bg-transparent border-none text-blue-600 cursor-pointer py-1 px-2 rounded text-sm font-medium underline transition-colors duration-200 hover:bg-black/[0.08] focus:outline-2 focus:outline-current focus:outline-offset-2"
                onClick={() => onNavigate(spec.filename)}
                title={spec.description || spec.filename}
                data-testid={`split-child-link-${spec.filename}`}
              >
                {spec.filename}
              </button>
            ))}
          </div>
        </div>
      )}

      {hasParent && parentSpecPath && (
        <div
          className="flex flex-wrap items-center gap-2 py-3 px-4 rounded-md text-sm mb-2 last:mb-0 bg-orange-50 border border-orange-500 text-orange-800"
          data-testid="split-child-banner"
        >
          <span className="text-base" aria-hidden="true">
            &#x2B06;
          </span>
          <span className="font-medium">Split from:</span>
          <button
            type="button"
            className="bg-transparent border-none text-orange-600 cursor-pointer py-1 px-2 rounded text-sm font-medium underline transition-colors duration-200 hover:bg-black/[0.08] focus:outline-2 focus:outline-current focus:outline-offset-2"
            onClick={() => onNavigate(parentSpecPath)}
            data-testid="split-parent-link"
          >
            {getFilenameFromPath(parentSpecPath)}
          </button>
        </div>
      )}
    </div>
  );
}
