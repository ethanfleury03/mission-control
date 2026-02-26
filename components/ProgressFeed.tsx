/**
 * Progress Feed Component
 * Timeline of agent activity and human responses
 */

import React from 'react';

interface Comment {
  id: string;
  author: 'human' | 'agent';
  message: string;
  timestamp: string;
  type?: 'comment' | 'progress' | 'block' | 'complete';
}

interface ProgressFeedProps {
  comments: Comment[];
}

export const ProgressFeed: React.FC<ProgressFeedProps> = ({ comments }) => {
  const sorted = [...comments].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const getMessageStyle = (comment: Comment) => {
    if (comment.type === 'block' || comment.message.startsWith('BLOCKED:')) {
      return { className: 'message blocked', icon: '🚫' };
    }
    if (comment.type === 'progress' || comment.message.startsWith('PROGRESS:')) {
      return { className: 'message progress', icon: '📊' };
    }
    if (comment.type === 'complete' || comment.message.startsWith('DONE:')) {
      return { className: 'message complete', icon: '✅' };
    }
    if (comment.author === 'agent') {
      return { className: 'message agent', icon: '🤖' };
    }
    return { className: 'message human', icon: '👤' };
  };

  return (
    <div className="progress-feed">
      <h3>📋 Activity Log</h3>
      
      {sorted.length === 0 ? (
        <div className="empty-feed">No activity yet</div>
      ) : (
        <div className="feed-timeline">
          {sorted.map((comment, idx) => {
            const style = getMessageStyle(comment);
            return (
              <div key={comment.id} className="feed-item">
                <div className="timeline-line" />
                <div className="timeline-dot">{style.icon}</div>
                <div className={`${style.className}`}>
                  <div className="message-header">
                    <span className="author">{comment.author}</span>
                    <span className="time">
                      {new Date(comment.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="message-body">{comment.message}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
