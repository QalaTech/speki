import type React from 'react';

interface SpecFile {
  name: string;
  path: string;
}

interface SpecReviewHeaderProps {
  files: SpecFile[];
  selectedFile: string;
  onFileChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  disabled?: boolean;
}

export function SpecReviewHeader({
  files,
  selectedFile,
  onFileChange,
  disabled = false,
}: SpecReviewHeaderProps): React.ReactElement {
  return (
    <header className="flex items-center justify-between p-4 border-b border-border bg-secondary">
      <h1 className="text-xl font-bold text-foreground">Spec Review</h1>
      <div className="flex items-center gap-3">
        <label htmlFor="file-select" className="text-sm text-muted-foreground/70">
          Spec File:
        </label>
        <select
          id="file-select"
          className="bg-background border border-border rounded-md px-3 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary min-w-48"
          value={selectedFile}
          onChange={onFileChange}
          data-testid="file-selector"
          disabled={disabled}
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
  );
}
