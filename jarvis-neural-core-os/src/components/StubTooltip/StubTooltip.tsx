import React from 'react';

/**
 * StubTooltip — обёртка для заглушек (неактивных/ещё не реализованных элементов).
 *
 * При наведении показывает tooltip «STUB — временно неактивно» с указанием
 * причины или описания того, что будет реализовано позже.
 *
 * Использование:
 *   <StubTooltip reason="будет подключено к systemd API">
 *     <button>System Status</button>
 *   </StubTooltip>
 */

interface StubTooltipProps {
  children: React.ReactNode;
  /** Что именно неактивно (опционально) */
  reason?: string;
  /** Позиция тултипа */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Дополнительный className для обёртки */
  className?: string;
}

export const StubTooltip: React.FC<StubTooltipProps> = ({
  children,
  reason,
  position = 'top',
  className = '',
}) => {
  return (
    <div className={`relative group/stub inline-block ${className}`}>
      {/* Невидимый overlay для захвата hover */}
      <div className="absolute inset-0 z-10 cursor-not-allowed rounded-inherit" />

      {/* Контент */}
      <div className="opacity-70 group-hover/stub:opacity-100 transition-opacity duration-200">
        {children}
      </div>

      {/* Tooltip */}
      <div
        className={`absolute z-50 pointer-events-none opacity-0 group-hover/stub:opacity-100 transition-opacity duration-200 ${
          position === 'top'
            ? 'bottom-full left-1/2 -translate-x-1/2 mb-2'
            : position === 'bottom'
            ? 'top-full left-1/2 -translate-x-1/2 mt-2'
            : position === 'left'
            ? 'right-full top-1/2 -translate-y-1/2 mr-2'
            : 'left-full top-1/2 -translate-y-1/2 ml-2'
        }`}
      >
        <div className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-[10px] font-mono text-amber-300 whitespace-nowrap shadow-[0_0_15px_rgba(245,158,11,0.2)] backdrop-blur-md">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="uppercase tracking-wider font-semibold">STUB — временно неактивно</span>
          </span>
          {reason && (
            <span className="block text-amber-400/60 mt-0.5 text-[9px] leading-tight max-w-[200px] whitespace-normal">
              {reason}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
