# Hybrid Ledger Tasks

## Design Context

### Users
Tech-savvy Millennials/Gen Z managing personal budgets and shared expenses. They need to track roommate costs, dinner splits, and social liabilities in real-time without the friction of multiple apps.

### Brand Personality
**Reliable, Minimalist, Playful.** The interface should feel as robust as a hardware wallet (Ledger Live) while maintaining the playful, accessible vibe of a modern fintech app.

### Aesthetic Direction
- **Theme**: Dual-theme system (Light/Dark) with a focus on eye protection and readability.
- **References**: Ledger Live (clear balances, charts, quick actions), Dribbble crypto concepts (Sentra/Vertus), Ally Bank (high contrast/accessibility).
- **Anti-references**: Cluttered layouts, blocking confirmation screens, over-simplified "low-res" dashboards, and forced early authentication loops.
- **Visual Style**: Clean layouts, intuitive navigation, high-contrast typography, and purposeful motion for "delight" during transaction splits.

### Design Principles
1. **Clarity over Complexity**: Emphasize clear balances and quick actions. Avoid overcomplicating the transaction flow.
2. **Accessible by Default**: Maintain high contrast for color blindness and prioritize eye-friendly palettes. Use readable font stacks (Inter).
3. **Frictionless Feedback**: Ensure confirmations are never blocked or obscured. Use micro-animations to create moments of "delight" when expenses are successfully split.
4. **Contextual Guidance**: Provide clear tooltips or labels for "Ghost vs Registered" states to ensure users always understand their financial context.
5. **Adaptive Resilience**: Design for mobile-first utility that scales to desktop without losing the "app-like" focus on high-priority actions.

---

## Roadmap

- [x] **Dual Theme System Implementation**:
    - [x] Create `frontend/src/store/themeStore.ts` (Zustand + Persistence)
    - [x] Refactor `frontend/src/index.css` with CSS variables & Tailwind v4 theme mapping
    - [x] Create `ThemeInitializer.tsx` for global theme application
    - [x] Update `DashboardLayout.tsx` with Theme Toggle (Sun/Moon icons)
    - [x] Update `AuthLayout.tsx` to be theme-aware
    - [x] Audit & Update UI Components (`Button`, `Input`)
    - [x] Audit & Update all Pages (`Login`, `Register`, `Dashboard`, `Friends`, `Categories`, `Transactions`)
- [x] Refactor navigation to match "Crypto Wallet" patterns (Quick Actions)
- [x] Audit accessibility for color blindness (Green/Red balance indicators)
- [x] **Interaction Polish**:
    - [x] Implement micro-animations for transaction successes (Phase 8 delight)
    - [x] Add smooth transitions for theme switching
