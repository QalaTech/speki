/**
 * Utility functions for SpecWorkspace
 */

/**
 * Format a date as relative time (e.g., "just now", "5m ago")
 */
export function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

/**
 * Extract title from document content (first H1) or format filename
 */
export function extractDocumentTitle(content: string, filename: string): string {
  // Try to extract H1 from content
  if (content) {
    const h1Match = content.match(/^#\s+(.+)$/m);
    if (h1Match) {
      return h1Match[1].trim();
    }
  }
  
  // Fall back to formatted filename
  if (filename) {
    // Remove extension and timestamp pattern (YYYYMMDD-HHMMSS-)
    const cleanName = filename
      .replace(/\.(prd|tech|bug)\.md$/i, '')
      .replace(/^\d{8}-\d{6}-/, '');
    
    // Convert to title case
    return cleanName
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
  
  return 'Untitled';
}

/**
 * Check if a decompose state is for the current spec
 */
export function isDecomposeForSpec(decomposePrdFile: string | undefined, selectedPath: string): boolean {
  if (!decomposePrdFile) return false;
  return (
    decomposePrdFile === selectedPath ||
    decomposePrdFile.endsWith(selectedPath) ||
    selectedPath.endsWith(decomposePrdFile)
  );
}
