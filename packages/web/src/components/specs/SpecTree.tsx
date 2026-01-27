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
          <ul>
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

  return (
    <>
      <li>
        <a
          className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all duration-200 hover-lift-sm active-press cursor-pointer ${
            isSelected
              ? 'bg-primary/15 text-primary font-medium ring-1 ring-primary/20 shadow-sm inner-glow-primary'
              : 'hover:bg-muted/50'
          } ${isGenerating ? 'opacity-50 pointer-events-none' : ''}`}
          onClick={(e) => {
            e.preventDefault();
            if (!isGenerating) onSelect(node.path);
          }}
        >
          {getFileIcon(node)}
          <span className={`flex-1 truncate ${isGenerating ? 'italic' : ''}`}>
            {node.name}
          </span>
          {node.name.endsWith('.md') && (
            <Badge variant={typeBadgeVariants[specType]} size="xs" outline className="shadow-sm">
              {specType.replace('tech-spec', 'tech')}
            </Badge>
          )}
          {node.reviewStatus && node.reviewStatus !== 'none' && getStatusIcon(node.reviewStatus)}
          {isGenerating && <ClockIcon className="h-4 w-4 animate-spin" />}
        </a>
      </li>
      {/* Render linked specs (tech specs under PRDs) */}
      {node.linkedSpecs && node.linkedSpecs.length > 0 && (
        <li>
          <ul className="ml-2 border-l-2 border-dashed border-muted-foreground/10">
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
    <div className="flex flex-col h-full frosted-sidebar">
      {/* Header */}
      <div className="flex items-center justify-between py-3.5 px-4 border-b border-border/5 bg-muted/30 backdrop-blur-sm">
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
      <div className="relative py-2.5 px-3 border-b border-border/5 bg-muted/30">
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
