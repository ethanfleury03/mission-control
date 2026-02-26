/**
 * Human Review Queue Component
 * Shows pending approvals/questions from agents
 */

import React from 'react';

interface HumanReviewItem {
  id: string;
  type: 'approval' | 'question';
  message: string;
  status: 'pending' | 'approved' | 'rejected' | 'answered';
  requestedAt: string;
  respondedAt?: string;
  response?: string;
  context?: {
    tool?: string;
    input?: Record<string, any>;
  };
}

interface HumanReviewQueueProps {
  items: HumanReviewItem[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onAnswer?: (id: string, answer: string) => void;
}

export const HumanReviewQueue: React.FC<HumanReviewQueueProps> = ({
  items,
  onApprove,
  onReject,
  onAnswer
}) => {
  const pendingItems = items.filter(i => i.status === 'pending');
  const resolvedItems = items.filter(i => i.status !== 'pending');

  return (
    <div className="human-review-queue">
      <h3>🚦 Human Review Required</h3>
      
      {pendingItems.length === 0 ? (
        <div className="no-pending">No pending reviews</div>
      ) : (
        <div className="pending-list">
          {pendingItems.map(item => (
            <div key={item.id} className="review-card urgent">
              <div className="review-header">
                <span className="badge urgent">
                  {item.type === 'approval' ? '⚠️ APPROVAL REQUIRED' : '❓ QUESTION'}
                </span>
                <span className="timestamp">
                  {new Date(item.requestedAt).toLocaleTimeString()}
                </span>
              </div>
              
              <div className="review-message">
                {item.message}
              </div>

              {item.context && (
                <div className="review-context">
                  <details>
                    <summary>View tool context</summary>
                    <pre>{JSON.stringify(item.context, null, 2)}</pre>
                  </details>
                </div>
              )}

              <div className="review-actions">
                {item.type === 'approval' ? (
                  <>
                    <button 
                      className="btn-approve"
                      onClick={() => onApprove(item.id)}
                    >
                      ✅ Approve
                    </button>
                    <button 
                      className="btn-reject"
                      onClick={() => onReject(item.id)}
                    >
                      ❌ Reject
                    </button>
                  </>
                ) : (
                  <div className="question-response">
                    <input 
                      type="text" 
                      placeholder="Type your answer..."
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          onAnswer?.(item.id, (e.target as HTMLInputElement).value);
                        }
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {resolvedItems.length > 0 && (
        <details className="resolved-section">
          <summary>Resolved ({resolvedItems.length})</summary>
          {resolvedItems.map(item => (
            <div key={item.id} className="review-card resolved">
              <span className="badge resolved">{item.status}</span>
              <p>{item.message}</p>
              {item.response && (
                <div className="response">→ {item.response}</div>
              )}
            </div>
          ))}
        </details>
      )}
    </div>
  );
};
