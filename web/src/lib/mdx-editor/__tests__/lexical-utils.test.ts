import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LexicalEditor, LexicalNode, RangeSelection } from 'lexical';
import {
  scrollToSection,
  scrollToLine,
  highlightText,
  findNodeByText,
  getSelectedText,
  selectText,
} from '../lexical-utils';

/**
 * Creates a mock text node for testing.
 */
function createMockTextNode(text: string, key: string) {
  return {
    getKey: () => key,
    getTextContent: () => text,
    getType: () => 'text',
  };
}

/**
 * Creates a mock heading node for testing.
 */
function createMockHeadingNode(text: string, key: string, tag: string = 'h1') {
  return {
    getKey: () => key,
    getTextContent: () => text,
    getType: () => 'heading',
    getTag: () => tag,
    getChildren: () => [createMockTextNode(text, `${key}-text`)],
    __type: 'heading',
  };
}

/**
 * Creates a mock paragraph node for testing.
 */
function createMockParagraphNode(text: string, key: string) {
  const textNode = createMockTextNode(text, `${key}-text`);
  return {
    getKey: () => key,
    getTextContent: () => text,
    getType: () => 'paragraph',
    getChildren: () => [textNode],
  };
}

/**
 * Creates a mock root node for testing.
 */
function createMockRootNode(children: LexicalNode[]) {
  return {
    getKey: () => 'root',
    getChildren: () => children,
    getType: () => 'root',
  };
}

/**
 * Creates a mock Lexical editor for testing.
 */
function createMockEditor(options: {
  rootChildren?: LexicalNode[];
  selection?: RangeSelection | null;
  elements?: Map<string, HTMLElement>;
}): LexicalEditor {
  const { rootChildren = [], selection = null, elements = new Map() } = options;

  const mockRoot = createMockRootNode(rootChildren);

  const mockEditor = {
    read: vi.fn((callback: () => void) => {
      // Set up the Lexical context for reads
      (global as Record<string, unknown>).__lexicalActiveEditor = mockEditor;
      (global as Record<string, unknown>).__lexicalRoot = mockRoot;
      (global as Record<string, unknown>).__lexicalSelection = selection;
      callback();
    }),
    update: vi.fn((callback: () => void) => {
      // Set up the Lexical context for updates
      (global as Record<string, unknown>).__lexicalActiveEditor = mockEditor;
      (global as Record<string, unknown>).__lexicalRoot = mockRoot;
      (global as Record<string, unknown>).__lexicalSelection = selection;
      callback();
    }),
    getElementByKey: vi.fn((key: string) => elements.get(key) ?? null),
  } as unknown as LexicalEditor;

  return mockEditor;
}

// Mock the lexical module
vi.mock('lexical', () => ({
  $getRoot: vi.fn(() => (global as Record<string, unknown>).__lexicalRoot),
  $getSelection: vi.fn(() => (global as Record<string, unknown>).__lexicalSelection),
  $isRangeSelection: vi.fn((selection) => selection?.__type === 'range'),
  $isTextNode: vi.fn((node) => node?.getType?.() === 'text'),
  $isElementNode: vi.fn((node) => {
    const type = node?.getType?.();
    return type === 'root' || type === 'paragraph' || type === 'heading';
  }),
  $createRangeSelection: vi.fn(() => ({
    __type: 'range',
    anchor: { set: vi.fn() },
    focus: { set: vi.fn() },
  })),
  $setSelection: vi.fn(),
}));

// Mock the @lexical/rich-text module
vi.mock('@lexical/rich-text', () => ({
  $isHeadingNode: vi.fn((node) => node?.__type === 'heading'),
}));

describe('lexical-utils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    // Reset global Lexical context
    (global as Record<string, unknown>).__lexicalActiveEditor = null;
    (global as Record<string, unknown>).__lexicalRoot = null;
    (global as Record<string, unknown>).__lexicalSelection = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('scrollToSection_ScrollsToHeading', () => {
    it('should scroll to heading when found', () => {
      const mockElement = document.createElement('h1');
      mockElement.scrollIntoView = vi.fn();

      const headingNode = createMockHeadingNode('Introduction', 'heading-1');
      const elements = new Map([['heading-1', mockElement]]);

      const editor = createMockEditor({
        rootChildren: [headingNode as unknown as LexicalNode],
        elements,
      });

      const result = scrollToSection(editor, 'Introduction');

      expect(result).toBe(true);
      expect(mockElement.scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'start',
      });
    });

    it('should return false when heading not found', () => {
      const editor = createMockEditor({
        rootChildren: [],
      });

      const result = scrollToSection(editor, 'NonExistent');

      expect(result).toBe(false);
    });

    it('should find heading with partial match', () => {
      const mockElement = document.createElement('h2');
      mockElement.scrollIntoView = vi.fn();

      const headingNode = createMockHeadingNode('Getting Started Guide', 'heading-2', 'h2');
      const elements = new Map([['heading-2', mockElement]]);

      const editor = createMockEditor({
        rootChildren: [headingNode as unknown as LexicalNode],
        elements,
      });

      const result = scrollToSection(editor, 'Getting Started');

      expect(result).toBe(true);
      expect(mockElement.scrollIntoView).toHaveBeenCalled();
    });
  });

  describe('scrollToLine', () => {
    it('should scroll to specified line number', () => {
      const mockElement = document.createElement('p');
      mockElement.scrollIntoView = vi.fn();

      const paragraph1 = createMockParagraphNode('Line 1 content', 'p-1');
      const paragraph2 = createMockParagraphNode('Line 2 content', 'p-2');
      const paragraph3 = createMockParagraphNode('Line 3 content', 'p-3');

      const elements = new Map([
        ['p-1', document.createElement('p')],
        ['p-2', mockElement],
        ['p-3', document.createElement('p')],
      ]);

      const editor = createMockEditor({
        rootChildren: [paragraph1, paragraph2, paragraph3] as unknown as LexicalNode[],
        elements,
      });

      const result = scrollToLine(editor, 2);

      expect(result).toBe(true);
      expect(mockElement.scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'start',
      });
    });

    it('should return false for invalid line number', () => {
      const editor = createMockEditor({
        rootChildren: [],
      });

      expect(scrollToLine(editor, 0)).toBe(false);
      expect(scrollToLine(editor, -1)).toBe(false);
    });

    it('should return false when line exceeds content', () => {
      const paragraph = createMockParagraphNode('Only line', 'p-1');
      const editor = createMockEditor({
        rootChildren: [paragraph as unknown as LexicalNode],
      });

      const result = scrollToLine(editor, 5);

      expect(result).toBe(false);
    });
  });

  describe('highlightText_AppliesHighlight', () => {
    it('should apply highlight to found text', () => {
      const mockElement = document.createElement('span');
      mockElement.scrollIntoView = vi.fn();

      const textNode = createMockTextNode('This is the target text to highlight', 'text-1');
      const paragraph = {
        ...createMockParagraphNode('', 'p-1'),
        getChildren: () => [textNode],
      };

      const elements = new Map([['text-1', mockElement]]);

      const editor = createMockEditor({
        rootChildren: [paragraph as unknown as LexicalNode],
        elements,
      });

      const cleanup = highlightText(editor, 'target text');

      expect(cleanup).not.toBeNull();
      expect(mockElement.classList.contains('lexical-highlight')).toBe(true);
      expect(mockElement.style.backgroundColor).toBe('rgb(255, 235, 59)');
      expect(mockElement.scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'center',
      });
    });

    it('should return null when text not found', () => {
      const editor = createMockEditor({
        rootChildren: [],
      });

      const cleanup = highlightText(editor, 'nonexistent');

      expect(cleanup).toBeNull();
    });

    it('should apply custom highlight options', () => {
      const mockElement = document.createElement('span');
      mockElement.scrollIntoView = vi.fn();

      const textNode = createMockTextNode('Custom highlight text', 'text-1');
      const paragraph = {
        ...createMockParagraphNode('', 'p-1'),
        getChildren: () => [textNode],
      };

      const elements = new Map([['text-1', mockElement]]);

      const editor = createMockEditor({
        rootChildren: [paragraph as unknown as LexicalNode],
        elements,
      });

      highlightText(editor, 'Custom', 1000, {
        className: 'custom-highlight',
        backgroundColor: '#ff0000',
      });

      expect(mockElement.classList.contains('custom-highlight')).toBe(true);
      expect(mockElement.style.backgroundColor).toBe('rgb(255, 0, 0)');
    });
  });

  describe('highlightText_FadesAfterDuration', () => {
    it('should fade highlight after specified duration', () => {
      const mockElement = document.createElement('span');
      mockElement.scrollIntoView = vi.fn();

      const textNode = createMockTextNode('Fade test text', 'text-1');
      const paragraph = {
        ...createMockParagraphNode('', 'p-1'),
        getChildren: () => [textNode],
      };

      const elements = new Map([['text-1', mockElement]]);

      const editor = createMockEditor({
        rootChildren: [paragraph as unknown as LexicalNode],
        elements,
      });

      highlightText(editor, 'Fade test', 2000);

      expect(mockElement.classList.contains('lexical-highlight')).toBe(true);

      // Advance time past duration
      vi.advanceTimersByTime(2000);

      // Background should be reset (empty string or original)
      expect(mockElement.style.backgroundColor).toBe('');

      // Advance for fade animation
      vi.advanceTimersByTime(500);

      expect(mockElement.classList.contains('lexical-highlight')).toBe(false);
    });

    it('should allow early cleanup via returned function', () => {
      const mockElement = document.createElement('span');
      mockElement.scrollIntoView = vi.fn();

      const textNode = createMockTextNode('Early cleanup text', 'text-1');
      const paragraph = {
        ...createMockParagraphNode('', 'p-1'),
        getChildren: () => [textNode],
      };

      const elements = new Map([['text-1', mockElement]]);

      const editor = createMockEditor({
        rootChildren: [paragraph as unknown as LexicalNode],
        elements,
      });

      const cleanup = highlightText(editor, 'Early cleanup', 5000);

      expect(cleanup).not.toBeNull();
      expect(mockElement.classList.contains('lexical-highlight')).toBe(true);

      // Call cleanup early
      cleanup!();

      expect(mockElement.classList.contains('lexical-highlight')).toBe(false);
    });
  });

  describe('findNodeByText_FindsNode', () => {
    it('should find node containing specified text', () => {
      const mockElement = document.createElement('span');

      const textNode = createMockTextNode('Find this specific text in the document', 'text-1');
      const paragraph = {
        ...createMockParagraphNode('', 'p-1'),
        getChildren: () => [textNode],
      };

      const elements = new Map([['text-1', mockElement]]);

      const editor = createMockEditor({
        rootChildren: [paragraph as unknown as LexicalNode],
        elements,
      });

      const result = findNodeByText(editor, 'specific text');

      expect(result).not.toBeNull();
      expect(result!.offset).toBe(10); // Position of "specific" in the text
      expect(result!.element).toBe(mockElement);
    });

    it('should return null when text not found', () => {
      const editor = createMockEditor({
        rootChildren: [],
      });

      const result = findNodeByText(editor, 'not found');

      expect(result).toBeNull();
    });

    it('should find text across multiple nodes', () => {
      const mockElement2 = document.createElement('span');

      const textNode1 = createMockTextNode('First paragraph', 'text-1');
      const textNode2 = createMockTextNode('Second paragraph with target', 'text-2');

      const paragraph1 = {
        ...createMockParagraphNode('', 'p-1'),
        getChildren: () => [textNode1],
      };
      const paragraph2 = {
        ...createMockParagraphNode('', 'p-2'),
        getChildren: () => [textNode2],
      };

      const elements = new Map([
        ['text-1', document.createElement('span')],
        ['text-2', mockElement2],
      ]);

      const editor = createMockEditor({
        rootChildren: [paragraph1, paragraph2] as unknown as LexicalNode[],
        elements,
      });

      const result = findNodeByText(editor, 'target');

      expect(result).not.toBeNull();
      expect(result!.element).toBe(mockElement2);
    });
  });

  describe('getSelectedText_ReturnsSelection', () => {
    it('should return selected text content', () => {
      const mockSelection = {
        __type: 'range',
        getTextContent: () => 'selected content',
        anchor: { key: 'text-1', offset: 0 },
        focus: { key: 'text-1', offset: 16 },
      };

      const editor = createMockEditor({
        selection: mockSelection as unknown as RangeSelection,
      });

      const result = getSelectedText(editor);

      expect(result).toBe('selected content');
    });

    it('should return empty string when no selection', () => {
      const editor = createMockEditor({
        selection: null,
      });

      const result = getSelectedText(editor);

      expect(result).toBe('');
    });

    it('should return empty string for non-range selection', () => {
      const mockSelection = {
        __type: 'node', // Not a range selection
        getTextContent: () => 'should not return this',
      };

      const editor = createMockEditor({
        selection: mockSelection as unknown as RangeSelection,
      });

      const result = getSelectedText(editor);

      expect(result).toBe('');
    });
  });

  describe('selectText', () => {
    it('should select text when found', () => {
      const textNode = createMockTextNode('Select this text in the document', 'text-1');
      const paragraph = {
        ...createMockParagraphNode('', 'p-1'),
        getChildren: () => [textNode],
      };

      const editor = createMockEditor({
        rootChildren: [paragraph as unknown as LexicalNode],
      });

      const result = selectText(editor, 'this text');

      expect(result).toBe(true);
    });

    it('should return false when text not found', () => {
      const editor = createMockEditor({
        rootChildren: [],
      });

      const result = selectText(editor, 'nonexistent');

      expect(result).toBe(false);
    });
  });
});
