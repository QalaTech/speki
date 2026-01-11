import { useState, useEffect, useRef, useCallback } from 'react';
import './SpecReviewPage.css';

interface SpecFile {
  name: string;
  path: string;
}

interface SpecReviewPageProps {
  projectPath?: string;
}

export function SpecReviewPage({ projectPath }: SpecReviewPageProps): React.ReactElement {
  const [files, setFiles] = useState<SpecFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [leftPanelWidth, setLeftPanelWidth] = useState(50);
  const [isResizing, setIsResizing] = useState(false);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const apiUrl = useCallback((endpoint: string): string => {
    if (!projectPath) return endpoint;
    const separator = endpoint.includes('?') ? '&' : '?';
    return `${endpoint}${separator}project=${encodeURIComponent(projectPath)}`;
  }, [projectPath]);

  useEffect(() => {
    const fetchFiles = async (): Promise<void> => {
      try {
        setLoading(true);
        const response = await fetch(apiUrl('/api/spec-review/files'));
        if (response.ok) {
          const data = await response.json();
          const fileList = data.files || [];
          setFiles(fileList);
          if (fileList.length > 0) {
            setSelectedFile(fileList[0].path);
          }
        }
      } catch (error) {
        console.error('Failed to fetch spec files:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchFiles();
  }, [apiUrl]);

  const handleMouseDown = useCallback((e: React.MouseEvent): void => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent): void => {
    if (!isResizing || !containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;

    const clampedWidth = Math.max(20, Math.min(80, newWidth));
    setLeftPanelWidth(clampedWidth);
  }, [isResizing]);

  const handleMouseUp = useCallback((): void => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  const handleFileChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    setSelectedFile(e.target.value);
  };

  if (loading) {
    return (
      <div className="spec-review-page" data-testid="spec-review-page">
        <div className="spec-review-loading">Loading spec files...</div>
      </div>
    );
  }

  return (
    <div className="spec-review-page" data-testid="spec-review-page">
      <header className="spec-review-header">
        <h1>Spec Review</h1>
        <div className="spec-review-controls">
          <label htmlFor="file-select" className="file-select-label">
            Spec File:
          </label>
          <select
            id="file-select"
            className="file-selector"
            value={selectedFile}
            onChange={handleFileChange}
            data-testid="file-selector"
          >
            {files.length === 0 ? (
              <option value="">No spec files found</option>
            ) : (
              files.map((file) => (
                <option key={file.path} value={file.path}>
                  {file.name}
                </option>
              ))
            )}
          </select>
        </div>
      </header>

      <div
        ref={containerRef}
        className="spec-review-container"
        data-testid="split-view"
      >
        <div
          className="spec-review-panel left-panel"
          style={{ width: `${leftPanelWidth}%` }}
          data-testid="left-panel"
        >
          <div className="panel-header">
            <span className="panel-title">Spec Editor</span>
          </div>
          <div className="panel-content">
            <div className="placeholder">
              Spec editor placeholder
              {selectedFile && (
                <div className="placeholder-file">
                  File: {selectedFile}
                </div>
              )}
            </div>
          </div>
        </div>

        <div
          className="resize-handle"
          onMouseDown={handleMouseDown}
          data-testid="resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={leftPanelWidth}
          aria-valuemin={20}
          aria-valuemax={80}
        />

        <div
          className="spec-review-panel right-panel"
          style={{ width: `${100 - leftPanelWidth}%` }}
          data-testid="right-panel"
        >
          <div className="panel-header">
            <span className="panel-title">Review Panel</span>
          </div>
          <div className="panel-content">
            <div className="placeholder">
              Review panel placeholder
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
