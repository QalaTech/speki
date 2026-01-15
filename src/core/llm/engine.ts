export interface EngineAvailability {
  available: boolean;
  name: string;
  version?: string;
}

export interface Engine {
  /** Engine identifier (implementation-defined, not vendor-specific in callers) */
  name: string;
  /** Is engine available on this system */
  isAvailable(): Promise<EngineAvailability>;
}

