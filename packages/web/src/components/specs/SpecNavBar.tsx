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
      <nav className="relative z-50">
        <div className="flex items-center justify-between gap-4 py-3 px-6 bg-background/95 backdrop-blur-md border-b border-border shadow-[0_4px_24px_rgba(0,0,0,0.3)] max-md:py-2.5 max-md:px-4">
          {/* Left side: Breadcrumbs and file selector */}
          <div className="flex items-center gap-4 min-w-0 flex-1">
            {/* Breadcrumbs */}
            <div className="hidden md:flex items-center gap-0.5 text-xs text-muted-foreground/60 min-w-0 overflow-hidden">
              {breadcrumbs.map((crumb, index) => (
                <span key={crumb.path} className="flex items-center whitespace-nowrap">
                  {index > 0 && <span className="mx-1.5 text-border font-light">/</span>}
                  <span
                    className={`transition-colors duration-150 hover:text-foreground ${index === breadcrumbs.length - 1 ? 'text-primary font-medium' : ''}`}
                  >
                    {crumb.name}
                  </span>
                </span>
              ))}
            </div>

            {/* File selector button */}
            <button
              ref={buttonRef}
              className={`flex items-center gap-2.5 py-2.5 px-4 bg-secondary/50 border border-border rounded-[10px] cursor-pointer transition-all duration-200 min-w-[200px] max-w-[400px] max-md:min-w-[150px] max-md:max-w-none max-md:flex-1 hover:bg-secondary hover:border-border/50 ${isDropdownOpen ? 'bg-primary/10 border-primary/30 shadow-[0_0_0_3px_rgba(88,166,255,0.1)]' : ''}`}
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              aria-expanded={isDropdownOpen}
              aria-haspopup="true"
            >
              <span className="text-base shrink-0">
                {selectedPath ? getFileIcon(selectedPath) : '📂'}
              </span>
              <span className="flex-1 text-sm font-medium text-foreground text-left whitespace-nowrap overflow-hidden text-ellipsis">{fileName}</span>
              <span className={`text-[10px] text-muted-foreground/60 transition-transform duration-200 shrink-0 ${isDropdownOpen ? 'rotate-180' : ''}`}>
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
          <div className="absolute top-full left-6 right-6 max-w-[500px] z-100 pt-2 max-md:left-4 max-md:right-4 max-md:max-w-none" ref={dropdownRef}>
            <div className="fixed inset-0 -z-10" />
            <div className="spec-dropdown-tree bg-background border border-border rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden animate-[dropdown-enter_0.2s_ease-out] max-h-[60vh] flex flex-col">
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
