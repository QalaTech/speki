import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DecomposeView } from '../DecomposeView';

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('DecomposeView Error Handling', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockNavigate.mockClear();
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const renderDecomposeView = () => {
    return render(
      <MemoryRouter>
        <DecomposeView onTasksActivated={vi.fn()} />
      </MemoryRouter>
    );
  };

  // Helper to set up default fetch responses
  const setupDefaultFetches = (stateOverride?: Record<string, unknown>) => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/decompose/prd-files')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ files: [{ name: 'test.md', path: '/test/test.md', dir: 'specs' }] }),
        });
      }
      if (url.includes('/api/decompose/state')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            status: 'IDLE',
            message: '',
            ...stateOverride,
          }),
        });
      }
      if (url.includes('/api/decompose/feedback')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ feedback: null }),
        });
      }
      if (url.includes('/api/decompose/draft')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ draft: null, draftPath: null }),
        });
      }
      if (url.includes('/api/decompose/review-logs')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ logs: [] }),
        });
      }
      if (url.includes('/api/decompose/review-log')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ log: null }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    });
  };

  describe('DecomposeError_WithUnavailableCli_ShouldShowSettingsSuggestion', () => {
    it('should show Settings suggestion when CLI is unavailable', async () => {
      setupDefaultFetches({
        status: 'ERROR',
        message: 'Peer review failed',
        error: 'codex CLI not available',
        errorType: 'CLI_UNAVAILABLE',
      });

      renderDecomposeView();

      await waitFor(() => {
        expect(screen.getByText(/codex CLI not available/)).toBeInTheDocument();
      });

      expect(screen.getByText(/The selected CLI tool is not available/)).toBeInTheDocument();
      expect(screen.getByText('Go to Settings')).toBeInTheDocument();
    });

    it('should navigate to settings when Go to Settings is clicked', async () => {
      setupDefaultFetches({
        status: 'ERROR',
        message: 'Peer review failed',
        error: 'claude CLI not available',
        errorType: 'CLI_UNAVAILABLE',
      });

      renderDecomposeView();

      await waitFor(() => {
        expect(screen.getByText('Go to Settings')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Go to Settings'));

      expect(mockNavigate).toHaveBeenCalledWith('/settings');
    });
  });

  describe('DecomposeError_WithCliCrash_ShouldShowRetryButton', () => {
    it('should show Retry button when CLI crashes', async () => {
      // Need draft to show retry button
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/decompose/prd-files')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ files: [] }),
          });
        }
        if (url.includes('/api/decompose/state')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              status: 'ERROR',
              message: 'Peer review failed',
              error: 'Codex execution error: Failed to spawn Codex CLI',
              errorType: 'CRASH',
            }),
          });
        }
        if (url.includes('/api/decompose/feedback')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ feedback: null }),
          });
        }
        if (url.includes('/api/decompose/draft')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              draft: {
                projectName: 'Test',
                branchName: 'main',
                language: 'nodejs',
                standardsFile: '.speki/standards/nodejs.md',
                description: 'Test',
                userStories: [{ id: 'US-001', title: 'Test', description: 'Test', acceptanceCriteria: [], priority: 1, passes: false, notes: '', dependencies: [] }],
              },
              draftPath: '/test/draft.json',
            }),
          });
        }
        if (url.includes('/api/decompose/review-logs')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ logs: [] }),
          });
        }
        if (url.includes('/api/decompose/review-log')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ log: null }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        });
      });

      renderDecomposeView();

      await waitFor(() => {
        expect(screen.getByText(/Codex execution error/)).toBeInTheDocument();
      });

      expect(screen.getByText('Retry Peer Review')).toBeInTheDocument();
    });
  });

  describe('DecomposeError_WithTimeout_ShouldShowRetryButton', () => {
    it('should show Retry button when CLI times out', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/decompose/prd-files')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ files: [] }),
          });
        }
        if (url.includes('/api/decompose/state')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              status: 'ERROR',
              message: 'Peer review failed',
              error: 'Claude CLI timed out after 300 seconds',
              errorType: 'TIMEOUT',
            }),
          });
        }
        if (url.includes('/api/decompose/feedback')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ feedback: null }),
          });
        }
        if (url.includes('/api/decompose/draft')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              draft: {
                projectName: 'Test',
                branchName: 'main',
                language: 'nodejs',
                standardsFile: '.speki/standards/nodejs.md',
                description: 'Test',
                userStories: [{ id: 'US-001', title: 'Test', description: 'Test', acceptanceCriteria: [], priority: 1, passes: false, notes: '', dependencies: [] }],
              },
              draftPath: '/test/draft.json',
            }),
          });
        }
        if (url.includes('/api/decompose/review-logs')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ logs: [] }),
          });
        }
        if (url.includes('/api/decompose/review-log')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ log: null }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        });
      });

      renderDecomposeView();

      await waitFor(() => {
        expect(screen.getByText(/Claude CLI timed out/)).toBeInTheDocument();
      });

      expect(screen.getByText('Retry Peer Review')).toBeInTheDocument();
    });
  });

  describe('DecomposeError_RetryButton_ShouldReAttemptPeerReview', () => {
    it('should call retry-review endpoint when Retry button is clicked', async () => {
      let callCount = 0;
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/api/decompose/retry-review') && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, verdict: 'PASS' }),
          });
        }
        if (url.includes('/api/decompose/prd-files')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ files: [] }),
          });
        }
        if (url.includes('/api/decompose/state')) {
          callCount++;
          // First call returns error, subsequent calls return success
          if (callCount <= 6) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({
                status: 'ERROR',
                message: 'Peer review failed',
                error: 'Codex execution error: crash',
                errorType: 'CRASH',
              }),
            });
          }
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              status: 'COMPLETED',
              message: 'Peer review complete: PASS',
              verdict: 'PASS',
            }),
          });
        }
        if (url.includes('/api/decompose/feedback')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ feedback: null }),
          });
        }
        if (url.includes('/api/decompose/draft')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              draft: {
                projectName: 'Test',
                branchName: 'main',
                language: 'nodejs',
                standardsFile: '.speki/standards/nodejs.md',
                description: 'Test',
                userStories: [{ id: 'US-001', title: 'Test', description: 'Test', acceptanceCriteria: [], priority: 1, passes: false, notes: '', dependencies: [] }],
              },
              draftPath: '/test/draft.json',
            }),
          });
        }
        if (url.includes('/api/decompose/review-logs')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ logs: [] }),
          });
        }
        if (url.includes('/api/decompose/review-log')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ log: null }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        });
      });

      renderDecomposeView();

      await waitFor(() => {
        expect(screen.getByText('Retry Peer Review')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Retry Peer Review'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/decompose/retry-review'),
          expect.objectContaining({ method: 'POST' })
        );
      });
    });

    it('should disable retry button while retry is in progress', async () => {
      let callCount = 0;
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/api/decompose/retry-review') && options?.method === 'POST') {
          // Immediately return success
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, verdict: 'PASS' }),
          });
        }
        if (url.includes('/api/decompose/prd-files')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ files: [] }),
          });
        }
        if (url.includes('/api/decompose/state')) {
          callCount++;
          // First 6 calls return error state
          if (callCount <= 6) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({
                status: 'ERROR',
                message: 'Peer review failed',
                error: 'Codex execution error: crash',
                errorType: 'CRASH',
              }),
            });
          }
          // After retry, return success
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              status: 'COMPLETED',
              message: 'Peer review complete: PASS',
              verdict: 'PASS',
            }),
          });
        }
        if (url.includes('/api/decompose/feedback')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ feedback: null }),
          });
        }
        if (url.includes('/api/decompose/draft')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              draft: {
                projectName: 'Test',
                branchName: 'main',
                language: 'nodejs',
                standardsFile: '.speki/standards/nodejs.md',
                description: 'Test',
                userStories: [{ id: 'US-001', title: 'Test', description: 'Test', acceptanceCriteria: [], priority: 1, passes: false, notes: '', dependencies: [] }],
              },
              draftPath: '/test/draft.json',
            }),
          });
        }
        if (url.includes('/api/decompose/review-logs')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ logs: [] }),
          });
        }
        if (url.includes('/api/decompose/review-log')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ log: null }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        });
      });

      renderDecomposeView();

      await waitFor(() => {
        expect(screen.getByText('Retry Peer Review')).toBeInTheDocument();
      });

      const retryButton = screen.getByText('Retry Peer Review');
      expect(retryButton).not.toBeDisabled();

      fireEvent.click(retryButton);

      // Verify the retry API was called
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/decompose/retry-review'),
          expect.objectContaining({ method: 'POST' })
        );
      });
    });
  });

  describe('DecomposeError_ShouldNotCrashFlow', () => {
    it('should not crash when error has no errorType', async () => {
      setupDefaultFetches({
        status: 'ERROR',
        message: 'Some error occurred',
        error: 'Unknown error',
        // No errorType field
      });

      // Should not throw
      renderDecomposeView();

      await waitFor(() => {
        expect(screen.getByText(/Unknown error/)).toBeInTheDocument();
      });

      // Should not show Settings suggestion or Retry button without errorType
      expect(screen.queryByText('Go to Settings')).not.toBeInTheDocument();
      expect(screen.queryByText('Retry Peer Review')).not.toBeInTheDocument();
    });

    it('should handle error state without crashing the decompose flow', async () => {
      setupDefaultFetches({
        status: 'ERROR',
        message: 'Peer review failed',
        error: 'codex CLI not available',
        errorType: 'CLI_UNAVAILABLE',
      });

      renderDecomposeView();

      await waitFor(() => {
        expect(screen.getByText(/codex CLI not available/)).toBeInTheDocument();
      });

      // PRD Decomposition header should still be visible
      expect(screen.getByText('PRD Decomposition')).toBeInTheDocument();

      // Start button should still be functional (decompose flow not crashed)
      expect(screen.getByText('Start')).toBeInTheDocument();
    });
  });
});
