import { useState, useRef, useEffect } from 'react';
import { SpecTree, type SpecFileNode } from './SpecTree';

interface SpecNavBarProps {
  files: SpecFileNode[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onCreateNew?: () => void;
}

function getFileIcon(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'md': return '📄';
    case 'yaml':
    case 'yml': return '⚙️';
    case 'json': return '📋';
    default: return '📄';
  }
}

function getBreadcrumbs(path: string | null): { name: string; path: string }[] {
  if (!path) return [];

  const parts = path.split('/');
  const crumbs: { name: string; path: string }[] = [];

  // Start from specs/ directory
  const specsIndex = parts.indexOf('specs');
  const startIndex = specsIndex >= 0 ? specsIndex : 0;

  for (let i = startIndex; i < parts.length; i++) {
    crumbs.push({
      name: parts[i],
      path: parts.slice(0, i + 1).join('/'),
    });
  }

  return crumbs;
}

export function SpecNavBar({ files, selectedPath, onSelect, onCreateNew }: SpecNavBarProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close dropdown on escape
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsDropdownOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const breadcrumbs = getBreadcrumbs(selectedPath);
  const fileName = selectedPath?.split('/').pop() || 'Select a spec';

  const handleSelect = (path: string) => {
    onSelect(path);
    setIsDropdownOpen(false);
  };

  return (
    <>
      <style>{`
        @keyframes dropdown-enter {
          from { opacity: 0; transform: translateY(-8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .spec-dropdown-tree .spec-tree { border-right: none; background: transparent; height: auto; max-height: 100%; }
        .spec-dropdown-tree .spec-tree-header { display: none; }
        .spec-dropdown-tree .spec-tree-filter { padding: 12px 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); background: rgba(0, 0, 0, 0.2); }
        .spec-dropdown-tree .spec-tree-filter-input { background: rgba(255, 255, 255, 0.05); border-color: rgba(255, 255, 255, 0.1); }
        .spec-dropdown-tree .spec-tree-filter-input:focus { background: rgba(255, 255, 255, 0.08); border-color: var(--color-accent); }
        .spec-dropdown-tree .spec-tree-content { max-height: 400px; padding: 8px; }
        .spec-dropdown-tree .tree-node { border-radius: 8px; margin: 2px 0; }
        .spec-dropdown-tree .tree-node:hover { background: rgba(255, 255, 255, 0.06); }
        .spec-dropdown-tree .tree-node--selected { background: rgba(88, 166, 255, 0.15) !important; }
        .spec-dropdown-tree .tree-node--focused { outline-color: var(--color-accent); }
        .spec-dropdown-tree .spec-tree-footer { padding: 8px 16px; background: rgba(0, 0, 0, 0.2); border-top: 1px solid rgba(255, 255, 255, 0.06); }
      `}</style>
      <nav className="relative z-[100]">
        <div className="flex items-center justify-between gap-4 py-3 px-6 bg-gradient-to-b from-[rgba(22,27,34,0.95)] to-[rgba(22,27,34,0.85)] backdrop-blur-[12px] border-b border-[rgba(255,255,255,0.06)] shadow-[0_4px_24px_rgba(0,0,0,0.3)] max-md:py-2.5 max-md:px-4">
          {/* Left side: Breadcrumbs and file selector */}
          <div className="flex items-center gap-4 min-w-0 flex-1">
            {/* Breadcrumbs */}
            <div className="hidden md:flex items-center gap-0.5 text-xs text-base-content/60 min-w-0 overflow-hidden">
              {breadcrumbs.map((crumb, index) => (
                <span key={crumb.path} className="flex items-center whitespace-nowrap">
                  {index > 0 && <span className="mx-1.5 text-border font-light">/</span>}
                  <span
                    className={`transition-colors duration-150 hover:text-base-content ${index === breadcrumbs.length - 1 ? 'text-secondary font-medium' : ''}`}
                  >
                    {crumb.name}
                  </span>
                </span>
              ))}
            </div>

            {/* File selector button */}
            <button
              ref={buttonRef}
              className={`flex items-center gap-2.5 py-2.5 px-4 bg-white/[0.03] border border-white/[0.08] rounded-[10px] cursor-pointer transition-all duration-200 min-w-[200px] max-w-[400px] max-md:min-w-[150px] max-md:max-w-none max-md:flex-1 hover:bg-white/[0.06] hover:border-white/[0.12] ${isDropdownOpen ? 'bg-accent/10 border-secondary/30 shadow-[0_0_0_3px_rgba(88,166,255,0.1)]' : ''}`}
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              aria-expanded={isDropdownOpen}
              aria-haspopup="true"
            >
              <span className="text-base shrink-0">
                {selectedPath ? getFileIcon(selectedPath) : '📂'}
              </span>
              <span className="flex-1 text-sm font-medium text-base-content text-left whitespace-nowrap overflow-hidden text-ellipsis">{fileName}</span>
              <span className={`text-[10px] text-base-content/60 transition-transform duration-200 shrink-0 ${isDropdownOpen ? 'rotate-180' : ''}`}>
                ▾
              </span>
            </button>
          </div>

          {/* Right side: Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {onCreateNew && (
              <button
                className="flex items-center gap-1.5 py-2 px-3.5 bg-accent/10 border border-secondary/20 rounded-lg text-secondary text-[13px] font-medium cursor-pointer transition-all duration-200 hover:bg-accent/15 hover:border-secondary/30 hover:-translate-y-px"
                onClick={onCreateNew}
                title="Create new spec"
              >
                <span className="text-base font-semibold">+</span>
                <span className="max-md:hidden">New Spec</span>
              </button>
            )}
          </div>
        </div>

        {/* Dropdown tree */}
        {isDropdownOpen && (
          <div className="absolute top-full left-6 right-6 max-w-[500px] z-[1000] pt-2 max-md:left-4 max-md:right-4 max-md:max-w-none" ref={dropdownRef}>
            <div className="fixed inset-0 -z-10" />
            <div className="spec-dropdown-tree bg-gradient-to-b from-[rgba(22,27,34,0.98)] to-[rgba(13,17,23,0.98)] backdrop-blur-[20px] border border-white/[0.08] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_0_0_1px_rgba(255,255,255,0.05)] overflow-hidden animate-[dropdown-enter_0.2s_ease-out] max-h-[60vh] flex flex-col">
              <SpecTree
                files={files}
                selectedPath={selectedPath}
                onSelect={handleSelect}
              />
            </div>
          </div>
        )}
      </nav>
    </>
  );
}
