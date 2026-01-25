import '@testing-library/jest-dom';
import { server } from './server';
import { afterAll, afterEach, beforeAll } from 'vitest';

// Start MSW server before all tests
// Use 'warn' to allow existing tests that don't use MSW handlers to pass
// while warning about unhandled requests during development
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));

// Reset handlers after each test (important for test isolation)
afterEach(() => server.resetHandlers());

// Clean up after all tests
afterAll(() => server.close());
