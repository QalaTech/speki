import { useState, useMemo, useRef, useCallback } from 'react';
import {
  DocumentTextIcon,
  FolderIcon,
  PlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { Button } from '../ui/Button';
import type { SpecFileNode } from './types';
import { TreeNode, formatSpecDisplayName } from './SpecTreeNode';

// Re-export for backwards compatibility
export type { SpecFileNode } from './types';
export type { SpecType } from './types';

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

  const handleToggle = useCallback((path: string, isOpen?: boolean) => {
    setExpandedPaths((prev) => {
      const currentlyOpen = prev.has(path);
      const shouldBeOpen = isOpen ?? !currentlyOpen;
      if (shouldBeOpen === currentlyOpen) return prev;

      const next = new Set(prev);
      if (shouldBeOpen) next.add(path);
      else next.delete(path);
      return next;
    });
  }, []);

  const filteredFiles = useMemo(() => {
    if (!filter.trim()) return filesWithGenerating;

    const filterLower = filter.toLowerCase();

    function filterNode(node: SpecFileNode): SpecFileNode | null {
      const { title } = formatSpecDisplayName(node.name);
      const specType = node.specType || '';
      
      const selfMatches = title.toLowerCase().includes(filterLower) || 
                         node.name.toLowerCase().includes(filterLower) ||
                         node.name.toLowerCase().includes(filterLower.replace(/\s+/g, '-')) ||
                         specType.toLowerCase().includes(filterLower.replace(/^\./, ''));

      // Check regular children for directories
      const filteredChildren = node.children
        ?.map(filterNode)
        .filter((n): n is SpecFileNode => n !== null);

      // Check linked specs (tech specs under PRDs)
      const filteredLinkedSpecs = node.linkedSpecs
        ?.map(filterNode)
        .filter((n): n is SpecFileNode => n !== null);

      const hasMatchingChildren = (filteredChildren && filteredChildren.length > 0) || 
                                 (filteredLinkedSpecs && filteredLinkedSpecs.length > 0);

      // Return node if it matches OR if any of its descendants match
      if (selfMatches || hasMatchingChildren) {
        return { 
          ...node, 
          children: filteredChildren,
          linkedSpecs: filteredLinkedSpecs
        };
      }

      return null;
    }

    return filesWithGenerating.map(filterNode).filter((n): n is SpecFileNode => n !== null);
  }, [filesWithGenerating, filter]);

  const filteredDirectoryPaths = useMemo(() => {
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
    return allDirPaths;
  }, [filteredFiles]);

  const effectiveExpandedPaths = filter.trim() ? filteredDirectoryPaths : expandedPaths;

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
          <ul ref={treeRef} className="w-full p-2 animate-stagger-in space-y-1.5" role="tree">
            {filteredFiles.map((node) => (
              <TreeNode
                key={node.path}
                node={node}
                selectedPath={selectedPath}
                expandedPaths={effectiveExpandedPaths}
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
