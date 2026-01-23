import { useState, useMemo, useRef, useEffect, useCallback } from 'react';

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
  // Legacy files without type suffix default to PRD
  return 'prd';
}

interface SpecTreeProps {
  files: SpecFileNode[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onCreateNew?: () => void;
  /** Placeholder for a spec currently being generated */
  generatingSpec?: {
    parentPath: string;
    name: string;
  };
}

interface TreeNodeProps {
  node: SpecFileNode;
  depth: number;
  selectedPath: string | null;
  focusedPath: string | null;
  expandedPaths: Set<string>;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
  onFocus: (path: string) => void;
  nodeRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
}

function getStatusIcon(status?: string): string {
  switch (status) {
    case 'reviewed': return '✅';
    case 'pending': return '⚠️';
    case 'god-spec': return '🔴';
    case 'in-progress': return '⏳';
    default: return '';
  }
}

/**
 * Render progress dots (e.g., ●●●○○ for 3/5)
 */
function renderProgressDots(completed: number, total: number, maxDots = 5): string {
  if (total === 0) return '';
  const filledCount = Math.round((completed / total) * maxDots);
  const filled = '●'.repeat(filledCount);
  const empty = '○'.repeat(maxDots - filledCount);
  return filled + empty;
}

function getSpecTypeIcon(specType: SpecType): string {
  switch (specType) {
    case 'prd': return '📋';
    case 'tech-spec': return '🔧';
    case 'bug': return '🐛';
  }
}

function getFileIcon(node: SpecFileNode, isExpanded: boolean): string {
  if (node.type === 'directory') {
    return isExpanded ? '📂' : '📁';
  }

  // For markdown files, show type-specific icon
  if (node.name.endsWith('.md')) {
    const specType = node.specType || detectSpecTypeFromFilename(node.name);
    return getSpecTypeIcon(specType);
  }

  const ext = node.name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'yaml':
    case 'yml': return '⚙️';
    case 'json': return '📋';
    default: return '📄';
  }
}

function TreeNode({
  node,
  depth,
  selectedPath,
  focusedPath,
  expandedPaths,
  onSelect,
  onToggle,
  onFocus,
  nodeRefs,
}: TreeNodeProps) {
  const isExpanded = expandedPaths.has(node.path);
  const isSelected = selectedPath === node.path;
  const isFocused = focusedPath === node.path;
  const isDirectory = node.type === 'directory';

  const handleClick = () => {
    onFocus(node.path);
    if (isDirectory) {
      onToggle(node.path);
    } else {
      onSelect(node.path);
    }
  };

  const isGenerating = node.isGenerating;

  // Base node classes
  const nodeClasses = [
    "flex items-center gap-1.5 py-1.5 px-3 cursor-pointer transition-colors duration-100",
    "hover:bg-surface-hover focus:outline-none focus:bg-surface-hover",
    isSelected ? "!bg-[rgba(88,166,255,0.15)]" : "",
    isFocused ? "outline outline-2 outline-accent -outline-offset-2" : "",
    isDirectory ? "font-medium" : "",
    isGenerating ? "opacity-70 cursor-default pointer-events-none" : "",
  ].filter(Boolean).join(" ");

  // Type badge classes
  const getTypeBadgeClasses = (specType: SpecType) => {
    const base = "ml-auto py-px px-1.5 text-[9px] font-semibold uppercase tracking-[0.03em] rounded flex-shrink-0";
    switch (specType) {
      case 'prd': return `${base} bg-[rgba(59,130,246,0.15)] text-[#3b82f6]`;
      case 'tech-spec': return `${base} bg-[rgba(168,85,247,0.15)] text-[#a855f7]`;
      case 'bug': return `${base} bg-[rgba(239,68,68,0.15)] text-[#ef4444]`;
    }
  };

  return (
    <div className="select-none">
      <div
        ref={(el) => {
          if (el) nodeRefs.current.set(node.path, el);
          else nodeRefs.current.delete(node.path);
        }}
        className={nodeClasses}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={isGenerating ? undefined : handleClick}
        role="treeitem"
        tabIndex={isGenerating ? -1 : (isFocused ? 0 : -1)}
        aria-selected={isSelected}
        aria-expanded={isDirectory ? isExpanded : undefined}
        aria-busy={isGenerating}
        data-path={node.path}
      >
        {isDirectory && (
          <span className={`inline-flex items-center justify-center w-4 h-4 text-xs text-text-muted transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}>
            ›
          </span>
        )}
        <span className="flex-shrink-0 text-sm leading-none">
          {getFileIcon(node, isExpanded)}
        </span>
        <span className={`flex-1 text-[13px] text-text whitespace-nowrap overflow-hidden text-ellipsis ${isSelected ? '!text-accent' : ''} ${isGenerating ? 'italic !text-text-muted' : ''}`}>
          {node.name}
        </span>
        {!isDirectory && node.name.endsWith('.md') && (
          <span className={getTypeBadgeClasses(node.specType || detectSpecTypeFromFilename(node.name))}>
            {(node.specType || detectSpecTypeFromFilename(node.name)).replace('tech-spec', 'tech')}
          </span>
        )}
        {node.progress && node.progress.total > 0 && (
          <span
            className="flex items-center gap-1.5 ml-auto flex-shrink-0"
            title={`${node.progress.completed}/${node.progress.total} user stories achieved`}
          >
            <span className="text-[11px] font-medium text-text-muted tabular-nums">
              {node.progress.completed}/{node.progress.total}
            </span>
            <span className="text-[8px] tracking-[1px] text-accent">
              {renderProgressDots(node.progress.completed, node.progress.total)}
            </span>
          </span>
        )}
        {node.reviewStatus && node.reviewStatus !== 'none' && (
          <span className="flex-shrink-0 text-xs leading-none ml-auto" title={node.reviewStatus}>
            {getStatusIcon(node.reviewStatus)}
          </span>
        )}
        {node.isGenerating && (
          <span className="flex-shrink-0 text-xs leading-none ml-auto animate-spin" title="Generating...">
            ⏳
          </span>
        )}
      </div>

      {/* Render linked specs (tech specs under PRDs) */}
      {!isDirectory && node.linkedSpecs && node.linkedSpecs.length > 0 && (
        <div className="border-l border-dashed border-border ml-5" role="group">
          {node.linkedSpecs.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              focusedPath={focusedPath}
              expandedPaths={expandedPaths}
              onSelect={onSelect}
              onToggle={onToggle}
              onFocus={onFocus}
              nodeRefs={nodeRefs}
            />
          ))}
        </div>
      )}

      {isDirectory && isExpanded && node.children && (
        <div role="group">
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              focusedPath={focusedPath}
              expandedPaths={expandedPaths}
              onSelect={onSelect}
              onToggle={onToggle}
              onFocus={onFocus}
              nodeRefs={nodeRefs}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function SpecTree({ files, selectedPath, onSelect, onCreateNew, generatingSpec }: SpecTreeProps) {
  const [filter, setFilter] = useState('');
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const treeRef = useRef<HTMLDivElement>(null);

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

  const handleToggle = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

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

  useMemo(() => {
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

  const visiblePaths = useMemo(() => {
    const paths: string[] = [];

    function collectVisible(nodes: SpecFileNode[]) {
      for (const node of nodes) {
        paths.push(node.path);
        if (node.type === 'directory' && expandedPaths.has(node.path) && node.children) {
          collectVisible(node.children);
        }
      }
    }

    collectVisible(filteredFiles);
    return paths;
  }, [filteredFiles, expandedPaths]);

  const parentMap = useMemo(() => {
    const map = new Map<string, string>();

    function buildMap(nodes: SpecFileNode[], parentPath: string | null) {
      for (const node of nodes) {
        if (parentPath) {
          map.set(node.path, parentPath);
        }
        if (node.type === 'directory' && node.children) {
          buildMap(node.children, node.path);
        }
      }
    }

    buildMap(filteredFiles, null);
    return map;
  }, [filteredFiles]);

  const nodeMap = useMemo(() => {
    const map = new Map<string, SpecFileNode>();

    function buildMap(nodes: SpecFileNode[]) {
      for (const node of nodes) {
        map.set(node.path, node);
        if (node.children) {
          buildMap(node.children);
        }
      }
    }

    buildMap(filteredFiles);
    return map;
  }, [filteredFiles]);

  useEffect(() => {
    if (focusedPath) {
      const el = nodeRefs.current.get(focusedPath);
      el?.focus();
    }
  }, [focusedPath]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!focusedPath || visiblePaths.length === 0) return;

    const currentIndex = visiblePaths.indexOf(focusedPath);
    const currentNode = nodeMap.get(focusedPath);

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        if (currentIndex < visiblePaths.length - 1) {
          setFocusedPath(visiblePaths[currentIndex + 1]);
        }
        break;
      }

      case 'ArrowUp': {
        e.preventDefault();
        if (currentIndex > 0) {
          setFocusedPath(visiblePaths[currentIndex - 1]);
        }
        break;
      }

      case 'ArrowRight': {
        e.preventDefault();
        if (currentNode?.type === 'directory') {
          if (!expandedPaths.has(focusedPath)) {
            handleToggle(focusedPath);
          } else if (currentNode.children?.length) {
            setFocusedPath(currentNode.children[0].path);
          }
        }
        break;
      }

      case 'ArrowLeft': {
        e.preventDefault();
        if (currentNode?.type === 'directory' && expandedPaths.has(focusedPath)) {
          handleToggle(focusedPath);
        } else {
          const parentPath = parentMap.get(focusedPath);
          if (parentPath) {
            setFocusedPath(parentPath);
          }
        }
        break;
      }

      case 'Home': {
        e.preventDefault();
        if (visiblePaths.length > 0) {
          setFocusedPath(visiblePaths[0]);
        }
        break;
      }

      case 'End': {
        e.preventDefault();
        if (visiblePaths.length > 0) {
          setFocusedPath(visiblePaths[visiblePaths.length - 1]);
        }
        break;
      }

      case 'Enter':
      case ' ': {
        e.preventDefault();
        if (currentNode?.type === 'directory') {
          handleToggle(focusedPath);
        } else if (currentNode) {
          onSelect(focusedPath);
        }
        break;
      }
    }
  }, [focusedPath, visiblePaths, nodeMap, expandedPaths, parentMap, onSelect]);

  useEffect(() => {
    if (!focusedPath && visiblePaths.length > 0) {
      setFocusedPath(visiblePaths[0]);
    }
  }, [visiblePaths, focusedPath]);

  return (
    <>
      <style>{`
        .spec-tree-scrollbar::-webkit-scrollbar { width: 8px; }
        .spec-tree-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .spec-tree-scrollbar::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 4px; }
        .spec-tree-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--color-text-muted); }
      `}</style>
      <div className="flex flex-col h-full bg-surface border-r border-border">
        <div className="flex items-center justify-between py-3 px-4 border-b border-border">
          <span className="text-[13px] font-semibold text-text uppercase tracking-[0.03em]">📂 Specs</span>
          {onCreateNew && (
            <button
              className="flex items-center justify-center w-6 h-6 p-0 bg-transparent border border-border rounded-md text-text-muted text-base font-medium cursor-pointer transition-all duration-150 hover:bg-surface-hover hover:border-accent hover:text-accent"
              onClick={onCreateNew}
              title="Create new spec"
            >
              +
            </button>
          )}
        </div>

        <div className="relative py-2 px-3 border-b border-border">
          <input
            type="text"
            className="w-full py-2 pl-3 pr-8 bg-bg border border-border rounded-md text-text text-[13px] outline-none transition-all duration-150 placeholder:text-text-muted focus:border-accent focus:shadow-[0_0_0_2px_rgba(88,166,255,0.15)]"
            placeholder="Filter specs..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {filter && (
            <button
              className="absolute right-5 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 p-0 bg-transparent border-none rounded text-text-muted text-base cursor-pointer transition-all duration-150 hover:bg-surface-hover hover:text-text"
              onClick={() => setFilter('')}
              title="Clear filter"
            >
              ×
            </button>
          )}
        </div>

        <div
          ref={treeRef}
          className="flex-1 overflow-y-auto overflow-x-hidden py-2 spec-tree-scrollbar"
          role="tree"
          onKeyDown={handleKeyDown}
          aria-label="Spec files"
        >
          {filteredFiles.length === 0 ? (
            filter ? (
              <div className="flex items-center justify-center h-[100px] text-text-muted text-[13px]">
                No specs match filter
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 px-4 text-center gap-2">
                <div className="text-[32px] mb-2 opacity-80">📄</div>
                <h3 className="m-0 text-[15px] font-semibold text-text">No Specs Yet</h3>
                <p className="m-0 text-[13px] text-text-muted max-w-[200px] leading-[1.4]">
                  Create your first spec to get started with Ralph.
                </p>
                {onCreateNew && (
                  <button
                    className="mt-3 py-2.5 px-4 bg-primary border-none rounded-lg text-white text-[13px] font-medium cursor-pointer transition-all duration-150 hover:bg-primary-hover hover:-translate-y-px active:translate-y-0"
                    onClick={onCreateNew}
                  >
                    + Create First Spec
                  </button>
                )}
              </div>
            )
          ) : (
            filteredFiles.map((node) => (
              <TreeNode
                key={node.path}
                node={node}
                depth={0}
                selectedPath={selectedPath}
                focusedPath={focusedPath}
                expandedPaths={expandedPaths}
                onSelect={onSelect}
                onToggle={handleToggle}
                onFocus={setFocusedPath}
                nodeRefs={nodeRefs}
              />
            ))
          )}
        </div>

        <div className="py-2 px-3 border-t border-border bg-bg">
          <span className="text-[11px] text-text-muted tracking-[0.01em]">
            ↑↓ Navigate • ←→ Collapse/Expand • Enter Select
          </span>
        </div>
      </div>
    </>
  );
}
