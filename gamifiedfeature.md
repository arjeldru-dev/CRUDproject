# Feature Spec: Gamified Challenges & Rewards System

## Overview
- **Feature:** Streaks, badges, group challenges, virtual rewards (avatar frames), and leaderboards for the Hybrid Ledger budget app
- **Complexity:** Large (20+ files, 3–5 days across 6 phases)
- **Estimated scope:** ~25 files to create/modify
- **Related features:** Budget tracking (categories, BUDGET_DEDUCTION), Feed system (FeedPost), Notifications, Friends/Friendships, Public Profile, Dashboard

## Problem & Motivation
Users lose motivation to track budgets after the initial novelty fades. By adding gamified elements—streaks, badges, group challenges with friends, and social leaderboards—we transform budget tracking from a solitary chore into a fun, social experience. Under-budget streaks create daily accountability; badges provide collectible milestones; group challenges (e.g., "No overspend week") add social pressure among roommates; and avatar frame rewards make financial discipline visible on profiles.

## User Stories
- **As a user**, I want to see my current under-budget streak on the Dashboard so I stay motivated.
- **As a user**, I want to earn badges for financial milestones (e.g., 7-day streak, first settlement) so my discipline is recognized.
- **As a user**, I want to challenge my friends to a "No overspend week" so we hold each other accountable.
- **As a user**, I want to unlock avatar frames by earning points so my profile stands out.
- **As a user**, I want to see a leaderboard of my friends' streaks/points for healthy competition.
- **As a user**, I want badge-earned and challenge-completed events to appear in my Feed so friends see my progress.

---

## Phase Implementation Plan

> Each phase is independently deployable and testable. Complete one phase fully before starting the next.

---

## PHASE 1 — Data Foundation & Gamification Schema

**Goal:** Add all new Prisma models, enums, and relations. Run migration. No controller/UI changes yet.

### Detailed Requirements

#### Prisma Schema Additions (`backend/prisma/schema.prisma`)

**New Enums:**
```prisma
enum ChallengeStatus {
  ACTIVE
  COMPLETED
  CANCELLED
}

enum ChallengeType {
  NO_OVERSPEND_WEEK
  NO_OVERSPEND_MONTH
  COFFEE_FREE_WEEK
  TRANSPORT_SAVER
  CUSTOM
}

enum BadgeRarity {
  COMMON
  UNCOMMON
  RARE
  EPIC
  LEGENDARY
}
```

**Update existing `NotificationType` enum — add:**
```prisma
CHALLENGE_INVITE
BADGE_UNLOCKED
STREAK_MILESTONE
CHALLENGE_COMPLETED
```

**Update existing `FeedPostType` enum — add:**
```prisma
CHALLENGE_COMPLETED
BADGE_EARNED
STREAK_MILESTONE
```

**New Model: `UserGamification`** (1:1 with User)
```typescript
interface UserGamification {
  id: string;           // UUID
  userId: string;       // FK → User, @unique
  currentStreak: number; // default 0 — consecutive days all categories under budget
  longestStreak: number; // default 0
  lastStreakDate: Date | null; // last date streak was validated
  totalPoints: number;  // default 0 — accumulated from badges, streaks, challenges
  activeFrameId: string | null; // FK → AvatarFrame
}
```

**New Model: `Badge`** (system-seeded, read-only for users)
```typescript
interface Badge {
  id: string;
  slug: string;          // unique, e.g. "streak_7", "first_settle"
  name: string;          // "Week Warrior"
  description: string;   // "Maintain a 7-day under-budget streak"
  iconUrl: string;       // emoji or icon path, e.g. "🔥" or "/badges/streak7.svg"
  rarity: BadgeRarity;
  pointsAwarded: number; // points granted on unlock
  requirement: string;   // JSON — machine-readable unlock criteria
}
```

**New Model: `UserBadge`** (many-to-many pivot)
```typescript
interface UserBadge {
  id: string;
  userId: string;      // FK → User
  badgeId: string;     // FK → Badge
  unlockedAt: Date;
  // @@unique([userId, badgeId])
}
```

**New Model: `AvatarFrame`** (system-seeded)
```typescript
interface AvatarFrame {
  id: string;
  slug: string;         // unique, e.g. "gold_ring", "fire_border"
  name: string;         // "Golden Saver"
  cssClass: string;     // CSS class or gradient definition for the ring
  pointsRequired: number; // minimum totalPoints to unlock
  sortOrder: number;
}
```

**New Model: `Challenge`**
```typescript
interface Challenge {
  id: string;
  creatorId: string;       // FK → User
  type: ChallengeType;
  name: string;            // display name, e.g. "No Overspend Week"
  description: string;
  categoryId: string | null; // FK → Category (optional — scope to one budget category)
  startDate: Date;
  endDate: Date;
  status: ChallengeStatus; // default ACTIVE
  createdAt: Date;
}
```

**New Model: `ChallengeParticipant`**
```typescript
interface ChallengeParticipant {
  id: string;
  challengeId: string;   // FK → Challenge
  userId: string;         // FK → User
  accepted: boolean;      // default false — becomes true when user joins
  failedAt: Date | null;  // set when user overspends during challenge
  completedAt: Date | null;
  joinedAt: Date;
  // @@unique([challengeId, userId])
}
```

**Update `User` model — add relations:**
```prisma
gamification     UserGamification?
badges           UserBadge[]
challengesCreated Challenge[]
challengeParticipations ChallengeParticipant[]
```

### Files to CREATE
| File Path | Purpose |
|---|---|
| (none — schema changes only) | |

### Files to MODIFY
| File Path | What Changes |
|---|---|
| `backend/prisma/schema.prisma` | Add 6 new models, 3 new enums, extend 2 existing enums, add 4 relations to User |

### Acceptance Criteria — Phase 1
- [ ] `npx prisma migrate dev --name add_gamification_models` succeeds with zero errors
- [ ] `npx prisma generate` completes; all new types available in `@prisma/client`
- [ ] Existing tests/endpoints are unaffected (no breaking changes)

---

## PHASE 2 — Gamification Engine (Backend Service + Seed Data)

**Goal:** Create the core gamification service that computes streaks, awards badges, and manages points. Seed the Badge and AvatarFrame tables. Hook into transaction creation.

### 2A — Badge & Frame Seed Data

**File:** `backend/prisma/seed-gamification.ts`

Seed the following badges:

| slug | name | description | rarity | points | requirement (JSON) |
|---|---|---|---|---|---|
| `first_expense` | First Step | Log your first expense | COMMON | 10 | `{"type":"expense_count","value":1}` |
| `first_settle` | Peacemaker | Complete your first settlement | COMMON | 10 | `{"type":"settlement_count","value":1}` |
| `streak_3` | Warming Up | 3-day under-budget streak | COMMON | 25 | `{"type":"streak","value":3}` |
| `streak_7` | Week Warrior | 7-day under-budget streak | UNCOMMON | 50 | `{"type":"streak","value":7}` |
| `streak_14` | Fortnight Force | 14-day under-budget streak | RARE | 100 | `{"type":"streak","value":14}` |
| `streak_30` | Monthly Master | 30-day under-budget streak | EPIC | 250 | `{"type":"streak","value":30}` |
| `budget_under_50` | Half Saver | End a month using less than 50% of any budget | UNCOMMON | 50 | `{"type":"budget_pct_under","value":50}` |
| `challenge_complete` | Team Player | Complete your first group challenge | UNCOMMON | 75 | `{"type":"challenge_complete_count","value":1}` |
| `challenge_3` | Challenge Champ | Complete 3 group challenges | RARE | 150 | `{"type":"challenge_complete_count","value":3}` |
| `social_butterfly` | Social Butterfly | Have 5 or more friends | COMMON | 25 | `{"type":"friend_count","value":5}` |
| `top_up_master` | Top-Up Pro | Add funds to your budget 5 times | UNCOMMON | 40 | `{"type":"topup_count","value":5}` |
| `streak_100` | Legendary Saver | 100-day under-budget streak | LEGENDARY | 500 | `{"type":"streak","value":100}` |

Seed avatar frames:

| slug | name | cssClass | pointsRequired | sortOrder |
|---|---|---|---|---|
| `default` | Default | (empty) | 0 | 0 |
| `bronze_ring` | Bronze Saver | `ring-2 ring-amber-600` | 50 | 1 |
| `silver_ring` | Silver Saver | `ring-2 ring-gray-400` | 150 | 2 |
| `gold_ring` | Gold Saver | `ring-2 ring-yellow-400` | 300 | 3 |
| `emerald_glow` | Emerald Elite | `ring-2 ring-emerald-400 shadow-emerald-400/40 shadow-lg` | 500 | 4 |
| `fire_border` | On Fire | `ring-2 ring-orange-500 animate-pulse` | 750 | 5 |
| `diamond_ring` | Diamond Legend | `ring-3 ring-primary shadow-primary/30 shadow-xl` | 1000 | 6 |

### 2B — Gamification Service

**File:** `backend/src/services/gamificationService.ts`

Core functions:

```typescript
// Ensure UserGamification row exists (upsert on first access)
ensureGamificationProfile(userId: string): Promise<UserGamification>

// Called after every expense/settlement/topup — checks all badge conditions
evaluateAndAwardBadges(userId: string): Promise<UserBadge[]>

// Called daily (or after each transaction) — checks if ALL categories are under budget today
updateStreak(userId: string): Promise<{ currentStreak: number; newMilestone: boolean }>

// Add points and check if new avatar frames are unlocked
addPoints(userId: string, points: number): Promise<void>

// Get user's gamification profile with badges and available frames
getGamificationProfile(userId: string): Promise<GamificationProfileDTO>

// Get leaderboard among user's friends
getLeaderboard(userId: string): Promise<LeaderboardEntry[]>
```

**Streak Logic (critical):**
1. After each expense transaction, check: are ALL of the user's budget categories still under their `monthlyLimit` for the current month?
2. If YES and `lastStreakDate` is yesterday → increment `currentStreak`, update `lastStreakDate` to today.
3. If YES and `lastStreakDate` is today → no change (already counted today).
4. If YES and `lastStreakDate` is null or older than yesterday → set `currentStreak = 1`, update `lastStreakDate`.
5. If NO (any category over budget) → set `currentStreak = 0`, clear `lastStreakDate`.
6. After updating, if `currentStreak > longestStreak` → update `longestStreak`.
7. Check if streak value matches any streak badge threshold → award badge if not already held.

**Badge Evaluation Logic:**
- On every transaction, run through badge definitions:
  - Count-based badges: query counts from DB (`transaction.count`, `friendship.count`, etc.)
  - Streak badges: check `currentStreak` value
  - Budget percentage badges: check at month-end
- For each unearned badge where condition is met → create `UserBadge`, add points, create notification, create feed post.

### 2C — Hook Into Transaction Controller

**File:** `backend/src/controllers/transactionController.ts`

After the feed/notification calls in `createExpenseTransaction`, `createSettlement`, and `createTopUp`:

```typescript
// Fire-and-forget gamification evaluation
gamificationService.updateStreak(userId).catch(console.error);
gamificationService.evaluateAndAwardBadges(userId).catch(console.error);
```

### Files to CREATE — Phase 2
| File Path | Purpose |
|---|---|
| `backend/prisma/seed-gamification.ts` | Seed badges and avatar frames |
| `backend/src/services/gamificationService.ts` | Core streak/badge/points engine |

### Files to MODIFY — Phase 2
| File Path | What Changes |
|---|---|
| `backend/src/controllers/transactionController.ts` | Import gamificationService; add calls after expense/settlement/topup creation (3 insertion points at lines ~326, ~557, ~813) |
| `backend/package.json` | Add seed script entry for gamification seeding |

### Acceptance Criteria — Phase 2
- [ ] **GIVEN** a new user logs their first expense, **WHEN** the transaction completes, **THEN** `UserGamification` row is created with `currentStreak >= 0` and `first_expense` badge is awarded
- [ ] **GIVEN** a user with all categories under budget, **WHEN** they log an expense and all categories remain under limit, **THEN** `currentStreak` increments by 1 if `lastStreakDate` was yesterday
- [ ] **GIVEN** a user exceeds any category budget, **WHEN** streak is evaluated, **THEN** `currentStreak` resets to 0
- [ ] **GIVEN** a user earns a badge, **THEN** their `totalPoints` increases by the badge's `pointsAwarded` value
- [ ] Seed script creates 12 badges and 7 avatar frames without errors
- [ ] All existing tests still pass

---

## PHASE 3 — Gamification API Endpoints

**Goal:** Expose gamification data via REST endpoints. Create routes and controller. No frontend yet.

### 3A — Controller

**File:** `backend/src/controllers/gamificationController.ts`

#### Endpoint 1: `GET /api/gamification/profile`
Returns the authenticated user's gamification data.

**Response (200):**
```typescript
{
  profile: {
    currentStreak: number;
    longestStreak: number;
    totalPoints: number;
    lastStreakDate: string | null;
    activeFrame: { id: string; slug: string; name: string; cssClass: string } | null;
  };
  badges: Array<{
    id: string;
    slug: string;
    name: string;
    description: string;
    iconUrl: string;
    rarity: string;
    unlockedAt: string;
  }>;
  allBadges: Array<{
    id: string;
    slug: string;
    name: string;
    description: string;
    iconUrl: string;
    rarity: string;
    pointsAwarded: number;
    unlocked: boolean;
    unlockedAt: string | null;
  }>;
  availableFrames: Array<{
    id: string;
    slug: string;
    name: string;
    cssClass: string;
    pointsRequired: number;
    unlocked: boolean;
    isActive: boolean;
  }>;
}
```

**States:**
| State | Trigger | Behavior |
|---|---|---|
| No gamification row | First-time access | Auto-create via `ensureGamificationProfile`, return defaults (0 streak, 0 points, no badges) |
| Normal | User has data | Return full profile |
| Unauthorized | No/invalid token | 401 |

#### Endpoint 2: `PUT /api/gamification/frame`
Sets the user's active avatar frame.

**Request body:** `{ frameId: string }`
**Validation:** Frame must exist. User's `totalPoints` must be >= frame's `pointsRequired`.
**Response (200):** `{ activeFrame: { id, slug, name, cssClass } }`
**Response (400):** `{ error: "Not enough points to unlock this frame" }`
**Response (404):** `{ error: "Frame not found" }`

#### Endpoint 3: `GET /api/gamification/leaderboard`
Returns a ranked list of the user's friends sorted by `totalPoints` desc, then `longestStreak` desc.

**Response (200):**
```typescript
{
  leaderboard: Array<{
    rank: number;
    userId: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    activeFrame: { cssClass: string } | null;
    totalPoints: number;
    currentStreak: number;
    longestStreak: number;
    badgeCount: number;
    isCurrentUser: boolean;
  }>;
  currentUserRank: number;
}
```

**Logic:**
1. Get all friendship IDs for the user (from `Friendship` table, both `userAId` and `userBId` directions).
2. Query `UserGamification` for those user IDs + the current user.
3. Sort by `totalPoints` desc, `longestStreak` desc as tiebreaker.
4. Assign rank numbers (1-indexed, dense ranking).
5. Include `badgeCount` via `_count` on `UserBadge`.

#### Endpoint 4: `POST /api/gamification/challenges`
Creates a new group challenge and invites friends.

**Request body:**
```typescript
{
  type: ChallengeType;     // e.g. "NO_OVERSPEND_WEEK"
  name?: string;           // override default name
  description?: string;
  categoryId?: string;     // optional — scope to one category
  startDate: string;       // ISO 8601
  endDate: string;         // ISO 8601
  invitedUserIds: string[]; // friend user IDs to invite
}
```

**Validation:**
- `startDate` must be today or future.
- `endDate` must be after `startDate`.
- `endDate - startDate` must be ≤ 31 days.
- `invitedUserIds` must all be friends of the user.
- Max 10 invitees per challenge.
- User cannot have more than 5 active challenges simultaneously.

**Response (201):**
```typescript
{
  challenge: { id, type, name, description, startDate, endDate, status };
  participants: Array<{ userId, accepted, joinedAt }>;
}
```

**Side effects:**
- Creator is auto-added as participant with `accepted: true`.
- Each invited friend receives a `CHALLENGE_INVITE` notification.

#### Endpoint 5: `POST /api/gamification/challenges/:id/join`
Accept a challenge invitation.

**Validation:** Challenge must be `ACTIVE`. User must be in `ChallengeParticipant` with `accepted: false`. Challenge `startDate` must not have passed by more than 1 day (grace period).
**Response (200):** `{ participant: { userId, accepted: true, joinedAt } }`

#### Endpoint 6: `GET /api/gamification/challenges`
List user's challenges (active + recent completed).

**Query params:** `?status=ACTIVE|COMPLETED|ALL` (default: `ALL`)
**Response (200):**
```typescript
{
  challenges: Array<{
    id: string;
    type: ChallengeType;
    name: string;
    description: string;
    startDate: string;
    endDate: string;
    status: ChallengeStatus;
    participantCount: number;
    participants: Array<{
      userId: string;
      username: string | null;
      displayName: string | null;
      avatarUrl: string | null;
      accepted: boolean;
      failedAt: string | null;
      completedAt: string | null;
    }>;
    isCreator: boolean;
    myStatus: "pending" | "active" | "failed" | "completed";
    daysRemaining: number;
  }>;
}
```

#### Endpoint 7: `DELETE /api/gamification/challenges/:id`
Cancel a challenge (creator only, while `ACTIVE`).
**Response (200):** `{ message: "Challenge cancelled" }`

### 3B — Routes

**File:** `backend/src/routes/gamificationRoutes.ts`
```typescript
router.use(requireAuth);

router.get('/profile', getGamificationProfile);
router.put('/frame', setActiveFrame);
router.get('/leaderboard', getLeaderboard);
router.get('/challenges', getChallenges);
router.post('/challenges', createChallenge);
router.post('/challenges/:id/join', joinChallenge);
router.delete('/challenges/:id', cancelChallenge);
```

### 3C — Server Registration

**File:** `backend/src/server.ts`
Add: `import gamificationRoutes from './routes/gamificationRoutes';`
Add: `app.use('/api/gamification', gamificationRoutes);`

### 3D — Challenge Evaluation Hook

The challenge system needs to check if a participant overspent during an active challenge. This happens inside `gamificationService.evaluateChallenges(userId)`, called after each expense:

1. Find all `ACTIVE` challenges where user is a participant with `accepted: true` and `failedAt: null`.
2. For each challenge:
   - If `categoryId` is set: check only that category's budget status.
   - If `categoryId` is null: check ALL categories.
   - If any relevant category is over budget → set `failedAt = now()`.
3. When `endDate` passes for a challenge:
   - All participants with `failedAt: null` get `completedAt = endDate`.
   - Award `challenge_complete` badge if threshold met.
   - Create feed post and notification.
   - Set challenge `status = COMPLETED`.

> **Decision:** Challenge completion evaluation runs lazily — triggered by any participant's transaction, or when any user fetches the challenges list. A cron job is NOT required for V1.

### Files to CREATE — Phase 3
| File Path | Purpose |
|---|---|
| `backend/src/controllers/gamificationController.ts` | 7 endpoint handlers |
| `backend/src/routes/gamificationRoutes.ts` | Route wiring with auth middleware |

### Files to MODIFY — Phase 3
| File Path | What Changes |
|---|---|
| `backend/src/server.ts` | Import and mount gamification routes at `/api/gamification` |
| `backend/src/services/gamificationService.ts` | Add `evaluateChallenges()` function |

### Acceptance Criteria — Phase 3
- [ ] **GIVEN** authenticated user, **WHEN** `GET /api/gamification/profile`, **THEN** returns profile with streak, points, badges list
- [ ] **GIVEN** user with 100 points, **WHEN** `PUT /api/gamification/frame` with a 50-point frame, **THEN** frame is set
- [ ] **GIVEN** user with 10 points, **WHEN** `PUT /api/gamification/frame` with a 50-point frame, **THEN** 400 error
- [ ] **GIVEN** user with 3 friends, **WHEN** `GET /api/gamification/leaderboard`, **THEN** returns ranked list of 4 entries (3 friends + self)
- [ ] **GIVEN** user creates challenge with 2 invited friends, **THEN** challenge is created, 2 notifications sent, creator auto-accepted
- [ ] **GIVEN** user exceeds budget during active challenge, **THEN** `failedAt` is set for that participant
- [ ] **GIVEN** challenge end date passes and user never exceeded budget, **WHEN** challenges list is fetched, **THEN** challenge is marked COMPLETED and user gets `completedAt`

---

## PHASE 4 — Dashboard Gamification Widgets (Frontend)

**Goal:** Add streak widget, badge showcase preview, and active challenge callout to the Dashboard page. Create the Zustand store.

### 4A — Gamification Store

**File:** `frontend/src/store/gamificationStore.ts`

Following the existing Zustand pattern from `feedStore.ts`:

```typescript
interface GamificationState {
  profile: GamificationProfile | null;
  badges: Badge[];
  allBadges: BadgeWithStatus[];
  availableFrames: FrameWithStatus[];
  leaderboard: LeaderboardEntry[];
  challenges: ChallengeWithDetails[];
  isLoading: boolean;
  error: string | null;

  fetchProfile: () => Promise<void>;
  fetchLeaderboard: () => Promise<void>;
  fetchChallenges: (status?: string) => Promise<void>;
  setActiveFrame: (frameId: string) => Promise<boolean>;
  createChallenge: (data: CreateChallengeDTO) => Promise<boolean>;
  joinChallenge: (challengeId: string) => Promise<boolean>;
  cancelChallenge: (challengeId: string) => Promise<boolean>;
}
```

### 4B — Streak Widget Component

**File:** `frontend/src/components/gamification/StreakWidget.tsx`

A compact card for the Dashboard showing:
- 🔥 flame icon (animated pulse when streak > 0)
- Current streak number (large, bold)
- "day streak" label
- Longest streak as small muted text below
- Points total with a ⭐ icon

**States:**
| State | What the user sees |
|---|---|
| Loading | Skeleton pulse (flame placeholder + number placeholder) |
| Zero streak | Dimmed flame, "0 day streak", motivational text: "Log an expense under budget to start!" |
| Active streak (1-6) | Orange flame, streak count, "Keep going!" |
| Active streak (7+) | Animated flame with glow, streak count, "You're on fire! 🔥" |

**Design:** Use `container-card` with `hover:border-secondary/30`. Flame icon uses `text-secondary` (the warm accent). Follow the existing card patterns from Dashboard.tsx summary grid.

### 4C — Active Challenge Callout

**File:** `frontend/src/components/gamification/ActiveChallengeCard.tsx`

Shows the user's most urgent active challenge (earliest `endDate`):
- Challenge name and type icon
- Progress bar showing days elapsed / total days
- Participant avatars (max 4 shown, "+N" overflow)
- Status text: "Day 3 of 7 — Stay under budget!"
- If user has `failedAt`: show muted state with "Challenge failed" text

**States:**
| State | What the user sees |
|---|---|
| No active challenges | Component returns `null` (not rendered) |
| Active challenge, on track | Green-tinted progress bar, encouraging text |
| Active challenge, failed | Red-tinted card, "You went over budget on [date]" |
| Challenge ending today | Amber/warning border, "Final day — finish strong!" |

### 4D — Dashboard Integration

**File:** `frontend/src/pages/Dashboard.tsx`

Insert two new sections after the AI Spending Forecasting section and before the two-column layout:

```tsx
{/* ── Gamification Streak & Challenge ──────────────────────── */}
<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
  <StreakWidget />
  <ActiveChallengeCard />
</div>
```

The Dashboard already imports from `useAuthStore` and `useUiStore`; add `useGamificationStore` and call `fetchProfile()` + `fetchChallenges('ACTIVE')` inside the existing `fetchDashboardData` callback.

### 4E — Avatar Frame Integration

**File:** `frontend/src/components/ui/Avatar.tsx`

Add an optional `frameClass` prop to Avatar:

```typescript
interface AvatarProps {
  // ... existing props
  frameClass?: string; // CSS classes for avatar frame ring (from AvatarFrame.cssClass)
}
```

When `frameClass` is provided, wrap the avatar in an additional `div` with the frame classes applied. This is a non-breaking change — existing usages without `frameClass` behave identically.

### Files to CREATE — Phase 4
| File Path | Purpose |
|---|---|
| `frontend/src/store/gamificationStore.ts` | Zustand store for gamification state |
| `frontend/src/components/gamification/StreakWidget.tsx` | Streak display card |
| `frontend/src/components/gamification/ActiveChallengeCard.tsx` | Active challenge callout |

### Files to MODIFY — Phase 4
| File Path | What Changes |
|---|---|
| `frontend/src/pages/Dashboard.tsx` | Import gamification store + 2 new components; add grid section after forecasting |
| `frontend/src/components/ui/Avatar.tsx` | Add optional `frameClass` prop for avatar frame rings |

### Files NOT to Change — Phase 4
| File Path | Why |
|---|---|
| `frontend/src/components/TransactionForm.tsx` | Transaction form is complex (37KB); gamification hooks are backend-side only |
| `frontend/src/store/feedStore.ts` | Feed store will be updated in Phase 6, not now |

### Acceptance Criteria — Phase 4
- [ ] **GIVEN** user opens Dashboard, **WHEN** gamification data loads, **THEN** StreakWidget shows current streak and points
- [ ] **GIVEN** user has an active challenge, **WHEN** Dashboard loads, **THEN** ActiveChallengeCard shows challenge name, progress bar, and participant avatars
- [ ] **GIVEN** user has no active challenges, **WHEN** Dashboard loads, **THEN** no challenge card is rendered (no empty state)
- [ ] **GIVEN** user has an avatar frame set, **WHEN** Avatar is rendered with `frameClass`, **THEN** a colored ring appears around the avatar
- [ ] StreakWidget has loading skeleton that matches existing Dashboard skeleton patterns
- [ ] All components use existing design tokens (container-card, text-foreground, text-muted, etc.)

---

## PHASE 5 — Challenges Page & Badge Showcase (Frontend)

**Goal:** Create the full-page Challenges experience and the Badge Showcase component. Add navigation entry.

### 5A — Challenges Page

**File:** `frontend/src/pages/Challenges.tsx`

A full page with three tabs/sections:

**Tab 1 — Active Challenges**
- List of cards for each active challenge the user is participating in
- Each card shows: challenge name, type icon, date range, progress bar (days elapsed / total), participant avatars with status indicators (✅ on track, ❌ failed, ⏳ pending), user's own status
- "Challenge Friends" button (opens create challenge modal)

**Tab 2 — Past Challenges**
- Completed/cancelled challenges in reverse chronological order
- Each card shows: name, date range, final status, who completed vs who failed
- Dimmed styling with `text-muted` for inactive feel

**Tab 3 — Badge Showcase**
- Grid of ALL badges (locked + unlocked)
- Unlocked badges: full color with unlock date, rarity glow border
- Locked badges: grayscale with lock icon overlay, requirement text
- Rarity colors: COMMON → `border-border`, UNCOMMON → `border-success/40`, RARE → `border-primary/40`, EPIC → `border-secondary/40`, LEGENDARY → `border-warning/40 animate-pulse`
- Points display at top: "⭐ 275 points"

**States for the full page:**
| State | What the user sees |
|---|---|
| Loading | Skeleton cards matching the active tab layout |
| Empty (no challenges) | Illustration-free empty state: "No challenges yet. Challenge your friends to stay under budget!" with CTA button |
| Empty (no badges) | "Start tracking expenses to earn your first badge!" |
| Error | Error banner with retry (matching `ProfileSettings.tsx` error pattern) |

### 5B — Create Challenge Modal

**File:** `frontend/src/components/gamification/CreateChallengeModal.tsx`

A modal/drawer (matching the `TransactionForm` overlay pattern) with:
- Challenge type selector (dropdown or card grid of predefined types)
- Optional category scope (dropdown from user's categories)
- Date range picker (start + end, max 31 days)
- Friend selector (multi-select from friends list, max 10)
- Name override (optional text input)
- Submit button → calls `POST /api/gamification/challenges`

**Validation (client-side mirrors server):**
- Start date ≥ today
- End date > start date, ≤ 31 days apart
- At least 1 friend invited
- Max 10 friends

### 5C — Avatar Frame Picker

**File:** `frontend/src/components/gamification/FramePicker.tsx`

A section within the Badge Showcase tab (or accessible from Profile Settings):
- Grid of all avatar frames
- Locked frames: grayscale with "🔒 Need X points" label
- Unlocked frames: full color with preview of user's avatar inside the frame
- Active frame has a checkmark overlay
- Clicking an unlocked frame → calls `PUT /api/gamification/frame`

### 5D — Navigation Integration

**File:** `frontend/src/components/layout/DashboardLayout.tsx`

Add to the `navItems` array (after "Transactions"):
```typescript
{ to: '/challenges', label: 'Challenges', icon: Trophy }
```
Import `Trophy` from `lucide-react`.

**File:** `frontend/src/App.tsx`

Add route inside the `DashboardLayout` group:
```tsx
<Route path="/challenges" element={<Challenges />} />
```
Import the `Challenges` page component.

### Files to CREATE — Phase 5
| File Path | Purpose |
|---|---|
| `frontend/src/pages/Challenges.tsx` | Full challenges page with 3 tabs |
| `frontend/src/components/gamification/CreateChallengeModal.tsx` | Challenge creation modal |
| `frontend/src/components/gamification/FramePicker.tsx` | Avatar frame selection grid |

### Files to MODIFY — Phase 5
| File Path | What Changes |
|---|---|
| `frontend/src/components/layout/DashboardLayout.tsx` | Add "Challenges" to `navItems` array (line ~18), import `Trophy` icon |
| `frontend/src/App.tsx` | Add `/challenges` route, import `Challenges` page |

### Acceptance Criteria — Phase 5
- [ ] **GIVEN** user navigates to `/challenges`, **THEN** page loads with Active, Past, and Badges tabs
- [ ] **GIVEN** user clicks "Challenge Friends", **THEN** modal opens with type selector, date picker, and friend multi-select
- [ ] **GIVEN** user creates a challenge with valid inputs, **THEN** challenge appears in Active tab and friends receive notifications
- [ ] **GIVEN** user has 3 unlocked badges and 9 locked, **THEN** Badge Showcase shows all 12 with correct locked/unlocked styling
- [ ] **GIVEN** user clicks an unlocked avatar frame, **THEN** frame is set and avatar updates across the app
- [ ] **GIVEN** user clicks a locked frame, **THEN** tooltip shows "Need X more points"
- [ ] "Challenges" nav item appears in top bar and mobile bottom nav
- [ ] Page is responsive — cards stack on mobile, grid on desktop

---

## PHASE 6 — Social Integration & Feed

**Goal:** Wire gamification events into the Feed system and Public Profile. Add leaderboard to Friends page.

### 6A — Feed Post Types for Gamification

**File:** `backend/src/services/feedService.ts`

Add two new methods:

```typescript
async generateBadgeEarnedPost(userId: string, badgeSlug: string, badgeName: string): Promise<void>
// Content: { description: "earned the Week Warrior badge 🔥", badgeName, badgeSlug }

async generateChallengeCompletedPost(userId: string, challengeId: string, challengeName: string): Promise<void>
// Content: { description: "completed the No Overspend Week challenge! 🏆", challengeName, challengeId }
```

These are called from `gamificationService` when a badge is awarded or a challenge is completed.

### 6B — Feed Post Card Updates

**File:** `frontend/src/components/social/FeedPostCard.tsx`

Add rendering for the new `BADGE_EARNED` and `CHALLENGE_COMPLETED` post types:
- **BADGE_EARNED:** Show badge icon + "earned the {badgeName} badge" with a colored badge chip
- **CHALLENGE_COMPLETED:** Show trophy icon + "completed the {challengeName} challenge!" with participant summary
- Both follow the existing card layout pattern with reactions and comments

**File:** `frontend/src/store/feedStore.ts`

Update the `FeedPost.type` union to include `'BADGE_EARNED' | 'CHALLENGE_COMPLETED' | 'STREAK_MILESTONE'`.

### 6C — Public Profile Gamification Section

**File:** `frontend/src/pages/PublicProfile.tsx`

After the existing meta info section (location, join date, shared splits), add a gamification summary visible to friends:

```tsx
{/* Gamification Summary — visible to friends and self */}
{(profile.friendshipStatus === 'friends' || profile.friendshipStatus === 'self') && gamificationData && (
  <div className="mt-6 pt-6 border-t border-border-subtle">
    <div className="flex items-center gap-6 text-sm">
      <span>🔥 {gamificationData.currentStreak} day streak</span>
      <span>⭐ {gamificationData.totalPoints} points</span>
      <span>🏅 {gamificationData.badgeCount} badges</span>
    </div>
    {/* Top 3 badges displayed inline */}
    <div className="flex gap-2 mt-3">
      {gamificationData.recentBadges.map(b => (
        <span key={b.id} className="text-lg" title={b.name}>{b.iconUrl}</span>
      ))}
    </div>
  </div>
)}
```

This requires a new API call or extending the existing profile endpoint to include gamification summary for friends.

**File:** `backend/src/controllers/profileController.ts`

When returning a public profile where `friendshipStatus === 'friends'` or `'self'`, include gamification summary:
```typescript
gamification: {
  currentStreak: number;
  totalPoints: number;
  badgeCount: number;
  recentBadges: Array<{ id, slug, name, iconUrl }>;  // latest 3
  activeFrame: { cssClass: string } | null;
}
```

### 6D — Leaderboard in Friends Page

**File:** `frontend/src/pages/Friends.tsx`

Add a "Leaderboard" tab (the Friends page likely already uses tabs for friend list/requests). The leaderboard tab renders the `Leaderboard` component.

**File:** `frontend/src/components/gamification/Leaderboard.tsx`

A ranked list of friends showing:
- Rank number (1st, 2nd, 3rd with gold/silver/bronze styling)
- Avatar with frame
- Display name
- Points, streak, badge count
- Current user's row highlighted with `bg-primary/5` and `border-primary/30`

**States:**
| State | What the user sees |
|---|---|
| Loading | 5 skeleton rows |
| Empty (no friends) | "Add friends to see the leaderboard!" |
| Populated | Ranked list, current user highlighted |

### 6E — Notification Text Updates

**File:** `backend/src/services/notificationService.ts`

Add cases to `getNotificationText` and `getNotificationUrl`:

```typescript
case 'CHALLENGE_INVITE':
  return `${actorName} invited you to a challenge: ${data?.challengeName}`;
case 'BADGE_UNLOCKED':
  return `You earned the ${data?.badgeName} badge! 🏅`;
case 'STREAK_MILESTONE':
  return `You're on a ${data?.streakDays}-day streak! 🔥`;
case 'CHALLENGE_COMPLETED':
  return `You completed the ${data?.challengeName} challenge! 🏆`;
```

URL mappings:
```typescript
case 'CHALLENGE_INVITE':
case 'CHALLENGE_COMPLETED':
  return `${baseUrl}/challenges`;
case 'BADGE_UNLOCKED':
case 'STREAK_MILESTONE':
  return `${baseUrl}/challenges?tab=badges`;
```

### Files to CREATE — Phase 6
| File Path | Purpose |
|---|---|
| `frontend/src/components/gamification/Leaderboard.tsx` | Friend leaderboard ranked list |

### Files to MODIFY — Phase 6
| File Path | What Changes |
|---|---|
| `backend/src/services/feedService.ts` | Add `generateBadgeEarnedPost()` and `generateChallengeCompletedPost()` methods |
| `backend/src/services/notificationService.ts` | Add 4 new cases to `getNotificationText` and `getNotificationUrl` |
| `backend/src/controllers/profileController.ts` | Include gamification summary in public profile response for friends/self |
| `frontend/src/components/social/FeedPostCard.tsx` | Add rendering for `BADGE_EARNED` and `CHALLENGE_COMPLETED` post types |
| `frontend/src/store/feedStore.ts` | Extend `FeedPost.type` union with new post types |
| `frontend/src/pages/PublicProfile.tsx` | Add gamification summary section for friends/self |
| `frontend/src/pages/Friends.tsx` | Add "Leaderboard" tab |

### Acceptance Criteria — Phase 6
- [ ] **GIVEN** user earns a badge, **THEN** a feed post is created visible to friends
- [ ] **GIVEN** user completes a challenge, **THEN** a feed post and notification are generated
- [ ] **GIVEN** user visits a friend's public profile, **THEN** gamification stats (streak, points, badges) are visible
- [ ] **GIVEN** user opens Friends → Leaderboard tab, **THEN** friends are ranked by points with their streak and badge counts
- [ ] **GIVEN** user receives a challenge invite, **THEN** notification text shows challenge name and links to `/challenges`
- [ ] New feed post types render with correct icons and styling in the Feed page

---

## Complete Codebase Integration Map

### Files to CREATE (All Phases)
| File Path | Phase | Purpose |
|---|---|---|
| `backend/prisma/seed-gamification.ts` | 2 | Seed badges and avatar frames |
| `backend/src/services/gamificationService.ts` | 2 | Core streak/badge/points/challenge engine |
| `backend/src/controllers/gamificationController.ts` | 3 | 7 REST endpoint handlers |
| `backend/src/routes/gamificationRoutes.ts` | 3 | Route wiring |
| `frontend/src/store/gamificationStore.ts` | 4 | Zustand store |
| `frontend/src/components/gamification/StreakWidget.tsx` | 4 | Dashboard streak card |
| `frontend/src/components/gamification/ActiveChallengeCard.tsx` | 4 | Dashboard challenge callout |
| `frontend/src/pages/Challenges.tsx` | 5 | Full challenges page |
| `frontend/src/components/gamification/CreateChallengeModal.tsx` | 5 | Challenge creation modal |
| `frontend/src/components/gamification/FramePicker.tsx` | 5 | Avatar frame selector |
| `frontend/src/components/gamification/Leaderboard.tsx` | 6 | Friend leaderboard |

### Files to MODIFY (All Phases)
| File Path | Phase | What Changes |
|---|---|---|
| `backend/prisma/schema.prisma` | 1 | 6 new models, 3 new enums, extend 2 enums, 4 new User relations |
| `backend/package.json` | 2 | Seed script for gamification |
| `backend/src/controllers/transactionController.ts` | 2 | Hook gamification calls into expense/settlement/topup (3 insertion points) |
| `backend/src/server.ts` | 3 | Mount gamification routes |
| `backend/src/services/gamificationService.ts` | 3 | Add `evaluateChallenges()` |
| `backend/src/services/feedService.ts` | 6 | Add 2 new feed post generators |
| `backend/src/services/notificationService.ts` | 6 | Add 4 new notification type handlers |
| `backend/src/controllers/profileController.ts` | 6 | Gamification summary in public profile |
| `frontend/src/components/ui/Avatar.tsx` | 4 | Add `frameClass` prop |
| `frontend/src/pages/Dashboard.tsx` | 4 | Embed StreakWidget + ActiveChallengeCard |
| `frontend/src/components/layout/DashboardLayout.tsx` | 5 | Add "Challenges" nav item |
| `frontend/src/App.tsx` | 5 | Add `/challenges` route |
| `frontend/src/components/social/FeedPostCard.tsx` | 6 | New post type rendering |
| `frontend/src/store/feedStore.ts` | 6 | Extend type union |
| `frontend/src/pages/PublicProfile.tsx` | 6 | Gamification stats section |
| `frontend/src/pages/Friends.tsx` | 6 | Leaderboard tab |

### Files NOT to Change
| File Path | Why |
|---|---|
| `frontend/src/components/TransactionForm.tsx` | Gamification hooks are backend-side; no UI changes needed in the form |
| `frontend/src/store/authStore.ts` | Auth store shape unchanged; frame data lives in gamification store |
| `backend/src/services/forecastingService.ts` | Forecasting is independent of gamification |
| `backend/src/controllers/categoryController.ts` | Categories are read by gamification service, not modified |

### Existing Code to Reuse
| What | Where | How |
|---|---|---|
| `container-card` CSS class | `frontend/src/index.css` | All gamification cards use this for consistent styling |
| `Avatar` component | `frontend/src/components/ui/Avatar.tsx` | Extended with `frameClass` prop; used in leaderboard and challenge participants |
| `Button` component | `frontend/src/components/ui/Button.tsx` | All CTAs (Create Challenge, Join, Set Frame) |
| `feedService` pattern | `backend/src/services/feedService.ts` | Badge/challenge feed posts follow the same `prisma.feedPost.create` pattern |
| `createNotification` | `backend/src/services/notificationService.ts` | All gamification notifications use this existing function |
| `requireAuth` middleware | `backend/src/middleware/requireAuth.ts` | Applied to all gamification routes |
| Zustand store pattern | `frontend/src/store/feedStore.ts` | Gamification store follows identical `create<State>((set, get) => ...)` pattern |
| `FeedPostCard` rendering | `frontend/src/components/social/FeedPostCard.tsx` | New post types follow existing switch-case pattern |

### New Dependencies
**No new dependencies required.** All functionality is built with existing packages:
- `@prisma/client` — new models
- `lucide-react` — `Trophy`, `Flame`, `Medal`, `Crown` icons (already installed)
- `zustand` — new store (already installed)
- `axios` — API calls (already installed)

---

## Edge Cases & Error Handling

| Scenario | Expected Behavior |
|---|---|
| User has 0 categories when streak is evaluated | Streak remains at 0 — no categories to evaluate |
| User deletes a category mid-challenge | Challenge continues for remaining categories; deleted category is ignored |
| Two users create overlapping challenges | Both challenges run independently — no conflict |
| User is invited to a challenge but isn't friends with creator anymore | Invitation is silently ignored; participant row stays with `accepted: false` |
| Badge seed data changes after users have earned badges | Existing `UserBadge` rows preserved; new badges appear as locked |
| User's streak crosses midnight | Streak logic uses UTC dates; `lastStreakDate` compared against `today (UTC)` |
| Network failure during badge award | `evaluateAndAwardBadges` is fire-and-forget with `.catch(console.error)` — transaction still succeeds |
| User tries to join an expired challenge | 400 error: "Challenge start date has passed" |
| Challenge has 0 accepted participants when it ends | Challenge marked COMPLETED with no winners |
| Concurrent transactions triggering streak update | `UserGamification` uses atomic Prisma updates; last-write-wins is acceptable for streak count |

---

## Security Considerations

- [ ] **Input validation:** Challenge `startDate`, `endDate`, `invitedUserIds` validated server-side (not just client)
- [ ] **Authorization:** Users can only view their own gamification profile via `/profile`; leaderboard only shows friends
- [ ] **Friendship verification:** `invitedUserIds` in challenge creation verified against `Friendship` table
- [ ] **Rate limiting:** Challenge creation limited to 5 active per user (enforced in controller)
- [ ] **Data exposure:** Gamification data on public profiles only shown to friends/self (respects `PrivacySettings`)
- [ ] **Frame cheating:** Frame selection validates `totalPoints >= pointsRequired` server-side

---

## Performance Considerations

- **Streak evaluation** runs after every transaction but only queries current month's budget data (already optimized in `getBudgetStatus`)
- **Badge evaluation** queries are lightweight counts; no heavy joins
- **Leaderboard** fetches `UserGamification` for friends only (typically < 50 rows); no pagination needed for V1
- **Challenge evaluation** is lazy (no cron); triggered by transactions or page loads — prevents orphaned active challenges from consuming resources
- **Indexes:** `UserGamification.userId` is `@unique` (auto-indexed). `ChallengeParticipant` has `@@unique([challengeId, userId])`. `UserBadge` has `@@unique([userId, badgeId])`. No additional indexes needed.

---

## Out of Scope (Explicit Exclusions)

- **Custom badge creation** — users cannot create custom badges; system-defined only
- **Real-money rewards** — all rewards are virtual (avatar frames, points)
- **Cron-based challenge completion** — V1 uses lazy evaluation; cron deferred to V2
- **Badge revoking** — once earned, badges are permanent (even if conditions change)
- **Challenge chat/messaging** — no in-challenge communication; use existing feed comments
- **Complex avatar builder** — only frame rings around existing avatars; no full character customization
- **Monthly badge auto-evaluation** — budget % badges are checked at transaction time, not end-of-month cron
- **Cross-month streak persistence** — streaks reset if no transaction logged in a day; no "grace days"

---

## Open Questions

- [x] **Streak definition:** Days in a row where ALL categories remain under budget. *(Decided)*
- [x] **Avatar customizations:** Profile frame rings overlaying existing avatar. *(Decided)*
- [x] **Challenge formation:** System-provided templates with friend invitations. *(Decided)*
- [ ] **Streak grace period:** Should weekends/holidays pause the streak? *(Default: No — every calendar day counts. Can revisit in V2.)*
- [ ] **Points decay:** Should points decay over time to encourage continued engagement? *(Default: No — points are permanent in V1.)*

---

## Recommended Skills

Skills from the skills library the implementing agent should load:

| Skill | Purpose |
|---|---|
| `react-patterns` | Hooks, composition for gamification components |
| `react-ui-patterns` | Loading/error/empty state handling for all new UI |
| `database-design` | Schema design for gamification models and indexes |
| `backend-dev-guidelines` | Layered architecture for gamificationService |
| `clean-code` | Consistent code standards across 11 new files |
| `frontend-design` | Production-grade UI for challenges page and badge showcase |
