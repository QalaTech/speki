import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  DocumentTextIcon,
  FolderIcon,
  FolderOpenIcon,
  WrenchScrewdriverIcon,
  BugAntIcon,
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
  DocumentIcon,
  PlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon, ExclamationTriangleIcon, ClockIcon } from '@heroicons/react/20/solid';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

export type SpecType = 'prd' | 'tech-spec' | 'bug';

export interface SpecFileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: SpecFileNode[];
  reviewStatus?: 'reviewed' | 'pending' | 'god-spec' | 'in-progress' | 'none';
  specType?: SpecType;
  /** Progress for PRDs: completed user stories / total */
  progress?: { completed: number; total: number };
  /** Linked child specs (tech specs under PRDs) */
  linkedSpecs?: SpecFileNode[];
  /** Parent spec ID (for tech specs linked to PRDs) */
  parentSpecId?: string;
  /** Whether this is a placeholder for a generating spec */
  isGenerating?: boolean;
}

/**
 * Detect spec type from filename
 */
function detectSpecTypeFromFilename(filename: string): SpecType {
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
function formatSpecDisplayName(filename: string, parentPath?: string) {
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
    } catch (e) {
      title = basename;
    }
  } else {
    // Fallback for non-standard names
    title = basename.split(/[-_.]/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  }

  return { title, subtitle, parentTitle };
}

interface SpecTreeProps {
  files: SpecFileNode[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onCreateNew?: () => void;
  generatingSpec?: {
    parentPath: string;
    name: string;
  };
}

function getStatusIcon(status?: string) {
  switch (status) {
    case 'reviewed':
      return <CheckCircleIcon className="h-4 w-4 text-success" />;
    case 'pending':
      return <ExclamationTriangleIcon className="h-4 w-4 text-warning" />;
    case 'god-spec':
      return <ExclamationTriangleIcon className="h-4 w-4 text-error" />;
    case 'in-progress':
      return <ClockIcon className="h-4 w-4 text-info" />;
    default:
      return null;
  }
}

const typeIconColors: Record<SpecType, string> = {
  'prd': 'text-info',
  'tech-spec': 'text-primary',
  'bug': 'text-error',
};

const typeBadgeVariants: Record<SpecType, "info" | "primary" | "error"> = {
  'prd': 'info',
  'tech-spec': 'primary',
  'bug': 'error',
};

function getSpecTypeIcon(specType: SpecType) {
  const colorClass = typeIconColors[specType];
  switch (specType) {
    case 'prd':
      return <ClipboardDocumentListIcon className={`h-4 w-4 ${colorClass}`} />;
    case 'tech-spec':
      return <WrenchScrewdriverIcon className={`h-4 w-4 ${colorClass}`} />;
    case 'bug':
      return <BugAntIcon className={`h-4 w-4 ${colorClass}`} />;
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
      return <Cog6ToothIcon className="h-4 w-4" />;
    case 'json':
      return <DocumentTextIcon className="h-4 w-4" />;
    default:
      return <DocumentIcon className="h-4 w-4" />;
  }
}

interface TreeNodeProps {
  node: SpecFileNode;
  selectedPath: string | null;
  expandedPaths: Set<string>;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
}

function TreeNode({
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
          <summary className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted/50 rounded-lg transition-colors cursor-pointer">
            {isExpanded ? (
              <FolderOpenIcon className="h-4 w-4 text-warning" />
            ) : (
              <FolderIcon className="h-4 w-4 text-warning" />
            )}
            <span className="flex-1 truncate font-medium text-foreground/80">{node.name}</span>
          </summary>
          <ul className="pl-4">
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
  const { title, subtitle, parentTitle } = formatSpecDisplayName(node.name, node.parentSpecId);

  return (
    <>
      <li className={node.parentSpecId ? 'relative' : ''}>
        {node.parentSpecId && (
          <div className="absolute -left-px top-0 bottom-[15px] w-4 border-l border-b border-muted-foreground/40 rounded-bl-lg" />
        )}
        <a
          role="treeitem"
          aria-selected={isSelected}
          className={`group flex items-start gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 hover-lift-sm active-press cursor-pointer border border-transparent ${
            node.parentSpecId ? 'ml-4' : ''
          } ${
            isSelected
              ? 'bg-primary/10 border-primary/20 shadow-[0_2px_10px_rgba(var(--primary-rgb),0.1)]'
              : 'hover:bg-muted/40'
          } ${isGenerating ? 'opacity-60 pointer-events-none' : ''}`}
          onClick={(e) => {
            e.preventDefault();
            if (!isGenerating) onSelect(node.path);
          }}
        >
          <div className={`mt-0.5 shrink-0 p-1.5 rounded-lg transition-colors ${
            isSelected ? 'bg-primary/20 text-primary' : 'bg-muted/30 text-muted-foreground group-hover:bg-muted/50'
          }`}>
            {getFileIcon(node)}
          </div>
          
          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            <div className="flex items-center justify-between gap-2">
              <span className={`text-sm truncate leading-tight ${
                isSelected ? 'font-semibold text-primary' : 'font-medium text-foreground/90'
              } ${isGenerating ? 'italic' : ''}`}>
                {title}
              </span>
              <div className="shrink-0 flex items-center gap-1.5">
                {isGenerating ? (
                  <ClockIcon className="h-3.5 w-3.5 animate-spin text-primary/60" />
                ) : (
                  node.reviewStatus && node.reviewStatus !== 'none' && (
                    <div className="transition-transform group-hover:scale-110">
                      {getStatusIcon(node.reviewStatus)}
                    </div>
                  )
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2 overflow-hidden">
              <Badge 
                variant={typeBadgeVariants[specType]} 
                size="xs" 
                className="px-1.5 py-0 h-4 uppercase tracking-wider text-[9px] font-bold ring-1 ring-inset ring-current/20"
              >
                {specType.replace('tech-spec', 'tech')}
              </Badge>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 truncate font-medium">
                {subtitle && <span className="shrink-0 tabular-nums">{subtitle}</span>}
                {parentTitle && (
                  <>
                    <span className="shrink-0 text-muted-foreground/30">•</span>
                    <span className="truncate italic text-muted-foreground/50">
                      Implements: {parentTitle}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </a>
      </li>
      {/* Render linked specs (tech specs under PRDs) */}
      {node.linkedSpecs && node.linkedSpecs.length > 0 && (
        <li className="ml-[26px]">
          <ul className="space-y-0.5 relative border-l border-muted-foreground/15">
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
export function SpecTree({ files, selectedPath, onSelect, onCreateNew, generatingSpec }: SpecTreeProps) {
  const [filter, setFilter] = useState('');
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const treeRef = useRef<HTMLUListElement>(null);

  // Inject generating spec placeholder into tree
  const filesWithGenerating = useMemo(() => {
    if (!generatingSpec) return files;

    const genSpec = generatingSpec;

    function injectGenerating(nodes: SpecFileNode[]): SpecFileNode[] {
      return nodes.map(node => {
        if (node.path === genSpec.parentPath) {
          const generatingNode: SpecFileNode = {
            name: genSpec.name,
            path: `${genSpec.parentPath}/__generating__`,
            type: 'file',
            specType: 'tech-spec',
            isGenerating: true,
          };
          return {
            ...node,
            linkedSpecs: [...(node.linkedSpecs || []), generatingNode],
          };
        }
        if (node.children) {
          return { ...node, children: injectGenerating(node.children) };
        }
        return node;
      });
    }

    return injectGenerating(files);
  }, [files, generatingSpec]);

  const handleToggle = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const filteredFiles = useMemo(() => {
    if (!filter.trim()) return filesWithGenerating;

    const filterLower = filter.toLowerCase();

    function filterNode(node: SpecFileNode): SpecFileNode | null {
      if (node.type === 'file') {
        return node.name.toLowerCase().includes(filterLower) ? node : null;
      }

      const filteredChildren = node.children
        ?.map(filterNode)
        .filter((n): n is SpecFileNode => n !== null);

      if (filteredChildren && filteredChildren.length > 0) {
        return { ...node, children: filteredChildren };
      }

      if (node.name.toLowerCase().includes(filterLower)) {
        return node;
      }

      return null;
    }

    return filesWithGenerating.map(filterNode).filter((n): n is SpecFileNode => n !== null);
  }, [filesWithGenerating, filter]);

  // Auto-expand all directories when filtering
  useEffect(() => {
    if (filter.trim()) {
      const allDirPaths = new Set<string>();
      function collectDirs(nodes: SpecFileNode[]) {
        for (const node of nodes) {
          if (node.type === 'directory') {
            allDirPaths.add(node.path);
            if (node.children) collectDirs(node.children);
          }
        }
      }
      collectDirs(filteredFiles);
      setExpandedPaths(allDirPaths);
    }
  }, [filter, filteredFiles]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between py-3.5 px-4 border-b border-border/30">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-linear-to-br from-warning/20 to-warning/10 ring-1 ring-warning/20">
            <FolderIcon className="h-4 w-4 text-warning" />
          </div>
          <span className="text-sm font-semibold text-foreground tracking-tight">Specs</span>
        </div>
        {onCreateNew && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 rounded-lg hover:bg-primary/10 hover:text-primary transition-all duration-200"
            onClick={onCreateNew}
            title="Create new spec"
          >
            <PlusIcon className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Filter input */}
      <div className="relative py-2.5 px-3 border-b border-border/30">
        <div className="relative">
          <input
            type="text"
            className="w-full h-8 px-3 pr-8 text-sm rounded-md bg-card/80 border border-border/10 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all duration-200 placeholder:text-muted-foreground/40"
            placeholder="Filter specs..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {filter && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 rounded-full hover:bg-error/10 hover:text-error transition-colors"
              onClick={() => setFilter('')}
              title="Clear filter"
            >
              <XMarkIcon className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {filteredFiles.length === 0 ? (
          filter ? (
            <div className="flex flex-col items-center justify-center h-24 text-muted-foreground text-sm gap-1">
              <span>No specs match</span>
              <span className="text-xs text-muted-foreground/40">"{filter}"</span>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center gap-4">
              <div className="p-4 rounded-2xl bg-linear-to-br from-muted/50 to-muted/30 ring-1 ring-border/5">
                <DocumentTextIcon className="h-10 w-10 text-muted-foreground/30" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-foreground">No Specs Yet</h3>
                <p className="text-sm text-muted-foreground max-w-[180px] leading-relaxed">
                  Create your first spec to get started
                </p>
              </div>
              {onCreateNew && (
                <Button 
                  size="sm"
                  className="gap-2 shadow-md"
                  onClick={onCreateNew}
                >
                  <PlusIcon className="h-4 w-4" />
                  Create Spec
                </Button>
              )}
            </div>
          )
        ) : (
          <ul ref={treeRef} className="w-full p-2 animate-stagger-in space-y-0.5" role="tree">
            {filteredFiles.map((node) => (
              <TreeNode
                key={node.path}
                node={node}
                selectedPath={selectedPath}
                expandedPaths={expandedPaths}
                onSelect={onSelect}
                onToggle={handleToggle}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
