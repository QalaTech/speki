import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { server } from './server';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';

// Stub document.queryCommandSupported for monaco-editor in jsdom
if (typeof document !== 'undefined' && !document.queryCommandSupported) {
  document.queryCommandSupported = () => false;
}

// Mock EventSource for SSE hooks (not available in jsdom)
class MockEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  url: string;
  readyState = MockEventSource.CONNECTING;
  private _onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    // Immediate connection for tests to avoid act warnings
    this.readyState = MockEventSource.OPEN;
  }

  set onopen(fn: ((event: Event) => void) | null) {
    this._onopen = fn;
    if (fn && this.readyState === MockEventSource.OPEN) {
      // Use queueMicrotask to ensure it's called after the current execution context
      // but still within the same act() boundary if possible.
      // Actually, immediate call is often better for tests if we want to avoid extra act() wraps.
      fn(new Event('open'));
    }
  }

  get onopen() {
    return this._onopen;
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

// Mock scrollIntoView for jsdom
if (typeof window !== 'undefined' && window.Element) {
  window.Element.prototype.scrollIntoView = vi.fn();
}

// Mock window.matchMedia for sonner and other components that use it
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
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
