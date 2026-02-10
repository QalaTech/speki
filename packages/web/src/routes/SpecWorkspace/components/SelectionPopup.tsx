import type { TextSelection } from '../hooks';

interface SelectionPopupProps {
  selection: TextSelection;
  onAddToConversation: (text: string) => void;
}

export function SelectionPopup({ selection, onAddToConversation }: SelectionPopupProps) {
  return (
    <div
      data-selection-popup
      className="absolute z-50 -translate-x-1/2 -translate-y-full"
      style={{ left: selection.position.x, top: selection.position.y }}
    >
      <button
        onClick={() => onAddToConversation(selection.text)}
        className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium shadow-lg hover:bg-primary/90 transition-colors whitespace-nowrap flex items-center gap-1.5"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
        Ask about this
      </button>
    </div>
  );
}
