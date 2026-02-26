'use client';

import { useState, useEffect, useRef } from 'react';
import { CommandResult } from '../lib/types';
import { Loader2, Sparkles, X } from 'lucide-react';

interface AICommandBarProps {
  onClose: () => void;
}

export function AICommandBar({ onClose }: AICommandBarProps) {
  const [command, setCommand] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [preview, setPreview] = useState<CommandResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when component mounts
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle escape key to close
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleSubmit = async () => {
    if (!command.trim() || isProcessing) return;

    setIsProcessing(true);
    setError(null);
    setPreview(null);

    try {
      // Parse the command first to show preview
      const parseResponse = await fetch('http://localhost:3001/api/commands/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });

      if (!parseResponse.ok) {
        const errorData = await parseResponse.json();
        throw new Error(errorData.error || 'Failed to parse command');
      }

      const parsed = await parseResponse.json();

      // Execute the parsed command
      const executeResponse = await fetch('http://localhost:3001/api/commands/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: parsed }),
      });

      if (!executeResponse.ok) {
        const errorData = await executeResponse.json();
        throw new Error(errorData.error || 'Failed to execute command');
      }

      const result = await executeResponse.json();

      if (result.success) {
        setPreview(result);
        // Auto-close after 2 seconds on success
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        setError(result.error || 'Command execution failed');
      }
    } catch (err: any) {
      console.error('Command error:', err);
      setError(err.message || 'Failed to process command');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Command Bar */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl px-4">
        <div className="bg-[#16161e] rounded-xl border-2 border-cyan-500/30 shadow-2xl overflow-hidden">
          {/* Input Section */}
          <div className="p-4 flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-cyan-400 flex-shrink-0" />
            <input
              ref={inputRef}
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a command... (e.g., 'move Ava to marketing team')"
              className="flex-1 bg-transparent text-white text-lg outline-none placeholder:text-gray-500"
              disabled={isProcessing}
            />
            {isProcessing ? (
              <Loader2 className="w-5 h-5 text-cyan-400 animate-spin flex-shrink-0" />
            ) : (
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 transition-colors group flex-shrink-0"
              >
                <X className="w-4 h-4 text-white/60 group-hover:text-white" />
              </button>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="px-4 pb-4">
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            </div>
          )}

          {/* Preview Display */}
          {preview && preview.success && (
            <div className="px-4 pb-4">
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                <p className="text-sm text-green-400 font-medium mb-2">
                  {preview.message}
                </p>
                
                {preview.changes && preview.changes.length > 0 && (
                  <div className="space-y-2 mt-3">
                    {preview.changes.map((change, idx) => (
                      <div key={idx} className="bg-[#0d0d12] rounded p-2 text-xs">
                        <span className="text-cyan-400 font-semibold">
                          {change.type.toUpperCase()}
                        </span>{' '}
                        <span className="text-gray-400">{change.entity}</span>
                        {change.after && (
                          <span className="text-white ml-2">
                            {change.after.name || change.after.id}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Helper Text */}
          {!isProcessing && !error && !preview && (
            <div className="px-4 pb-3">
              <p className="text-xs text-gray-500">
                Press <kbd className="px-1.5 py-0.5 rounded bg-white/5 text-gray-400">Enter</kbd> to execute •{' '}
                <kbd className="px-1.5 py-0.5 rounded bg-white/5 text-gray-400">Esc</kbd> to cancel
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
