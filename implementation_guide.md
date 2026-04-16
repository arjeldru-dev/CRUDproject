# Hybrid Ledger — Implementation Guide

This document serves as the master blueprint for the AI executing agent (or any senior developer) to build the Hybrid Ledger application from scratch. It is grouped into 9 linear phases covering full-stack completion, mapped strictly against the MVP product spec.

*Do not proceed to the next phase until the Verification Checklist of the current phase is fully checked.*

---

# Phase 0: Project Scaffolding & Tooling

## Context
Initializes the monorepo-style structure, setting up the isolated backend (Node.js/Express) and frontend (React/Tailwind) workspaces. This lays the groundwork for the decoupled API architecture while ensuring the coding standards (TypeScript, routing) are embedded from the very first commit.

## Skills to Load
Before starting this phase, load these skill files from `.agent/skills/skills/[skill-id]/SKILL.md`:
- `clean-code` — Establishes core coding standards that must be respected across both apps.
- `cc-skill-coding-standards` — Enforces strict TypeScript/JS conventions.
- `environment-setup-guide` — Best practices for managing `.env` files in isolated directories.

## Prerequisites
- Node.js (v20+) and `npm` installed.
- Project root directory (`d:\CRUD`) exists.

## Directory Structure
```text
d:\CRUD\
├── .gitignore
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   └── server.ts
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
└── frontend/
    ├── src/
    │   ├── components/
    │   ├── pages/
    │   └── App.tsx
    ├── .env.example
    ├── index.html
    ├── package.json
    ├── tailwind.config.js
    └── tsconfig.json
```

## Instructions

### Step 0.1: Initialize Root & Backend Workspace
**File:** `backend/package.json` & `backend/tsconfig.json` — CREATE
**Purpose:** Scaffolds the Express backend equipped with strict TypeScript.
**Details:**
- Create a global `.gitignore` at the root ignoring `node_modules` and `.env`.
- Create the `backend/` directory.
- Initialize `backend/package.json`. Define `main` as `src/server.ts`.
- Install dependencies: `express`, `cors`, `helmet`, `dotenv`.
- Install dev dependencies: `typescript`, `@types/node`, `@types/express`, `@types/cors`, `ts-node`, `nodemon`.
- Create `tsconfig.json` enabling `strict` mode, targeting `ES2022`, with `outDir` set to `dist/`.
- Add backend NPM scripts: `"start": "node dist/server.js"`, `"dev": "nodemon src/server.ts"`, `"build": "tsc"`.

### Step 0.2: Improvise Basic Express Server
**File:** `backend/src/server.ts` — CREATE
**Purpose:** Establishes the API entry point with base security middlewares.
**Details:**
- Import `express`, `cors`, `helmet`, and `dotenv`.
- Call `dotenv.config()`.
- Apply middlewares: `cors({ credentials: true, origin: true })`, `helmet()` for standard HTTP security headers, and `express.json()` for parsing.
- Add a health check route `GET /api/health` that returns standard JSON: `{ status: 'ok', service: 'Hybrid Ledger API' }`.
- Read `process.env.PORT` (fallback `5000`). Start the server gracefully, logging to the console.

### Step 0.3: Initialize Frontend Workspace
**File:** `frontend/package.json` — CREATE via Scaffolding
**Purpose:** Scaffolds the React application natively using Vite.
**Details:**
- Use Vite to scaffold the frontend: `npx create-vite@latest frontend --template react-ts`. Wait for execution.
- CD into `frontend/` and run `npm install`.
- Install core UI/routing/data dependencies: `react-router-dom`, `axios`, `lucide-react`.
- Install Tailwind CSS: `tailwindcss`, `postcss`, `autoprefixer`.
- Initialize Tailwind (`npx tailwindcss init -p`).
- Configure `tailwind.config.js` to scan `./index.html` and `./src/**/*.{js,ts,jsx,tsx}`.
- Replace the contents of `src/index.css` with the Tailwind base/components/utilities directives.
- Modify `src/App.tsx` into a functional component rendering a simple text: "Hybrid Ledger MVP" with Tailwind styling for validation.

### Step 0.4: Environment Configuration Setup
**Files:** `backend/.env.example` & `frontend/.env.example` — CREATE
**Purpose:** Sets up environment variable templates.
**Details:**
- Inside `backend/.env.example`, define `PORT=5000` and placeholders for PostgreSQL connection strings.
- Inside `frontend/.env.example`, define `VITE_API_BASE_URL=http://localhost:5000/api`.

## Verification Checklist
- [ ] Running `npm run dev` in `backend/` starts the Express server on port 5000 without errors.
- [ ] `curl http://localhost:5000/api/health` returns the health check JSON payload.
- [ ] Running `npm run dev` in `frontend/` starts the Vite dev server.
- [ ] Visiting the frontend URL renders the Tailwind-styled title successfully.
- [ ] `npx tsc --noEmit` returns 0 compilation errors in both directories.

## Rollback Plan
- Delete the `frontend/` and `backend/` directories.
- Clear NPM cache if missing packages occur.

## Troubleshooting
| Symptom | Likely Cause | Fix |
|---|---|---|
| EADDRINUSE on backend | Port 5000 is occupied. | Change `PORT` in backend `.env` to `5001`. |
| Tailwind styles aren't applied | Missing `content` config in `tailwind.config.js`. | Update the `content` array to match `src` explicitly. |

---

# Phase 1: Database Schema & ORM

## Context
Initializes Prisma on the backend and defines the 5 main PostgreSQL entities (User, FriendProfile, Category, Transaction, Ledger_Entry). This proves out the database dependencies required for the relational dual-entry logic.

## Skills to Load
- `database-design` — Guidelines for creating accurate, normalized data schemas.
- `prisma-expert` — Synthesizing relations natively into `.prisma` with accurate nullability schemas.
- `cc-skill-backend-patterns` — Ensures structure remains query-optimal.

## Prerequisites
- Phase 0 completed.
- Access to a Supabase Postgres instance or a localized Postgres docker/binary with standard connection URL.

## Directory Structure
```text
backend/
├── prisma/
│   └── schema.prisma
├── src/
│   └── config/
│       └── db.ts
└── .env
```

## Instructions

### Step 1.1: Prisma Initialization
**File:** `backend/prisma/schema.prisma` — CREATE
**Purpose:** Sets up Prisma schema structure.
**Details:**
- Run `npx prisma init` inside the `backend/` folder.
- Ensure the `datasource db` provider is set to `postgresql`.
- Ensure `.env` includes `DATABASE_URL`. Do NOT commit real passwords; keep `.env.example` updated with mock strings.

### Step 1.2: Define the Schema Models
**File:** `backend/prisma/schema.prisma` — MODIFY
**Purpose:** Translate the data model from the spec into precise Prisma relations.
**Details:**
- **User:** `id` (uuid), `email` (unique), `password_hash`, `created_at`.
- **FriendProfile:** `id` (uuid), `main_user_id` (refs User), `friend_user_id` (refs User, nullable for Ghost Profiles), `name`, `is_ghost` (boolean). Add relation connecting `main_user_id` back to User.
- **Category:** `id` (uuid), `user_id` (refs User), `name`, `monthly_limit` (float).
- **Transaction:** `id` (uuid), `creator_id` (refs User), `category_id` (refs Category), `total_amount` (float), `type` (enum constraint: EXPENSE or SETTLEMENT). Add created_at timestamp.
- **LedgerEntry:** `id` (uuid), `transaction_id` (refs Transaction), `user_id` (refs User), `friend_profile_id` (refs FriendProfile, nullable), `amount_change` (float), `type` (enum constraint: PAYABLE, RECEIVABLE, BUDGET_DEDUCTION).
- Explicitly map relations with cascading deletion preferences rules (e.g. if User deleted, categories deleted).

### Step 1.3: Generate Client & Validate Connection
**File:** `backend/src/config/db.ts` — CREATE
**Purpose:** Instantiates the singleton database client.
**Details:**
- Run `npx prisma db push` (or `npx prisma migrate dev` if relying on migrations).
- Instantiate `PrismaClient` in `db.ts` and export it for use by all controllers.
- Add an initialization hook in `server.ts` to log successfully connecting to Prisma.

## Verification Checklist
- [ ] `npx prisma format` runs with 0 syntax errors on `schema.prisma`.
- [ ] `npx prisma db push` executes fully, reflecting the tables in the active Postgres GUI.
- [ ] Running the server console-logs successful Postgres connection.

## Rollback Plan
If `db push` corrupts relations:
- Drop all tables in Supabase manually.
- Fix relations inside `schema.prisma` natively based on error payloads.
- Rerun `npx prisma db push`.

## Troubleshooting
| Symptom | Likely Cause | Fix |
|---|---|---|
| Prisma generation errors regarding relations | Ambiguous one-to-many foreign keys. | Give explicit `@relation(name: "RelVar", fields: [...])` definitions. |

---

# Phase 2: Authentication API

## Context
Implementing local email/password authentication using Express controllers, JWT token issuance, and router middleware. Sets the security basis that ensures users can only read/write their own ledger.

## Skills to Load
- `nodejs-best-practices` — Layered logic abstraction.
- `api-security-best-practices` — Essential requirements for safe authentication in MVP.

## Prerequisites
- Phase 1 Prisma Schema established.

## Directory Structure
```text
backend/src/
├── controllers/
│   └── authController.ts
├── middleware/
│   └── requireAuth.ts
└── routes/
    └── authRoutes.ts
```

## Instructions

### Step 2.1: Authentication Controllers
**File:** `backend/src/controllers/authController.ts` — CREATE
**Purpose:** Handles parsing of Sign Up and Login REST bodies.
**Details:**
- Install `bcrypt` (and `@types/bcrypt`), `jsonwebtoken` (and `@types/jsonwebtoken`).
- Expose `register`: Accept `email` & `password`. Hash password (cost factor 10+). Save user via Prisma. Output 201 with stripped user object and JWT token.
- Expose `login`: Accept `email` & `password`. Query User. Run `bcrypt.compare`. On pass, output 200 with JWT token signed by `process.env.JWT_SECRET`.
- Output precise error states (e.g., 400 "User already exists", 401 "Invalid credentials").

### Step 2.2: Auth Middleware
**File:** `backend/src/middleware/requireAuth.ts` — CREATE
**Purpose:** Verifies JWT token on protected routes.
**Details:**
- Extract Bearer token from `Authorization` header.
- Execute `jwt.verify`.
- Populate `req.user` with the decoded `id`.
- Immediately bounce bad signatures with a clean 401 response formatted `{ error: "Unauthorized access" }`.

### Step 2.3: Wire the Routes
**File:** `backend/src/routes/authRoutes.ts` & `server.ts` — CREATE/MODIFY
**Purpose:** Expose endpoints logic to Express.
**Details:**
- Connect `POST /api/auth/register` to `register`.
- Connect `POST /api/auth/login` to `login`.
- Register the `authRoutes` router in `server.ts`.

## Verification Checklist
- [ ] `POST /api/auth/register` successfully logs 201 and creates a User row in DB. Password visually obscured in DB Viewer.
- [ ] `POST /api/auth/login` with correct credentials returns 200 with a valid JWT.
- [ ] A test protected route leveraging `requireAuth` properly rejects 401 when no token is passed.

## Rollback Plan
- Revert modifications into `server.ts`.
- Delete `authRoutes` and `authController` to clean namespace.

## Troubleshooting
| Symptom | Likely Cause | Fix |
|---|---|---|
| req.user property type missing error | TypeScript cannot map decoded token. | Declare namespace overriding `Express.Request` to include `user: any` globally. |

---

# Phase 3: Relational Ledger API

## Context
Exposing standard REST APIs for Users to manage their `FriendProfile` (Roommates, Ghosts) entries and `Category` budget constraints. These endpoints are protected and heavily gated by ownership logic.

## Skills to Load
- `api-patterns` — For standard RESTful structure and verb adherence.

## Prerequisites
- `requireAuth` authentication token injection.

## Directory Structure
```text
backend/src/
├── controllers/
│   ├── categoryController.ts
│   └── friendController.ts
└── routes/
    ├── categoryRoutes.ts
    └── friendRoutes.ts
```

## Instructions

### Step 3.1: Category Endpoints
**File:** `backend/src/controllers/categoryController.ts` — CREATE
**Purpose:** CRUD capabilities for personal budget rules.
**Details:**
- Export `createCategory`: Inputs `name`, `monthly_limit`. Uses `req.user.id`. Creates via Prisma.
- Export `getCategories`: Retrieves all categories bound exclusively to `user_id = req.user.id`. 
- Export `updateCategory`: Verifies ownership before updating limits. Use a 404/403 paradigm on missing validation.

### Step 3.2: Friends / Ghosts Endpoints
**File:** `backend/src/controllers/friendController.ts` — CREATE
**Purpose:** CRUD capabilities for tracking relational nodes.
**Details:**
- Export `createFriend`: Input `name`, `is_ghost` bool. `main_user_id` matches `req.user.id`.
- Export `getFriends`: Gets all `FriendProfile` associated with `req.user.id`.

### Step 3.3: Wire Routing 
**File:** `routes/` & `server.ts` — MODIFY
**Purpose:** Inject these paths into express.
**Details:**
- Expose `/api/categories` and `/api/friends`.
- Strictly enforce `requireAuth` array across them.

## Verification Checklist
- [ ] `POST /api/categories` responds 201 with DB record.
- [ ] Category endpoint throws 401 without Bearer JWT.
- [ ] `POST /api/friends` accurately creates a ghost node in `FriendProfile` for an authorized session.

## Rollback Plan
- Delete CRUD controllers and unregister route declarations in `server.ts`.

---

# Phase 4: Dual-Entry Engine API Core

## Context
This is the core nervous system of the specs. Processing an expense and translating it flawlessly into Ledger entries reflecting both the budget impact and the owing debts reliably using Prisma atomic `$transaction` constructs.

## Skills to Load
- `prisma-expert` — Managing $transaction array promises reliably.
- `cc-skill-backend-patterns` — Defensive coding against financial fractional errors.

## Prerequisites
- Phase 3 completely functional.

## Directory Structure
```text
backend/src/
├── controllers/
│   └── transactionController.ts
└── routes/
    └── transactionRoutes.ts
```

## Instructions

### Step 4.1: The Expense Processing Engine
**File:** `backend/src/controllers/transactionController.ts` — CREATE
**Purpose:** Implements complex ledger accounting generation.
**Details:**
- Export `createExpenseTransaction`: Accepts `amount`, `category_id`, `payer_id` (self or friend), `taggie_id` (self or friend), `split_ratio` (e.g. 0.5 for 50/50).
- Business Rules check: Ensure inputs total accurately. Determine logic. If user paid to share with Ghost:
  - Create the `Transaction` entity.
  - Insert `LedgerEntry` for `BUDGET_DEDUCTION` on `user_id` equal to complete cost or partial cost depending on rule.
  - Insert `LedgerEntry` for `RECEIVABLE` bound to `friend_profile_id` with an amount of positive offset reflecting what they owe.
- You MUST wrap these multi-inserts into a Prisma `$transaction` array. If any nested entry violates integrity, it refuses everything (ACID compliance).

### Step 4.2: View Balances Engine
**File:** `backend/src/controllers/transactionController.ts` — MODIFY
**Purpose:** Expose mathematical aggregation of ledger states.
**Details:**
- Export `getBalances`: Summarize total RECEIVABLE amounts minus PAYABLE amounts grouped by `friend_profile_id` via Prisma aggregation.
- Export `getBudgetStatus`: Get sum of `BUDGET_DEDUCTION` against each Category's `monthly_limit`.

## Verification Checklist
- [ ] A single HTTP `POST /api/transactions` safely constructs 1 `Transaction` row and at least 2 corresponding `LedgerEntry` rows. 
- [ ] If attempting to assign a `category_id` that doesn't belong to `req.user.id`, the backend rejects with 403 Forbidden.
- [ ] The aggregated `getBalances` route calculates and responds accurately.

---

# Phase 5: Frontend Auth & Architecture

## Context
Laying out the React structural skeleton, wiring the unified API client (Axios + Interceptors), rendering the Auth components to establish protective route routing.

## Skills to Load
- `react-patterns` — Setup contextual stores logically.
- `react-ui-patterns` — Managing loading/error feedback loops.
- `tailwindcss-patterns` — Structuring standard stylistic themes explicitly.

## Prerequisites
- Working Backend Auth API available.

## Directory Structure
```text
frontend/src/
├── components/
│   ├── ui/ (Generic reusable standard buttons, inputs)
│   └── layout/
├── lib/
│   └── api.ts
├── store/
│   └── authStore.ts
└── pages/
    ├── Login.tsx
    ├── Register.tsx
```

## Instructions

### Step 5.1: The API Interceptor Singleton
**File:** `frontend/src/lib/api.ts` — CREATE
**Purpose:** Guarantees Bearer tokens attach dynamically to Axios calls.
**Details:**
- Instantiate `axios.create` pointed into `import.meta.env.VITE_API_BASE_URL`.
- Append an interceptor leveraging local storage or global state to inject `Authorization: Bearer <token>` automatically on requesting payloads.

### Step 5.2: Authentication Store
**File:** `frontend/src/store/authStore.ts` — CREATE
**Purpose:** Client-side management of user identities.
**Details:**
- Use Zustand or React Context natively.
- Maintain `user` (id, email) and `token` variables. 
- Build actions `login`, `logout` which clear/populate token bindings.

### Step 5.3: Authentication UIs & Router Protection
**File:** `frontend/src/App.tsx` & `Pages` — MODIFY/CREATE
**Purpose:** Wire the views.
**Details:**
- Implement `Login.tsx` and `Register.tsx` leveraging controlled react form states (or react-hook-form/Zod if preferred). Ensure clear loading state transitions and red error alert boundaries on rejected submissions.
- Implement React Router natively inside `App.tsx`.
- Create a `ProtectedRoute` wrapper component. Redirect unauthorized payloads to `/login`.

## Verification Checklist
- [ ] Register forms communicate through `lib/api.ts`, receive JWT payload, and instantly redirect to a `/dashboard` protected page.
- [ ] LocalStorage correctly persists the token across browser refreshes.
- [ ] Auth pages exhibit proper disabled button parameters during a loading cycle.
- [ ] Ensure full visual accessibility via high contrast inputs utilizing Tailwind natively.

---

# Phase 6: Frontend Ledger UI

## Context
Construct the management screens where Users edit their categories (Personal Budget) and Ghost Profiles (Relational Targets). 

## Skills to Load
- `react-ui-patterns` — Emphasizing empty states.
- `tailwindcss-patterns` — Producing Mobile-First interfaces representing a sleek Fintech UI.

## Prerequisites
- Frontend Auth flow securely operating.

## Instructions

### Step 6.1: Friends & Ghosts Directory
**File:** `frontend/src/pages/Friends.tsx` — CREATE
**Purpose:** Manage passive friends.
**Details:**
- Render a list mapping via `api.get('/friends')`.
- Ensure an explicitly visible empty state if array is flat.
- Embed a modal/form adding a new Friend explicitly toggling `is_ghost: true`. Ensure successful saves seamlessly prepend into list state dynamically without full reload.

### Step 6.2: Budgeting Layout
**File:** `frontend/src/pages/Categories.tsx` — CREATE
**Purpose:** Visual settings for limits.
**Details:**
- Display category blocks mapped from `api.get('/categories')`. 
- Allow input to modify `monthly_limit`. Use debouncing or explicit save buttons to persist changes against backend.

## Verification Checklist
- [ ] Loading the Friends route automatically signals a skeleton loader or spinner while awaiting network completion.
- [ ] Inputting "John Doe" via the Ghost form adds to the screen synchronously matching standard Tailwind UX themes.

---

# Phase 7: Frontend Transaction Engine

## Context
Translates the heavy core engine into an intuitive "Add Expense/Settle" mobile modal. This is the product's primary interaction loop and needs robust error boundary feedback.

## Skills to Load
- `javascript-mastery` — Complex React local calculation for splits dynamically.

## Prerequisites
- Complete category and friend list data existing natively in scope.

## Instructions

### Step 7.1: The Expense Form Component
**File:** `frontend/src/components/TransactionForm.tsx` — CREATE
**Purpose:** Capture dual-entry definitions natively.
**Details:**
- Require highly responsive component rendering native HTML `<select>` maps bridging categories natively.
- Use explicit numeric type sanitization strictly prior to `POST` dispatching.
- Include logic dynamically rendering "Payer" vs "Taggie", calculating exactly what numeric split matches the visual intention context before dispatch.

### Step 7.2: Submission Validation
**File:** `frontend/src/pages/Dashboard.tsx` (or dedicated Modal) — MODIFY
**Purpose:** Safely emit transaction calls.
**Details:**
- Block dispatch natively if numeric string is mismatched or empty.
- Send accurate structured payload via Axios explicitly conforming to API `createExpenseTransaction` guidelines.

## Verification Checklist
- [ ] Entering €100 inside the UI evenly splitting against John Doe produces successful UI visual validation via Toast alerts or equivalent upon HTTP 200 payload responses.

---

# Phase 8: Main Dashboard & Polish

## Context
Aggregating the complex backend mathematical data into visual summarizing UI nodes verifying the product's primary use-cases and finalizing the deployment specifications natively.

## Skills to Load
- `ui-ux-pro-max` — Elevating standard elements into premium views natively.
- `mobile-design` — Ensure responsive refactoring on small viewpoint width contexts.
- `vercel-deployment` — Setup safe boundaries for CI/CD transitions.

## Instructions

### Step 8.1: The Primary Dashboard Composition
**File:** `frontend/src/pages/Dashboard.tsx` — MODIFY
**Purpose:** The central data hub reflecting live limits.
**Details:**
- `useEffect` or React-Query implementation fetching `getBalances` and `getBudgetStatus` APIs natively.
- Render two overarching visual columns natively. 1: "Available Categories" representing deduction limits visually via a progress bar (Tailwind width calculations native). 2: "Friends Who Owe You", iterating native positive balances distinctively (e.g. green styling).

### Step 8.2: Accessibility & Cleanup Polish
**File:** Multiple UI Components — MODIFY
**Purpose:** Verify product-readiness.
**Details:**
- Explicit implementation enforcing `<label>` `htmlFor` against every field statically.
- Keyboard navigation (tab indices). Error statuses translated effectively.
- Prepare a comprehensive `README.md` containing architectural logic and execution scripts referencing V1 and V2 context definitions.

### Step 8.3: Deployment Prep
**File:** `backend/` and `frontend/`
**Purpose:** Readying apps for Render and Vercel structures natively.
**Details:**
- Verify `npm run build` targets successfully inside the `backend/dist` architecture cleanly. 
- Ensure `package.json` natively exposes `"engines": { "node": ">=20" }`.

## Verification Checklist
- [ ] Launching the Dashboard visually guarantees exact split measurements reflect simultaneously within both Budget limits and Friend debts correctly synchronously.
- [ ] Total visual responsiveness scaling native elements appropriately down to 320px environments successfully.
- [ ] Application stands 100% prepared to execute statically matching production specifications dynamically.

---
> You have reached the end of the Implementation Guide. AI Agent: Follow these phases linearly with atomic verification against each deliverable marker prior to initiating successive blocks.
