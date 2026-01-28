import { useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

/**
 * Derives the execution tab from the current pathname.
 */
export function getExecutionTab(pathname: string): string {
  if (pathname.includes('/live')) return 'live';
  if (pathname.includes('/list')) return 'list';
  if (pathname.includes('/log')) return 'log';
  if (pathname.includes('/knowledge')) return 'knowledge';
  return 'kanban';
}

/**
 * Hook for managing execution tab navigation while preserving the project query param.
 */
export function useExecutionNavigation(_project: string | null) {
  const navigate = useNavigate();
  const location = useLocation();

  const executionTab = getExecutionTab(location.pathname);

  const navigateToTab = useCallback((path: string) => {
    navigate(`${path}${location.search}`);
  }, [navigate, location.search]);

  return { executionTab, navigateToTab };
}
