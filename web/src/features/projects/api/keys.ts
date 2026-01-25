/**
 * Query key factory for projects-related queries.
 * Using a factory pattern ensures consistent cache key generation.
 */
export const projectsKeys = {
  all: ['projects'] as const,
} as const;
