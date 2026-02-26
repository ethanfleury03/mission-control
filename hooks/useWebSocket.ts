/**
 * WebSocket Hook for real-time updates
 */

import { useEffect, useRef, useState } from 'react';

export function useWebSocket(url: string) {
  const [lastMessage, setLastMessage] = useState<MessageEvent | null>(null);
  const [readyState, setReadyState] = useState<number>(WebSocket.CONNECTING);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setReadyState(WebSocket.OPEN);
    ws.onclose = () => setReadyState(WebSocket.CLOSED);
    ws.onerror = (error) => console.error('WebSocket error:', error);
    ws.onmessage = (event) => setLastMessage(event);

    return () => {
      ws.close();
    };
  }, [url]);

  const sendMessage = (data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  };

  return { lastMessage, readyState, sendMessage };
}
