# Feature Spec: Dashboard Data Visualization

## Overview
- **Feature:** Dashboard Data Visualization Upgrades
- **Requested by:** User
- **Complexity:** Medium (8-20 files/components impacted, moderate frontend math/layout changes)
- **Estimated scope:** 4 files created/modified, ~2-3 hours
- **Related features:** AI Spending Forecasting, Gamification Dashboard Widgets, Transaction Form modal

## Problem & Motivation
The current dashboard dashboard relies heavily on raw numbers and list-based cards. While functional, it requires high cognitive load for users to interpret their current financial state. Users cannot easily see their spending distribution across categories, understand their overall net balance position at a glance, or instantly gauge if their current spending trajectory will cause them to exceed their monthly limits. 

By replacing these text-based metrics with highly aesthetic, interactive SVG components, we decrease cognitive load, improve scannability, and provide a premium, gamified experience.

## User Stories
- **As a** budgeting user, **I want to** see a colorful donut breakdown of my monthly spending **so that** I can instantly understand which categories consume most of my money without scanning long lists.
- **As a** shared-expense user, **I want to** see a visual gauge comparing what I owe vs. what is owed to me **so that** I can easily understand my net financial health at a glance.
- **As a** disciplined saver, **I want to** see my spent limits alongside my projected spending trajectory on a single progress bar **so that** I can make proactive adjustments before I actually go over budget.

---

## Detailed Requirements

### 1. Spending Donut Chart (`SpendingDonutChart`)
**Description:** A responsive, animated SVG donut chart that aggregates and displays total spending across categories.

**UI/UX:**
- **Layout:** Standard circular donut with a hollow center. Located on the dashboard in a side-by-side or stacked grid with the Net Balance Gauge.
- **Center Focus:** The center of the donut displays aggregate data. By default, it shows "Total Spent" and the sum of all category spends in PHP. Hovering/focusing on any segment updates the center text to show that category's name, spent amount, and percentage of total spend.
- **Animations:** A smooth drawing transition (`stroke-dashoffset` from empty to full) on load, plus subtle scaling/glow animations when a segment is hovered.
- **States:**
  | State | What the user sees | Trigger |
  |---|---|---|
  | Loading | A pulsing circular skeleton placeholder matching the layout. | When budget and transaction data are being fetched |
  | Empty | A sleek, dashed light-gray circular ring with "No spending logged yet" inside. | When total spending across all active categories is exactly `0` |
  | Populated | A colorful segmented donut with clear color divisions, smooth hover triggers, and an interactive legend. | When there is at least `0.01 PHP` of spending logged |
  | Error | A simple circular ring with a red warning exclamation and "Failed to load visualization" subtext. | When the data API request fails |

**Data:**
- **Source:** Array of active `BudgetStatus` from the dashboard's backend response.
- **Shape:** 
  ```typescript
  interface DonutSlice {
    categoryId: string;
    categoryName: string;
    spent: number;
    percentage: number;
    color: string;
  }
  ```
- **Math:** 
  - Radius $R = 60$, Circumference $C = 2 \pi R \approx 376.99$.
  - Segment $i$ size: `strokeDasharray={[spentPercentage * C, C]}`.
  - Stacking rotation: `transform={`rotate(${accumulatedPercentage * 360 - 90} 80 80)`}`.

---

### 2. Net Position Gauge (`NetBalanceGauge`)
**Description:** A high-delight radial gauge visualizing the balance between what the user owes (Payables) vs. what is owed to them (Receivables).

**UI/UX:**
- **Layout:** A semi-circular arc (gauge) showing a balanced scale. Left side of the scale represents "You Owe" (coral/red) and the right side represents "Owed to You" (green/teal).
- **Indicator:** An animated dial needle or glowing status arc overlay. If Net Balance is positive, the center ring glows with a lush green shadow, showing a "Net Positive" badge. If Net is negative, the ring glows with a warm warning coral glow, showing a "Net Negative" badge.
- **States:**
  | State | What the user sees | Trigger |
  |---|---|---|
  | Loading | Skeletons showing a semi-circle track. | When balance data is loading |
  | Empty | A balanced dial sitting exactly at $0$ with "No outstanding balances" text. | When total owed and total owe are both exactly `0` |
  | Populated | Active dial needle/arc shifted left or right with glows and sub-counters. | When receivables or payables are greater than `0` |

**Data:**
- **Source:** Reuses the existing `balances` array from `/api/transactions/balances`.
- **Derived Metrics:**
  - `totalOwed` (Receivables) = Sum of all `receivableBalance > 0`
  - `totalOwe` (Payables) = Sum of all `payableBalance > 0`
  - `netBalance` = `totalOwed - totalOwe`

---

### 3. Budget Forecast Progress Bar (`BudgetForecastBarChart`)
**Description:** Replaces simple horizontal progress bars with an advanced double-layered tracking chart that incorporates spent, limits, and projected spend.

**UI/UX:**
- **Bar Design:**
  - **Base Track:** A light-gray/surface-hover track representing the monthly category limit.
  - **Spent Progress:** A solid, color-changing gradient bar (Green $\rightarrow$ Yellow $\rightarrow$ Red) based on threshold consumption.
  - **Projection Segment:** A semi-transparent, hatched/dashed pulsing overlay extending beyond the "Spent" bar, representing the `projectedSpend` calculated by the AI Forecasting module.
  - **Over-limit Glow:** If either Spent or Projected Spend exceeds the monthly limit, the exceeded segment shifts to warning colors with subtle ambient glow effects.
- **States:**
  | State | What the user sees | Trigger |
  |---|---|---|
  | Under-limit | Solid Green/Blue bar; no projection overlap or a projection segment well below the 100% threshold. | Spending & projections are within budget limits |
  | At Risk | Amber progress bar, with a pulsing projection segment crossing the 85% threshold. | Projection predicts over-spending soon |
  | Over Budget | Hot red/coral solid bar extending past 100%, with a flashing warning icon and overflow indicator. | Current spent amount is higher than the budget limit |

---

## Codebase Integration

### Files to CREATE
| File Path | Purpose |
|---|---|
| `d:\CRUD\frontend\src\components\ui\SpendingDonutChart.tsx` | Highly interactive circular SVG donut chart showing category distribution with hover states and a responsive center panel. |
| `d:\CRUD\frontend\src\components\ui\NetBalanceGauge.tsx` | Radial balance gauge displaying net financial health and outstanding debt ratios. |
| `d:\CRUD\frontend\src\components\ui\BudgetForecastBarChart.tsx` | Enhanced horizontal bar chart combining actual spent, monthly limits, and AI-driven projection paths. |

### Files to MODIFY
| File Path | What Changes |
|---|---|
| `d:\CRUD\frontend\src\pages\Dashboard.tsx` | - Import and mount `<SpendingDonutChart />` and `<NetBalanceGauge />` in place of the top numbers boxes.<br>- Replace standard linear progress bars inside the "Budget Status" loop with `<BudgetForecastBarChart />`. |

### Files NOT to Change
| File Path | Why |
|---|---|
| `d:\CRUD\backend\src\controllers\transactionController.ts` | The backend API endpoints are already built and fully functional; all visual metrics are derived purely in the frontend application layer. |

### Existing Code to Reuse
| What | Where | How |
|---|---|---|
| Lucide Icons | `lucide-react` | Reuse standard icons (`Wallet`, `Users`, `TrendingUp`, etc.) for chart headers. |
| Currency Formatter | `Dashboard.tsx` (`fmt`) | Re-use the existing PHP formatter utility `fmt` inside the new visual components for formatting precision. |

### New Dependencies
*No new dependencies required.* We will leverage vanilla React, pure inline SVG vectors, and Tailwind v4 CSS utility class tokens.

---

## Acceptance Criteria
- [ ] **GIVEN** a user has logged spending, **WHEN** the dashboard renders, **THEN** the Donut chart segments match the proportional spend of each category.
- [ ] **GIVEN** a user hovers over a Donut slice, **WHEN** hovered, **THEN** the central text dynamically updates to display the Category Name, exact spend in PHP, and the exact percentage.
- [ ] **GIVEN** a user has outstanding debts and receivables, **WHEN** the dashboard renders, **THEN** the Net Position radial needle shifts dynamically (green-right for Net Positive, red-left for Net Negative).
- [ ] **GIVEN** a budget category has an AI spending forecast, **WHEN** rendering the category bar, **THEN** a pulsing, semi-transparent forecast overlay accurately visualizes the projected spend position.
- [ ] **GIVEN** there are no active budgets or spent transactions, **WHEN** the dashboard loads, **THEN** the visual donut renders a beautiful, dashed circular empty-state placeholder.
- [ ] All new components render perfectly in both Dark ("Midnight Study") and Light ("Warm Ivory") modes.
- [ ] All changes compile without TypeScript warnings and pass `npm run build` validation.

---

## Edge Cases & Error Handling
| Scenario | Expected Behavior |
|---|---|
| Category limit is $0$ | Prevent division-by-zero errors. Set limit visually to a default minimal line, and display "No Limit Set" label. |
| Total spent is $0$ across all categories | The Donut chart renders a clean, subtle light-gray circular dashed ring with "No spending logged yet" in the center. |
| Spent exceeds $100\%$ of limit | Progress bar is capped visually at $100\%$ track width, with an extra glowing red indicator and overflow overflow count (e.g. `+1,250 PHP over`). |
| Screen size scales down to mobile | Charts stack vertically in a single column; font sizing shrinks proportionally using fluid spacing. |

---

## Security Considerations
- *No additional security considerations beyond existing patterns.* No input elements or raw HTML parameters are introduced by these purely visual read-only components.

---

## Analytics & Tracking
- Defer analytics tracking events (e.g. `chart_slice_hover`, `gauge_rendered`) to V2 follow-up.

---

## Performance Considerations
- All SVG paths are optimized with minimal nodes.
- Animation triggers utilize CSS transform and transitions rather than intensive JS polling, ensuring smooth 60fps renders on mobile devices.
- Zero extra bundle overhead because no charting npm dependencies are added.

---

## Out of Scope (Explicit Exclusions)
- Custom calendar date range filters for charts (will continue to rely on the monthStart/monthEnd logic present in `Dashboard.tsx`).
- Inline category editing within the budget forecast list.

---

## Recommended Skills
Skills from `.agent/skills/skills/` to load:
- `ui-ux-pro-max` (design system tokens, ambient glows, premium glassmorphism)
- `typescript-expert` (strict interfaces and clean props mappings)
- `react-ui-patterns` (smooth loading skeletons, conditional layouts, robust state handlers)
