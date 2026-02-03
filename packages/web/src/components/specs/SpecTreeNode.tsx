/**
 * SpecTreeNode - Shared tree node components for spec file trees.
 *
 * Used by both SpecTree and AppSidebar to render the spec file tree.
 */
import {
  DocumentTextIcon,
  FolderIcon,
  FolderOpenIcon,
  WrenchScrewdriverIcon,
  BugAntIcon,
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
  DocumentIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon, ExclamationTriangleIcon, ClockIcon } from '@heroicons/react/20/solid';
import type { SpecFileNode, SpecType } from './types';

/**
 * Detect spec type from filename
 */
export function detectSpecTypeFromFilename(filename: string): SpecType {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.prd.md')) return 'prd';
  if (lower.endsWith('.tech.md')) return 'tech-spec';
  if (lower.endsWith('.bug.md')) return 'bug';
  return 'prd';
}

/**
 * Formats a technical filename into a human-readable title and date
 * Input: "20260127-193651-create-tech-spec.md"
 * Output: { title: "Create Tech Spec", subtitle: "Jan 27, 19:36", parentTitle: "..." }
 */
export function formatSpecDisplayName(filename: string, parentPath?: string) {
  const basename = filename.replace(/\.md$/, '');
  const parts = basename.split('-');

  let title = '';
  let subtitle: string | null = null;
  let parentTitle: string | null = null;

  if (parentPath) {
    const parentBasename = parentPath.split('/').pop()?.replace(/\.(prd|tech|bug)\.md$/, '') || '';
    parentTitle = parentBasename.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  }

  // Check if it follows the pattern: YYYYMMDD-HHMMSS-title
  if (parts.length >= 3 && parts[0].length === 8 && parts[1].length === 6) {
    const dateStr = parts[0];
    const timeStr = parts[1];
    title = parts.slice(2).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');

    try {
      const year = parseInt(dateStr.substring(0, 4));
      const month = parseInt(dateStr.substring(4, 6)) - 1;
      const day = parseInt(dateStr.substring(6, 8));
      const hour = parseInt(timeStr.substring(0, 2));
      const minute = parseInt(timeStr.substring(2, 4));

      const date = new Date(year, month, day, hour, minute);
      subtitle = date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } catch {
      title = basename;
    }
  } else {
    // Fallback for non-standard names
    title = basename.split(/[-_.]/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  }

  return { title, subtitle, parentTitle };
}

function getStatusIcon(status?: string) {
  switch (status) {
    case 'reviewed':
      return <CheckCircleIcon className="h-3.5 w-3.5 text-success" />;
    case 'pending':
      return <ExclamationTriangleIcon className="h-3.5 w-3.5 text-warning" />;
    case 'god-spec':
      return <ExclamationTriangleIcon className="h-3.5 w-3.5 text-error" />;
    case 'in-progress':
      return <ClockIcon className="h-3.5 w-3.5 text-info" />;
    default:
      return null;
  }
}

const typeIconColors: Record<SpecType, string> = {
  'prd': 'text-info',
  'tech-spec': 'text-primary',
  'bug': 'text-error',
};

function getSpecTypeIcon(specType: SpecType) {
  const colorClass = typeIconColors[specType];
  switch (specType) {
    case 'prd':
      return <ClipboardDocumentListIcon className={`h-3.5 w-3.5 ${colorClass}`} />;
    case 'tech-spec':
      return <WrenchScrewdriverIcon className={`h-3.5 w-3.5 ${colorClass}`} />;
    case 'bug':
      return <BugAntIcon className={`h-3.5 w-3.5 ${colorClass}`} />;
  }
}

function getFileIcon(node: SpecFileNode) {
  if (node.name.endsWith('.md')) {
    const specType = node.specType || detectSpecTypeFromFilename(node.name);
    return getSpecTypeIcon(specType);
  }

  const ext = node.name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'yaml':
    case 'yml':
      return <Cog6ToothIcon className="h-3.5 w-3.5" />;
    case 'json':
      return <DocumentTextIcon className="h-3.5 w-3.5" />;
    default:
      return <DocumentIcon className="h-3.5 w-3.5" />;
  }
}

export interface TreeNodeProps {
  node: SpecFileNode;
  selectedPath: string | null;
  expandedPaths: Set<string>;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
}

export function TreeNode({
  node,
  selectedPath,
  expandedPaths,
  onSelect,
  onToggle,
}: TreeNodeProps) {
  const isExpanded = expandedPaths.has(node.path);
  const isSelected = selectedPath === node.path;
  const isDirectory = node.type === 'directory';
  const isGenerating = node.isGenerating;

  if (isDirectory) {
    return (
      <li>
        <details open={isExpanded} onToggle={(e) => {
          e.stopPropagation();
          onToggle(node.path);
        }}>
          <summary className="flex items-center gap-1.5 px-2 py-1 hover:bg-sidebar-accent/50 rounded-md transition-colors cursor-pointer text-xs">
            {isExpanded ? (
              <FolderOpenIcon className="h-3.5 w-3.5 text-warning/80" />
            ) : (
              <FolderIcon className="h-3.5 w-3.5 text-warning/80" />
            )}
            <span className="flex-1 truncate font-medium text-sidebar-foreground/70">{node.name}</span>
          </summary>
          <ul className="pl-3 border-l border-sidebar-border/30 ml-2">
            {node.children?.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                selectedPath={selectedPath}
                expandedPaths={expandedPaths}
                onSelect={onSelect}
                onToggle={onToggle}
              />
            ))}
          </ul>
        </details>
      </li>
    );
  }

  // File node
  const specType = node.specType || detectSpecTypeFromFilename(node.name);
  const { title, subtitle } = formatSpecDisplayName(node.name, node.parentSpecId);

  return (
    <>
      <li className={node.parentSpecId ? 'relative' : ''}>
        {node.parentSpecId && (
          <div className="absolute -left-px top-0 bottom-2 w-3 border-l border-b border-sidebar-border/40 rounded-bl" />
        )}
        <a
          role="treeitem"
          aria-selected={isSelected}
          className={`group flex items-center gap-2 px-2 py-1.5 rounded-md transition-all duration-150 cursor-pointer ${
            node.parentSpecId ? 'ml-3' : ''
          } ${
            isSelected
              ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
              : 'hover:bg-sidebar-accent/60 hover:shadow-sm text-sidebar-foreground/80 hover:text-sidebar-foreground'
          } ${isGenerating ? 'opacity-50 pointer-events-none' : ''}`}
          onClick={(e) => {
            e.preventDefault();
            if (!isGenerating) onSelect(node.path);
          }}
        >
          <div className={`shrink-0 transition-colors ${
            isSelected ? 'text-sidebar-primary' : 'text-sidebar-foreground/50'
          }`}>
            {getFileIcon(node)}
          </div>

          <div className="flex-1 min-w-0 flex flex-col gap-px">
            <div className="flex items-center justify-between gap-1.5">
              <span className={`text-xs truncate leading-tight ${
                isSelected ? 'font-medium' : 'font-normal'
              } ${isGenerating ? 'italic' : ''}`}>
                {title}
              </span>
              <div className="shrink-0 flex items-center gap-1">
                {isGenerating ? (
                  <ClockIcon className="h-3 w-3 animate-spin text-sidebar-primary/60" />
                ) : (
                  node.reviewStatus && node.reviewStatus !== 'none' && (
                    <div className="scale-75">
                      {getStatusIcon(node.reviewStatus)}
                    </div>
                  )
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 overflow-hidden">
              <span className={`text-[10px] uppercase tracking-wide font-medium ${
                specType === 'prd' ? 'text-info/70' : specType === 'tech-spec' ? 'text-sidebar-primary/70' : 'text-error/70'
              }`}>
                {specType.replace('tech-spec', 'tech')}
              </span>
              {subtitle && (
                <>
                  <span className="text-sidebar-foreground/20">·</span>
                  <span className="text-[10px] text-sidebar-foreground/40 tabular-nums truncate">{subtitle}</span>
                </>
              )}
            </div>
          </div>
        </a>
      </li>
      {/* Render linked specs (tech specs under PRDs) */}
      {node.linkedSpecs && node.linkedSpecs.length > 0 && (
        <li className="ml-4">
          <ul className="space-y-0.5 pl-2 border-l border-sidebar-border/30">
            {node.linkedSpecs.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                selectedPath={selectedPath}
                expandedPaths={expandedPaths}
                onSelect={onSelect}
                onToggle={onToggle}
              />
            ))}
          </ul>
        </li>
      )}
    </>
  );
}
