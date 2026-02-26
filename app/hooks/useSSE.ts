'use client';

import { useEffect, useState, useCallback } from 'react';

interface SSEState<T> {
  data: T | null;
  error: Error | null;
  connected: boolean;
}

export function useSSE<T>(url: string): SSEState<T> {
  const [state, setState] = useState<SSEState<T>>({
    data: null,
    error: null,
    connected: false,
  });

  useEffect(() => {
    const eventSource = new EventSource(url);

    eventSource.onopen = () => {
      setState((prev) => ({ ...prev, connected: true }));
    };

    eventSource.onerror = (error) => {
      setState((prev) => ({ ...prev, error: new Error('SSE connection failed'), connected: false }));
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setState((prev) => ({ ...prev, data }));
      } catch (err) {
        console.error('Failed to parse SSE data:', err);
      }
    };

    return () => {
      eventSource.close();
    };
  }, [url]);

  return state;
}

export function useMetricsStream() {
  return useSSE('/api/stream');
}
