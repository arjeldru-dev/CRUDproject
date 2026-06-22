# BudgetBarkada (Hybrid Ledger)

<p align="center">
  <a href="https://github.com/arjeldru-dev/CRUDproject">
    <img src="https://img.shields.io/github/stars/arjeldru-dev/CRUDproject?style=for-the-badge&color=2563EB" alt="GitHub stars" />
  </a>
  <a href="https://github.com/arjeldru-dev/CRUDproject/network/members">
    <img src="https://img.shields.io/github/forks/arjeldru-dev/CRUDproject?style=for-the-badge&color=10B981" alt="GitHub forks" />
  </a>
  <a href="https://github.com/arjeldru-dev/CRUDproject/issues">
    <img src="https://img.shields.io/github/issues/arjeldru-dev/CRUDproject?style=for-the-badge&color=EF4444" alt="GitHub issues" />
  </a>
  <a href="https://github.com/arjeldru-dev/CRUDproject/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/arjeldru-dev/CRUDproject?style=for-the-badge&color=7C3AED" alt="License" />
  </a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D20-green.svg?style=flat-square" alt="Node Version" />
  <img src="https://img.shields.io/badge/React-19-blue.svg?style=flat-square" alt="React 19" />
  <img src="https://img.shields.io/badge/PostgreSQL-Ready-blue?style=flat-square&logo=postgresql" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square" alt="PRs Welcome" />
</p>

---

> ⚠️ If this documentation doesn't match the code, the CODE is the source of
> truth. Please update these docs. | Last verified: June 22, 2026

---

A comprehensive, dual-entry financial ledger application that tracks personal
budgets while securely processing cross-user split expenses and settlements. The
application features a real-time social activity feed with emoji reactions and
comment threading, an automated push notification system, custom QR-code sharing
for user profiles, and a robust gamification system containing active user
streaks, group challenges, badges, and unlockable avatar frames.

---

## 📖 Step-by-Step User Guide

Welcome to **BudgetBarkada**! Follow this step-by-step guide to get started with
budgeting, splitting expenses, and challenging your friends.

### 1. Account & Profile Setup

- **Registration:** Sign up for an account. Navigate to the **Profile Settings**
  screen to customize your display name, write a bio, and add your location.
- **Custom Avatar:** Upload your profile picture on the Profile Settings page.
  The backend automatically compresses, resizes, and converts your avatar to a
  base64 WebP image for high-performance loads.
- **Scan & Add Friends via QR Code:** Every user gets a personalized,
  high-contrast **QR Code** on their profile page. Show your QR Code to your
  friends or scan theirs to instantly open their public profile page and send a
  friend request.

### 2. Creating Budget Categories & Targets

Before recording expenses, define your spending categories:

1. Navigate to the **Budget Categories** section via the sidebar navigation.
2. Click **Add Category** (on mobile) or use the **New Budget Category** form on
   the left pane.
3. Type a category name (e.g., `Dining Out`, `Groceries`, `Utilities`,
   `Transportation`, `Entertainment`).
4. Enter your **Monthly Limit** in Pesos (₱) and click **Create**.
5. _How it works:_ The application automatically parses the category name to
   assign a curated theme color and matching icon (e.g., shopping bag for
   `Groceries`, utensils for `Dining Out`, plane/car for `Transportation`).
6. _Managing Limits:_ You can edit limits inline at any time by clicking the
   **Pencil icon** or delete a category entirely by clicking the **Trash icon**
   (this will mark its transactions as uncategorized).

### 3. Recording Transactions & Splitting Expenses

To record budget activities, open the **Transaction Form Modal** (triggered via
the "+" or transaction buttons on the dashboard and transaction screens) and
fill out the details:

- **Select a Transaction Mode:**
  - **Expense:** Input daily spending. You can toggle **Solo Expense** to record
    it strictly on your personal budget, or choose friends to split the bill
    with.
  - **Settle Debt:** Select a friend to record a repayment. The system queries
    active balances and displays full receivable or payable balances to fill in
    amounts with a single click.
  - **Top-Up Budget:** Add funds directly to a category to replenish your
    available spending pool.
- **Enter the Amount & Category:** Input the total amount in Pesos and link the
  transaction to one of your created categories.
- **Configure Split Mode (for splits):**
  - _Equal:_ The total cost is split evenly among you and selected friends. The
    engine handles decimal rounding remainders automatically.
  - _Exact:_ Assign custom peso amounts to each individual. Use the **Distribute
    Equally** shortcut to pre-fill the form, then adjust each person's share.
    The form validates that the individual sums match the total amount.
- **Set Payer:** Specify who paid the initial bill (defaults to yourself).
- **Optional Details & Privacy:** Add a memo message (e.g., "Samgyupsal Night
  Out") and toggle the **Private Post** switch if you want to hide transaction
  details (like the total split amounts) from public feeds.
- **Confirmation:** Press **Submit**. A premium animated Success Overlay will
  confirm the transaction has been securely calculated and recorded in the
  database.

### 4. Adding Friends & Moderation

- **Adding Real Users:** Search for active users by typing their usernames in
  the search bar on the **Friends** page, and click **Send Friend Request**.
  Once accepted, they appear in your active friends listing.
- **Blocking & Moderation:** Protect your privacy by utilizing the **Block
  User** or **Report User** triggers on a friend's profile.

### 5. Joining Group Challenges & Gamification

Budgeting is more fun when done together. Leverage gamification to build
discipline:

- **Creating a Challenge:** On the **Challenges** page, click **Challenge
  Friends** or choose **Duel** next to a friend in your sidebar. Select a
  challenge template (e.g., `Coffee-Free Week`, `No Overspend Week`,
  `Transport Saver`, or `Custom`), set the duration (up to 31 days), and invite
  up to 10 friends. Invited friends will receive system and push notifications.
- **Joining a Challenge:** Navigate to the **Active Challenges** tab. Under
  **Pending Invitations**, accept the challenge invitation within 24 hours of
  the start date.
- **How to Win:** The system monitors your transactions during the challenge
  window. If you exceed the budget limit of the linked category, you fail the
  challenge. Stay within budget to succeed!
- **Earn XP & Badges:** Successful challenges and maintaining daily login
  streaks award points (XP) and unlock badges (e.g., `Streak Milestone`,
  `Social Butterfly`).
- **Equip Avatar Frames:** Use your earned points to unlock premium CSS-styled
  **Avatar Frames** in the **Badges & Frames** tab. Equip them to customize your
  avatar border across the dashboard, feed, and friend leaderboards.

### 6. Social Interaction on the Activity Feed

- **Feed Updates:** View a chronological updates feed showing when friends split
  expenses, complete challenges, maintain streaks, or unlock rare badges.
- **Reactions & Comments:** Double-tap or select emoji buttons (`👍`, `❤️`,
  `🔥`, `😮`, `🏆`, `🙏`) to react to updates. Click on any feed post to open
  the comments drawer, add thoughts, or reply to threaded discussions.
- **Privacy Filters:** The feed automatically respects user privacy levels
  (e.g., hiding exact debt details if a user's privacy visibility is set to
  `PRIVATE`).

---

## 🏛️ Monorepo Structure

The project is designed as a decoupled monorepo structured around two primary
layers:

### 1. Frontend Client (V1 UI Context)

- **Framework:** React SPA bootstrapped with Vite, TypeScript, Tailwind CSS, and
  Zustand for global state management.
- **Routing:** Layout-based protected views, lazy-loaded page components, and
  dynamic route protection matching user session states.
- **Design & UX:** High-contrast, mobile-first, premium interface styled after
  modern fintech and consumer applications, complete with interactive modals,
  custom status dashboards, and equipment screens for avatar frames.

### 2. Backend Engine (V2 Engine Context)

- **Framework:** Node.js/Express REST API written in TypeScript.
- **ORM & Database:** Prisma ORM connected to a transactional PostgreSQL
  database instance.
- **Core Operations:** Strictly typed, ACID-compliant ledger transaction engine.
  When split expenses are submitted, the backend executes atomic database
  transactions to ensure dual-entry ledger impacts (payables, receivables,
  budget deductions) update in synchronization.
- **Uploads & Images:** Handles profile avatar uploads, processes them
  on-the-fly with `sharp` (converting uploaded files into optimized 256x256 WebP
  formats), and stores them as Base64 Data URLs.

---

## 🗄️ Database Schema & Models Reference

The relational database layer managed by Prisma consists of 19 models:

- **`User`:** Holds authentication credentials and public profile metadata
  (username, display name, bio, location, avatarUrl).
- **`FriendRequest`:** Tracks incoming/outgoing peer friendship requests and
  their state (`PENDING`, `ACCEPTED`, `DECLINED`).
- **`Friendship`:** Direct relationship records mapping linked users.
- **`FriendProfile`:** Used for tracking ledger balances. Maps a registered user on the platform.
- **`Category`:** Budget categories with customizable spending limits.
- **`Transaction`:** Base record of ledger activity. Can be an `EXPENSE`,
  `SETTLEMENT`, or `TOP_UP`.
- **`LedgerEntry`:** Atomic accounting lines mapping amount changes to user
  balances. Classified as `PAYABLE` (debt), `RECEIVABLE` (credit), or
  `BUDGET_DEDUCTION` (personal budget).
- **`FeedPost`:** Social updates shared on the activity feed (e.g., budget
  alerts, splits, streaks, badge unlocks, challenges).
- **`Reaction`:** Emojis reacted to feed posts.
- **`Comment`:** Written comments on feed posts. Supports nested threaded
  replies (`parentId`) and like counts.
- **`CommentLike`:** Tracks unique likes on comments.
- **`PrivacySettings`:** Access controls for profile, debt, and budget
  visibility constraints (`PUBLIC`, `FRIENDS_ONLY`, `PRIVATE`).
- **`BlockedUser`:** Handles account blocks between users, restricting search
  visibility and requests.
- **`Notification`:** System notifications (unlocked badges, streaks, split
  requests, settlements) with support for Web Push subscription syncing.
- **`PushSubscription`:** Stored headers and endpoint credentials for
  dispatching browser push notifications.
- **`AuditLog`:** Audit trails tracking administrative or sensitive database
  activities.
- **`UserGamification`:** Gamification profile holding current streaks, longest
  streaks, last streak dates, total points, and equipped CSS avatar frames.
- **`Badge` / `UserBadge`:** Defined achievements and the list of users who
  unlocked them.
- **`AvatarFrame`:** Collectible custom CSS borders unlocked using points.
- **`Challenge` / `ChallengeParticipant`:** Active or historical group spending
  challenges (e.g., transport saving, coffee-free weeks).
- **`PendingTransaction`:** Split expense requests awaiting approval or
  rejection from a peer.

---

## 📡 API Surface Reference

All endpoints are prefixed with `/api`. Protected routes require a valid JWT
header (`Authorization: Bearer <token>`).

### 🔑 Authentication (`/api/auth`)

| Method | Path                 | Description                           | Access    |
| :----- | :------------------- | :------------------------------------ | :-------- |
| `POST` | `/api/auth/register` | Creates a new account.                | Public    |
| `POST` | `/api/auth/login`    | Authenticates user and returns a JWT. | Public    |
| `GET`  | `/api/auth/me`       | Fetches session credentials.          | Protected |

### 👤 Profile Management (`/api/profile`)

| Method | Path                      | Description                                                       | Access    |
| :----- | :------------------------ | :---------------------------------------------------------------- | :-------- |
| `GET`  | `/api/profile/me`         | Retrieves the logged-in user's profile details.                   | Protected |
| `PUT`  | `/api/profile/me`         | Updates profile fields (displayName, bio, location, username).    | Protected |
| `POST` | `/api/profile/avatar`     | Uploads an avatar image (processes through Multer/Sharp to WebP). | Protected |
| `GET`  | `/api/profile/:userId/qr` | Generates a sharing QR code mapping to the user profile URL.      | Protected |
| `GET`  | `/api/profile/:username`  | Retrieves public profile data by username.                        | Protected |

### 👥 Friends & Requests (`/api/friends`)

| Method   | Path                               | Description                                                         | Access    |
| :------- | :--------------------------------- | :------------------------------------------------------------------ | :-------- |
| `GET`    | `/api/friends/search`              | Searches other users by username.                                   | Protected |
| `POST`   | `/api/friends/request`             | Sends a friend request to another user.                             | Protected |
| `GET`    | `/api/friends/requests/received`   | Lists received pending friend requests.                             | Protected |
| `GET`    | `/api/friends/requests/sent`       | Lists sent pending friend requests.                                 | Protected |
| `POST`   | `/api/friends/request/:id/accept`  | Accepts a pending friend request.                                   | Protected |
| `POST`   | `/api/friends/request/:id/decline` | Declines a pending friend request.                                  | Protected |
| `DELETE` | `/api/friends/request/:id/cancel`  | Cancels a sent friend request.                                      | Protected |
| `GET`    | `/api/friends/list`                | Returns a list of active friends and balances.                      | Protected |
| `POST`   | `/api/friends/invite`              | Sends a friend invite to an email address.                          | Protected |
| `DELETE` | `/api/friends/:friendshipId`       | Removes an active friendship connection.                            | Protected |
| `POST`   | `/api/friends/block/:userId`       | Blocks a user.                                                      | Protected |
| `POST`   | `/api/friends/report/:userId`      | Submits a moderation report on a user.                              | Protected |

### 💰 Budget Categories (`/api/categories`)

| Method   | Path                  | Description                                        | Access    |
| :------- | :-------------------- | :------------------------------------------------- | :-------- |
| `GET`    | `/api/categories`     | Lists all personal spending categories and limits. | Protected |
| `POST`   | `/api/categories`     | Creates a new category with a monthly limit.       | Protected |
| `PUT`    | `/api/categories/:id` | Updates a category name and monthly limit.         | Protected |
| `DELETE` | `/api/categories/:id` | Deletes a category.                                | Protected |

### 📊 Transactions & Ledger (`/api/transactions`)

| Method | Path                                    | Description                                               | Access    |
| :----- | :-------------------------------------- | :-------------------------------------------------------- | :-------- |
| `POST` | `/api/transactions`                     | Creates an expense split (computes ledger entries).       | Protected |
| `POST` | `/api/transactions/settle`              | Records a settlement transaction between friends.         | Protected |
| `POST` | `/api/transactions/topup`               | Records a personal budget top-up.                         | Protected |
| `GET`  | `/api/transactions/balances`            | Retrieves current balance summaries.                      | Protected |
| `GET`  | `/api/transactions/budget`              | Returns monthly progress metrics for spending categories. | Protected |
| `GET`  | `/api/transactions/pending`             | Lists split requests awaiting your response.              | Protected |
| `POST` | `/api/transactions/pending/:id/respond` | Approves or rejects a pending split transaction.          | Protected |

### 📝 Social Feed (`/api/feed`)

| Method   | Path                                | Description                                                          | Access    |
| :------- | :---------------------------------- | :------------------------------------------------------------------- | :-------- |
| `GET`    | `/api/feed`                         | Retrieves the activity feed with cursor-based pagination.            | Protected |
| `GET`    | `/api/feed/:postId/comments`        | Retrieves chronological comments under a post.                       | Protected |
| `POST`   | `/api/feed/:postId/react`           | Adds/toggles an emoji reaction (`👍`, `❤️`, `🔥`, `😮`, `🏆`, `🙏`). | Protected |
| `POST`   | `/api/feed/:postId/comment`         | Appends a comment/threaded reply (max 500 characters).               | Protected |
| `POST`   | `/api/feed/comment/:commentId/like` | Likes/toggles a comment like.                                        | Protected |
| `DELETE` | `/api/feed/comment/:commentId`      | Deletes your own comment.                                            | Protected |
| `DELETE` | `/api/feed/:postId`                 | Deletes your own feed post.                                          | Protected |
| `PATCH`  | `/api/feed/:postId`                 | Updates the message text of a post.                                  | Protected |
| `PATCH`  | `/api/feed/:postId/privacy`         | Toggles the visibility state of a feed post (Public/Private).        | Protected |

### 🏆 Gamification (`/api/gamification`)

| Method   | Path                                    | Description                                             | Access    |
| :------- | :-------------------------------------- | :------------------------------------------------------ | :-------- |
| `GET`    | `/api/gamification/profile`             | Returns user points, streaks, badges, and active frame. | Protected |
| `PUT`    | `/api/gamification/frame`               | Equips a purchased/unlocked CSS avatar frame.           | Protected |
| `GET`    | `/api/gamification/leaderboard`         | Returns point-based friend rankings.                    | Protected |
| `GET`    | `/api/gamification/challenges`          | Lists your active and historical group challenges.      | Protected |
| `POST`   | `/api/gamification/challenges`          | Initiates a group challenge and invites friends.        | Protected |
| `POST`   | `/api/gamification/challenges/:id/join` | Joins a group challenge (within the active window).     | Protected |
| `DELETE` | `/api/gamification/challenges/:id`      | Cancels an active challenge (creator only).             | Protected |

### 🔔 Notifications & Privacy Settings (`/api/notifications` & `/api/settings`)

| Method   | Path                                | Description                                       | Access    |
| :------- | :---------------------------------- | :------------------------------------------------ | :-------- |
| `GET`    | `/api/notifications`                | Lists system notifications.                       | Protected |
| `GET`    | `/api/notifications/unread-count`   | Returns count of unread notifications.            | Protected |
| `PUT`    | `/api/notifications/:id/read`       | Marks a specific notification as read.            | Protected |
| `PUT`    | `/api/notifications/read-all`       | Marks all system notifications as read.           | Protected |
| `POST`   | `/api/notifications/push-subscribe` | Registers web push subscription credentials.      | Protected |
| `DELETE` | `/api/notifications/push-subscribe` | Deregisters web push credentials.                 | Protected |
| `GET`    | `/api/notifications/vapid-key`      | Fetches server VAPID public key.                  | Protected |
| `GET`    | `/api/settings/privacy`             | Fetches active visibility toggles.                | Protected |
| `PUT`    | `/api/settings/privacy`             | Updates profile, debt, and budget privacy levels. | Protected |
| `GET`    | `/api/settings/blocked`             | Lists currently blocked users.                    | Protected |
| `DELETE` | `/api/settings/blocked/:userId`     | Unblocks a user.                                  | Protected |

---

## 🚀 Production Deployment

### Bundling

To build the optimized production builds for both modules:

```bash
# Build Backend (compiles TypeScript to dist/)
cd backend
npm run build

# Build Frontend (generates optimized client bundle in dist/)
cd ../frontend
npm run build
```

### Hosting Recommendations

1. **Backend Service:** Host on platforms like Render, Railway, or Heroku.
   Ensure you configure your database connection string and setup
   migrations/seeding scripts on deployment.
2. **Frontend client:** Deploy static bundles to Vercel, Netlify, or AWS
   Amplify. Ensure redirection rules are defined (refer to
   `frontend/vercel.json` for Vite router defaults) to prevent 404 errors during
   client-side route transitions.
