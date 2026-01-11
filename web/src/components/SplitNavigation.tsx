import type { SplitSpecRef } from '../../../src/types/index.js';
import './SplitNavigation.css';

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
    <div className="split-navigation" data-testid="split-navigation">
      {hasChildren && (
        <div
          className="split-navigation-banner split-navigation-parent"
          data-testid="split-parent-banner"
        >
          <span className="split-navigation-icon" aria-hidden="true">
            &#x1F4C4;
          </span>
          <span className="split-navigation-text">
            Split into {splitSpecs.length} spec{splitSpecs.length !== 1 ? 's' : ''}:
          </span>
          <div className="split-navigation-links">
            {splitSpecs.map((spec) => (
              <button
                key={spec.filename}
                type="button"
                className="split-navigation-link"
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
          className="split-navigation-banner split-navigation-child"
          data-testid="split-child-banner"
        >
          <span className="split-navigation-icon" aria-hidden="true">
            &#x2B06;
          </span>
          <span className="split-navigation-text">Split from:</span>
          <button
            type="button"
            className="split-navigation-link"
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
