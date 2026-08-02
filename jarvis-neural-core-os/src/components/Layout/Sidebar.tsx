import React from 'react';
import { ViewMode } from '../../types';
import { StubTooltip } from '../StubTooltip/StubTooltip';
import {
  Home,
  Bot,
  CheckSquare,
  Cpu,
  Grid,
  Settings,
  Power,
  MessageSquare,
} from 'lucide-react';

interface SidebarProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  onPowerOff?: () => void;
  onToggleChatLog?: () => void;
  chatLogOpen?: boolean;
}

// ── Статический массив вне компонента ──
const NAV_ITEMS = [
  { id: 'minimal' as ViewMode, label: 'ГЛАВНАЯ', icon: Home },
  { id: 'full' as ViewMode, label: 'АССИСТЕНТ', icon: Bot },
  { id: 'aider' as ViewMode, label: 'ЗАДАЧИ', icon: CheckSquare },
  { id: 'full' as ViewMode, label: 'СИСТЕМА', icon: Cpu, stub: true },
  { id: 'settings' as ViewMode, label: 'НАСТРОЙКИ', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onViewChange,
  onPowerOff,
  onToggleChatLog,
  chatLogOpen,
}) => {
  return (
    <aside className="w-16 border-r border-cyan-500/15 bg-[#07080c]/90 backdrop-blur-xl flex flex-col items-center justify-between py-5 select-none z-30">
      {/* Upper Navigation Icons */}
      <div className="flex flex-col items-center gap-6 w-full px-2">
        {/* Core Reactor Icon */}
        <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(0,240,255,0.2)] mb-2 cursor-pointer hover:scale-105 transition-transform">
          <div className="w-5 h-5 rounded-full border-2 border-cyan-400 border-dashed animate-spin" />
        </div>

        {/* Menu Buttons */}
        <div className="flex flex-col gap-3 w-full">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.label}
                onClick={() => onViewChange(item.id)}
                title={item.label}
                className={`w-full py-2.5 rounded-xl flex flex-col items-center gap-1 transition-all duration-200 relative group ${
                  isActive
                    ? 'bg-gradient-to-r from-cyan-500/20 to-purple-600/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_15px_rgba(0,240,255,0.2)]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[9px] font-mono tracking-tighter uppercase font-semibold">
                  {item.label}
                </span>
                {isActive && (
                  <span className="absolute left-0 top-2 bottom-2 w-1 bg-cyan-400 rounded-r-full shadow-[0_0_8px_#00f0ff]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="flex flex-col items-center gap-3 w-full px-2">
        {/* Chat Log Toggle */}
        {onToggleChatLog && (
          <button
            onClick={onToggleChatLog}
            title="ЧАТ"
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
              chatLogOpen
                ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 shadow-[0_0_10px_rgba(0,240,255,0.3)]'
                : 'bg-slate-800/40 border border-slate-700/40 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/30'
            }`}
          >
            <MessageSquare className="w-5 h-5" />
          </button>
        )}
        <button
          onClick={onPowerOff}
          title="ВЫКЛЮЧЕНИЕ"
          className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 flex items-center justify-center hover:bg-red-500/20 hover:border-red-500/50 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)] transition-all duration-200"
        >
          <Power className="w-5 h-5" />
        </button>
      </div>
    </aside>
  );
};
