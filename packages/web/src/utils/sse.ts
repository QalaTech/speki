/**
 * SSE connection utilities with exponential backoff
 */

interface SSEConnectionOptions {
  url: string;
  onMessage?: (event: MessageEvent) => void;
  onError?: (error: Event) => void;
  onOpen?: () => void;
  eventListeners?: Record<string, (event: MessageEvent) => void>;
  maxRetries?: number;
  initialRetryDelay?: number;
  maxRetryDelay?: number;
}

/**
 * Create an EventSource connection with automatic reconnection and exponential backoff
 */
export function createSSEConnection(options: SSEConnectionOptions): () => void {
  const {
    url,
    onMessage,
    onError,
    onOpen,
    eventListeners = {},
    maxRetries = Infinity,
    initialRetryDelay = 1000,
    maxRetryDelay = 30000,
  } = options;

  let es: EventSource | null = null;
  let retryCount = 0;
  let retryTimeout: NodeJS.Timeout | null = null;
  let isClosed = false;

  const connect = () => {
    if (isClosed) return;

    // Create EventSource connection
    es = new EventSource(url);

    // Handle open event
    if (onOpen) {
      es.addEventListener('open', onOpen);
    }

    // Handle generic message event
    if (onMessage) {
      es.addEventListener('message', onMessage);
    }

    // Register custom event listeners
    for (const [eventType, handler] of Object.entries(eventListeners)) {
      es.addEventListener(eventType, handler);
    }

    // Handle errors and reconnection
    es.addEventListener('error', (event) => {
      // Call user-provided error handler
      if (onError) {
        onError(event);
      }

      // Close the failed connection
      if (es) {
        es.close();
        es = null;
      }

      // Don't retry if explicitly closed
      if (isClosed) return;

      // Check if we've exceeded max retries
      if (retryCount >= maxRetries) {
        console.error(`SSE connection failed after ${retryCount} retries`);
        return;
      }

      // Calculate exponential backoff delay
      const delay = Math.min(
        initialRetryDelay * Math.pow(2, retryCount),
        maxRetryDelay
      );

      retryCount++;
      console.log(`SSE reconnecting in ${delay}ms (attempt ${retryCount})`);

      // Schedule reconnection
      retryTimeout = setTimeout(() => {
        connect();
      }, delay);
    });

    // Reset retry count on successful connection
    es.addEventListener('open', () => {
      retryCount = 0;
    });
  };

  // Start initial connection
  connect();

  // Return cleanup function
  return () => {
    isClosed = true;

    // Clear retry timeout
    if (retryTimeout) {
      clearTimeout(retryTimeout);
      retryTimeout = null;
    }

    // Close EventSource
    if (es) {
      es.close();
      es = null;
    }
  };
}
