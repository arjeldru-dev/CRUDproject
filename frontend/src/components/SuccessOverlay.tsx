import React, { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

interface SuccessOverlayProps {
  amount: string;
  mode: 'expense' | 'settlement';
}

interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
  delay: number;
  angle: number;
  distance: number;
}

const PARTICLE_COLORS = [
  '#10b981', // emerald
  '#6366f1', // indigo
  '#a855f7', // purple
  '#f59e0b', // amber
  '#34d399', // green
  '#818cf8', // light indigo
];

const generateParticles = (count: number): Particle[] =>
  Array.from({ length: count }, (_, i) => ({
    id: i,
    x: 50 + (Math.random() - 0.5) * 20,
    y: 35 + (Math.random() - 0.5) * 10,
    color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
    size: 4 + Math.random() * 6,
    delay: Math.random() * 0.4,
    angle: (Math.random() * 360 * Math.PI) / 180,
    distance: 40 + Math.random() * 60,
  }));

/**
 * SuccessOverlay — Shown when a transaction is recorded successfully.
 * Features staggered entrance animations, a pulsing check icon, and
 * particle burst micro-animations for a moment of delight.
 */
const SuccessOverlay: React.FC<SuccessOverlayProps> = ({ amount, mode }) => {
  const [particles] = useState<Particle[]>(() => generateParticles(16));
  const [showParticles, setShowParticles] = useState(false);

  useEffect(() => {
    // Trigger particles slightly after icon appears
    const timer = setTimeout(() => setShowParticles(true), 150);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center z-20 rounded-2xl overflow-hidden"
      style={{ background: 'var(--color-surface)', opacity: 0.97 }}
    >
      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          background: 'radial-gradient(ellipse at 50% 40%, var(--color-success) 0%, transparent 65%)',
        }}
      />

      {/* Particle burst */}
      {showParticles &&
        particles.map((p) => (
          <span
            key={p.id}
            className="absolute rounded-full pointer-events-none"
            style={{
              left: `calc(${p.x}% + ${Math.cos(p.angle) * p.distance * 0.5}px)`,
              top:  `calc(${p.y}% + ${Math.sin(p.angle) * p.distance * 0.5}px)`,
              width: p.size,
              height: p.size,
              background: p.color,
              opacity: 0,
              animation: `particleFloat 0.8s ${p.delay}s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards`,
            }}
          />
        ))}

      {/* Success icon */}
      <div
        className="w-24 h-24 rounded-full flex items-center justify-center mb-6 animate-successPulse bg-success/15 border-2 border-success/30"
      >
        <CheckCircle2
          className="w-12 h-12 text-success animate-fadeInScale"
          strokeWidth={2.5}
        />
      </div>

      {/* Text — staggered entrance */}
      <h3
        className="text-2xl font-display font-semibold text-foreground mb-2 animate-fadeInUp"
        style={{ animationDelay: '0.1s' }}
      >
        {mode === 'expense' ? '🎉 Expense Split!' : '🤝 Debt Settled!'}
      </h3>
      <p
        className="text-base text-muted animate-fadeInUp"
        style={{ animationDelay: '0.2s' }}
      >
        <span className="font-semibold text-success">
          {amount}
        </span>{' '}
        {mode === 'expense' ? 'recorded & split' : 'settlement complete'}
      </p>

      {/* Saving indicator */}
      <div
        className="mt-6 flex items-center gap-2 text-sm text-muted animate-fadeInUp"
        style={{ animationDelay: '0.35s' }}
      >
        <span className="inline-flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: 'var(--color-success)',
                animation: `successPulse 1.2s ${i * 0.2}s ease-in-out infinite`,
                display: 'inline-block',
              }}
            />
          ))}
        </span>
        Updating balances…
      </div>
    </div>
  );
};

export default SuccessOverlay;
