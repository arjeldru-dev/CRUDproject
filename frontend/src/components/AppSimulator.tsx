import React, { useState } from 'react';
import { 
  Plus, 
  Trophy, 
  Activity,
  MessageSquare,
  Sparkles,
  LayoutDashboard,
  ThumbsUp,
  Heart,
  Flame,
  ArrowDownRight,
  ArrowUpRight
} from 'lucide-react';

// Mock Types for the Interactive App Simulator
interface MockFriend {
  id: string;
  name: string;
  avatarUrl: string | null;
  frame: string | null;
  owesYou: number;
  youOwe: number;
}

interface MockCategory {
  id: string;
  name: string;
  limit: number;
  spent: number;
}

interface MockFeedComment {
  id: string;
  author: string;
  text: string;
}

interface MockFeedPost {
  id: string;
  authorName: string;
  avatarUrl: string | null;
  frame: string | null;
  actionText: string;
  amountText: string;
  message: string | null;
  reactions: { type: string; count: number; reacted: boolean }[];
  comments: MockFeedComment[];
  time: string;
}

interface MockChallenge {
  id: string;
  name: string;
  type: string;
  status: 'PENDING' | 'ACTIVE' | 'COMPLETED';
  participantsCount: number;
  daysLeft: number;
  limit: number;
}

const getReactionIcon = (emoji: string, isActive: boolean) => {
  const cls = `w-3.5 h-3.5 transition-colors ${isActive ? 'text-primary' : 'text-muted'}`;
  switch (emoji) {
    case '👍': return <ThumbsUp className={cls} />;
    case '❤️': return <Heart className={cls} />;
    case '🔥': return <Flame className={cls} />;
    case '🏆': return <Trophy className={cls} />;
    default: return null;
  }
};

export default function AppSimulator() {
  // ─── STATE FOR SIMULATOR (MOCK DB) ───
  const [mockUser, setMockUser] = useState({
    name: 'You (Demo User)',
    avatarUrl: null,
    equippedFrame: null as string | null,
    xp: 320,
    streak: 5,
  });

  const [mockFriends, setMockFriends] = useState<MockFriend[]>([
    { id: '1', name: 'Kevin', avatarUrl: null, frame: 'avatar-frame-fire', owesYou: 850, youOwe: 0 },
    { id: '2', name: 'Arianne', avatarUrl: null, frame: 'avatar-frame-diamond', owesYou: 0, youOwe: 300 },
    { id: '3', name: 'Patricia', avatarUrl: null, frame: null, owesYou: 400, youOwe: 0 },
  ]);

  const [mockCategories, setMockCategories] = useState<MockCategory[]>([
    { id: 'cat-1', name: 'Dining Out', limit: 4000, spent: 2850 },
    { id: 'cat-2', name: 'Groceries', limit: 5000, spent: 3900 },
    { id: 'cat-3', name: 'Transportation', limit: 2000, spent: 850 },
    { id: 'cat-4', name: 'Utilities', limit: 3000, spent: 2950 },
  ]);

  const [mockFeedPosts, setMockFeedPosts] = useState<MockFeedPost[]>([
    {
      id: 'feed-1',
      authorName: 'Kevin',
      avatarUrl: null,
      frame: 'avatar-frame-fire',
      actionText: 'split an expense with You',
      amountText: '₱1,700.00',
      message: 'Samgyupsal Friday Dinner with the barkada! 🥓🍲',
      reactions: [
        { type: '👍', count: 3, reacted: false },
        { type: '❤️', count: 2, reacted: false },
        { type: '🔥', count: 5, reacted: true },
      ],
      comments: [
        { id: 'c-1', author: 'Arianne', text: 'Solid dinner, let\'s do this again next week!' },
      ],
      time: '2h ago',
    },
    {
      id: 'feed-2',
      authorName: 'Patricia',
      avatarUrl: null,
      frame: null,
      actionText: 'unlocked a new badge',
      amountText: 'Budget Master',
      message: 'Kept dining out spend under limit for 3 consecutive weeks! 🎯',
      reactions: [
        { type: '👍', count: 4, reacted: false },
        { type: '🏆', count: 3, reacted: false },
      ],
      comments: [],
      time: '5h ago',
    },
  ]);

  const [mockChallenges, setMockChallenges] = useState<MockChallenge[]>([
    { id: 'ch-1', name: 'Coffee-Free Week', type: 'COFFEE', status: 'PENDING', participantsCount: 3, daysLeft: 7, limit: 0 },
    { id: 'ch-2', name: 'Food Prep Duel', type: 'DINING', status: 'ACTIVE', participantsCount: 2, daysLeft: 4, limit: 1500 },
  ]);

  // Simulator UI State
  const [simTab, setSimTab] = useState<'dashboard' | 'feed' | 'challenges'>('dashboard');
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [txType, setTxType] = useState<'EXPENSE' | 'SETTLEMENT'>('EXPENSE');
  const [txAmount, setTxAmount] = useState('');
  const [txCategory, setTxCategory] = useState('cat-1');
  const [txFriend, setTxFriend] = useState('1'); // Kevin
  const [txMessage, setTxMessage] = useState('');
  const [selectedCommentsPostId, setSelectedCommentsPostId] = useState<string | null>(null);
  const [newCommentText, setNewCommentText] = useState('');
  const [nudgeMessage, setNudgeMessage] = useState<string | null>(null);

  // Input Validation Error State
  const [formError, setFormError] = useState<string | null>(null);

  // Delight/Particle state
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; color: string }[]>([]);

  // Emitter function
  const triggerExplosion = () => {
    const newParticles = Array.from({ length: 16 }).map((_, i) => ({
      id: Date.now() + i,
      x: (Math.random() - 0.5) * 140,
      y: (Math.random() - 0.5) * 140 - 20,
      color: ['#0284c7', '#10b981', '#fb923c', '#818cf8', '#f43f5e'][Math.floor(Math.random() * 5)],
    }));
    setParticles(prev => [...prev, ...newParticles]);
    setTimeout(() => {
      setParticles(prev => prev.filter(p => !newParticles.find(np => np.id === p.id)));
    }, 800);
  };

  // Helper formats
  const formatPHP = (n: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  };

  // Trigger brief floating notifications inside simulator
  const triggerNudge = (msg: string) => {
    setNudgeMessage(msg);
    setTimeout(() => setNudgeMessage(null), 3000);
  };

  // Add mock transaction (expense or settlement)
  const handleAddMockTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(txAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setFormError('Please enter a valid amount greater than 0.');
      return;
    }

    if (txType === 'EXPENSE') {
      // 1. Deduct from Category
      setMockCategories(prev =>
        prev.map(cat => (cat.id === txCategory ? { ...cat, spent: cat.spent + parsedAmount } : cat))
      );

      // 2. Adjust Balance (split equally 50/50 with selected friend)
      const splitAmount = parsedAmount / 2;
      setMockFriends(prev =>
        prev.map(f => {
          if (f.id === txFriend) {
            // Friend owes you splitAmount
            return { ...f, owesYou: f.owesYou + splitAmount };
          }
          return f;
        })
      );

      // 3. Add to Feed
      const selectedFriend = mockFriends.find(f => f.id === txFriend);
      const categoryName = mockCategories.find(c => c.id === txCategory)?.name || 'Expense';
      const newPost: MockFeedPost = {
        id: `feed-custom-${Date.now()}`,
        authorName: 'You',
        avatarUrl: null,
        frame: mockUser.equippedFrame,
        actionText: `logged a split expense for ${categoryName}`,
        amountText: formatPHP(parsedAmount),
        message: txMessage.trim() || `Dinner split with ${selectedFriend?.name || 'Friend'}`,
        reactions: [
          { type: '👍', count: 0, reacted: false },
          { type: '❤️', count: 0, reacted: false },
          { type: '🔥', count: 0, reacted: false },
        ],
        comments: [],
        time: 'Just now',
      };
      setMockFeedPosts(prev => [newPost, ...prev]);
      triggerNudge(`Logged ₱${parsedAmount} expense! Split details posted to Feed.`);
      triggerExplosion();

    } else {
      // SETTLEMENT
      const friendObj = mockFriends.find(f => f.id === txFriend);
      if (!friendObj) return;

      // Settle what you owe
      setMockFriends(prev =>
        prev.map(f => {
          if (f.id === txFriend) {
            const remainingDebt = Math.max(0, f.youOwe - parsedAmount);
            const excess = Math.max(0, parsedAmount - f.youOwe);
            return {
              ...f,
              youOwe: remainingDebt,
              owesYou: f.owesYou + excess,
            };
          }
          return f;
        })
      );

      // Add to Feed
      const newPost: MockFeedPost = {
        id: `feed-settle-${Date.now()}`,
        authorName: 'You',
        avatarUrl: null,
        frame: mockUser.equippedFrame,
        actionText: `settled a balance with ${friendObj.name}`,
        amountText: formatPHP(parsedAmount),
        message: txMessage.trim() || `Repaid debt to ${friendObj.name}`,
        reactions: [
          { type: '👍', count: 1, reacted: false },
        ],
        comments: [],
        time: 'Just now',
      };
      setMockFeedPosts(prev => [newPost, ...prev]);
      triggerNudge(`Recorded settlement of ₱${parsedAmount} with ${friendObj.name}!`);
      triggerExplosion();
    }

    // Reset Form & Clear Errors
    setTxAmount('');
    setTxMessage('');
    setFormError(null);
    setShowTransactionModal(false);
  };

  // Toggle emoji reactions
  const handleToggleReaction = (postId: string, reactionType: string) => {
    setMockFeedPosts(prev =>
      prev.map(post => {
        if (post.id === postId) {
          return {
            ...post,
            reactions: post.reactions.map(r => {
              if (r.type === reactionType) {
                return {
                  ...r,
                  count: r.reacted ? r.count - 1 : r.count + 1,
                  reacted: !r.reacted,
                };
              }
              return r;
            }),
          };
        }
        return post;
      })
    );
  };

  // Add Comment to Feed Post
  const handleAddComment = (postId: string) => {
    if (!newCommentText.trim()) return;
    setMockFeedPosts(prev =>
      prev.map(post => {
        if (post.id === postId) {
          return {
            ...post,
            comments: [
              ...post.comments,
              {
                id: `c-custom-${Date.now()}`,
                author: 'You',
                text: newCommentText.trim(),
              },
            ],
          };
        }
        return post;
      })
    );
    setNewCommentText('');
  };

  // Calculate overall totals for simulator
  const totalOwedToYou = mockFriends.reduce((acc, f) => acc + f.owesYou, 0);
  const totalYouOwe = mockFriends.reduce((acc, f) => acc + f.youOwe, 0);
  const totalSpent = mockCategories.reduce((acc, c) => acc + c.spent, 0);

  return (
    <div className="relative w-[340px] sm:w-[370px] h-[640px] bg-background dark:bg-black rounded-[48px] border-[10px] border-border shadow-2xl overflow-hidden flex flex-col transition-all duration-200 flex-shrink-0">
      
      {/* Phone Top Notch / Speaker block */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 w-32 h-4.5 bg-border rounded-full z-[100] flex items-center justify-center pointer-events-none">
        <div className="w-12 h-1 bg-background dark:bg-black rounded-full mb-0.5" />
        <div className="w-2.5 h-2.5 bg-border rounded-full ml-3" />
      </div>

      {/* Particles explosion overlay */}
      <div className="absolute inset-0 pointer-events-none z-[100] overflow-hidden">
        {particles.map(p => (
          <div
            key={p.id}
            className="absolute w-2 h-2 rounded-full"
            style={{
              left: '50%',
              top: '50%',
              backgroundColor: p.color,
              '--dx': `${p.x}px`,
              '--dy': `${p.y}px`,
              transform: 'translate(-50%, -50%)',
              animation: 'particleFloat 0.8s cubic-bezier(0.25, 1, 0.5, 1) forwards',
            } as React.CSSProperties}
          />
        ))}
      </div>

      {/* Simulator Header */}
      <div className="pt-8 px-4 pb-3 border-b border-border bg-surface flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative shrink-0">
            {mockUser.equippedFrame ? (
              <div className={`w-8 h-8 rounded-xl p-[2.5px] ${mockUser.equippedFrame} flex items-center justify-center shrink-0`}>
                <div className="w-full h-full rounded-[9px] bg-surface flex items-center justify-center text-[10px] font-bold text-foreground font-display">
                  U
                </div>
              </div>
            ) : (
              <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary font-display shrink-0">
                U
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-foreground leading-tight truncate max-w-[120px]" title={mockUser.name}>{mockUser.name}</p>
            <p className="text-[9px] text-streak font-bold flex items-center gap-0.5">
              <span>🔥</span> {mockUser.streak} Days
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="px-2 py-0.5 text-[9px] font-bold bg-primary/10 text-primary border border-primary/20 rounded font-mono">
            DEMO MODE
          </span>
        </div>
      </div>

      {/* Simulated Floating Notification Toast */}
      {nudgeMessage && (
        <div className="absolute top-18 left-3 right-3 bg-surface border border-border text-foreground rounded-xl px-3 py-2.5 text-[11px] font-medium shadow-lg z-[90] flex items-center gap-2 animate-slideDownIn">
          <Sparkles className="w-3.5 h-3.5 text-streak shrink-0" />
          <span className="flex-1 truncate">{nudgeMessage}</span>
        </div>
      )}

      {/* Simulator Views Scroll Container */}
      <div className="flex-1 overflow-y-auto bg-background p-4 relative no-scrollbar">
        
        {/* ──────────────────────────────────────────────────────── */}
        {/* VIEW A: DASHBOARD VIEW                                   */}
        {/* ──────────────────────────────────────────────────────── */}
        {simTab === 'dashboard' && (
          <div className="space-y-4 animate-fadeInFast text-left">
            {/* Financial Balance Summary */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-success/[0.04] border border-success/10 p-3 rounded-2xl flex items-center gap-2.5 hover:scale-[1.01] transition-transform duration-200 ease-out-emil min-w-0">
                <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
                  <ArrowDownRight className="w-4 h-4 text-success" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[9px] text-muted font-bold uppercase tracking-wider block leading-none">Owed to you</span>
                  <span className="text-sm font-display font-extrabold text-success tracking-tight mt-1.5 font-mono block leading-none truncate">
                    {formatPHP(totalOwedToYou)}
                  </span>
                </div>
              </div>
              <div className="bg-error/[0.04] border border-error/10 p-3 rounded-2xl flex items-center gap-2.5 hover:scale-[1.01] transition-transform duration-200 ease-out-emil min-w-0">
                <div className="w-8 h-8 rounded-lg bg-error/10 flex items-center justify-center shrink-0">
                  <ArrowUpRight className="w-4 h-4 text-error" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[9px] text-muted font-bold uppercase tracking-wider block leading-none">You owe</span>
                  <span className="text-sm font-display font-extrabold text-error tracking-tight mt-1.5 font-mono block leading-none truncate">
                    {formatPHP(totalYouOwe)}
                  </span>
                </div>
              </div>
            </div>

            {/* Main Category Budgets */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-xs font-bold text-foreground font-display">Monthly Category Budgets</h4>
                <span className="text-[9px] font-mono text-muted">
                  Spent: {formatPHP(totalSpent)}
                </span>
              </div>
              
              {mockCategories.length === 0 ? (
                <div className="py-6 text-center text-muted border border-dashed border-border rounded-2xl">
                  <p className="text-xs">No active category targets.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {mockCategories.map(cat => {
                    const pct = Math.min(100, (cat.spent / cat.limit) * 100);
                    const isOver = cat.spent > cat.limit;
                    return (
                      <div key={cat.id} className="bg-surface p-3 rounded-2xl shadow-sm hover:scale-[1.01] transition-transform duration-200 ease-out-emil">
                        <div className="flex justify-between items-baseline mb-1.5 min-w-0">
                          <span className="text-xs font-bold text-foreground font-display truncate max-w-[130px]" title={cat.name}>{cat.name}</span>
                          <span className="text-[10px] font-mono text-muted shrink-0">
                            {formatPHP(cat.spent)} / {formatPHP(cat.limit)}
                          </span>
                        </div>
                        <div className="w-full bg-surface-hover h-2 rounded-full overflow-hidden border border-border-subtle/50">
                          <div 
                            className={`h-full rounded-full transition-all duration-350 ease-out-emil ${isOver ? 'bg-error' : pct > 80 ? 'bg-warning' : 'bg-success'}`} 
                            style={{ width: `${pct}%`, transitionTimingFunction: 'var(--ease-out-expo)' }} 
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Friends balances list */}
            <div>
              <h4 className="text-xs font-bold text-foreground font-display mb-2">Splits with Barkada</h4>
              
              {mockFriends.length === 0 ? (
                <div className="py-6 text-center text-muted border border-dashed border-border rounded-2xl">
                  <p className="text-xs">All settled up! Add friends to split costs.</p>
                </div>
              ) : (
                <div className="bg-surface rounded-2xl divide-y divide-border-subtle/50 shadow-sm overflow-hidden">
                  {mockFriends.map(f => (
                    <div key={f.id} className="p-3 flex items-center justify-between gap-2 hover:bg-surface-hover/20 transition-colors duration-150">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="relative shrink-0">
                          {f.frame ? (
                            <div className={`w-7 h-7 rounded-xl p-[2px] ${f.frame} flex items-center justify-center shrink-0`}>
                              <div className="w-full h-full rounded-[8px] bg-surface flex items-center justify-center text-[10px] font-bold text-foreground font-display">
                                {f.name[0]}
                              </div>
                            </div>
                          ) : (
                            <div className="w-7 h-7 rounded-xl bg-secondary/15 flex items-center justify-center text-[10px] font-bold text-secondary font-display shrink-0">
                              {f.name[0]}
                            </div>
                          )}
                        </div>
                        <span className="text-xs font-bold text-foreground font-display truncate max-w-[110px]" title={f.name}>{f.name}</span>
                      </div>
                      <div className="text-right shrink-0">
                        {f.owesYou > 0 ? (
                          <p className="text-[10px] text-success font-bold font-mono">Owes you +{formatPHP(f.owesYou)}</p>
                        ) : f.youOwe > 0 ? (
                          <p className="text-[10px] text-error font-bold font-mono">You owe -{formatPHP(f.youOwe)}</p>
                        ) : (
                          <p className="text-[9px] text-muted font-bold font-display">Settled</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ──────────────────────────────────────────────────────── */}
        {/* VIEW B: FEED VIEW                                        */}
        {/* ──────────────────────────────────────────────────────── */}
        {simTab === 'feed' && (
          <div className="space-y-3.5 animate-fadeInFast text-left">
            <div className="flex justify-between items-center mb-1">
              <h4 className="text-xs font-bold text-foreground font-display">Barkada Activity Feed</h4>
            </div>

            {mockFeedPosts.length === 0 ? (
              <div className="py-12 text-center text-muted border border-dashed border-border rounded-3xl">
                <p className="text-xs">No activity yet. Log a transaction to see feed updates!</p>
              </div>
            ) : (
              mockFeedPosts.map(post => (
                <div key={post.id} className="bg-surface rounded-2xl p-4 space-y-3 shadow-sm hover:scale-[1.01] transition-transform duration-200 ease-out-emil">
                  
                  {/* Post Author */}
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="relative shrink-0">
                        {post.frame ? (
                          <div className={`w-7 h-7 rounded-xl p-[2px] ${post.frame} flex items-center justify-center shrink-0`}>
                            <div className="w-full h-full rounded-[8px] bg-surface flex items-center justify-center text-[10px] font-bold text-foreground font-display">
                              {post.authorName[0]}
                            </div>
                          </div>
                        ) : (
                          <div className="w-7 h-7 rounded-xl bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary font-display shrink-0">
                            {post.authorName[0]}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-foreground font-display leading-tight truncate" title={`${post.authorName} ${post.actionText}`}>
                          {post.authorName} <span className="font-normal text-muted font-sans">{post.actionText}</span>
                        </p>
                        <p className="text-[9px] text-muted">{post.time}</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-display font-black text-foreground font-mono shrink-0 ml-1">
                      {post.amountText}
                    </span>
                  </div>

                  {/* Message body with line clamp protection */}
                  {post.message && (
                    <p className="text-xs text-muted leading-relaxed italic bg-surface-hover/40 px-3 py-2 rounded-xl border border-border-subtle/40 break-words line-clamp-3" title={post.message}>
                      &ldquo;{post.message}&rdquo;
                    </p>
                  )}

                  {/* Reactions & Actions Row */}
                  <div className="flex items-center justify-between pt-1 border-t border-border-subtle/50 text-[10px]">
                    <div className="flex gap-2">
                      {post.reactions.map(r => (
                        <button
                          key={r.type}
                          onClick={() => handleToggleReaction(post.id, r.type)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all duration-200 active:scale-90 hover:scale-105 ${r.reacted ? 'bg-primary/10 border-primary/30 text-primary font-bold shadow-sm' : 'bg-surface border-border hover:bg-surface-hover text-muted hover:text-foreground'}`}
                          aria-label={`React with ${r.type}`}
                        >
                          <span className="flex items-center justify-center shrink-0">
                            {getReactionIcon(r.type, r.reacted)}
                          </span>
                          <span className="font-mono text-[9px]">{r.count}</span>
                        </button>
                      ))}
                    </div>
                    
                    <button
                      onClick={() => setSelectedCommentsPostId(selectedCommentsPostId === post.id ? null : post.id)}
                      className="flex items-center gap-1.5 text-muted hover:text-foreground font-semibold px-3 py-1.5 rounded-lg hover:bg-surface-hover transition-all duration-200 active:scale-95"
                      aria-label={`Toggle comments drawer. Currently has ${post.comments.length} comments.`}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>{post.comments.length}</span>
                    </button>
                  </div>

                  {/* Expand comments list inside card */}
                  {selectedCommentsPostId === post.id && (
                    <div className="mt-3.5 pt-3.5 border-t border-border-subtle/80 space-y-2.5 animate-fadeInFast">
                      {post.comments.map(c => (
                        <div key={c.id} className="text-[11px] bg-surface-hover/20 p-2.5 rounded-xl border border-border-subtle/20 break-words">
                          <span className="font-bold text-foreground font-display">{c.author}:</span>{' '}
                          <span className="text-muted">{c.text}</span>
                        </div>
                      ))}
                      
                      {/* Add mock comment inline */}
                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="text"
                          placeholder="Add mock comment..."
                          value={newCommentText}
                          onChange={e => setNewCommentText(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleAddComment(post.id);
                          }}
                          className="flex-1 text-[11px] bg-surface border border-border rounded-xl px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200"
                          aria-label="Write a simulation comment"
                        />
                        <button
                          disabled={!newCommentText.trim()}
                          onClick={() => handleAddComment(post.id)}
                          className={`text-[11px] font-bold px-3 py-2 rounded-lg transition-all duration-150 ${!newCommentText.trim() ? 'text-muted opacity-50 cursor-not-allowed bg-surface-hover border border-border/20' : 'text-primary bg-primary/10 border border-primary/10 hover:bg-primary/20 active:scale-95'}`}
                        >
                          Post
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ──────────────────────────────────────────────────────── */}
        {/* VIEW C: CHALLENGES VIEW                                  */}
        {/* ──────────────────────────────────────────────────────── */}
        {simTab === 'challenges' && (
          <div className="space-y-4 animate-fadeInFast text-left">
            {/* Profile XP & Equippable Frames */}
            <div className="bg-surface p-4 rounded-2xl shadow-sm">
              <div className="flex justify-between items-baseline mb-2">
                <h4 className="text-xs font-bold text-foreground font-display">Gamified Avatar Frames</h4>
                <span className="text-[9px] font-mono text-muted font-bold">{mockUser.xp} XP Available</span>
              </div>
              <p className="text-[10px] text-muted mb-3 leading-relaxed">
                Succeed in saving duels to unlock avatar custom borders. Tap one to equip:
              </p>
              
              <div className="flex gap-2">
                <button
                  onClick={() => setMockUser(prev => ({ ...prev, equippedFrame: null }))}
                  className={`w-12 h-12 rounded-xl border flex items-center justify-center text-[10px] font-bold active:scale-90 hover:scale-105 transition-all duration-200 ${!mockUser.equippedFrame ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/20 font-extrabold' : 'border-border bg-surface text-muted hover:text-foreground'}`}
                  aria-label="Equip no frame"
                >
                  None
                </button>
                <button
                  onClick={() => {
                    if (mockUser.xp < 500) {
                      triggerNudge('🔒 Fire frame requires 500 XP! Click +XP to earn XP.');
                      return;
                    }
                    setMockUser(prev => ({ ...prev, equippedFrame: 'avatar-frame-fire' }));
                  }}
                  className={`relative w-12 h-12 rounded-xl border flex flex-col items-center justify-center text-[10px] font-bold transition-all duration-200 ${mockUser.xp < 500 ? 'border-border bg-surface/50 border-dashed text-muted/40 cursor-not-allowed' : `avatar-frame-fire text-white active:scale-90 hover:scale-105 ${mockUser.equippedFrame === 'avatar-frame-fire' ? 'ring-2 ring-primary/40 scale-105' : 'opacity-70'}`}`}
                  aria-label="Equip fire frame"
                >
                  {mockUser.xp < 500 && <span className="absolute -top-1 -right-1 text-[8px] bg-background border border-border rounded-full p-0.5 leading-none">🔒</span>}
                  <span>Fire</span>
                  {mockUser.xp < 500 && <span className="text-[7px] font-mono text-muted/50 mt-0.5">500 XP</span>}
                </button>
                <button
                  onClick={() => {
                    if (mockUser.xp < 1000) {
                      triggerNudge('🔒 Diamond frame requires 1000 XP! Click +XP to earn XP.');
                      return;
                    }
                    setMockUser(prev => ({ ...prev, equippedFrame: 'avatar-frame-diamond' }));
                  }}
                  className={`relative w-12 h-12 rounded-xl border flex flex-col items-center justify-center text-[10px] font-bold transition-all duration-200 ${mockUser.xp < 1000 ? 'border-border bg-surface/50 border-dashed text-muted/40 cursor-not-allowed' : `avatar-frame-diamond text-white active:scale-90 hover:scale-105 ${mockUser.equippedFrame === 'avatar-frame-diamond' ? 'ring-2 ring-primary/40 scale-105' : 'opacity-70'}`}`}
                  aria-label="Equip diamond frame"
                >
                  {mockUser.xp < 1000 && <span className="absolute -top-1 -right-1 text-[8px] bg-background border border-border rounded-full p-0.5 leading-none">🔒</span>}
                  <span>Dia</span>
                  {mockUser.xp < 1000 && <span className="text-[7px] font-mono text-muted/50 mt-0.5">1000 XP</span>}
                </button>
                <button
                  onClick={() => {
                    setMockUser(prev => ({ ...prev, xp: prev.xp + 50 }));
                    triggerNudge('Earned +50 XP for simulated activity!');
                    triggerExplosion();
                  }}
                  className="w-12 h-12 rounded-xl border border-streak-muted bg-streak-muted hover:bg-streak/15 active:scale-90 hover:scale-105 text-[10px] font-extrabold text-streak flex items-center justify-center transition-all duration-200"
                  title="Claim Daily Streak XP boost"
                  aria-label="Simulate claiming daily streak XP boost"
                >
                  +XP
                </button>
              </div>
            </div>

            {/* Active Saving Challenges */}
            <div>
              <h4 className="text-xs font-bold text-foreground font-display mb-2">Saving Duels & Challenges</h4>
              
              {mockChallenges.length === 0 ? (
                <div className="py-6 text-center text-muted border border-dashed border-border rounded-2xl">
                  <p className="text-xs">No active challenges. Join daily runs to earn XP!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {mockChallenges.map(ch => (
                    <div key={ch.id} className="bg-surface border border-border/40 p-3.5 rounded-2xl flex justify-between items-start gap-4 shadow-sm hover:scale-[1.01] transition-transform duration-200 ease-out-emil">
                      <div className="min-w-0">
                        <h5 className="text-xs font-bold text-foreground font-display truncate" title={ch.name}>{ch.name}</h5>
                        <p className="text-[10px] text-muted mt-1 leading-relaxed">
                          {ch.status === 'PENDING' ? `Invite from Kevin • ${ch.participantsCount} friends` : `Keep limit under ${formatPHP(ch.limit)}`}
                        </p>
                        <span className="inline-block px-1.5 py-0.5 text-[8px] bg-streak-muted text-streak rounded font-bold mt-2 font-mono">
                          {ch.daysLeft}d left
                        </span>
                      </div>

                      <div className="shrink-0">
                        {ch.status === 'PENDING' ? (
                          <button
                            onClick={() => {
                              setMockChallenges(prev =>
                                prev.map(c => (c.id === ch.id ? { ...c, status: 'ACTIVE' } : c))
                              );
                              setMockUser(prev => ({ ...prev, streak: prev.streak + 1 }));
                              triggerNudge(`Joined ${ch.name}! Streak updated.`);
                              triggerExplosion();
                            }}
                            className="px-3.5 py-2 text-[10px] font-bold bg-primary hover:bg-primary-hover text-white rounded-lg active:scale-95 hover:scale-105 transition-all duration-200 shadow-sm"
                            aria-label={`Accept duel: ${ch.name}`}
                          >
                            Accept
                          </button>
                        ) : (
                          <span className="px-2.5 py-1 text-[9px] font-bold text-success bg-success/8 border border-success/15 rounded-lg font-display">
                            Joined
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Floating "+" button triggers Modal */}
      <button
        onClick={() => {
          setFormError(null);
          setShowTransactionModal(true);
        }}
        className="absolute bottom-16 right-4 w-12 h-12 bg-primary text-white rounded-full flex items-center justify-center shadow-lg hover:bg-primary-hover hover:scale-110 active:scale-95 transition-all duration-200 ease-out-expo z-40 group hover:shadow-xl"
        title="Add Simulation Transaction"
        aria-label="Add Simulation Transaction"
      >
        <Plus className="w-6 h-6 transition-transform duration-350 group-hover:rotate-90" />
      </button>

      {/* Simulator Bottom Tab Bar */}
      <nav className="h-14 bg-surface border-t border-border flex items-center justify-around shrink-0 select-none z-30">
        <button
          onClick={() => setSimTab('dashboard')}
          className={`flex flex-col items-center justify-center w-20 h-full gap-0.5 text-[9px] font-bold transition-all duration-200 active:scale-95 ${simTab === 'dashboard' ? 'text-primary font-black' : 'text-muted hover:text-foreground'}`}
          aria-label="Dashboard tab"
        >
          <div className={`transition-all duration-300 ${simTab === 'dashboard' ? 'scale-110 -translate-y-0.5' : 'scale-100 opacity-85'}`}>
            <LayoutDashboard className="w-4.5 h-4.5" />
          </div>
          <span className="font-display">Dashboard</span>
        </button>
        
        <button
          onClick={() => setSimTab('feed')}
          className={`flex flex-col items-center justify-center w-20 h-full gap-0.5 text-[9px] font-bold transition-all duration-200 active:scale-95 ${simTab === 'feed' ? 'text-primary font-black' : 'text-muted hover:text-foreground'}`}
          aria-label="Feed tab"
        >
          <div className={`transition-all duration-300 ${simTab === 'feed' ? 'scale-110 -translate-y-0.5' : 'scale-100 opacity-85'}`}>
            <Activity className="w-4.5 h-4.5" />
          </div>
          <span className="font-display">Feed</span>
        </button>
        
        <button
          onClick={() => setSimTab('challenges')}
          className={`flex flex-col items-center justify-center w-20 h-full gap-0.5 text-[9px] font-bold transition-all duration-200 active:scale-95 ${simTab === 'challenges' ? 'text-primary font-black' : 'text-muted hover:text-foreground'}`}
          aria-label="Challenges tab"
        >
          <div className={`transition-all duration-300 ${simTab === 'challenges' ? 'scale-110 -translate-y-0.5' : 'scale-100 opacity-85'}`}>
            <Trophy className="w-4.5 h-4.5" />
          </div>
          <span className="font-display">Challenges</span>
        </button>
      </nav>

      {/* Phone Bottom Home Indicator */}
      <div className="h-4 bg-surface flex justify-center items-center shrink-0 z-30 border-t border-border/10">
        <div className="w-24 h-1 bg-border rounded-full" />
      </div>

      {/* MOCK TRANSACTION FORM MODAL */}
      {showTransactionModal && (
        <div className="absolute inset-0 bg-black/70 z-[95] flex flex-col justify-end">
          {/* Modal Content container */}
          <form 
            onSubmit={handleAddMockTransaction}
            className="bg-surface rounded-t-3xl border-t border-border p-5 text-left space-y-4 animate-slideUpIn select-none"
          >
            <div className="flex justify-between items-center">
              <h4 className="text-sm font-extrabold text-foreground font-display">Log Mock Transaction</h4>
              <button
                type="button"
                onClick={() => {
                  setFormError(null);
                  setShowTransactionModal(false);
                }}
                className="text-xs text-muted hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-surface-hover active:scale-95 transition-all duration-150"
              >
                Cancel
              </button>
            </div>

            {/* Transaction Type Segment */}
            <div className="flex bg-surface-hover p-1 rounded-xl border border-border/50">
              <button
                type="button"
                onClick={() => {
                  setTxType('EXPENSE');
                  setFormError(null);
                }}
                className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg active:scale-95 transition-all duration-200 ${txType === 'EXPENSE' ? 'bg-surface text-foreground shadow-sm font-black' : 'text-muted hover:text-foreground'}`}
              >
                Split Expense
              </button>
              <button
                type="button"
                onClick={() => {
                  setTxType('SETTLEMENT');
                  setFormError(null);
                }}
                className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg active:scale-95 transition-all duration-200 ${txType === 'SETTLEMENT' ? 'bg-surface text-foreground shadow-sm font-black' : 'text-muted hover:text-foreground'}`}
              >
                Settle Debt
              </button>
            </div>

            {/* Input fields */}
            <div className="space-y-3.5 text-xs">
              <div className="animate-fadeInUp" style={{ animationDelay: '30ms' }}>
                <label className="block text-muted font-bold mb-1.5 uppercase tracking-wider text-[9px] font-display" htmlFor="sim-amount">Amount in PHP</label>
                <input
                  id="sim-amount"
                  type="number"
                  required
                  placeholder="₱ 0.00"
                  value={txAmount}
                  onChange={e => {
                    setTxAmount(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-foreground font-semibold font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200"
                />
                {formError && (
                  <p className="text-[10px] text-error font-semibold mt-1.5 animate-fadeInFast">{formError}</p>
                )}
              </div>

              {txType === 'EXPENSE' ? (
                <div className="animate-fadeInUp" style={{ animationDelay: '60ms' }}>
                  <label className="block text-muted font-bold mb-1.5 uppercase tracking-wider text-[9px] font-display" htmlFor="sim-cat">Budget Category</label>
                  <select
                    id="sim-cat"
                    value={txCategory}
                    onChange={e => setTxCategory(e.target.value)}
                    className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-foreground font-semibold cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200"
                  >
                    {mockCategories.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({formatPHP(c.limit - c.spent)} remaining)</option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2 animate-fadeInUp" style={{ animationDelay: '90ms' }}>
                <div>
                  <label className="block text-muted font-bold mb-1.5 uppercase tracking-wider text-[9px] font-display" htmlFor="sim-friend">Select Friend</label>
                  <select
                    id="sim-friend"
                    value={txFriend}
                    onChange={e => setTxFriend(e.target.value)}
                    className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-foreground font-semibold cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200"
                  >
                    {mockFriends.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col justify-end pl-1">
                  <span className="text-[10px] text-muted leading-tight mb-2 select-none font-medium">
                    {txType === 'EXPENSE' ? 'Split 50/50 with friend' : 'Repay your balance'}
                  </span>
                </div>
              </div>

              <div className="animate-fadeInUp" style={{ animationDelay: '120ms' }}>
                <label className="block text-muted font-bold mb-1.5 uppercase tracking-wider text-[9px] font-display" htmlFor="sim-message">Memo / Message (Optional)</label>
                <input
                  id="sim-message"
                  type="text"
                  placeholder="e.g. Starbucks Treat, Gas split..."
                  value={txMessage}
                  onChange={e => setTxMessage(e.target.value)}
                  className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200"
                />
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="w-full py-3 text-xs font-bold bg-primary hover:bg-primary-hover text-white rounded-lg shadow-md active:scale-98 transition-all duration-150 cursor-pointer"
            >
              Submit Simulated Log
            </button>
          </form>
        </div>
      )}

    </div>
  );
}
