import { createContext, useContext, useState, type ReactNode } from 'react';
import type { SpecType } from '../components/specs/types';

interface ActiveSpec {
  title: string;
  type: SpecType;
}

interface SaveStatus {
  isSaving: boolean;
  lastSavedAt: Date | null;
  hasUnsavedChanges: boolean;
}

interface SpecContextType {
  activeSpec: ActiveSpec | null;
  setActiveSpec: (spec: ActiveSpec | null) => void;
  saveStatus: SaveStatus;
  setSaveStatus: (status: SaveStatus) => void;
}

const SpecContext = createContext<SpecContextType | undefined>(undefined);

export function SpecProvider({ children }: { children: ReactNode }) {
  const [activeSpec, setActiveSpec] = useState<ActiveSpec | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({
    isSaving: false,
    lastSavedAt: null,
    hasUnsavedChanges: false,
  });

  return (
    <SpecContext.Provider value={{ activeSpec, setActiveSpec, saveStatus, setSaveStatus }}>
      {children}
    </SpecContext.Provider>
  );
}

export function useSpec() {
  const context = useContext(SpecContext);
  if (context === undefined) {
    throw new Error('useSpec must be used within a SpecProvider');
  }
  return context;
}
