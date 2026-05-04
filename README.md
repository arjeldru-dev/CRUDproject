# Hybrid Ledger

A comprehensive, dual-entry financial ledger application that tracks personal budgets while securely processing cross-user split expenses and settlements.

## Architecture

This project is structured as a monorepo containing two decoupled applications:

- **Frontend (V1 UI Context):** React SPA built with Vite, Tailwind CSS, and Zustand. Features a mobile-first, high-contrast, premium interface mimicking modern fintech applications.
- **Backend (V2 Engine Context):** Node.js/Express API with Prisma ORM connected to a PostgreSQL database. Implements a strictly typed, ACID-compliant transaction engine that calculates dual-entry ledger impacts dynamically.

### Core Technologies
- **Frontend:** React, React Router, Tailwind CSS, Axios, Zustand
- **Backend:** Node.js, Express, Prisma ORM, PostgreSQL, JSON Web Tokens (JWT), bcrypt

## Getting Started

### Prerequisites
- Node.js >= 20
- PostgreSQL database

### Local Development Setup

1. **Clone and Install:**
   - Install backend dependencies: `cd backend && npm install`
   - Install frontend dependencies: `cd frontend && npm install`

2. **Backend Configuration:**
   - Create `backend/.env` with:
     ```env
     PORT=5000
     DATABASE_URL="postgresql://user:password@localhost:5432/hybrid_ledger"
     JWT_SECRET="your_super_secret_jwt_key"
     ```
   - Push the Prisma schema to your database:
     ```bash
     cd backend
     npx prisma db push
     ```

3. **Frontend Configuration:**
   - Create `frontend/.env` with:
     ```env
     VITE_API_BASE_URL="http://localhost:5000/api"
     ```

### Execution Scripts

To run the application locally, you'll need two terminal windows:

**Terminal 1 (Backend Engine):**
```bash
cd backend
npm run dev
```

**Terminal 2 (Frontend Client):**
```bash
cd frontend
npm run dev
```

## V1 and V2 Contexts

- **V1 (Frontend):** Deals strictly with UI state management, rendering budget progress bars, aggregating friend balances, and interacting with user permissions. Focuses heavily on the user experience layer.
- **V2 (Backend):** Focuses on secure endpoints, atomic `$transaction` executions within Prisma to ensure dual-entry expense splitting doesn't lead to out-of-sync relational ledger nodes, and proper authentication gating.

## Deployment

This application is ready for deployment on platforms like Vercel, Render, or Railway. Both `backend` and `frontend` subdirectories define their `"engines": { "node": ">=20" }` constraint in `package.json` for proper hosting resolution.

- **Backend Build:** `npm run build`
- **Frontend Build:** `npm run build`
