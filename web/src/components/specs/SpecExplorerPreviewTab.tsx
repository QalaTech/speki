/**
 * Preview tab content for SpecExplorer - shows only the editor.
 * Edit controls are in SpecHeader. The review panel is rendered separately.
 */
import { useRef } from 'react';
import { SpecEditor, type SpecEditorRef } from '../shared/SpecEditor';

interface SpecExplorerPreviewTabProps {
  content: string;
  isEditing: boolean;
  onContentChange: (content: string) => void;
  editorRef?: React.RefObject<SpecEditorRef | null>;
  /**
   * Called when user selects text and asks a question about it.
   * Opens chat with the selection as context.
   */
  onSelectionAsk?: (selectedText: string, question: string) => void;
}

export function SpecExplorerPreviewTab({
  content,
  isEditing,
  onContentChange,
  editorRef: externalEditorRef,
  onSelectionAsk,
}: SpecExplorerPreviewTabProps) {
  const internalEditorRef = useRef<SpecEditorRef>(null);
  const editorRef = externalEditorRef ?? internalEditorRef;

  return (
    <div className="flex flex-col h-full">
      <SpecEditor
        ref={editorRef}
        content={content}
        onChange={onContentChange}
        readOnly={!isEditing}
        className="flex-1 overflow-auto"
        onSelectionAsk={onSelectionAsk}
      />
    </div>
  );
}
