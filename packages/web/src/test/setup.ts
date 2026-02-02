import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { server } from './server';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';

// Stub document.queryCommandSupported for monaco-editor in jsdom
if (typeof document !== 'undefined' && !document.queryCommandSupported) {
  document.queryCommandSupported = () => false;
}

// Mock window.matchMedia for sonner (not available in jsdom)
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// Mock EventSource for SSE hooks (not available in jsdom)
class MockEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  url: string;
  readyState = MockEventSource.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    // Simulate connection
    setTimeout(() => {
      this.readyState = MockEventSource.OPEN;
      if (this.onopen) this.onopen(new Event('open'));
    }, 0);
  }

  close() {
    this.readyState = MockEventSource.CLOSED;
  }

  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() { return true; }
}

if (typeof globalThis.EventSource === 'undefined') {
  (globalThis as unknown as { EventSource: typeof MockEventSource }).EventSource = MockEventSource;
}

// Mock @mdxeditor/editor to avoid @stitches/core CSS parsing issues in jsdom
// The MDX editor imports sandpack-react which bundles stitches, causing CSS parse errors
vi.mock('@mdxeditor/editor', () => ({
  MDXEditor: ({ markdown }: { markdown: string }) => markdown,
  // Plugin exports
  headingsPlugin: () => ({}),
  listsPlugin: () => ({}),
  quotePlugin: () => ({}),
  thematicBreakPlugin: () => ({}),
  markdownShortcutPlugin: () => ({}),
  linkPlugin: () => ({}),
  linkDialogPlugin: () => ({}),
  tablePlugin: () => ({}),
  codeBlockPlugin: () => ({}),
  codeMirrorPlugin: () => ({}),
  diffSourcePlugin: () => ({}),
  toolbarPlugin: () => ({}),
  frontmatterPlugin: () => ({}),
  directivesPlugin: () => ({}),
  imagePlugin: () => ({}),
  // Directive descriptors
  AdmonitionDirectiveDescriptor: {},
  // Toolbar component exports
  UndoRedo: () => null,
  BoldItalicUnderlineToggles: () => null,
  BlockTypeSelect: () => null,
  CreateLink: () => null,
  InsertTable: () => null,
  InsertThematicBreak: () => null,
  ListsToggle: () => null,
  DiffSourceToggleWrapper: () => null,
  CodeToggle: () => null,
  InsertCodeBlock: () => null,
  Separator: () => null,
}));

// Start MSW server before all tests
// Use 'warn' to allow existing tests that don't use MSW handlers to pass
// while warning about unhandled requests during development
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));

// Reset handlers and clean up DOM after each test (important for test isolation)
afterEach(() => {
  cleanup();
  server.resetHandlers();
});

// Clean up after all tests
afterAll(() => server.close());
