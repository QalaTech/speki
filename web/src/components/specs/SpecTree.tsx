import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import './SpecTree.css';

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

  return (
    <div className="tree-node-container">
      <div
        ref={(el) => {
          if (el) nodeRefs.current.set(node.path, el);
          else nodeRefs.current.delete(node.path);
        }}
        className={`tree-node ${isSelected ? 'tree-node--selected' : ''} ${isFocused ? 'tree-node--focused' : ''} ${isDirectory ? 'tree-node--directory' : ''}`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={handleClick}
        role="treeitem"
        tabIndex={isFocused ? 0 : -1}
        aria-selected={isSelected}
        aria-expanded={isDirectory ? isExpanded : undefined}
        data-path={node.path}
      >
        {isDirectory && (
          <span className={`tree-node-chevron ${isExpanded ? 'tree-node-chevron--expanded' : ''}`}>
            ›
          </span>
        )}
        <span className="tree-node-icon">
          {getFileIcon(node, isExpanded)}
        </span>
        <span className="tree-node-name">{node.name}</span>
        {!isDirectory && node.name.endsWith('.md') && (
          <span className={`tree-node-type tree-node-type--${node.specType || detectSpecTypeFromFilename(node.name)}`}>
            {(node.specType || detectSpecTypeFromFilename(node.name)).replace('tech-spec', 'tech')}
          </span>
        )}
        {node.progress && node.progress.total > 0 && (
          <span
            className="tree-node-progress"
            title={`${node.progress.completed}/${node.progress.total} user stories achieved`}
          >
            <span className="tree-node-progress-fraction">
              {node.progress.completed}/{node.progress.total}
            </span>
            <span className="tree-node-progress-dots">
              {renderProgressDots(node.progress.completed, node.progress.total)}
            </span>
          </span>
        )}
        {node.reviewStatus && node.reviewStatus !== 'none' && (
          <span className="tree-node-status" title={node.reviewStatus}>
            {getStatusIcon(node.reviewStatus)}
          </span>
        )}
      </div>

      {isDirectory && isExpanded && node.children && (
        <div className="tree-node-children" role="group">
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

export function SpecTree({ files, selectedPath, onSelect, onCreateNew }: SpecTreeProps) {
  const [filter, setFilter] = useState('');
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const treeRef = useRef<HTMLDivElement>(null);

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

  // Filter files recursively
  const filteredFiles = useMemo(() => {
    if (!filter.trim()) return files;

    const filterLower = filter.toLowerCase();

    function filterNode(node: SpecFileNode): SpecFileNode | null {
      if (node.type === 'file') {
        return node.name.toLowerCase().includes(filterLower) ? node : null;
      }

      // Directory: filter children
      const filteredChildren = node.children
        ?.map(filterNode)
        .filter((n): n is SpecFileNode => n !== null);

      if (filteredChildren && filteredChildren.length > 0) {
        return { ...node, children: filteredChildren };
      }

      // Also match directory name itself
      if (node.name.toLowerCase().includes(filterLower)) {
        return node;
      }

      return null;
    }

    return files.map(filterNode).filter((n): n is SpecFileNode => n !== null);
  }, [files, filter]);

  // Auto-expand when filtering
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

  // Build flat list of visible paths for navigation
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

  // Build a map of path -> parent path
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

  // Build a map of path -> node
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

  // Focus the node element when focusedPath changes
  useEffect(() => {
    if (focusedPath) {
      const el = nodeRefs.current.get(focusedPath);
      el?.focus();
    }
  }, [focusedPath]);

  // Handle keyboard navigation
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
            // Expand
            handleToggle(focusedPath);
          } else if (currentNode.children?.length) {
            // Move to first child
            setFocusedPath(currentNode.children[0].path);
          }
        }
        break;
      }

      case 'ArrowLeft': {
        e.preventDefault();
        if (currentNode?.type === 'directory' && expandedPaths.has(focusedPath)) {
          // Collapse
          handleToggle(focusedPath);
        } else {
          // Move to parent
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

  // Set initial focus on first item
  useEffect(() => {
    if (!focusedPath && visiblePaths.length > 0) {
      setFocusedPath(visiblePaths[0]);
    }
  }, [visiblePaths, focusedPath]);

  return (
    <div className="spec-tree">
      <div className="spec-tree-header">
        <span className="spec-tree-title">📂 Specs</span>
        {onCreateNew && (
          <button
            className="spec-tree-add-btn"
            onClick={onCreateNew}
            title="Create new spec"
          >
            +
          </button>
        )}
      </div>

      <div className="spec-tree-filter">
        <input
          type="text"
          className="spec-tree-filter-input"
          placeholder="Filter specs..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {filter && (
          <button
            className="spec-tree-filter-clear"
            onClick={() => setFilter('')}
            title="Clear filter"
          >
            ×
          </button>
        )}
      </div>

      <div
        ref={treeRef}
        className="spec-tree-content"
        role="tree"
        onKeyDown={handleKeyDown}
        aria-label="Spec files"
      >
        {filteredFiles.length === 0 ? (
          <div className="spec-tree-empty">
            {filter ? 'No specs match filter' : 'No specs found'}
          </div>
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

      <div className="spec-tree-footer">
        <span className="spec-tree-hint">
          ↑↓ Navigate • ←→ Collapse/Expand • Enter Select
        </span>
      </div>
    </div>
  );
}
