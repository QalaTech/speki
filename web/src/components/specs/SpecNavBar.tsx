import { useState, useRef, useEffect } from 'react';
import { SpecTree, type SpecFileNode } from './SpecTree';
import './SpecNavBar.css';

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
    <nav className="spec-navbar">
      <div className="spec-navbar-content">
        {/* Left side: Breadcrumbs and file selector */}
        <div className="spec-navbar-left">
          {/* Breadcrumbs */}
          <div className="spec-navbar-breadcrumbs">
            {breadcrumbs.map((crumb, index) => (
              <span key={crumb.path} className="spec-navbar-crumb">
                {index > 0 && <span className="spec-navbar-separator">/</span>}
                <span
                  className={`spec-navbar-crumb-text ${index === breadcrumbs.length - 1 ? 'spec-navbar-crumb-text--active' : ''}`}
                >
                  {crumb.name}
                </span>
              </span>
            ))}
          </div>

          {/* File selector button */}
          <button
            ref={buttonRef}
            className={`spec-navbar-selector ${isDropdownOpen ? 'spec-navbar-selector--open' : ''}`}
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            aria-expanded={isDropdownOpen}
            aria-haspopup="true"
          >
            <span className="spec-navbar-selector-icon">
              {selectedPath ? getFileIcon(selectedPath) : '📂'}
            </span>
            <span className="spec-navbar-selector-name">{fileName}</span>
            <span className={`spec-navbar-selector-chevron ${isDropdownOpen ? 'spec-navbar-selector-chevron--open' : ''}`}>
              ▾
            </span>
          </button>
        </div>

        {/* Right side: Actions */}
        <div className="spec-navbar-right">
          {onCreateNew && (
            <button
              className="spec-navbar-action"
              onClick={onCreateNew}
              title="Create new spec"
            >
              <span className="spec-navbar-action-icon">+</span>
              <span className="spec-navbar-action-text">New Spec</span>
            </button>
          )}
        </div>
      </div>

      {/* Dropdown tree */}
      {isDropdownOpen && (
        <div className="spec-navbar-dropdown" ref={dropdownRef}>
          <div className="spec-navbar-dropdown-backdrop" />
          <div className="spec-navbar-dropdown-content">
            <SpecTree
              files={files}
              selectedPath={selectedPath}
              onSelect={handleSelect}
            />
          </div>
        </div>
      )}
    </nav>
  );
}
