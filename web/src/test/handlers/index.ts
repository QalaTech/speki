import { projectsHandlers } from './projects';
import { executionHandlers } from './execution';
import { specsHandlers } from './specs';

// Combine all handlers
export const handlers = [
  ...projectsHandlers,
  ...executionHandlers,
  ...specsHandlers,
];

// Re-export individual handlers for selective use
export { projectsHandlers } from './projects';
export { executionHandlers } from './execution';
export { specsHandlers } from './specs';

// Re-export mock data for use in tests
export { mockProjects } from './projects';
export {
  mockSpecTree,
  mockSpecContent,
  mockSuggestions,
  mockSession,
  mockGenerationStatus,
  mockStatuses,
} from './specs';
