import React from 'react';

interface AudioWaveformProps {
  isPlaying: boolean;
  label?: string;
}

export const AudioWaveform: React.FC<AudioWaveformProps> = ({ isPlaying, label = 'TTS Playing' }) => {
  return (
    <div className="flex items-center gap-2 bg-slate-900/80 border border-emerald-500/30 px-3 py-1.5 rounded-full text-xs font-mono text-emerald-400 backdrop-blur-md shadow-lg shadow-emerald-950/20">
      <div className="flex items-end gap-1 h-4">
        {[0.4, 0.8, 0.5, 1.0, 0.6, 0.9, 0.3].map((height, idx) => (
          <div
            key={idx}
            className={`w-1 rounded-full bg-emerald-400 transition-all duration-150 ${
              isPlaying ? 'animate-pulse' : 'opacity-40'
            }`}
            style={{
              height: isPlaying ? `${Math.max(20, height * 100)}%` : '20%',
              animationDelay: `${idx * 0.12}s`,
            }}
          />
        ))}
      </div>
      <span className="font-semibold text-[11px] uppercase tracking-wider">{isPlaying ? label : 'TTS Ready'}</span>
    </div>
  );
};
