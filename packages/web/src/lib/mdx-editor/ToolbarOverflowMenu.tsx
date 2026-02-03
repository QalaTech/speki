/**
 * ToolbarOverflowMenu - Dropdown menu for secondary toolbar actions
 * Keeps the toolbar clean by hiding less-used actions behind a "more" button
 * Uses portal to escape MDXEditor's overflow:hidden toolbar
 */

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { insertTable$, insertCodeBlock$, usePublisher } from '@mdxeditor/editor';

export function ToolbarOverflowMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  
  const insertTable = usePublisher(insertTable$);
  const insertCodeBlock = usePublisher(insertCodeBlock$);

  // Calculate position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 4,
        left: rect.right - 160, // Align right edge with button
      });
    }
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current && !menuRef.current.contains(target) &&
        buttonRef.current && !buttonRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleInsertTable = () => {
    insertTable({ rows: 3, columns: 3 });
    setIsOpen(false);
  };

  const handleInsertCodeBlock = () => {
    insertCodeBlock({});
    setIsOpen(false);
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center w-8 h-8 rounded hover:bg-white/10 transition-colors text-white/60 hover:text-white/90"
        title="More actions"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
        </svg>
      </button>
      
      {isOpen && createPortal(
        <div 
          ref={menuRef}
          className="fixed py-1 min-w-[160px] rounded-lg bg-[#2a2a2a] border border-white/10 shadow-xl animate-in fade-in slide-in-from-top-2 duration-150"
          style={{ 
            top: menuPosition.top,
            left: menuPosition.left,
            zIndex: 99999,
          }}
        >
          <button
            onClick={handleInsertTable}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors text-left"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Insert Table
          </button>
          <button
            onClick={handleInsertCodeBlock}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors text-left"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            Insert Code Block
          </button>
        </div>,
        document.body
      )}
    </>
  );
}

