/**
 * Tool Call Log Component
 * Visualizes agent tool usage with timing, inputs, outputs
 */

import React, { useState } from 'react';

interface ToolCall {
  id: string;
  tool: string;
  input: Record<string, any>;
  output?: any;
  error?: string;
  timestamp: string;
  durationMs: number;
}

interface ToolCallLogProps {
  calls: ToolCall[];
  maxVisible?: number;
}

export const ToolCallLog: React.FC<ToolCallLogProps> = ({ calls, maxVisible = 10 }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const visibleCalls = showAll ? calls : calls.slice(0, maxVisible);
  const hasMore = calls.length > maxVisible;

  const getToolIcon = (tool: string) => {
    const icons: Record<string, string> = {
      'web_search': '🔍',
      'web_fetch': '🌐',
      'exec': '⚡',
      'read': '📄',
      'write': '✏️',
      'edit': '📝',
      'message': '💬',
      'email': '📧',
      'calendar': '📅',
      'browser': '🖥️',
      'image': '🖼️',
      'tts': '🔊',
    };
    return icons[tool] || '🔧';
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="tool-call-log">
      {visibleCalls.length === 0 ? (
        <div className="no-calls">No tool activity yet</div>
      ) : (
        <>
          <div className="call-list">
            {visibleCalls.map((call, index) => (
              <div 
                key={call.id} 
                className={`call-item ${call.error ? 'error' : ''} ${expandedId === call.id ? 'expanded' : ''}`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div 
                  className="call-summary"
                  onClick={() => setExpandedId(expandedId === call.id ? null : call.id)}
                >
                  <span className="tool-icon">{getToolIcon(call.tool)}</span>
                  <span className="tool-name">{call.tool}</span>
                  <span className="call-time">
                    {new Date(call.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="call-duration" title={`${call.durationMs}ms`}>
                    {formatDuration(call.durationMs)}
                  </span>
                  {call.error && <span className="error-badge">ERROR</span>}
                  <span className="expand-icon">
                    {expandedId === call.id ? '▼' : '▶'}
                  </span>
                </div>

                {expandedId === call.id && (
                  <div className="call-details">
                    <div className="detail-section">
                      <h5>Input</h5>
                      <pre>{JSON.stringify(call.input, null, 2)}</pre>
                    </div>
                    
                    {call.output && (
                      <div className="detail-section">
                        <h5>Output</h5>
                        <pre className="output">{JSON.stringify(call.output, null, 2)}</pre>
                      </div>
                    )}
                    
                    {call.error && (
                      <div className="detail-section error">
                        <h5>Error</h5>
                        <pre className="error-text">{call.error}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {hasMore && (
            <button className="show-more" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show less' : `Show ${calls.length - maxVisible} more`}
            </button>
          )}
        </>
      )}
    </div>
  );
};
