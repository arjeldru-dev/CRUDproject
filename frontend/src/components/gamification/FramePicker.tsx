import React, { useState } from 'react';
import { useGamificationStore } from '../../store/gamificationStore';
import { useAuthStore } from '../../store/authStore';
import Avatar from '../ui/Avatar';
import { Lock, Check, Sparkles } from 'lucide-react';

/**
 * FramePicker Component
 * Renders a grid of avatar frames that the user can preview and equip
 * based on their total earned points.
 */
export const FramePicker: React.FC = () => {
  const { user } = useAuthStore();
  const { availableFrames, profile, setActiveFrame, isLoading } = useGamificationStore();
  const [equippingId, setEquippingId] = useState<string | null>(null);
  const [localSuccess, setLocalSuccess] = useState<string | null>(null);

  const totalPoints = profile?.totalPoints || 0;
  const avatarName = user?.displayName || user?.email || 'User';

  const handleEquip = async (frameId: string, frameName: string) => {
    if (equippingId) return;
    setEquippingId(frameId);
    setLocalSuccess(null);
    
    const success = await setActiveFrame(frameId);
    if (success) {
      setLocalSuccess(`Equipped ${frameName}!`);
      setTimeout(() => setLocalSuccess(null), 3000);
    }
    setEquippingId(null);
  };

  return (
    <div className="mt-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-lg font-display font-semibold text-foreground flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-warning fill-warning/20" />
            Avatar Frames
          </h3>
          <p className="text-sm text-muted">
            Unlock premium border rings around your avatar with points you earn
          </p>
        </div>
        {localSuccess && (
          <div className="text-xs font-bold text-success bg-success/10 border border-success/20 px-3 py-1.5 rounded-lg animate-fadeInFast">
            {localSuccess}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {availableFrames.map((frame) => {
          const isUnlocked = totalPoints >= frame.pointsRequired || frame.unlocked;
          const isActive = frame.isActive || (profile?.activeFrame?.id === frame.id);
          const isProcessing = equippingId === frame.id;

          return (
            <div
              key={frame.id}
              className={`
                relative container-card p-4 flex flex-col items-center text-center transition-all duration-300
                ${isActive 
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/20 shadow-md' 
                  : isUnlocked 
                    ? 'hover:border-border-subtle hover:bg-surface-hover/30 cursor-pointer' 
                    : 'opacity-75 border-border-subtle bg-surface-hover/10'
                }
              `}
              onClick={() => {
                if (isUnlocked && !isActive && !isLoading) {
                  handleEquip(frame.id, frame.name);
                }
              }}
            >
              {/* Avatar Preview with Frame */}
              <div className="relative mb-4 flex items-center justify-center h-20 w-20">
                <Avatar
                  src={user?.avatarUrl}
                  name={avatarName}
                  size="lg"
                  frameClass={frame.cssClass || undefined}
                />
                
                {/* Status Badges overlayed */}
                {!isUnlocked && (
                  <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] rounded-xl flex items-center justify-center z-10">
                    <div className="p-1.5 bg-surface border border-border rounded-lg text-muted shadow-sm">
                      <Lock className="w-4 h-4" />
                    </div>
                  </div>
                )}
              </div>

              {/* Frame Info */}
              <p className="text-sm font-semibold text-foreground mb-1 truncate w-full">
                {frame.name}
              </p>
              
              {isActive ? (
                <span className="text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                  <Check className="w-3 h-3" /> Active
                </span>
              ) : isUnlocked ? (
                <button
                  disabled={isProcessing || isLoading}
                  className="text-[11px] font-bold text-muted hover:text-primary transition-colors focus:outline-none"
                >
                  {isProcessing ? 'Equipping...' : 'Click to Equip'}
                </button>
              ) : (
                <span className="text-[10px] font-semibold text-muted bg-surface/80 border border-border-subtle px-2 py-0.5 rounded-md">
                  Requires {frame.pointsRequired} pts
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
export default FramePicker;
