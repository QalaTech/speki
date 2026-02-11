import { useRef, forwardRef } from 'react';
import { SpecEditor, type SpecEditorRef } from '../../../components/shared/SpecEditor';
import { SelectionPopup } from './SelectionPopup';
import { useTextSelection } from '../hooks';

interface EditorSectionProps {
  content: string;
  isLoading: boolean;
  onChange: (value: string) => void;
  onAddToConversation: (text: string) => void;
}

export const EditorSection = forwardRef<SpecEditorRef, EditorSectionProps>(
  ({ content, isLoading, onChange, onAddToConversation }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const { selection, clearSelection, handleMouseUp } = useTextSelection({
      containerRef: containerRef as React.RefObject<HTMLElement>,
    });

    const handleAddToConversation = (text: string) => {
      onAddToConversation(text);
      clearSelection();
    };

    return (
      <div className="mb-8">
        <div
          ref={containerRef}
          className="bg-card/50 border border-white/3 rounded-xl relative shadow-lg"
          onMouseUp={handleMouseUp}
        >
          {selection && (
            <SelectionPopup selection={selection} onAddToConversation={handleAddToConversation} />
          )}

          {isLoading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <SpecEditor
              ref={ref}
              content={content}
              onChange={onChange}
              readOnly={false}
              className="min-h-[300px]"
            />
          )}
        </div>
      </div>
    );
  }
);

EditorSection.displayName = 'EditorSection';
