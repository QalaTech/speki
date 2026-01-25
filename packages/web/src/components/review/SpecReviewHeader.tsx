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
    <header className="flex items-center justify-between p-4 border-b border-base-300 bg-base-200">
      <h1 className="text-xl font-bold">Spec Review</h1>
      <div className="flex items-center gap-3">
        <label htmlFor="file-select" className="text-sm opacity-70">
          Spec File:
        </label>
        <select
          id="file-select"
          className="select select-bordered select-sm min-w-48"
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
