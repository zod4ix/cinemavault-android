import React from 'react';

interface CinemaLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  animated?: boolean;
}

export const CinemaLogo: React.FC<CinemaLogoProps> = ({ size = 'md', animated = false }) => {
  const sizeMap = {
    sm: 'w-8 h-8',
    md: 'w-11 h-11',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24'
  };

  return (
    <div className={`relative ${sizeMap[size]} shrink-0 flex items-center justify-center select-none`}>
      {/* Outer ambient glow */}
      <div 
        className={`absolute inset-0 rounded-2xl bg-gradient-to-tr from-red-600 via-amber-500 to-red-500 opacity-70 blur-md ${
          animated ? 'animate-pulse' : ''
        }`} 
      />

      {/* Main SVG Logo Shield */}
      <svg 
        viewBox="0 0 100 100" 
        className="relative w-full h-full drop-shadow-xl"
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Main Shield Gradient */}
          <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1a0b12" />
            <stop offset="50%" stopColor="#2a0d18" />
            <stop offset="100%" stopColor="#0d0408" />
          </linearGradient>

          {/* Golden Crimson Border Gradient */}
          <linearGradient id="borderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="35%" stopColor="#ef4444" />
            <stop offset="70%" stopColor="#dc2626" />
            <stop offset="100%" stopColor="#fbbf24" />
          </linearGradient>

          {/* Film Ring Gradient */}
          <linearGradient id="ringGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#dc2626" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>

          {/* Play Triangle Glow */}
          <linearGradient id="playGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#ffd27d" />
          </linearGradient>
        </defs>

        {/* Outer Shield Hexagon */}
        <polygon 
          points="50,4 92,26 92,74 50,96 8,74 8,26" 
          fill="url(#shieldGrad)" 
          stroke="url(#borderGrad)" 
          strokeWidth="3.5"
          strokeLinejoin="round"
        />

        {/* Film Perforations on shield border (Cinema motif) */}
        <circle cx="28" cy="22" r="2.5" fill="#f59e0b" opacity="0.8" />
        <circle cx="72" cy="22" r="2.5" fill="#f59e0b" opacity="0.8" />
        <circle cx="86" cy="50" r="2.5" fill="#ef4444" opacity="0.8" />
        <circle cx="72" cy="78" r="2.5" fill="#ef4444" opacity="0.8" />
        <circle cx="28" cy="78" r="2.5" fill="#f59e0b" opacity="0.8" />
        <circle cx="14" cy="50" r="2.5" fill="#ef4444" opacity="0.8" />

        {/* Central Film Reel Outer Ring */}
        <circle 
          cx="50" 
          cy="50" 
          r="26" 
          stroke="url(#ringGrad)" 
          strokeWidth="2.8" 
          strokeDasharray="6 3"
          className={animated ? 'origin-center animate-spin' : ''}
          style={{ animationDuration: '24s' }}
        />

        {/* Vault Core Circle */}
        <circle 
          cx="50" 
          cy="50" 
          r="19" 
          fill="#17060b" 
          stroke="url(#borderGrad)" 
          strokeWidth="2" 
        />

        {/* Central Play Arrow / Cinema Vault Key */}
        <polygon 
          points="46,40 60,50 46,60" 
          fill="url(#playGrad)" 
          filter="drop-shadow(0px 2px 4px rgba(239, 68, 68, 0.6))"
        />
      </svg>
    </div>
  );
};
