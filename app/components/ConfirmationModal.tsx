'use client';

import { CommandResult } from '../lib/types';
import { Check, X, AlertTriangle } from 'lucide-react';

interface ConfirmationModalProps {
  result: CommandResult;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationModal({ result, onConfirm, onCancel }: ConfirmationModalProps) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4">
      <div className="bg-[#16161e] rounded-xl p-6 max-w-md w-full border-2 border-cyan-500 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-cyan-400" />
          </div>
          <h3 className="text-xl font-bold text-white">Confirm Changes</h3>
        </div>
        
        <p className="text-gray-300 mb-4">{result.message}</p>

        {result.changes && result.changes.length > 0 && (
          <div className="space-y-2 mb-6 max-h-96 overflow-y-auto">
            {result.changes.map((change, idx) => (
              <div key={idx} className="bg-[#0d0d12] rounded-lg p-3 border border-white/5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-cyan-500/20 text-cyan-400">
                    {change.type.toUpperCase()}
                  </span>
                  <span className="text-sm text-white capitalize">{change.entity}</span>
                  {change.after && (
                    <span className="text-sm text-gray-400">
                      {change.after.name || change.after.id}
                    </span>
                  )}
                </div>
                
                {change.before && (
                  <div className="mt-2 p-2 bg-red-500/5 border border-red-500/20 rounded text-xs">
                    <p className="text-red-400 font-semibold mb-1">Before:</p>
                    <pre className="text-gray-400 overflow-x-auto">
                      {JSON.stringify(change.before, null, 2)}
                    </pre>
                  </div>
                )}
                
                {change.after && (
                  <div className="mt-2 p-2 bg-green-500/5 border border-green-500/20 rounded text-xs">
                    <p className="text-green-400 font-semibold mb-1">After:</p>
                    <pre className="text-gray-400 overflow-x-auto">
                      {JSON.stringify(change.after, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            Confirm
          </button>
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-white font-medium transition-colors flex items-center justify-center gap-2"
          >
            <X className="w-4 h-4" />
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
