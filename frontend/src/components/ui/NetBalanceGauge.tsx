import React, { useState, useEffect } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

interface Balance {
  friendProfileId: string;
  friendName: string;
  receivableBalance: number;
  payableBalance: number;
}

interface NetBalanceGaugeProps {
  balances: Balance[];
  loading?: boolean;
}

export const NetBalanceGauge: React.FC<NetBalanceGaugeProps> = ({
  balances,
  loading = false,
}) => {
  const [displayedAngle, setDisplayedAngle] = useState(0);

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  // Derived Metrics
  const positiveBalances = balances.filter((b) => b.receivableBalance > 0);
  const negativeBalances = balances.filter((b) => b.payableBalance > 0);
  const totalOwed = positiveBalances.reduce((s, b) => s + b.receivableBalance, 0);
  const totalOwe = negativeBalances.reduce((s, b) => s + b.payableBalance, 0);
  const netBalance = totalOwed - totalOwe;

  // Calculate Balance Ratio & Angle
  const sumBalances = totalOwed + totalOwe;
  const score = sumBalances > 0 ? (totalOwed - totalOwe) / sumBalances : 0;
  const targetAngle = score * 90; // range [-90, 90]

  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => {
        setDisplayedAngle(targetAngle);
      }, 50);
      return () => clearTimeout(timer);
    } else {
      setDisplayedAngle(0);
    }
  }, [loading, targetAngle]);

  // Trigonometric coordinates for active segment highlight arc
  const R = 70;
  const angleRad = (displayedAngle * Math.PI) / 180;
  const activeX = 90 + R * Math.sin(angleRad);
  const activeY = 90 - R * Math.cos(angleRad);
  const sweepFlag = displayedAngle >= 0 ? 1 : 0;
  const activePathD = displayedAngle !== 0
    ? `M 90,20 A ${R},${R} 0 0,${sweepFlag} ${activeX},${activeY}`
    : '';

  // Determine colors and badge state
  const isNetPositive = netBalance > 0;
  const isNetNegative = netBalance < 0;
  const isEmpty = sumBalances === 0;

  let glowColor = '';
  let badgeText = 'Net Balanced';
  let badgeColorClass = 'text-muted border-border bg-surface-hover';

  if (isNetPositive) {
    glowColor = 'var(--color-success)';
    badgeText = 'Net Positive';
    badgeColorClass = 'text-success border-success/30 bg-success/5';
  } else if (isNetNegative) {
    glowColor = 'var(--color-error)';
    badgeText = 'Net Negative';
    badgeColorClass = 'text-error border-error/30 bg-error/5';
  } else if (isEmpty) {
    badgeText = 'No Outstanding Balances';
  }

  // Loading state
  if (loading) {
    return (
      <div className="container-card p-6 md:p-8 animate-pulse flex flex-col h-full justify-between">
        <div>
          <div className="h-6 bg-surface-hover rounded w-1/3 mb-6" />
          <div className="flex flex-col items-center justify-center gap-6 my-auto py-2">
            <div className="relative w-[180px] h-[100px] bg-surface-hover rounded-t-full flex items-end justify-center overflow-hidden">
              <div className="w-[140px] h-[70px] bg-surface rounded-t-full" />
            </div>
            <div className="h-5 bg-surface-hover rounded w-1/2" />
            <div className="flex w-full justify-between gap-4 mt-2">
              <div className="h-10 bg-surface-hover rounded flex-1" />
              <div className="h-10 bg-surface-hover rounded flex-1" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container-card p-6 md:p-8 flex flex-col h-full justify-between">
      <h3 className="text-lg font-display font-semibold text-foreground mb-4">Net Position</h3>

      <div className="flex flex-col items-center justify-center gap-6 my-auto py-2">
        {/* SVG semi-circular gauge */}
        <div className="relative w-[180px] h-[100px] flex-shrink-0">
          <svg viewBox="0 0 180 100" className="w-full h-full overflow-visible">
            {/* Background Track */}
            <path
              d="M 20,90 A 70,70 0 0,1 160,90"
              fill="transparent"
              stroke="var(--color-border-subtle)"
              strokeWidth="10"
              strokeLinecap="round"
            />

            {/* Split Indicator dot in center top */}
            <circle cx="90" cy="20" r="3.5" fill="var(--color-text-secondary)" className="opacity-40" />

            {/* Left label "Owe" and Right label "Owed" */}
            <text x="12" y="94" fontSize="9" fontWeight="700" fill="var(--color-error)" opacity="0.8" textAnchor="middle">
              OWE
            </text>
            <text x="168" y="94" fontSize="9" fontWeight="700" fill="var(--color-success)" opacity="0.8" textAnchor="middle">
              OWED
            </text>

            {/* Active highlight segment (Green/Red arc) */}
            {activePathD && (
              <path
                d={activePathD}
                fill="transparent"
                stroke={isNetPositive ? 'var(--color-success)' : 'var(--color-error)'}
                strokeWidth="10"
                strokeLinecap="round"
                className="transition-all duration-300"
                style={{
                  filter: glowColor ? `drop-shadow(0 0 5px ${glowColor}55)` : 'none',
                }}
              />
            )}

            {/* Needle */}
            {!isEmpty && (
              <g
                transform={`rotate(${displayedAngle} 90 90)`}
                className="transition-transform duration-500 ease-out origin-[90px_90px]"
              >
                {/* Needle pointer */}
                <line
                  x1="90"
                  y1="90"
                  x2="90"
                  y2="28"
                  stroke="var(--color-text-primary)"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
                {/* Needle glowing tip cap */}
                <circle
                  cx="90"
                  cy="28"
                  r="3.5"
                  fill={isNetPositive ? 'var(--color-success)' : isNetNegative ? 'var(--color-error)' : 'var(--color-text-primary)'}
                />
              </g>
            )}

            {/* Center Pivot Point */}
            <circle cx="90" cy="90" r="7" fill="var(--color-text-primary)" />
            <circle cx="90" cy="90" r="3" fill="var(--color-bg)" />
          </svg>
        </div>

        {/* Glow center status badge */}
        <div className="flex flex-col items-center text-center">
          <div
            className={`px-3 py-1 rounded-full text-xs font-semibold tracking-wide border uppercase transition-all duration-300 ${badgeColorClass}`}
            style={{
              boxShadow: glowColor ? `0 0 12px ${glowColor}25` : 'none',
            }}
          >
            {badgeText}
          </div>
          <span className="text-xl font-display font-bold text-foreground mt-2 leading-none">
            {netBalance >= 0 ? '+' : ''}
            {fmt(netBalance)}
          </span>
        </div>

        {/* Breakdown Sub-counters */}
        <div className="flex w-full items-center justify-between gap-4 mt-2 pt-4 border-t border-border-subtle">
          {/* Receivables */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
              <ArrowDownRight className="w-4 h-4 text-success" />
            </div>
            <div className="min-w-0">
              <span className="block text-[10px] font-bold text-muted uppercase tracking-wider leading-none">Owed to You</span>
              <span className="text-xs font-bold text-success mt-0.5 block leading-none">{fmt(totalOwed)}</span>
            </div>
          </div>

          {/* Payables */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-error/10 flex items-center justify-center shrink-0">
              <ArrowUpRight className="w-4 h-4 text-error" />
            </div>
            <div className="min-w-0">
              <span className="block text-[10px] font-bold text-muted uppercase tracking-wider leading-none">You Owe</span>
              <span className="text-xs font-bold text-error mt-0.5 block leading-none">{fmt(totalOwe)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
