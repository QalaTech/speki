/**
 * AppSidebar - Spec tree sidebar using shadcn sidebar components.
 *
 * Wraps SpecTree in a collapsible sidebar with:
 * - Keyboard shortcut (Cmd+B) to toggle
 * - Mobile sheet on small screens
 * - SidebarRail for quick collapse
 */
import * as React from 'react';
import { FolderIcon, PlusIcon, XMarkIcon, ChevronLeftIcon } from '@heroicons/react/24/outline';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarRail,
  SidebarInput,
  SidebarGroup,
  SidebarGroupContent,
  useSidebar,
} from '../ui/sidebar';
import type { SpecFileNode } from './types';
import { TreeNode, formatSpecDisplayName } from './SpecTreeNode';

interface AppSidebarProps extends Omit<React.ComponentProps<typeof Sidebar>, 'onSelect'> {
  files: SpecFileNode[];
  selectedPath: string | null;
  onSelect: (path: string | null) => void;
  onCreateNew?: () => void;
  generatingSpec?: {
    name: string;
    parentPath: string;
  };
}

function stripSpecsRoot(nodes: SpecFileNode[]): SpecFileNode[] {
  if (
    nodes.length === 1 &&
    nodes[0].type === 'directory' &&
    nodes[0].path === 'specs'
  ) {
    return nodes[0].children || [];
  }
  return nodes;
}

function findAncestorDirectories(
  nodes: SpecFileNode[],
  targetPath: string,
  ancestors: string[] = []
): string[] | null {
  for (const node of nodes) {
    if (node.type === 'directory') {
      const nextAncestors = [...ancestors, node.path];
      if (node.path === targetPath) return nextAncestors;
      if (node.children) {
        const result = findAncestorDirectories(node.children, targetPath, nextAncestors);
        if (result) return result;
      }
    } else {
      if (node.path === targetPath) return ancestors;
      if (node.linkedSpecs) {
        const result = findAncestorDirectories(node.linkedSpecs, targetPath, ancestors);
        if (result) return result;
      }
    }
  }

  return null;
}

export function AppSidebar({
  files,
  selectedPath,
  onSelect,
  onCreateNew,
  generatingSpec,
  ...props
}: AppSidebarProps) {
  const [filter, setFilter] = React.useState('');
  const [expandedPaths, setExpandedPaths] = React.useState<Set<string>>(new Set());
  const { state, toggleSidebar, isMobile, setOpenMobile } = useSidebar();
  const isCollapsed = state === 'collapsed';

  // Close mobile sidebar when a spec is selected
  const handleSelect = React.useCallback((path: string | null) => {
    onSelect(path);
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [onSelect, isMobile, setOpenMobile]);

  // Inject generating spec placeholder into tree
  const sidebarFiles = React.useMemo(() => {
    if (!generatingSpec) return stripSpecsRoot(files);

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

    return stripSpecsRoot(injectGenerating(files));
  }, [files, generatingSpec]);

  const handleToggle = React.useCallback((path: string, isOpen?: boolean) => {
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

  const filteredFiles = React.useMemo(() => {
    if (!filter.trim()) return sidebarFiles;

    const filterLower = filter.toLowerCase();

    function filterNode(node: SpecFileNode): SpecFileNode | null {
      const { title } = formatSpecDisplayName(node.name);
      const specType = node.specType || '';

      const selfMatches = title.toLowerCase().includes(filterLower) ||
                         node.name.toLowerCase().includes(filterLower) ||
                         node.name.toLowerCase().includes(filterLower.replace(/\s+/g, '-')) ||
                         specType.toLowerCase().includes(filterLower.replace(/^\./, ''));

      const filteredChildren = node.children
        ?.map(filterNode)
        .filter((n): n is SpecFileNode => n !== null);
      const filteredLinkedSpecs = node.linkedSpecs
        ?.map(filterNode)
        .filter((n): n is SpecFileNode => n !== null);
      const hasMatchingChildren =
        !!(filteredChildren && filteredChildren.length > 0) ||
        !!(filteredLinkedSpecs && filteredLinkedSpecs.length > 0);

      if (selfMatches || hasMatchingChildren) {
        return {
          ...node,
          children: filteredChildren,
          linkedSpecs: filteredLinkedSpecs,
        };
      }

      return null;
    }

    return sidebarFiles.map(filterNode).filter((n): n is SpecFileNode => n !== null);
  }, [sidebarFiles, filter]);

  const selectedAncestorDirectories = React.useMemo(() => {
    if (!selectedPath) return [];
    return findAncestorDirectories(sidebarFiles, selectedPath) || [];
  }, [sidebarFiles, selectedPath]);

  const filteredDirectoryPaths = React.useMemo(() => {
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

  // Ensure selected spec is visible by expanding every ancestor directory.
  React.useEffect(() => {
    if (!selectedAncestorDirectories.length) return;

    setExpandedPaths((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const path of selectedAncestorDirectories) {
        if (!next.has(path)) {
          next.add(path);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [selectedAncestorDirectories]);

  const effectiveExpandedPaths = filter.trim() ? filteredDirectoryPaths : expandedPaths;

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="pb-0">
        <div className="flex items-center justify-between px-1 py-0.5">
          <div className="flex items-center gap-2 group-data-[collapsible=icon]:hidden">
            <FolderIcon className="h-4 w-4 text-sidebar-foreground/50" />
            <span className="text-xs font-medium text-sidebar-foreground/70 uppercase tracking-wider">Specs</span>
          </div>
          {/* Collapsed state icon */}
          <div className="hidden group-data-[collapsible=icon]:flex items-center justify-center w-full">
            <FolderIcon className="h-4 w-4 text-sidebar-foreground/50" />
          </div>
          {onCreateNew && !isCollapsed && (
            <button
              className="h-5 w-5 flex items-center justify-center rounded text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
              onClick={onCreateNew}
              title="Create new spec"
            >
              <PlusIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filter input - hidden when collapsed */}
        {!isCollapsed && (
          <SidebarGroup className="py-1.5 px-1">
            <SidebarGroupContent className="relative">
              <SidebarInput
                placeholder="Filter..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="h-7 text-xs pr-7"
              />
              {filter && (
                <button
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 h-4 w-4 flex items-center justify-center rounded text-sidebar-foreground/40 hover:text-error transition-colors"
                  onClick={() => setFilter('')}
                  title="Clear filter"
                >
                  <XMarkIcon className="h-3 w-3" />
                </button>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup className="py-0">
          <SidebarGroupContent>
            {filteredFiles.length === 0 ? (
              filter ? (
                <div className="flex flex-col items-center justify-center h-20 text-sidebar-foreground/50 text-xs gap-0.5 group-data-[collapsible=icon]:hidden">
                  <span>No matches</span>
                  <span className="text-[10px] text-sidebar-foreground/30">"{filter}"</span>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 px-3 text-center gap-3 group-data-[collapsible=icon]:hidden">
                  <p className="text-xs text-sidebar-foreground/50">
                    No specs yet
                  </p>
                  {onCreateNew && (
                    <button
                      className="text-xs text-sidebar-primary hover:text-sidebar-primary/80 font-medium transition-colors"
                      onClick={onCreateNew}
                    >
                      + Create spec
                    </button>
                  )}
                </div>
              )
            ) : (
              <ul className="w-full space-y-0.5 group-data-[collapsible=icon]:hidden" role="tree">
                {filteredFiles.map((node) => (
                  <TreeNode
                    key={node.path}
                    node={node}
                    selectedPath={selectedPath}
                    expandedPaths={effectiveExpandedPaths}
                    onSelect={handleSelect}
                    onToggle={handleToggle}
                  />
                ))}
              </ul>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-0">
        <div className="border-t border-sidebar-border">
          <button
            onClick={() => toggleSidebar()}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors group-data-[collapsible=icon]:justify-center"
          >
            <ChevronLeftIcon className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? 'rotate-180' : ''}`} />
            <span className="group-data-[collapsible=icon]:hidden">Collapse</span>
          </button>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
