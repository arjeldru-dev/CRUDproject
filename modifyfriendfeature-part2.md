# Feature Spec Part 2: Notifications, Privacy, Schema, Integration

*Continuation of [modifyfriendfeature.md](file:///d:/CRUD/modifyfriendfeature.md)*

---

### Requirement Group 4 — Notification System

**Description:** In-app + browser push notifications for all social and financial triggers.

**UI/UX:**

- **Layout:** Bell icon (🔔) in `DashboardLayout.tsx` nav bar with red badge showing unread count (caps at "99+"). Click opens a dropdown panel (max-height 400px, scrollable). Notifications page at `/notifications` for full view.
- **States:**

| State | What the user sees | Trigger |
|---|---|---|
| No Notifications | "All caught up! 🎉" | Empty list |
| Has Unread | Bold text + dot indicator per item, red badge on bell | Unread items exist |
| All Read | Normal weight text, no badge | User marked all read |
| Loading | Skeleton items (3) | Fetching |

- **Notification Item Structure:** Actor avatar | Action text | Relative timestamp | Quick-action button
- **Quick Actions by Type:**

| Type | Action Button | Behavior |
|---|---|---|
| `FRIEND_REQUEST_RECEIVED` | "Accept" | Accepts request inline |
| `FRIEND_REQUEST_ACCEPTED` | "View Profile" | Navigates to friend's profile |
| `ADDED_TO_SPLIT` | "View Split" | Opens transaction detail |
| `BALANCE_CHANGED` | "Settle Now" | Opens settlement form |
| `FEED_REACTION` | "View Post" | Navigates to feed post |
| `FEED_COMMENT` | "View Post" | Navigates to feed post |
| `SETTLEMENT_REMINDER` | "Settle Now" | Opens settlement form |

**Push Notifications (Web Push API):**

- Backend uses `web-push` npm package with VAPID keys
- Frontend registers a Service Worker (`public/sw.js`) on login
- User subscribes via `PushManager.subscribe()` with the public VAPID key
- Subscription object stored in new `PushSubscription` Prisma model tied to `userId`
- When creating an in-app notification, backend also calls `webpush.sendNotification()` for all active subscriptions of that user
- Service Worker displays browser notification with title, body, and click action URL
- Push permission requested via a subtle prompt banner (not on first load — after first friend action)

**Data:**

```typescript
interface AppNotification {
  id: string;
  recipientId: string;
  actorId: string | null;
  actor: { username: string; displayName: string | null; avatarUrl: string | null } | null;
  type: NotificationType;
  data: Record<string, any> | null;  // type-specific metadata
  read: boolean;
  createdAt: string;
}

type NotificationType =
  | 'FRIEND_REQUEST_RECEIVED'
  | 'FRIEND_REQUEST_ACCEPTED'
  | 'ADDED_TO_SPLIT'
  | 'BALANCE_CHANGED'
  | 'FEED_REACTION'
  | 'FEED_COMMENT'
  | 'SETTLEMENT_REMINDER';
```

**API Changes:**

| Endpoint | Method | Request | Response (200) |
|---|---|---|---|
| `GET /api/notifications` | GET | `?cursor=&limit=20` | `{ notifications: AppNotification[], nextCursor }` |
| `GET /api/notifications/unread-count` | GET | — | `{ count: number }` |
| `PUT /api/notifications/:id/read` | PUT | — | `{ success: true }` |
| `PUT /api/notifications/read-all` | PUT | — | `{ success: true }` |
| `POST /api/notifications/push-subscribe` | POST | `{ subscription: PushSubscription }` | `{ success: true }` |
| `DELETE /api/notifications/push-subscribe` | DELETE | — | `{ success: true }` |

**Business Rules:**
1. Notifications are never created for actions by the user themselves.
2. Blocked users cannot trigger notifications for each other.
3. Unread count polls every 30 seconds (frontend interval) — real-time WebSocket deferred.
4. Push notifications include: title (actor name), body (action text), icon (actor avatar URL), click URL (deep link).
5. If push delivery fails (subscription expired), silently delete the subscription row.
6. Max 200 notifications stored per user; oldest auto-pruned on insert.

---

### Requirement Group 5 — Privacy Controls

**Description:** User-configurable privacy with block/report functionality.

**UI/UX:**

- **Layout:** New page at `/settings/privacy` with toggle switches in a card layout. Blocked users list below.
- **Privacy Toggles:**

| Setting | Options | Default | Effect |
|---|---|---|---|
| Profile Visibility | Public / Friends Only / Hidden | Public | Controls who can find and view profile via search |
| Debt & Balance Visibility | Visible to Friends / Hidden | Friends Only | Controls whether amounts appear in friends' feeds |
| Budget Visibility | Show in Feed / Keep Private | Private | Controls whether budget milestone posts are created |

- **Block User Flow:** Accessible from profile page or friend card → Confirm modal → Removes friendship, hides all mutual data, prevents re-request, suppresses search.
- **Report User Flow:** Accessible from profile page → Modal with reason dropdown (Harassment, Spam, Inappropriate, Other) + optional text → Logged to `AuditLog` for admin review.

**Data:**

```typescript
interface PrivacySettings {
  profileVisibility: 'PUBLIC' | 'FRIENDS_ONLY' | 'PRIVATE';
  debtVisibility: 'FRIENDS_ONLY' | 'PRIVATE';
  budgetVisibility: 'FRIENDS_ONLY' | 'PRIVATE';
}

interface BlockedUserItem {
  id: string;
  blockedUserId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  blockedAt: string;
}
```

**API Changes:**

| Endpoint | Method | Request | Response (200) |
|---|---|---|---|
| `GET /api/settings/privacy` | GET | — | `{ settings: PrivacySettings }` |
| `PUT /api/settings/privacy` | PUT | `Partial<PrivacySettings>` | `{ settings: PrivacySettings }` |
| `GET /api/settings/blocked` | GET | — | `{ blocked: BlockedUserItem[] }` |
| `POST /api/friends/block/:userId` | POST | — | `{ success: true }` |
| `DELETE /api/settings/blocked/:userId` | DELETE | — | `{ success: true }` |
| `POST /api/friends/report/:userId` | POST | `{ reason: string, details?: string }` | `{ success: true }` |

**Business Rules:**
1. Blocking removes friendship, declines pending requests, and suppresses all mutual visibility bidirectionally.
2. Blocked users cannot search for, view profile of, or send requests to the blocker.
3. Unblocking does NOT restore the previous friendship — a new request must be sent.
4. Reports are logged with full metadata to `AuditLog` but do not auto-block.
5. Default privacy on account creation: Profile = Public, Debt = Friends Only, Budget = Private.
6. Privacy changes take effect immediately on next query.

---

## Prisma Schema Changes

### Models to ADD (9 new models)

```prisma
model FriendRequest {
  id         String        @id @default(uuid()) @db.Uuid
  senderId   String        @map("sender_id") @db.Uuid
  receiverId String        @map("receiver_id") @db.Uuid
  status     RequestStatus @default(PENDING)
  createdAt  DateTime      @default(now()) @map("created_at")
  updatedAt  DateTime      @updatedAt @map("updated_at")
  sender     User          @relation("RequestSender", fields: [senderId], references: [id], onDelete: Cascade)
  receiver   User          @relation("RequestReceiver", fields: [receiverId], references: [id], onDelete: Cascade)
  @@unique([senderId, receiverId])
  @@map("friend_requests")
}

model Friendship {
  id        String   @id @default(uuid()) @db.Uuid
  userAId   String   @map("user_a_id") @db.Uuid
  userBId   String   @map("user_b_id") @db.Uuid
  createdAt DateTime @default(now()) @map("created_at")
  userA     User     @relation("FriendshipUserA", fields: [userAId], references: [id], onDelete: Cascade)
  userB     User     @relation("FriendshipUserB", fields: [userBId], references: [id], onDelete: Cascade)
  @@unique([userAId, userBId])
  @@map("friendships")
}

model FeedPost {
  id        String       @id @default(uuid()) @db.Uuid
  userId    String       @map("user_id") @db.Uuid
  type      FeedPostType
  content   String
  isPublic  Boolean      @default(false) @map("is_public")
  createdAt DateTime     @default(now()) @map("created_at")
  user      User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  reactions Reaction[]
  comments  Comment[]
  @@map("feed_posts")
}

model Reaction {
  id        String   @id @default(uuid()) @db.Uuid
  postId    String   @map("post_id") @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  emoji     String   @db.VarChar(10)
  createdAt DateTime @default(now()) @map("created_at")
  post      FeedPost @relation(fields: [postId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([postId, userId, emoji])
  @@map("reactions")
}

model Comment {
  id        String   @id @default(uuid()) @db.Uuid
  postId    String   @map("post_id") @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  text      String   @db.VarChar(500)
  createdAt DateTime @default(now()) @map("created_at")
  post      FeedPost @relation(fields: [postId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("comments")
}

model Notification {
  id          String           @id @default(uuid()) @db.Uuid
  recipientId String           @map("recipient_id") @db.Uuid
  actorId     String?          @map("actor_id") @db.Uuid
  type        NotificationType
  data        String?
  read        Boolean          @default(false)
  createdAt   DateTime         @default(now()) @map("created_at")
  recipient   User             @relation("NotificationRecipient", fields: [recipientId], references: [id], onDelete: Cascade)
  actor       User?            @relation("NotificationActor", fields: [actorId], references: [id], onDelete: SetNull)
  @@map("notifications")
}

model BlockedUser {
  id        String   @id @default(uuid()) @db.Uuid
  blockerId String   @map("blocker_id") @db.Uuid
  blockedId String   @map("blocked_id") @db.Uuid
  createdAt DateTime @default(now()) @map("created_at")
  blocker   User     @relation("Blocker", fields: [blockerId], references: [id], onDelete: Cascade)
  blocked   User     @relation("Blocked", fields: [blockedId], references: [id], onDelete: Cascade)
  @@unique([blockerId, blockedId])
  @@map("blocked_users")
}

model PrivacySettings {
  id                String     @id @default(uuid()) @db.Uuid
  userId            String     @unique @map("user_id") @db.Uuid
  profileVisibility Visibility @default(PUBLIC) @map("profile_visibility")
  debtVisibility    Visibility @default(FRIENDS_ONLY) @map("debt_visibility")
  budgetVisibility  Visibility @default(PRIVATE) @map("budget_visibility")
  user              User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("privacy_settings")
}

model PushSubscription {
  id           String   @id @default(uuid()) @db.Uuid
  userId       String   @map("user_id") @db.Uuid
  endpoint     String
  p256dh       String
  auth         String
  createdAt    DateTime @default(now()) @map("created_at")
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, endpoint])
  @@map("push_subscriptions")
}

model AuditLog {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  action    String
  targetId  String?  @map("target_id") @db.Uuid
  metadata  String?
  createdAt DateTime @default(now()) @map("created_at")
  @@map("audit_logs")
}
```

### Enums to ADD

```prisma
enum RequestStatus { PENDING; ACCEPTED; DECLINED }
enum FeedPostType { EXPENSE_ADDED; SETTLEMENT_COMPLETED; GROUP_SPLIT_CREATED; BUDGET_MILESTONE }
enum NotificationType { FRIEND_REQUEST_RECEIVED; FRIEND_REQUEST_ACCEPTED; ADDED_TO_SPLIT; BALANCE_CHANGED; FEED_REACTION; FEED_COMMENT; SETTLEMENT_REMINDER }
enum Visibility { PUBLIC; FRIENDS_ONLY; PRIVATE }
```

### Fields to ADD on existing `User` model

```prisma
username          String?  @unique
displayName       String?  @map("display_name")
bio               String?  @db.VarChar(160)
location          String?
avatarUrl         String?  @map("avatar_url")
// + all new relation fields for the 9 new models
```

---

## Codebase Integration

### Files to CREATE

| File Path | Purpose |
|---|---|
| `backend/src/controllers/profileController.ts` | Profile CRUD + avatar upload + QR code generation |
| `backend/src/controllers/friendRequestController.ts` | Send/accept/decline/cancel friend requests + search |
| `backend/src/controllers/friendshipController.ts` | List friends, remove, block, report, claim ghost |
| `backend/src/controllers/feedController.ts` | Feed listing, reactions, comments CRUD |
| `backend/src/controllers/notificationController.ts` | Notification listing, read marking, push subscribe |
| `backend/src/controllers/privacyController.ts` | Privacy settings CRUD, blocked users list |
| `backend/src/services/feedService.ts` | Auto-create feed posts from transactions |
| `backend/src/services/notificationService.ts` | Central notification creation + push dispatch |
| `backend/src/services/supabaseStorage.ts` | Supabase Storage client for avatar uploads |
| `backend/src/middleware/upload.ts` | Multer config for avatar file handling |
| `backend/src/middleware/privacyGuard.ts` | Privacy check helpers for queries |
| `backend/src/routes/profileRoutes.ts` | Profile endpoint wiring |
| `backend/src/routes/friendRequestRoutes.ts` | Friend request endpoint wiring |
| `backend/src/routes/feedRoutes.ts` | Feed endpoint wiring |
| `backend/src/routes/notificationRoutes.ts` | Notification endpoint wiring |
| `backend/src/routes/privacyRoutes.ts` | Privacy endpoint wiring |
| `frontend/src/store/friendStore.ts` | Zustand store for friend data + requests |
| `frontend/src/store/feedStore.ts` | Zustand store for feed data |
| `frontend/src/store/notificationStore.ts` | Zustand store for notifications |
| `frontend/src/pages/Feed.tsx` | Social feed page |
| `frontend/src/pages/Profile.tsx` | Public profile view |
| `frontend/src/pages/ProfileSettings.tsx` | Edit profile form |
| `frontend/src/pages/PrivacySettings.tsx` | Privacy toggles + blocked users |
| `frontend/src/components/social/FriendCard.tsx` | Friend list card |
| `frontend/src/components/social/FriendRequestCard.tsx` | Pending request card |
| `frontend/src/components/social/UserSearchResult.tsx` | Search result row |
| `frontend/src/components/social/FeedPostCard.tsx` | Feed post card |
| `frontend/src/components/social/ReactionBar.tsx` | Emoji reaction buttons |
| `frontend/src/components/social/CommentThread.tsx` | Comment list + input |
| `frontend/src/components/social/NotificationPanel.tsx` | Bell dropdown panel |
| `frontend/src/components/social/NotificationItem.tsx` | Single notification row |
| `frontend/src/components/social/QRCodeDisplay.tsx` | QR code renderer |
| `frontend/src/components/social/AvatarUpload.tsx` | Avatar file picker |
| `frontend/src/components/ui/Avatar.tsx` | Reusable avatar with fallback |
| `frontend/src/components/ui/Tabs.tsx` | Reusable tab component |
| `frontend/src/components/ui/Badge.tsx` | Notification count badge |
| `frontend/public/sw.js` | Service worker for push notifications |

### Files to MODIFY

| File Path | What Changes |
|---|---|
| `backend/prisma/schema.prisma` | Add 10 new models, 4 enums, 5 fields on User, new relations |
| `backend/src/server.ts` | Register 5 new route modules, serve static uploads |
| `backend/src/controllers/authController.ts` | Auto-generate username on register, return expanded user, create default PrivacySettings |
| `backend/src/controllers/friendController.ts` | Expand `getFriends` to include real friendships alongside ghosts |
| `backend/src/controllers/transactionController.ts` | Call feedService after expense/settlement creation, support real friend userId |
| `backend/src/routes/friendRoutes.ts` | Mount new friend request/friendship sub-routes |
| `backend/.env` | Add `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`, `FRONTEND_URL` |
| `frontend/src/store/authStore.ts` | Expand `AuthUser` with profile fields, add `updateProfile` action |
| `frontend/src/pages/Friends.tsx` | Major rewrite: tab layout with My Friends / Requests / Discover |
| `frontend/src/components/layout/DashboardLayout.tsx` | Add bell icon + notification panel, user avatar in nav, Feed nav item |
| `frontend/src/App.tsx` | Add routes: `/feed`, `/profile/:username`, `/settings/profile`, `/settings/privacy` |
| `frontend/src/index.css` | Add notification badge pulse animation, feed card styles, reaction animations |
| `frontend/package.json` | Add `react-intersection-observer` dependency |
| `backend/package.json` | Add `multer`, `@types/multer`, `qrcode`, `@types/qrcode`, `sharp`, `web-push`, `@supabase/supabase-js` |

### Files NOT to Change

| File Path | Why |
|---|---|
| `backend/src/controllers/categoryController.ts` | Categories are user-private; no social changes needed |
| `backend/src/routes/categoryRoutes.ts` | No changes to category routing |
| `backend/src/middleware/requireAuth.ts` | Auth middleware is stable; no modification needed |
| `backend/src/config/db.ts` | Prisma client singleton unchanged |
| `frontend/src/components/TransactionForm.tsx` | Transaction form UI unchanged (data sources expand but form stays the same) |
| `frontend/src/components/SuccessOverlay.tsx` | No changes needed |
| `frontend/src/store/themeStore.ts` | Theme system unaffected |
| `frontend/src/pages/Categories.tsx` | Budget page unaffected |
| `frontend/src/pages/Login.tsx` | Login UI unchanged |
| `frontend/src/pages/Register.tsx` | Register UI unchanged (profile setup happens post-registration) |

### Existing Code to Reuse

| What | Where | How |
|---|---|---|
| Button component | `frontend/src/components/ui/Button.tsx` | All new action buttons |
| Input component | `frontend/src/components/ui/Input.tsx` | Search, profile form, comment input |
| API singleton | `frontend/src/lib/api.ts` | All new API calls |
| Skeleton loader pattern | `frontend/src/pages/Friends.tsx` | Replicate for feed, notifications |
| Error banner pattern | `frontend/src/pages/Friends.tsx` (AlertCircle) | Replicate for all new pages |
| Container card CSS | `frontend/src/index.css` | All new cards use `container-card` class |
| Animation classes | `frontend/src/index.css` | `animate-fadeInFast`, `animate-slideUpIn`, etc. |
| Currency formatter | `frontend/src/pages/Dashboard.tsx` (fmt function) | Extract to shared utility |

### New Dependencies

| Package | Purpose | Justification |
|---|---|---|
| `@supabase/supabase-js` | Supabase Storage client for avatar uploads | User chose Supabase Storage; already using Supabase Postgres |
| `multer` + `@types/multer` | Multipart form data parsing for file uploads | Standard Express file upload middleware |
| `sharp` | Server-side image resizing (256×256) before storage | Optimizes avatar storage and load time |
| `qrcode` + `@types/qrcode` | Generate QR code data URLs server-side | User chose server-side generation |
| `web-push` | Send browser push notifications via VAPID | Required for push notification feature |
| `react-intersection-observer` | Infinite scroll trigger detection | Lightweight (2KB), avoids manual IntersectionObserver boilerplate |

---

## Acceptance Criteria

- [ ] **GIVEN** a new user registers, **WHEN** registration completes, **THEN** a default `@username` is generated from email prefix and default `PrivacySettings` row is created.
- [ ] **GIVEN** a user visits `/settings/profile`, **WHEN** they upload an avatar image ≤5MB, **THEN** the image is resized to 256×256, stored in Supabase Storage, and the profile displays the new avatar.
- [ ] **GIVEN** a user searches for "ardiel" in the Discover tab, **WHEN** a user with that username exists and is not blocked/hidden, **THEN** they appear in search results with correct relationship status.
- [ ] **GIVEN** User A sends a friend request to User B, **WHEN** User B views the Requests tab, **THEN** they see the request with Accept/Decline buttons and receive an in-app + push notification.
- [ ] **GIVEN** User B accepts User A's request, **WHEN** acceptance completes, **THEN** both appear in each other's My Friends tab, a Friendship row exists, and User A receives a notification.
- [ ] **GIVEN** a user creates an expense, **WHEN** the transaction succeeds, **THEN** a feed post is auto-generated and visible to their friends.
- [ ] **GIVEN** a user views the Feed page, **WHEN** they scroll to the bottom, **THEN** the next 20 posts load automatically (infinite scroll).
- [ ] **GIVEN** a user clicks 👍 on a feed post, **WHEN** the reaction is toggled, **THEN** the count updates optimistically and the post author receives a notification.
- [ ] **GIVEN** a user blocks another user, **WHEN** the block completes, **THEN** the friendship is removed, all mutual data is hidden, search is suppressed, and the event is logged to AuditLog.
- [ ] **GIVEN** a user sets debtVisibility to PRIVATE, **WHEN** friends view the feed, **THEN** that user's expense amounts are hidden from feed posts.
- [ ] **GIVEN** a user has a ghost profile for "John", **WHEN** they click "Link to Real User" and select a registered user, **THEN** the ghost is associated with the real account and historical ledger data transfers.
- [ ] **GIVEN** push notifications are enabled, **WHEN** a notification event fires, **THEN** the browser displays a push notification with correct title, body, and click action.
- [ ] All new backend code passes `npx tsc --noEmit` with zero errors.
- [ ] All new frontend code passes `npm run build` with zero errors.
- [ ] All new pages follow the Soft Geometry design system (Sora headings, DM Sans body, CSS tokens).

---

## Edge Cases & Error Handling

| Scenario | Expected Behavior |
|---|---|
| User uploads a 10MB avatar | Server rejects with 413; frontend shows "File must be under 5MB" |
| User picks a taken username | Debounced check shows "Username taken" inline; save blocked |
| User sends request to someone who already sent them one | Auto-accept — mutual intent creates friendship immediately |
| User tries to send request to blocked user | 404 — blocked user is invisible |
| 1000+ notifications | Oldest auto-pruned to 200; pagination prevents UI overload |
| Feed post references a deleted transaction | Post remains but "View Split" button shows "Transaction no longer available" |
| User unfriends someone mid-expense | Historical ledger entries remain; shared balance visibility revoked; ghost profile auto-created for continuity |
| Network failure during friend accept | Optimistic UI reverts; error toast shown; user can retry |
| Concurrent friend requests (race condition) | DB unique constraint `[senderId, receiverId]` prevents duplicates; second request returns 400 |
| Push subscription expires | `web-push` returns 410 Gone; subscription row auto-deleted silently |
| User with HIDDEN profile is directly linked | Profile returns 404 — same as non-existent user |
| Empty search query | No API call; show default state |
| Comment with only whitespace | Server trims and rejects with 400 |

---

## Security Considerations

- [ ] **Input validation:** Username (3–30 chars, alphanumeric+underscore), bio (max 160), comment (max 500), location (max 100), emoji (whitelist only).
- [ ] **Authorization:** All endpoints require `requireAuth`. Friendship/request actions validate that the acting user is a party to the relationship. Block/report validate target exists.
- [ ] **File upload validation:** Server-side MIME type check (`image/jpeg`, `image/png`, `image/webp`), file size check (≤5MB), filename sanitization.
- [ ] **Rate limiting:** Friend request sending: max 20 per hour. Search: max 60 per minute. Comment posting: max 30 per minute. (Implement via simple in-memory counter or express-rate-limit.)
- [ ] **Data exposure:** Public profile endpoint never returns email for non-friends. Block status is never revealed (blocked = 404). Password hash never included in any response.
- [ ] **XSS prevention:** All user-generated text (bio, comments, display name) is stored as plain text and rendered via React's JSX escaping (no `dangerouslySetInnerHTML`).
- [ ] **VAPID keys:** Private key stored in `.env` only, never exposed to frontend. Public key sent to frontend via API endpoint or env variable.

---

## Performance Considerations

- **Feed query:** Uses cursor-based pagination (keyed on `createdAt` + `id`) for consistent O(1) page loads regardless of dataset size.
- **Friend balance aggregation:** Reuses existing `getBalances` logic from `transactionController.ts`; called per-friend in list view — consider caching if >50 friends.
- **Avatar optimization:** Images resized to 256×256 server-side before Supabase upload. Supabase CDN handles delivery.
- **Notification polling:** Frontend polls `GET /notifications/unread-count` every 30s — lightweight endpoint returning single integer.
- **Push notifications:** Sent asynchronously after notification creation; failures don't block the primary action.
- **Database indexes:** Add index on `friend_requests(sender_id)`, `friend_requests(receiver_id)`, `friendships(user_a_id)`, `friendships(user_b_id)`, `feed_posts(user_id, created_at)`, `notifications(recipient_id, read, created_at)`, `blocked_users(blocker_id)`, `blocked_users(blocked_id)`.
- **Bundle size impact:** `react-intersection-observer` adds ~2KB gzipped. No other heavy frontend deps.

---

## Out of Scope (Explicit Exclusions)

- **Real-time updates** (WebSocket/SSE) — polling-based for V1; real-time is a follow-up
- **Email sending** for invitations — stubbed, logs to console; wire to Resend/SendGrid later
- **Admin panel** for reviewing reported users — reports log to `AuditLog` only
- **Group splits** (3+ person expense splitting) — current engine handles 2-party only
- **Rich media** in feed posts (images/attachments) — text descriptions only
- **Chat / direct messaging** between friends
- **Notification sound customization**
- **Profile cover photos** — avatar only for V1
- **Activity status** (online/offline indicators)
- **Friend suggestions** algorithm — manual search only for V1

---

## Environment Variables to Add

```env
# Supabase Storage
SUPABASE_URL=https://qqujehuulsdnoakzwneq.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# Web Push (VAPID)
VAPID_PUBLIC_KEY=generate-via-npx-web-push-generate-vapid-keys
VAPID_PRIVATE_KEY=generate-via-npx-web-push-generate-vapid-keys
VAPID_EMAIL=mailto:your-email@example.com

# Frontend URL (for QR codes)
FRONTEND_URL=http://localhost:5173
```
