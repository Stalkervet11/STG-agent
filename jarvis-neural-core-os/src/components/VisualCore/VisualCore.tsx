import React, { useEffect, useRef } from 'react';

import { CoreState } from '../../types';
import { motion } from 'motion/react';
import { RefreshCw, Cpu, HardDrive, Zap } from 'lucide-react';

interface VisualCoreProps {
  state: CoreState;
  onStateChange?: (state: CoreState) => void;
  size?: number;
  showStateControls?: boolean;
  interactive?: boolean;
  statusMessage?: string;
  isAudioActive?: boolean;
}

const PLEXUS_COUNT = 30; // Reduced from 45
const FPS_THROTTLE_IDLE = 30; // Idle 30fps — saves CPU
const FPS_THROTTLE_ACTIVE = 60; // Active 60fps

// ── Standalone render functions (no closure overhead) ──

function renderStartup(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, baseRadius: number,
  rotationAngle: number, pulsePhase: number,
  particles: { x: number; y: number; z: number; vx: number; vy: number; vz: number; radius: number }[],
) {
  const breath = Math.sin(pulsePhase) * 0.08 + 1;

  // Outer glow (cheaper gradient — fewer stops)
  const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, baseRadius * 1.3);
  grad.addColorStop(0, 'rgba(0, 240, 255, 0.35)');
  grad.addColorStop(0.6, 'rgba(14, 165, 233, 0.1)');
  grad.addColorStop(1, 'rgba(9, 10, 15, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, baseRadius * 1.3 * breath, 0, Math.PI * 2);
  ctx.fill();

  // Concentric expanding rings (reduced to 3)
  for (let i = 1; i <= 3; i++) {
    const ringR = (baseRadius * 0.3 * i + (pulsePhase * 15) % (baseRadius * 1.1)) * breath;
    ctx.strokeStyle = `rgba(0, 240, 255, ${Math.max(0, 0.4 - ringR / (baseRadius * 1.2))})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 3D Plexus with pre-computed trig
  const cosA = Math.cos(rotationAngle);
  const sinA = Math.sin(rotationAngle);
  const cosB = Math.cos(rotationAngle * 0.7);
  const sinB = Math.sin(rotationAngle * 0.7);

  const projectedNodes: { x: number; y: number; z: number }[] = [];

  for (let idx = 0; idx < particles.length; idx++) {
    const p = particles[idx];
    // Update positions
    p.x += p.vx;
    p.y += p.vy;
    p.z += p.vz;

    // Bounce check (faster — avoid sqrt if possible)
    const absSum = Math.abs(p.x) + Math.abs(p.y) + Math.abs(p.z);
    if (absSum > baseRadius * 0.8 * 1.7) {
      p.vx *= -1;
      p.vy *= -1;
      p.vz *= -1;
    }

    // 3D rotation
    const x1 = p.x * cosA - p.z * sinA;
    const z1 = p.x * sinA + p.z * cosA;
    const y1 = p.y * cosB - z1 * sinB;
    const z2 = p.y * sinB + z1 * cosB;

    const scale = 250 / (250 + z2);
    projectedNodes.push({ x: cx + x1 * scale, y: cy + y1 * scale, z: z2 });

    const alpha = Math.min(1, Math.max(0.2, (z2 + 100) / 200));
    ctx.fillStyle = `rgba(0, 240, 255, ${alpha})`;
    ctx.beginPath();
    ctx.arc(projectedNodes[idx].x, projectedNodes[idx].y, p.radius * scale, 0, Math.PI * 2);
    ctx.fill();
  }

  // Plexus connections (optimized: early distance cutoff)
  for (let i = 0; i < projectedNodes.length; i++) {
    for (let j = i + 1; j < projectedNodes.length; j++) {
      const dx = projectedNodes[i].x - projectedNodes[j].x;
      const dy = projectedNodes[i].y - projectedNodes[j].y;
      const distSq = dx * dx + dy * dy;
      if (distSq < 2025) { // 45^2
        ctx.strokeStyle = `rgba(0, 240, 255, ${0.4 * (1 - Math.sqrt(distSq) / 45)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(projectedNodes[i].x, projectedNodes[i].y);
        ctx.lineTo(projectedNodes[j].x, projectedNodes[j].y);
        ctx.stroke();
      }
    }
  }
}

function renderFileIO(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, baseRadius: number,
  rotationAngle: number, _pulsePhase: number,
  scanLineY: number,
  fileSegments: boolean[],
) {
  const outerR = baseRadius * 1.1;

  // Outer dotted ring
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotationAngle);
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  ctx.arc(0, 0, outerR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Counter rotating brackets (reduced to 3)
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-rotationAngle * 1.5);
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 4;
  ctx.setLineDash([]);
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(0, 0, outerR * 0.9, i * (Math.PI / 2) + 0.1, i * (Math.PI / 2) + 0.6);
    ctx.stroke();
  }
  ctx.restore();

  // Crosshairs
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - outerR * 1.2, cy);
  ctx.lineTo(cx + outerR * 1.2, cy);
  ctx.moveTo(cx, cy - outerR * 1.2);
  ctx.lineTo(cx, cy + outerR * 1.2);
  ctx.stroke();

  // Data segment arc blocks
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotationAngle * 0.5);
  const arcLength = (Math.PI * 2) / fileSegments.length;
  for (let idx = 0; idx < fileSegments.length; idx++) {
    const startA = idx * arcLength;
    ctx.fillStyle = fileSegments[idx] ? 'rgba(0, 240, 255, 0.7)' : 'rgba(245, 158, 11, 0.2)';
    ctx.beginPath();
    ctx.arc(0, 0, baseRadius * 0.7, startA, startA + arcLength - 0.1);
    ctx.arc(0, 0, baseRadius * 0.62, startA + arcLength - 0.1, startA, true);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Scanning laser sweep line
  const currentY = cy - outerR + scanLineY;
  const scanGrad = ctx.createLinearGradient(cx - outerR, currentY, cx + outerR, currentY);
  scanGrad.addColorStop(0, 'rgba(245, 158, 11, 0)');
  scanGrad.addColorStop(0.5, 'rgba(245, 158, 11, 0.9)');
  scanGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
  ctx.strokeStyle = scanGrad;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - outerR, currentY);
  ctx.lineTo(cx + outerR, currentY);
  ctx.stroke();

  // HUD text overlay
  ctx.fillStyle = '#38bdf8';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('FILE_IO :: SCANNING', cx, cy - 15);
  ctx.fillStyle = '#f59e0b';
  ctx.fillText('0x8F4A :: BUFF_READ_OK', cx, cy + 25);
}

function renderWorking(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, baseRadius: number,
  rotationAngle: number, pulsePhase: number,
  audioLevel: number,
  barPositions: number[], barWidth: number,
) {
  const r1 = baseRadius * 1.05;
  const r2 = baseRadius * 0.85;

  // Glowing aura (simplified gradient)
  const auraGrad = ctx.createRadialGradient(cx, cy, baseRadius * 0.5, cx, cy, baseRadius * 1.4);
  auraGrad.addColorStop(0, 'rgba(168, 85, 247, 0.3)');
  auraGrad.addColorStop(0.6, 'rgba(0, 240, 255, 0.12)');
  auraGrad.addColorStop(1, 'rgba(9, 10, 15, 0)');
  ctx.fillStyle = auraGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, baseRadius * 1.4, 0, Math.PI * 2);
  ctx.fill();

  // Ring 1 — Purple clockwise
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotationAngle * 2);
  ctx.strokeStyle = '#a855f7';
  ctx.lineWidth = 4;
  ctx.shadowColor = '#a855f7';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(0, 0, r1, 0, Math.PI * 1.5);
  ctx.stroke();
  ctx.restore();

  // Ring 2 — Cyan counter-clockwise
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-rotationAngle * 2.5);
  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth = 3;
  ctx.shadowColor = '#00f0ff';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(0, 0, r2, Math.PI * 0.5, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Audio waveform bars (optimized with pre-computed positions)
  const maxH = baseRadius * 0.5;
  ctx.shadowColor = '#a855f7';
  ctx.shadowBlur = 8;

  for (let i = 0; i < barPositions.length; i++) {
    const normIdx = i / barPositions.length;
    const freq = Math.sin(normIdx * Math.PI) * audioLevel * (0.4 + Math.sin(pulsePhase * 3 + i * 0.3) * 0.6);
    const h = Math.max(6, freq * maxH);
    ctx.fillStyle = i % 2 === 0 ? '#00f0ff' : '#c084fc';
    ctx.fillRect(cx + barPositions[i], cy - h / 2, barWidth, h);
  }
  ctx.shadowBlur = 0;
}

function renderIdle(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, baseRadius: number,
  rotationAngle: number, pulsePhase: number,
) {
  const breath = Math.sin(pulsePhase) * 0.08 + 1;
  const rInner = baseRadius * 0.45 * breath;
  const rMid = baseRadius * 0.75;
  const rOuter = baseRadius * 1.0;

  // Ambient glow
  const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rOuter * 1.2);
  glowGrad.addColorStop(0, 'rgba(0, 240, 255, 0.2)');
  glowGrad.addColorStop(0.6, 'rgba(99, 102, 241, 0.08)');
  glowGrad.addColorStop(1, 'rgba(9, 10, 15, 0)');
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, rOuter * 1.2, 0, Math.PI * 2);
  ctx.fill();

  // Outer track
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.3)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
  ctx.stroke();

  // Mid rotating arcs
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotationAngle);
  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth = 3;
  ctx.shadowColor = '#00f0ff';
  ctx.shadowBlur = 8;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(0, 0, rMid, i * (Math.PI * 0.66) + 0.2, i * (Math.PI * 0.66) + 1.2);
    ctx.stroke();
  }
  ctx.restore();

  // Inner core
  ctx.fillStyle = 'rgba(0, 240, 255, 0.15)';
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, rInner, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Sine wave (cheaper — fewer sample points)
  ctx.strokeStyle = '#a855f7';
  ctx.lineWidth = 2;
  ctx.beginPath();
  const step = 5; // Increased from 3 to 5
  for (let x = -rInner * 0.8; x <= rInner * 0.8; x += step) {
    const y = Math.sin((x / (rInner * 0.8)) * Math.PI * 3 + pulsePhase * 2) * (rInner * 0.25);
    if (x === -rInner * 0.8) ctx.moveTo(cx + x, cy + y);
    else ctx.lineTo(cx + x, cy + y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
}

/**
 * Optimized VisualCore — Canvas animation with FPS throttle, visibility pause,
 * ref-based audio (no React re-renders), and reduced O(n²) complexity.
 */
export const VisualCore: React.FC<VisualCoreProps> = React.memo(({
  state = 'idle',
  onStateChange,
  size = 380,
  showStateControls = true,
  interactive = true,
  statusMessage,
  isAudioActive = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Use refs instead of state for animation variables — zero re-renders
  const audioLevelRef = useRef<number>(0.3);
  const lastFrameTimeRef = useRef<number>(0);
  const animationIdRef = useRef<number>(0);
  const isVisibleRef = useRef<boolean>(true);

  // Ref-based audio simulation — no React re-renders at 80ms intervals!
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (state === 'working' || isAudioActive) {
      interval = setInterval(() => {
        audioLevelRef.current = 0.2 + Math.random() * 0.8;
      }, 100); // Slightly longer interval for less CPU
    } else {
      audioLevelRef.current = 0.3;
    }
    return () => clearInterval(interval);
  }, [state, isAudioActive]);

  // Visibility API — pause animation when tab is hidden
  useEffect(() => {
    const handleVisibility = () => {
      isVisibleRef.current = !document.hidden;
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // ──────────────────────────────────────────────
  // OPTIMIZED CANVAS ANIMATION LOOP
  // Features:
  //  • FPS throttle (30fps idle, 60fps working/startup)
  //  • Skips frames when tab is hidden
  //  • Particles stored in ref — initialized once
  //  • Reduced O(n²) connection checks (threshold-gated)
  //  • Pre-computed trig values where possible
  // ──────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rotationAngle = 0;
    let pulsePhase = 0;
    let scanLineY = 0;

    // Pre-initialize particles ONCE (not per frame)
    const particles = Array.from({ length: PLEXUS_COUNT }, () => ({
      x: (Math.random() - 0.5) * 200,
      y: (Math.random() - 0.5) * 200,
      z: (Math.random() - 0.5) * 200,
      vx: (Math.random() - 0.5) * 0.8,
      vy: (Math.random() - 0.5) * 0.8,
      vz: (Math.random() - 0.5) * 0.8,
      radius: Math.random() * 2 + 1,
    }));

    // Pre-compute file segments once
    const fileSegments = Array.from({ length: 12 }, () => Math.random() > 0.4);

    // Pre-compute bar x-positions for waveform (no per-frame calculations)
    const barCount = 28;
    const barWidth = 3;
    const barPositions = Array.from({ length: barCount }, (_, i) => (i - barCount / 2) * (barWidth + 3));

    const render = (timestamp: number) => {
      // ── FPS Throttle ──
      const isHeavyState = state === 'working' || state === 'startup';
      const targetFps = isHeavyState ? FPS_THROTTLE_ACTIVE : FPS_THROTTLE_IDLE;
      const frameInterval = 1000 / targetFps;

      if (timestamp - lastFrameTimeRef.current < frameInterval) {
        animationIdRef.current = requestAnimationFrame(render);
        return;
      }
      lastFrameTimeRef.current = timestamp;

      // ── Skip rendering when tab is hidden ──
      if (!isVisibleRef.current) {
        animationIdRef.current = requestAnimationFrame(render);
        return;
      }

      const width = canvas!.width;
      const height = canvas!.height;
      const cx = width / 2;
      const cy = height / 2;
      const baseRadius = Math.min(width, height) * 0.35;

      // Update animation phase
      rotationAngle += state === 'working' ? 0.035 : state === 'file_io' ? 0.025 : 0.008;
      pulsePhase += 0.03;

      ctx!.clearRect(0, 0, width, height);

      // ── STATE RENDERERS (each self-contained) ──
      if (state === 'startup') {
        renderStartup(ctx!, cx, cy, baseRadius, rotationAngle, pulsePhase, particles);
      } else if (state === 'file_io') {
        renderFileIO(ctx!, cx, cy, baseRadius, rotationAngle, pulsePhase, scanLineY, fileSegments);
        scanLineY = (scanLineY + 2.5) % (baseRadius * 1.1 * 2);
      } else if (state === 'working') {
        renderWorking(ctx!, cx, cy, baseRadius, rotationAngle, pulsePhase, audioLevelRef.current, barPositions, barWidth);
      } else {
        renderIdle(ctx!, cx, cy, baseRadius, rotationAngle, pulsePhase);
      }

      animationIdRef.current = requestAnimationFrame(render);
    };

    animationIdRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationIdRef.current);
    };
  }, [state]);

  return (
    <div className="relative flex flex-col items-center justify-center p-2 select-none">
      {/* Visual Canvas Container */}
      <div
        style={{ width: size, height: size }}
        className="relative flex items-center justify-center rounded-full bg-[#090a0f]/60 backdrop-blur-xl border border-cyan-500/20 shadow-[0_0_50px_rgba(0,240,255,0.12)]"
      >
        {/* HTML5 Canvas Engine */}
        <canvas
          ref={canvasRef}
          width={size}
          height={size}
          className="absolute inset-0 z-10 rounded-full"
        />

        {/* Overlay HUD SVG Glass Reticle Rings */}
        <svg
          width={size}
          height={size}
          viewBox="0 0 400 400"
          className="absolute inset-0 pointer-events-none z-20"
        >
          {/* Tech tick marks */}
          <circle
            cx="200"
            cy="200"
            r="185"
            stroke="rgba(0, 240, 255, 0.15)"
            strokeWidth="1"
            strokeDasharray="2 6"
            fill="none"
          />
          <circle
            cx="200"
            cy="200"
            r="170"
            stroke="rgba(168, 85, 247, 0.12)"
            strokeWidth="1"
            fill="none"
          />

          {/* Corner HUD Markers */}
          <path
            d="M 40 100 L 40 40 L 100 40"
            stroke="rgba(0, 240, 255, 0.4)"
            strokeWidth="1.5"
            fill="none"
          />
          <path
            d="M 360 100 L 360 40 L 300 40"
            stroke="rgba(0, 240, 255, 0.4)"
            strokeWidth="1.5"
            fill="none"
          />
          <path
            d="M 40 300 L 40 360 L 100 360"
            stroke="rgba(0, 240, 255, 0.4)"
            strokeWidth="1.5"
            fill="none"
          />
          <path
            d="M 360 300 L 360 360 L 300 360"
            stroke="rgba(0, 240, 255, 0.4)"
            strokeWidth="1.5"
            fill="none"
          />
        </svg>

        {/* State Label & Status Indicator in Core Center */}
        <div className="absolute z-30 bottom-8 text-center pointer-events-none">
          <motion.div
            key={state}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="flex items-center gap-1.5 justify-center px-3 py-1 rounded-full bg-[#0a0d14]/90 border border-cyan-500/30 text-[11px] font-mono tracking-widest uppercase text-cyan-300 shadow-[0_0_15px_rgba(0,240,255,0.2)]"
          >
            <span
              className={`w-2 h-2 rounded-full animate-ping ${
                state === 'startup'
                  ? 'bg-cyan-400'
                  : state === 'file_io'
                  ? 'bg-amber-400'
                  : state === 'working'
                  ? 'bg-purple-400'
                  : 'bg-indigo-400'
              }`}
            />
            <span>{state}</span>
          </motion.div>
          {statusMessage && (
            <p className="mt-1 text-[10px] text-slate-400 font-mono tracking-tight truncate max-w-[220px]">
              {statusMessage}
            </p>
          )}
        </div>
      </div>

      {/* Interactive Core State Switcher / HUD Test Controls */}
      {showStateControls && interactive && (
        <div className="mt-4 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0d0f18]/90 border border-slate-800 backdrop-blur-md shadow-xl z-30">
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mr-1">
            CORE_STATE:
          </span>
          {(['startup', 'file_io', 'working', 'idle'] as CoreState[]).map((s) => {
            const isActive = state === s;
            return (
              <button
                key={s}
                onClick={() => onStateChange && onStateChange(s)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-all duration-200 flex items-center gap-1.5 ${
                  isActive
                    ? s === 'startup'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-[0_0_10px_rgba(0,240,255,0.3)]'
                      : s === 'file_io'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                      : s === 'working'
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/50 shadow-[0_0_10px_rgba(168,85,247,0.3)]'
                      : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/50 shadow-[0_0_10px_rgba(99,102,241,0.3)]'
                    : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-slate-800'
                }`}
              >
                {s === 'startup' && <Zap className="w-3 h-3" />}
                {s === 'file_io' && <HardDrive className="w-3 h-3" />}
                {s === 'working' && <Cpu className="w-3 h-3" />}
                {s === 'idle' && <RefreshCw className="w-3 h-3" />}
                <span className="capitalize">{s}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});
