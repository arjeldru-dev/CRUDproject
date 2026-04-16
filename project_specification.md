# Project Specification: Hybrid Ledger

## 1. Executive Summary
- **Product:** Hybrid Ledger — A collaborative financial tracker that merges personal budgeting with peer-to-peer expense splitting.
- **Problem:** Users currently have to use separate apps for personal budgets (like YNAB) and group bill-splitting (like Splitwise), leading to redundant entries and inaccurate real-time financial tracking.
- **Solution:** An application that treats shared debts as active liabilities against personal budget categories, synchronizing group shared expenses with personal cash-flow in real-time.
- **Platform:** Web App (Mobile-first responsive design)
- **Target Launch:** Milestone-driven (No hard deadline)
- **Scope:** MVP Focus

## 2. User Personas & Workflows

- **The Primary User (Registered)** — A tech-savvy millennial/Gen Z managing rent and social expenses.
  - Primary goal: Maintain an up-to-date personal budget while accurately tracking money owed to/from friends.
  - Key workflow: Logs a shared expense, tags a friend, and sees their budget category instantly update reflecting their true financial state.
  - Frequency: Daily
  - Pain points: Forgetting to log Splitwise debts back into a personal budget app.

- **The Guest (Ghost Profile)** — A roommate or friend who is not registered on the platform.
  - Primary goal: Be tracked passively without needing to create an account.
  - Key workflow: Has their name entered by a Registered User; their balance is tracked purely on the Registered User's side.
  - Frequency: N/A (Passive)
  - Pain points: Doesn't want to download yet another app just to split a dinner bill.

## 3. Feature Specification

### MVP Features (Must Ship)

- **User Authentication & Profiles**
  - Description: Standard user account creation and login state.
  - User story: "As a primary user, I want to securely log into my account to access my personal budget."
  - Inputs: Email, Password.
  - Outputs: JWT token, User session, Dashboard access.
  - Business rules: Passwords must be hashed.
  - Edge cases: Invalid credentials, duplicate email signup.
  - Dependencies: None.

- **The Relational Ledger (Friends System)**
  - Description: Ability to add friends as registered users or "Ghost Profiles."
  - User story: "As a primary user, I want to add my roommate to split expenses even if they don't have an app."
  - Inputs: Friend name, Ghost toggle (true/false).
  - Outputs: A profile entry on the user's friend list.
  - Business rules: Ghost profiles belong to the creator; registered friends must confirm request (or MVP simplified auto-link).
  - Edge cases: Adding a friend that already exists.
  - Dependencies: User Authentication.

- **The Dual-Entry Transaction Engine**
  - Description: The core engine that processes an expense, splits it, and updates both the personal cash flow/budget and the relational ledger.
  - User story: "As a primary user, I want to enter a dinner bill and tag my friend so my dining budget and friend's debt balance both update instantly."
  - Inputs: Amount, Category, Split Type (e.g., 50/50), Payer, Taggie (Friend/Ghost).
  - Outputs: Deductions in relevant categories, updates to the friend ledger balances.
  - Business rules: Debts owed *to* you do not boost your cash flow, but they do preserve your budget. Settling debts restores cash flow.
  - Edge cases: Splitting an amount that doesn't divide evenly.
  - Dependencies: Relational Ledger, User Profiles.

- **The Dashboard**
  - Description: Overview of current budget categories and owed/owing balances.
  - User story: "As a user, I want to see how much dining out budget I have left and who owes me what."
  - Inputs: N/A (derived from DB).
  - Outputs: Remaining budget per category, summarized "Who owes me / Who I owe" list.
  - Business rules: Read-only summarizations based on the dual-entry engine.
  - Edge cases: Negative budgets.
  - Dependencies: Transaction Engine.

### V1.1 Features (Next Release)
- **The "Settle Up" Algorithm:** Graph simplification feature to minimize total transactions across a friend group.
- **Data-Driven Insights:** Advanced category visualizations indicating spending patterns per friend group.
- **Invite a Ghost:** Merging a ghost profile's debt history into a newly registered user account.

### Anti-Features (Explicitly Out of Scope)
- **Real Bank Syncing:** (e.g., Plaid integration). Too complex and costly for the MVP. Manual entry only.
- **Full Social Network Feed:** No comments, likes, or global social feeds.

## 4. Technical Architecture

### Stack
| Layer | Technology | Justification |
|---|---|---|
| Frontend | React.js | Chosen to explicitly demonstrate separated-architecture API consumption. |
| Styling | Tailwind CSS | Free, open-source, enables rapid UI construction. |
| Backend | Node.js / Express | Classic REST API handling to prove backend, routing, and CORS mastery. |
| Database | PostgreSQL + Prisma | Relational DB is mandatory for rigid double-entry ledger logic. Prisma provides type-safe ORM. |
| DB Host | Supabase (Free Tier) | Accessible, free Postgres. |
| Auth | JWT / Custom | Basic auth suitable for an MVP portfolio piece. |
| Hosting | Vercel (Front) / Render (Back) | Cost-effective (free) and demonstrates deployment of separate services. |

### System Architecture
The application runs on a decoupled architecture. The React frontend interacts with the Node.js API over secure HTTPS. The backend leverages the Prisma ORM to execute complex, transactional queries against a PostgreSQL database hosted on Supabase, ensuring that dual-entry logic commits safely with ACID compliance.

### Data Model (Key Entities)
- **User**
  - Fields: id, email, password_hash, created_at
  - Relations: Has many Categories, Has many Ledger_Entries, Has many Friends.
- **FriendProfile**
  - Fields: id, main_user_id, friend_user_id (nullable for Ghosts), name, is_ghost
  - Relations: Belongs to User.
- **Category**
  - Fields: id, user_id, name, monthly_limit
  - Relations: Has many Transactions.
- **Transaction**
  - Fields: id, creator_id, category_id, total_amount, type (expense/settlement)
  - Relations: Has many Ledger_Entries.
- **Ledger_Entry (The magic layer)**
  - Fields: id, transaction_id, user_id, friend_profile_id, amount_change, type (payable/receivable/budget_deduction)
  - Relations: Links users, friends, and transactions to calculate accurate balances.

### API Design Philosophy
RESTful endpoints built in Express. Standard resource controllers (e.g., `/api/transactions`, `/api/users/balances`). Strict data validation middleware before Prisma queries.

## 5. Design Direction
- **Aesthetic:** Modern, mobile-first, and friendly. A playful FinTech vibe similar to Venmo or Splitwise.
- **Color palette:** Approachable vibrant accents on clean, light backgrounds. Soft shadows.
- **Typography:** Sans-serif (like Inter or Roboto) for high legibility on mobile.
- **Themes:** Light mode priority for MVP.
- **Key screens:** Dashboard (Budgets + Friends), Add Transaction Modal, Profile Settings.
- **Responsive strategy:** Mobile-first approach, scaling up to tablet/desktop layouts gracefully.

## 6. Security & Compliance
- **Security tier:** MVP / Portfolio.
- **Authentication:** Standard JWT-based auth via Express backend.
- **Authorization:** Backend middleware ensuring users can only read/write their own `user_id` records.
- **Data handling:** Passwords hashed with bcrypt.

## 7. Infrastructure & DevOps
- **Environments:** Dev (Local) / Production (Vercel + Render).
- **Deployment strategy:** GitHub integrations for auto-deployments on main branch push.
- **Monitoring:** Basic Express error-logging to console (via Render dashboard).

## 8. Project Phases & Milestones

| Phase | Focus | Duration | Key Deliverables |
|---|---|---|---|
| 1 | Backend API & DB Foundation | Milestone-driven | PostgreSQL Schema in Prisma, Express Route endpoints, basic JWT Auth. |
| 2 | Core Frontend & Dual-Entry Engine | Milestone-driven | React UI setup, connecting to API, Add Transaction workflows, updating balances safely. |
| 3 | Polish & Dashboard Integration | Milestone-driven | Tailwind UI refinement, Dashboard data aggregation, Readme updates, Final deployment. |

## 9. Open Questions & Risks
- **Concurrency Risk:** Ensuring the backend uses database transactions (Prisma `$transaction`) to prevent race conditions if multiple people update their ledger simultaneously.
- **Ghost Profile Migration Complexity:** The logic to later associate an email with a ghost profile could be tricky if not thought through in the initial schema.

## 10. Success Metrics
- Seamlessly running locally with zero CORS errors between frontend and backend.
- A fully functional deployment on Vercel and Render handling the 2000 Php 50/50 test case without DB errors.
- Clean, highly readable code repository ready for recruiter evaluation.

## 11. Recommended Skills

| Phase | Skills | Purpose |
|---|---|---|
| Phase 1: DB & Backend API | `nodejs-best-practices`, `api-patterns`, `database-design`, `prisma-expert`, `cc-skill-backend-patterns` | Expert guidance on creating robust APIs, defining normalized schemas, and using Prisma for safe ledger transactions. |
| Phase 2: Core Frontend & Transaction Engine | `react-patterns`, `react-ui-patterns`, `tailwind-patterns`, `cc-skill-frontend-patterns`, `javascript-mastery` | Implementing clean component architecture, managing API calls, and fast Tailwind setups. |
| Phase 3: Dashboard, Polish & Launch | `ui-ux-pro-max`, `mobile-design`, `documentation-templates`, `vercel-deployment` | Ensuring the Venmo-like friendly UI is cohesive and publishing a professional portfolio README. |
