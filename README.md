# BudgetBarkada (Hybrid Ledger)

>
> ⚠️ If this documentation doesn't match the code, the CODE is the source of truth. Please update these docs. |  Last verified: June 21, 2026

---

A comprehensive, dual-entry financial ledger application that tracks personal budgets while securely processing cross-user split expenses and settlements. The application features a real-time social activity feed with emoji reactions and comment threading, an automated push notification system, custom QR-code sharing for user profiles, and a robust gamification system containing active user streaks, group challenges, badges, and unlockable avatar frames.

---

## 🏛️ Architecture Overview

The project is designed as a decoupled monorepo structured around two primary layers:

### 1. Frontend Client (V1 UI Context)
- **Framework:** React SPA bootstrapped with Vite, TypeScript, Tailwind CSS, and Zustand for global state management.
- **Routing:** Layout-based protected views, lazy-loaded page components, and dynamic route protection matching user session states.
- **Design & UX:** High-contrast, mobile-first, premium interface styled after modern fintech and consumer applications, complete with interactive modals, custom status dashboards, and equipment screens for avatar frames.

### 2. Backend Engine (V2 Engine Context)
- **Framework:** Node.js/Express REST API written in TypeScript.
- **ORM & Database:** Prisma ORM connected to a transactional PostgreSQL database instance.
- **Core Operations:** Strictly typed, ACID-compliant ledger transaction engine. When split expenses are submitted, the backend executes atomic database transactions to ensure dual-entry ledger impacts (payables, receivables, budget deductions) update in synchronization.
- **Uploads & Images:** Handles profile avatar uploads, processes them on-the-fly with `sharp` (converting uploaded files into optimized 256x256 WebP formats), and stores them as Base64 Data URLs.

---

## 🛠️ Core Technologies & Dependencies

| Category | Technology / Library | Version | Description |
| :--- | :--- | :--- | :--- |
| **Frontend Core** | [React](https://react.dev/) | `^19.2.4` | Component framework |
| **Frontend Router** | [React Router DOM](https://reactrouter.com/) | `^7.14.1` | Application routing |
| **State Management**| [Zustand](https://github.com/pmndrs/zustand) | `^5.0.12` | Lightweight state store |
| **Backend Core** | [Express](https://expressjs.com/) | `^4.19.2` | REST API framework |
| **Database Client**| [Prisma ORM](https://www.prisma.io/) | `^7.8.0` | Next-generation Node.js & TypeScript ORM |
| **Database** | [PostgreSQL](https://www.postgresql.org/) | `>=15` | Relational transactional database |
| **Encryption** | [bcrypt](https://github.com/kelektiv/node.bcrypt.js) | `^6.0.0` | Password hashing algorithm |
| **Auth Token** | [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken) | `^9.0.3` | Session token validation |
| **Image Handler** | [sharp](https://github.com/lovell/sharp) | `^0.34.5` | High-performance image processing |
| **QR Code Maker** | [qrcode](https://github.com/soldair/node-qrcode) | `^1.5.4` | Profile sharing QR code generator |
| **Push Gateway** | [web-push](https://github.com/web-push-libs/web-push) | `^3.6.7` | Standard push notification gateway |
| **Upload Handler** | [multer](https://github.com/expressjs/multer) | `^2.1.1` | Multipart request parser |

---

## ⚡ Local Development Setup

### 📋 Prerequisites
- **Node.js:** `>=20.x`
- **Database:** An active PostgreSQL database (local or hosted e.g., Supabase)

### 1. Repository Setup & Installations
Clone the repository and install the dependencies inside both workspaces:

```bash
# Clone the repository
git clone https://github.com/arjeldru-dev/CRUDproject.git
cd CRUDproject

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Environment Configuration

#### Backend Configuration
Create a `.env` file in the `backend/` directory:
```env
PORT=5000
DATABASE_URL="postgresql://<username>:<password>@localhost:5432/<dbname>?schema=public"
DIRECT_URL="postgresql://<username>:<password>@localhost:5432/<dbname>"
JWT_SECRET="your_secure_random_jwt_secret_token_here"

# Web Push Keys (Generate with: npx web-push generate-vapid-keys)
VAPID_PUBLIC_KEY="your_public_vapid_key"
VAPID_PRIVATE_KEY="your_private_vapid_key"
VAPID_EMAIL="mailto:your_email@example.com"

# Public domain fallback for QR Code generation (defaults to https://budgetbarkada.vercel.app)
FRONTEND_URL="http://localhost:5173"
```

#### Frontend Configuration
Create a `.env` file in the `frontend/` directory:
```env
VITE_API_BASE_URL="http://localhost:5000/api"
VITE_VAPID_PUBLIC_KEY="your_public_vapid_key"
```

### 3. Database Initialization & Seeding
Apply the database schema definitions and seed the gamification metadata (Badges and CSS Avatar frame border assets):

```bash
cd backend

# Push the Prisma schema definitions directly to the DB
npx prisma db push

# Seed gamification resources (Badges and Avatar border CSS frames)
npm run seed:gamification
```

### 4. Running the Development Servers
Open two terminal windows/tabs to launch the frontend and backend servers in parallel:

**Terminal 1 (Backend API Engine):**
```bash
cd backend
npm run dev
# Server boots on: http://localhost:5000
```

**Terminal 2 (Frontend React App):**
```bash
cd frontend
npm run dev
# Client boots on: http://localhost:5173
```

---

## 🗄️ Database Schema & Models Reference

The relational database layer managed by Prisma consists of 19 models:

- **`User`:** Holds authentication credentials and public profile metadata (username, display name, bio, location, avatarUrl).
- **`FriendRequest`:** Tracks incoming/outgoing peer friendship requests and their state (`PENDING`, `ACCEPTED`, `DECLINED`).
- **`Friendship`:** Direct relationship records mapping linked users.
- **`FriendProfile`:** Used for tracking ledger balances. Maps either a registered user on the platform or an offline placeholder ghost client (`isGhost: true`).
- **`Category`:** Budget categories with customizable spending limits.
- **`Transaction`:** Base record of ledger activity. Can be an `EXPENSE`, `SETTLEMENT`, or `TOP_UP`.
- **`LedgerEntry`:** Atomic accounting lines mapping amount changes to user balances. Classified as `PAYABLE` (debt), `RECEIVABLE` (credit), or `BUDGET_DEDUCTION` (personal budget).
- **`FeedPost`:** Social updates shared on the activity feed (e.g., budget alerts, splits, streaks, badge unlocks, challenges).
- **`Reaction`:** Emojis reacted to feed posts.
- **`Comment`:** Written comments on feed posts. Supports nested threaded replies (`parentId`) and like counts.
- **`CommentLike`:** Tracks unique likes on comments.
- **`PrivacySettings`:** Access controls for profile, debt, and budget visibility constraints (`PUBLIC`, `FRIENDS_ONLY`, `PRIVATE`).
- **`BlockedUser`:** Handles account blocks between users, restricting search visibility and requests.
- **`Notification`:** System notifications (unlocked badges, streaks, split requests, settlements) with support for Web Push subscription syncing.
- **`PushSubscription`:** Stored headers and endpoint credentials for dispatching browser push notifications.
- **`AuditLog`:** Audit trails tracking administrative or sensitive database activities.
- **`UserGamification`:** Gamification profile holding current streaks, longest streaks, last streak dates, total points, and equipped CSS avatar frames.
- **`Badge` / `UserBadge`:** Defined achievements and the list of users who unlocked them.
- **`AvatarFrame`:** Collectible custom CSS borders unlocked using points.
- **`Challenge` / `ChallengeParticipant`:** Active or historical group spending challenges (e.g., transport saving, coffee-free weeks).
- **`PendingTransaction`:** Split expense requests awaiting approval or rejection from a peer.

---

## 📡 API Surface Reference

All endpoints are prefixed with `/api`. Protected routes require a valid JWT header (`Authorization: Bearer <token>`).

### 🔑 Authentication (`/api/auth`)
| Method | Path | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Creates a new account. | Public |
| `POST` | `/api/auth/login` | Authenticates user and returns a JWT. | Public |
| `GET` | `/api/auth/me` | Fetches session credentials. | Protected |

### 👤 Profile Management (`/api/profile`)
| Method | Path | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/profile/me` | Retrieves the logged-in user's profile details. | Protected |
| `PUT` | `/api/profile/me` | Updates profile fields (displayName, bio, location, username). | Protected |
| `POST` | `/api/profile/avatar` | Uploads an avatar image (processes through Multer/Sharp to WebP). | Protected |
| `GET` | `/api/profile/:userId/qr` | Generates a sharing QR code mapping to the user profile URL. | Protected |
| `GET` | `/api/profile/:username` | Retrieves public profile data by username. | Protected |

### 👥 Friends & Requests (`/api/friends`)
| Method | Path | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/friends/` | Registers a legacy ghost client profile. | Protected |
| `GET` | `/api/friends/` | Lists legacy ghost client profiles. | Protected |
| `DELETE`| `/api/friends/ghost/:id` | Deletes a ghost profile. | Protected |
| `GET` | `/api/friends/search` | Searches other users by username. | Protected |
| `POST` | `/api/friends/request` | Sends a friend request to another user. | Protected |
| `GET` | `/api/friends/requests/received` | Lists received pending friend requests. | Protected |
| `GET` | `/api/friends/requests/sent` | Lists sent pending friend requests. | Protected |
| `POST` | `/api/friends/request/:id/accept` | Accepts a pending friend request. | Protected |
| `POST` | `/api/friends/request/:id/decline` | Declines a pending friend request. | Protected |
| `DELETE`| `/api/friends/request/:id/cancel` | Cancels a sent friend request. | Protected |
| `GET` | `/api/friends/list` | Returns a list of active friends and balances. | Protected |
| `POST` | `/api/friends/ghost/:id/claim` | Claims/merges a ghost profile with a newly registered user account. | Protected |
| `POST` | `/api/friends/invite` | Sends a friend invite to an email address. | Protected |
| `DELETE`| `/api/friends/:friendshipId` | Removes an active friendship connection. | Protected |
| `POST` | `/api/friends/block/:userId` | Blocks a user. | Protected |
| `POST` | `/api/friends/report/:userId` | Submits a moderation report on a user. | Protected |

### 💰 Budget Categories (`/api/categories`)
| Method | Path | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/categories` | Lists all personal spending categories and limits. | Protected |
| `POST` | `/api/categories` | Creates a new category with a monthly limit. | Protected |
| `PUT` | `/api/categories/:id` | Updates a category name and monthly limit. | Protected |
| `DELETE`| `/api/categories/:id` | Deletes a category. | Protected |

### 📊 Transactions & Ledger (`/api/transactions`)
| Method | Path | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/transactions` | Creates an expense split (computes ledger entries). | Protected |
| `POST` | `/api/transactions/settle` | Records a settlement transaction between friends. | Protected |
| `POST` | `/api/transactions/topup` | Records a personal budget top-up. | Protected |
| `GET` | `/api/transactions/balances` | Retrieves current balance summaries. | Protected |
| `GET` | `/api/transactions/budget` | Returns monthly progress metrics for spending categories. | Protected |
| `GET` | `/api/transactions/pending` | Lists split requests awaiting your response. | Protected |
| `POST` | `/api/transactions/pending/:id/respond`| Approves or rejects a pending split transaction. | Protected |

### 📝 Social Feed (`/api/feed`)
| Method | Path | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/feed` | Retrieves the activity feed with cursor-based pagination. | Protected |
| `GET` | `/api/feed/:postId/comments` | Retrieves chronological comments under a post. | Protected |
| `POST` | `/api/feed/:postId/react` | Adds/toggles an emoji reaction (`👍`, `❤️`, `🔥`, `😮`, `🏆`, `🙏`). | Protected |
| `POST` | `/api/feed/:postId/comment` | Appends a comment/threaded reply (max 500 characters). | Protected |
| `POST` | `/api/feed/comment/:commentId/like` | Likes/toggles a comment like. | Protected |
| `DELETE`| `/api/feed/comment/:commentId` | Deletes your own comment. | Protected |
| `DELETE`| `/api/feed/:postId` | Deletes your own feed post. | Protected |
| `PATCH` | `/api/feed/:postId` | Updates the message text of a post. | Protected |
| `PATCH` | `/api/feed/:postId/privacy` | Toggles the visibility state of a feed post (Public/Private). | Protected |

### 🏆 Gamification (`/api/gamification`)
| Method | Path | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/gamification/profile` | Returns user points, streaks, badges, and active frame. | Protected |
| `PUT` | `/api/gamification/frame` | Equips a purchased/unlocked CSS avatar frame. | Protected |
| `GET` | `/api/gamification/leaderboard` | Returns point-based friend rankings. | Protected |
| `GET` | `/api/gamification/challenges` | Lists your active and historical group challenges. | Protected |
| `POST` | `/api/gamification/challenges` | Initiates a group challenge and invites friends. | Protected |
| `POST` | `/api/gamification/challenges/:id/join` | Joins a group challenge (within the active window). | Protected |
| `DELETE`| `/api/gamification/challenges/:id` | Cancels an active challenge (creator only). | Protected |

### 🔔 Notifications & Privacy Settings (`/api/notifications` & `/api/settings`)
| Method | Path | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/notifications` | Lists system notifications. | Protected |
| `GET` | `/api/notifications/unread-count`| Returns count of unread notifications. | Protected |
| `PUT` | `/api/notifications/:id/read` | Marks a specific notification as read. | Protected |
| `PUT` | `/api/notifications/read-all` | Marks all system notifications as read. | Protected |
| `POST` | `/api/notifications/push-subscribe`| Registers web push subscription credentials. | Protected |
| `DELETE`| `/api/notifications/push-subscribe`| Deregisters web push credentials. | Protected |
| `GET` | `/api/notifications/vapid-key` | Fetches server VAPID public key. | Protected |
| `GET` | `/api/settings/privacy` | Fetches active visibility toggles. | Protected |
| `PUT` | `/api/settings/privacy` | Updates profile, debt, and budget privacy levels. | Protected |
| `GET` | `/api/settings/blocked` | Lists currently blocked users. | Protected |
| `DELETE`| `/api/settings/blocked/:userId` | Unblocks a user. | Protected |

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
1. **Backend Service:** Host on platforms like Render, Railway, or Heroku. Ensure you configure your database connection string and setup migrations/seeding scripts on deployment.
2. **Frontend client:** Deploy static bundles to Vercel, Netlify, or AWS Amplify. Ensure redirection rules are defined (refer to `frontend/vercel.json` for Vite router defaults) to prevent 404 errors during client-side route transitions.
