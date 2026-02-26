'use client';



import { cn } from '../lib/utils';



interface AgentAvatarProps {

  avatarType?: 'cat' | 'robot-teal' | 'robot-orange' | 'robot-purple';

  className?: string;

}



export function AgentAvatar({ avatarType, className }: AgentAvatarProps) {

  const baseClasses = 'w-20 h-20 drop-shadow-lg';

  

  switch (avatarType) {

    case 'cat':

      return <ClawdAvatar className={cn(baseClasses, className)} />;

    case 'robot-teal':

      return <ForgeAvatar className={cn(baseClasses, className)} />;

    case 'robot-orange':

      return <AthenaAvatar className={cn(baseClasses, className)} />;

    case 'robot-purple':

      return <QuillAvatar className={cn(baseClasses, className)} />;

    default:

      return null; // Render nothing if avatarType is undefined or unknown

  }

}



// Clawd: Black cat with green eyes and green collar

function ClawdAvatar({ className }: { className?: string }) {

  return (

    <svg viewBox="0 0 64 64" className={className} xmlns="http://www.w3.org/2000/svg">

      {/* Body - black */}

      <rect x="20" y="30" width="24" height="28" fill="#000000" />

      {/* Head - black */}

      <rect x="22" y="12" width="20" height="20" fill="#000000" />

      {/* Ears */}

      <polygon points="22,12 28,4 34,12" fill="#000000" />

      <polygon points="30,12 36,4 42,12" fill="#000000" />

      {/* Eyes - green */}

      <rect x="26" y="18" width="4" height="4" fill="#22c55e" />

      <rect x="34" y="18" width="4" height="4" fill="#22c55e" />

      {/* Nose */}

      <rect x="30" y="24" width="4" height="2" fill="#ffffff" />

      {/* Collar - green */}

      <rect x="20" y="30" width="24" height="4" fill="#22c55e" />

      {/* Legs */}

      <rect x="22" y="50" width="6" height="8" fill="#000000" />

      <rect x="36" y="50" width="6" height="8" fill="#000000" />

      {/* Tail */}

      <rect x="44" y="35" width="4" height="12" fill="#000000" />

    </svg>

  );

}



// Forge: Teal/cyan robot with square body, holding tools

function ForgeAvatar({ className }: { className?: string }) {

  return (

    <svg viewBox="0 0 64 64" className={className} xmlns="http://www.w3.org/2000/svg">

      {/* Head - square */}

      <rect x="20" y="8" width="24" height="24" fill="#22d3ee" />

      {/* Eyes */}

      <rect x="26" y="16" width="4" height="4" fill="#000000" />

      <rect x="34" y="16" width="4" height="4" fill="#000000" />

      {/* Body - square */}

      <rect x="18" y="32" width="28" height="24" fill="#22d3ee" />

      {/* Chest panel */}

      <rect x="24" y="36" width="16" height="12" fill="#0e7490" />

      {/* Arms */}

      <rect x="8" y="36" width="10" height="6" fill="#22d3ee" />

      <rect x="46" y="36" width="10" height="6" fill="#22d3ee" />

      {/* Tool in right hand - wrench */}

      <rect x="50" y="38" width="2" height="8" fill="#ffffff" />

      <rect x="48" y="40" width="6" height="2" fill="#ffffff" />

      {/* Legs */}

      <rect x="22" y="56" width="8" height="8" fill="#22d3ee" />

      <rect x="34" y="56" width="8" height="8" fill="#22d3ee" />

    </svg>

  );

}



// Athena: Orange robot with antenna, boxy shape

function AthenaAvatar({ className }: { className?: string }) {

  return (

    <svg viewBox="0 0 64 64" className={className} xmlns="http://www.w3.org/2000/svg">

      {/* Antenna */}

      <rect x="30" y="0" width="4" height="8" fill="#f97316" />

      <rect x="28" y="8" width="8" height="2" fill="#f97316" />

      {/* Head - boxy */}

      <rect x="18" y="10" width="28" height="22" fill="#f97316" />

      {/* Eyes */}

      <rect x="24" y="18" width="4" height="4" fill="#000000" />

      <rect x="36" y="18" width="4" height="4" fill="#000000" />

      {/* Body - boxy */}

      <rect x="16" y="32" width="32" height="26" fill="#f97316" />

      {/* Chest panel */}

      <rect x="22" y="38" width="20" height="14" fill="#c2410c" />

      {/* Arms */}

      <rect x="6" y="36" width="10" height="8" fill="#f97316" />

      <rect x="48" y="36" width="10" height="8" fill="#f97316" />

      {/* Legs */}

      <rect x="20" y="58" width="10" height="6" fill="#f97316" />

      <rect x="34" y="58" width="10" height="6" fill="#f97316" />

    </svg>

  );

}



// Quill: Purple robot, rounded, cute design

function QuillAvatar({ className }: { className?: string }) {

  return (

    <svg viewBox="0 0 64 64" className={className} xmlns="http://www.w3.org/2000/svg">

      {/* Head - rounded */}

      <ellipse cx="32" cy="20" rx="18" ry="16" fill="#a855f7" />

      {/* Eyes - cute */}

      <ellipse cx="26" cy="18" rx="3" ry="4" fill="#000000" />

      <ellipse cx="38" cy="18" rx="3" ry="4" fill="#000000" />

      {/* Mouth - smile */}

      <path d="M 24 26 Q 32 30 40 26" stroke="#000000" strokeWidth="2" fill="none" />

      {/* Body - rounded */}

      <ellipse cx="32" cy="42" rx="20" ry="18" fill="#a855f7" />

      {/* Chest panel */}

      <ellipse cx="32" cy="42" rx="12" ry="10" fill="#7c3aed" />

      {/* Arms - rounded */}

      <ellipse cx="12" cy="40" rx="6" ry="10" fill="#a855f7" />

      <ellipse cx="52" cy="40" rx="6" ry="10" fill="#a855f7" />

      {/* Legs - rounded */}

      <ellipse cx="24" cy="58" rx="6" ry="6" fill="#a855f7" />

      <ellipse cx="40" cy="58" rx="6" ry="6" fill="#a855f7" />

    </svg>

  );

}

