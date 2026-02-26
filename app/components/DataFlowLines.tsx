'use client';

interface Agent {
  id: string;
  name: string;
  status: 'working' | 'moving' | 'idle';
  avatarType?: 'cat' | 'robot-teal' | 'robot-orange' | 'robot-purple';
}

interface DataFlowLinesProps {
  agents: Agent[];
}

export function DataFlowLines({ agents }: DataFlowLinesProps) {
  // Agent desk positions (approximate, based on grid layout)
  // The agents are in a 4-column grid centered at the bottom
  const agentPositions = [
    { x: '22%', y: '75%' }, // Clawd - left
    { x: '40%', y: '75%' }, // Forge - center-left
    { x: '60%', y: '75%' }, // Athena - center-right
    { x: '78%', y: '75%' }, // Quill - right
  ];

  // Monitor positions (targets for data flow)
  const monitorPositions = [
    { x: '25%', y: '15%', name: 'gallery' },      // Left gallery monitor
    { x: '50%', y: '12%', name: 'bar-chart' },    // Center bar chart
    { x: '70%', y: '15%', name: 'terminal' },     // Center-right terminal
    { x: '88%', y: '18%', name: 'grid' },         // Right green grid
  ];

  // Color mapping for each agent
  const agentColors = {
    'cat': '#22d3ee',           // Clawd - cyan
    'robot-teal': '#14b8a6',    // Forge - teal
    'robot-orange': '#f97316',  // Athena - orange
    'robot-purple': '#a855f7',  // Quill - purple
  };

  return (
    <svg 
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 5 }}
    >
      <defs>
        {/* Define animated dash pattern */}
        <style>{`
          @keyframes data-stream {
            0% { stroke-dashoffset: 0; }
            100% { stroke-dashoffset: -40; }
          }
        `}</style>
      </defs>

      {agents.map((agent, index) => {
        // Only show lines for working agents
        if (agent.status !== 'working') return null;

        const startPos = agentPositions[index];
        // Connect to the nearest monitor (simple round-robin for variety)
        const targetPos = monitorPositions[index % monitorPositions.length];
        const color = agentColors[agent.avatarType || 'cat'];

        // Create a curved path from agent to monitor
        const startX = startPos.x;
        const startY = startPos.y;
        const endX = targetPos.x;
        const endY = targetPos.y;

        // Calculate control points for a smooth curve
        const controlY = `${(parseFloat(startY) + parseFloat(endY)) / 2 - 10}%`;

        return (
          <g key={agent.id}>
            {/* Data flow line */}
            <path
              d={`M ${startX} ${startY} Q ${startX} ${controlY}, ${endX} ${endY}`}
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeDasharray="8 4"
              opacity="0.15"
              style={{
                animation: 'data-stream 2s linear infinite'
              }}
            />
            {/* Glow effect */}
            <path
              d={`M ${startX} ${startY} Q ${startX} ${controlY}, ${endX} ${endY}`}
              fill="none"
              stroke={color}
              strokeWidth="4"
              strokeDasharray="8 4"
              opacity="0.05"
              filter="blur(3px)"
              style={{
                animation: 'data-stream 2s linear infinite'
              }}
            />
            {/* Data packet (moving dot) */}
            <circle
              r="3"
              fill={color}
              opacity="0.4"
              style={{
                offsetPath: `path('M ${startX} ${startY} Q ${startX} ${controlY}, ${endX} ${endY}')`,
                animation: `packet-move-${index} 3s ease-in-out infinite`,
                filter: `drop-shadow(0 0 4px ${color})`
              }}
            >
              <animateMotion
                dur="3s"
                repeatCount="indefinite"
                path={`M ${startX} ${startY} Q ${startX} ${controlY}, ${endX} ${endY}`}
              />
            </circle>
          </g>
        );
      })}
    </svg>
  );
}
