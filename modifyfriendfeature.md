# Feature Spec: Social Friends Network — Modify Friend Feature

## Overview

- **Feature:** Transform the static ghost-profile "Friends" system into a real social network with bidirectional friend requests, user profiles, a social feed, notifications (including push), and privacy controls.
- **Requested by:** User (product owner)
- **Complexity:** Epic (50+ files, 5–7 days)
- **Estimated scope:** ~55 files to create/modify across backend and frontend
- **Related features:** Transactions, Ledger Entries, Categories, Dashboard, Authentication

## Problem & Motivation

Currently, "Friends" in Hybrid Ledger are ghost profiles — unlinked name entries owned by a single user with no real account connection, no mutual acceptance, and no social interaction. Users cannot discover other registered users, share expense visibility mutually, or interact socially around their financial activity. This limits the app to a solo budgeting tool when it should be a collaborative finance platform. The modification transforms Friends into a real social layer — similar to how Facebook handles connections — but purpose-built for shared budgeting and expense tracking.

## User Stories

- **As a** registered user, **I want to** create a public profile with my photo, display name, @username, and bio **so that** other users can find and identify me.
- **As a** user, **I want to** search for other users by username or email **so that** I can connect with people I split expenses with.
- **As a** user, **I want to** send a friend request to another user **so that** we can establish a mutual financial connection.
- **As a** user, **I want to** accept or decline incoming friend requests **so that** I control who can see my financial activity.
- **As a** user, **I want to** see a social feed of my friends' financial activity **so that** I stay informed about shared expenses and settlements.
- **As a** user, **I want to** react to and comment on friends' feed posts **so that** I can engage socially around financial events.
- **As a** user, **I want to** receive notifications for friend requests, expenses, settlements, and social interactions **so that** I never miss important financial events.
- **As a** user, **I want to** receive push notifications in my browser **so that** I'm alerted even when the app isn't open.
- **As a** user, **I want to** control my privacy settings **so that** I decide what financial data is visible to friends.
- **As a** user, **I want to** block or report problematic users **so that** I feel safe using the platform.
- **As a** user, **I want to** scan a QR code to send a friend request **so that** connecting in person is instant.
- **As a** user with existing ghost profiles, **I want to** convert them to real connections **so that** my historical data links to actual accounts.

---

## Detailed Requirements

---

### Requirement Group 1 — Profile System

**Description:** Each user account gets a public-facing profile with photo, display name, @username, bio, location, and joined date. Profiles are editable from a dedicated settings page.

**UI/UX:**

- **Layout:** A dedicated `/settings/profile` page with a form layout matching the existing Soft Geometry design system (container-card backgrounds, rounded inputs, Sora headings, DM Sans body text). A public profile view at `/profile/:username`.
- **States:**

| State | What the user sees | Trigger |
|---|---|---|
| Loading | Skeleton placeholders matching existing pattern in `Friends.tsx` | Profile data being fetched |
| Empty Profile | Default avatar (initials-based circle), prompt to complete profile | User has not set displayName/bio |
| Populated | Full profile with avatar, name, username, bio, location, join date | All fields set |
| Error | Error banner with retry (matches existing `AlertCircle` pattern) | API failure |
| Own Profile | "Edit Profile" button visible | Viewing own `/profile/:username` |
| Other Profile (Not Friend) | "Send Friend Request" button | Viewing non-connected user |
| Other Profile (Pending) | "Request Pending..." disabled button | Request already sent |
| Other Profile (Friend) | "Friends ✓" badge + shared balance summary | Already connected |
| Other Profile (Blocked) | 404 — profile not found | Blocked user trying to view |

- **Interactions:** Avatar click opens file picker for upload. Username field has debounced uniqueness check. Bio has 160-char counter. Save button with loading state.
- **Navigation:** Accessible from nav bar avatar dropdown → "Edit Profile", and from any friend card → "View Profile" link.
- **Accessibility:** All form fields have `<label>` with `htmlFor`. Avatar upload has `aria-label`. Focus management on form validation errors.

**Data:**

- **Source:** `GET /api/profile/me`, `PUT /api/profile/me`, `GET /api/profile/:username`
- **Shape:**

```typescript
interface UserProfile {
  id: string;
  email: string;
  username: string | null;
  displayName: string | null;
  bio: string | null;       // max 160 chars
  location: string | null;
  avatarUrl: string | null;
  createdAt: string;        // ISO 8601
}

interface PublicProfile extends UserProfile {
  friendshipStatus: 'none' | 'pending_sent' | 'pending_received' | 'friends' | 'blocked';
  sharedSplitCount?: number;  // visible to friends only
  mutualFriendCount?: number;
}
```

- **New fields on existing types:** The `User` Prisma model gains: `username`, `displayName`, `bio`, `location`, `avatarUrl`. The `AuthUser` interface in `authStore.ts` gains the same fields.
- **Caching:** Profile data refreshes on page load. Avatar URL includes cache-busting query param after upload.

**API Changes:**

| Endpoint | Method | Auth | Request | Response (200) | Errors |
|---|---|---|---|---|---|
| `/api/profile/me` | GET | Required | — | `{ profile: UserProfile }` | 401 |
| `/api/profile/me` | PUT | Required | `{ displayName?, username?, bio?, location? }` | `{ profile: UserProfile }` | 400 (validation), 409 (username taken), 401 |
| `/api/profile/avatar` | POST | Required | `multipart/form-data` with `avatar` file field | `{ avatarUrl: string }` | 400 (invalid file), 413 (>5MB), 401 |
| `/api/profile/:username` | GET | Required | — | `{ profile: PublicProfile }` | 404 (not found / blocked / hidden), 401 |
| `/api/profile/:userId/qr` | GET | Required | — | `{ qrDataUrl: string }` | 404, 401 |

**Avatar Upload Details (Supabase Storage):**
- Bucket: `avatars` (create if not exists)
- Path: `avatars/{userId}.{ext}`
- Max file size: 5MB
- Accepted types: `image/jpeg`, `image/png`, `image/webp`
- Image resized server-side to 256×256 using `sharp` before upload
- Public URL returned from Supabase: `{SUPABASE_URL}/storage/v1/object/public/avatars/{userId}.{ext}`
- `upsert: true` to overwrite on re-upload

**QR Code Details:**
- Generated server-side using `qrcode` npm package
- QR encodes URL: `{FRONTEND_URL}/profile/{username}?action=add-friend`
- Returns base64 data URL (`data:image/png;base64,...`)
- Frontend renders as `<img>` with "Copy Link" button alongside

**Business Rules:**
1. Username must be 3–30 characters, alphanumeric + underscores only, case-insensitive unique.
2. Username is auto-generated from email prefix on registration (e.g., `ardiel@email.com` → `@ardiel`). If taken, append random 4 digits.
3. Bio max 160 characters. Location max 100 characters.
4. Display name max 50 characters.
5. Avatar must be ≤5MB, image/* only. Resized to 256×256.
6. Default avatar is a colored circle with user's initials (rendered client-side via CSS, no image needed).

---

### Requirement Group 2 — Friend Request System

**Description:** Replace ghost-profile manual-entry friend logic with a real request-based connection flow. Users search by username/email, send requests, and receive accept/decline notifications.

**UI/UX:**

- **Layout:** The existing `Friends.tsx` page is restructured with a tab interface: **"My Friends"** | **"Requests"** | **"Discover"**. The tab component follows the Soft Geometry design (underline indicator, smooth transition).
- **States per tab:**

| Tab | State | What the user sees | Trigger |
|---|---|---|---|
| My Friends | Loading | Skeleton grid (existing pattern) | Fetching friends |
| My Friends | Empty | Empty state with "Find friends to start splitting expenses" + search CTA | No accepted friends |
| My Friends | Populated | Grid of friend cards with avatar, name, @username, balance summary | Has friends |
| Requests | Empty | "No pending requests" with prompt to share QR code | No requests |
| Requests | Has Received | Cards with Accept/Decline buttons | Pending received |
| Requests | Has Sent | Cards with "Cancel Request" option | Pending sent |
| Discover | Default | Search bar + QR code display for own profile | Page load |
| Discover | Search Results | User cards with action buttons | After typing query |
| Discover | No Results | "No users found. Invite via email?" + email input | Search returns empty |

- **Interactions:**
  - Search: Debounced (300ms) text input searching by username or email
  - Send Request: Single button click → optimistic UI update → button changes to "Pending..."
  - Accept: Button click → friend appears in My Friends tab → notification sent to requester
  - Decline: Button click → card removed with slide-out animation
  - QR Code: Displayed in Discover tab; scannable by camera apps, links to user's profile with auto-add intent
  - Email Invite: If search email not found → show "Invite" button → logs invitation (console for now)
  - Ghost Profile Section: Below friends grid, collapsible section showing legacy ghost profiles with "Link to Real User" prompt

**Data:**

```typescript
interface FriendListItem {
  friendshipId: string;
  friendId: string;           // the other user's ID
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  netBalance: number;         // positive = they owe you
  createdAt: string;          // friendship date
}

interface FriendRequest {
  id: string;
  senderId: string;
  receiverId: string;
  senderProfile: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  receiverProfile: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  createdAt: string;
}

interface UserSearchResult {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  relationshipStatus: 'none' | 'pending_sent' | 'pending_received' | 'friends';
}
```

**API Changes:**

| Endpoint | Method | Auth | Request | Response (200) | Errors |
|---|---|---|---|---|---|
| `/api/friends/search?q=` | GET | Required | query param `q` (min 2 chars) | `{ results: UserSearchResult[] }` | 401 |
| `/api/friends/request` | POST | Required | `{ targetUserId?: string, targetEmail?: string }` | `{ request: FriendRequest }` | 400 (self/already-friends/already-pending), 404, 401 |
| `/api/friends/requests/received` | GET | Required | — | `{ requests: FriendRequest[] }` | 401 |
| `/api/friends/requests/sent` | GET | Required | — | `{ requests: FriendRequest[] }` | 401 |
| `/api/friends/request/:id/accept` | POST | Required | — | `{ friendship: { id, createdAt } }` | 403, 404, 401 |
| `/api/friends/request/:id/decline` | POST | Required | — | `{ success: true }` | 403, 404, 401 |
| `/api/friends/request/:id/cancel` | DELETE | Required | — | `{ success: true }` | 403, 404, 401 |
| `/api/friends/list` | GET | Required | — | `{ friends: FriendListItem[] }` | 401 |
| `/api/friends/:friendshipId` | DELETE | Required | — | `{ success: true }` | 403, 404, 401 |
| `/api/friends/ghost/:id/claim` | POST | Required | `{ realUserId: string }` | `{ success: true }` | 403, 404, 401 |
| `/api/friends/invite` | POST | Required | `{ email: string }` | `{ invited: true }` | 400, 401 |

**Business Rules:**
1. Friend relationships are **bidirectional** — both sides must accept before any data is shared.
2. A user cannot send a request to themselves.
3. A user cannot send a request to someone they've blocked or who has blocked them.
4. Duplicate pending requests between the same pair are rejected.
5. If User A has a pending request FROM User B and User A tries to send a request TO User B → auto-accept (mutual intent).
6. When a friendship is removed, all shared balance visibility is revoked but historical ledger entries remain intact.
7. Ghost profile claiming: associates the ghost profile's `friendUserId` with the real user and creates a `Friendship` row. Historical ledger entries tied to that ghost remain valid.
8. Search excludes: blocked users, users with `profileVisibility = HIDDEN`, and the searching user themselves.
9. Search results are limited to 20 per query.
10. Email invitation is logged to `AuditLog` and console (no real email sent in V1 unless email service is configured).

---

### Requirement Group 3 — Friends Feed

**Description:** A social feed visible only to logged-in users showing financial activity from accepted friends.

**UI/UX:**

- **Layout:** New page at `/feed`, accessible from main navigation (added between "Dashboard" and "Friends" in nav). Feed is a single-column card list with infinite scroll.
- **States:**

| State | What the user sees | Trigger |
|---|---|---|
| Loading | Skeleton post cards (3 placeholders) | Initial fetch |
| Empty | Illustration + "Your feed is empty" + "Add friends to see their activity" CTA + "Start a Split" CTA | No friends or no activity |
| Populated | Feed cards sorted by recency (newest first) | Friends have activity |
| End of Feed | "You're all caught up! 🎉" message | No more posts to load |
| Error | Error banner with retry | API failure |

- **Feed Post Card Structure:**
  - Friend's avatar (left)
  - Friend's display name + @username (top)
  - Action description text (middle): e.g., "added a grocery split — ₱1,200 with 3 people"
  - Timestamp (top-right): relative ("2h ago", "Yesterday")
  - Relevant amount styled in accent color
  - Emoji reaction bar (bottom): 👍 ❤️ 😮 with counts; user's selection highlighted
  - Comment count + toggle ("3 comments" clickable)
  - "View Split" / "Quick Join" action button on expense posts
  - Expandable comment thread below

- **Interactions:**
  - Infinite scroll: loads 20 posts per page, triggers at 200px from bottom
  - Reaction: click emoji → toggle on/off → optimistic update → API call
  - Comment: expand thread → text input (max 500 chars) → submit → optimistic prepend
  - Delete own comment: hover reveals trash icon → confirm → remove
  - "View Split": navigates to transaction detail (or opens a modal with split breakdown)

**Data:**

```typescript
interface FeedPost {
  id: string;
  userId: string;
  user: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  type: 'EXPENSE_ADDED' | 'SETTLEMENT_COMPLETED' | 'GROUP_SPLIT_CREATED' | 'BUDGET_MILESTONE';
  content: {
    description: string;      // human-readable action text
    amount?: number;
    categoryName?: string;
    friendNames?: string[];
    transactionId?: string;
  };
  isPublic: boolean;
  createdAt: string;
  reactions: {
    emoji: string;
    count: number;
    userReacted: boolean;     // whether current user reacted with this emoji
  }[];
  commentCount: number;
}

interface FeedComment {
  id: string;
  postId: string;
  userId: string;
  user: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  text: string;              // max 500 chars
  createdAt: string;
  isOwn: boolean;            // whether current user authored this
}
```

**API Changes:**

| Endpoint | Method | Auth | Request | Response (200) | Errors |
|---|---|---|---|---|---|
| `/api/feed` | GET | Required | query: `?cursor=&limit=20` | `{ posts: FeedPost[], nextCursor: string \| null }` | 401 |
| `/api/feed/:postId/comments` | GET | Required | query: `?cursor=&limit=20` | `{ comments: FeedComment[], nextCursor: string \| null }` | 401, 404 |
| `/api/feed/:postId/react` | POST | Required | `{ emoji: string }` | `{ reaction: { id, emoji } }` | 400, 404, 401 |
| `/api/feed/:postId/react/:emoji` | DELETE | Required | — | `{ success: true }` | 404, 401 |
| `/api/feed/:postId/comment` | POST | Required | `{ text: string }` | `{ comment: FeedComment }` | 400 (empty/too long), 404, 401 |
| `/api/feed/comment/:commentId` | DELETE | Required | — | `{ success: true }` | 403, 404, 401 |

**Feed Generation Rules (Backend Service):**
1. When `createExpenseTransaction` succeeds → auto-create `EXPENSE_ADDED` post with category name, amount, friend name.
2. When `createSettlement` succeeds → auto-create `SETTLEMENT_COMPLETED` post with amount, friend name.
3. Budget milestone: when `BUDGET_DEDUCTION` crosses 50% or 100% of category limit → auto-create `BUDGET_MILESTONE` post (only if user's `budgetVisibility` is not `PRIVATE`).
4. Feed query returns posts only from accepted friends, excluding blocked users.
5. Feed respects privacy: if a friend's `debtVisibility = PRIVATE`, their expense amounts are hidden (show "logged an expense" without amount). If `budgetVisibility = PRIVATE`, budget milestone posts are excluded.
6. Allowed reaction emojis: `👍`, `❤️`, `😮`. Others rejected with 400.
7. Each user can react with each emoji at most once per post (toggle behavior).
8. Comments max 500 characters. Empty/whitespace-only rejected.

---

*Continued in [modifyfriendfeature-part2.md](file:///d:/CRUD/modifyfriendfeature-part2.md)*
