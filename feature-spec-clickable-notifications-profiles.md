# Feature Spec: Clickable Notifications & Friend Profile Navigation

## Overview
- **Feature:** Clickable Notifications and Friends List Profile Links
- **Requested by:** User
- **Complexity:** Small (2 files modified, ~2 hours)
- **Estimated scope:** Modify 2 files, no new dependencies
- **Related features:** Notification Panel, Notifications list, Friends list, Challenges page, Public Profiles

## Problem & Motivation
Currently, notifications in the application are designed to be clicked, but tab parameter navigation (e.g. `/friends?tab=requests`) is ignored because the target page (`Friends.tsx`) does not check for query parameters. This results in the user being sent to the page but not the relevant tab. Additionally, friends in the "My Friends" tab of the Friends page are rendered as static elements; clicking on a friend does not take the user to their public profile page, meaning the user cannot check friend streaks, points, badges, or easily access settings like reporting or blocking.

## User Stories
- **As a** registered user, **I want to** click on a notification (such as a friend request received), **so that** I am taken directly to the correct tab (e.g., Requests tab in Friends) where I can take action.
- **As a** registered user, **I want to** click on any friend in my friends list, **so that** I am navigated to their public profile page to view their gamification statistics and manage the friendship connection.

## Detailed Requirements

### Requirement Group 1 — Friends List Profile Redirection

**Description:** Make friend items in the "My Friends" list clickable. Clicking an item navigates the user to their public profile.

**UI/UX:**
- **Layout:** Reuses the existing card structure (`container-card container-card-interactive`).
- **States:**
  | State | What the user sees | Trigger |
  |---|---|---|
  | Hover | The card rises slightly (`translate-y`), shadows increase, and friend's name highlights using primary color. | Cursor hovering over the friend card |
  | Clicked | Navigates the user to `/profile/:username` of that friend. | Left click on the card body |
- **Interactions:** 
  - Clicking any part of the card (except the hover action "Remove Friend") initiates navigation.
  - Clicking "Remove Friend" triggers a confirmation dialog and does not trigger navigation (stops event propagation).
- **Navigation:** Navigates from `/friends` to `/profile/:username` where `:username` is the unique username of the friend. If no username exists, clicking does not navigate (remains non-clickable).

**Data:**
- **Source:** Existing `friend.username` property from the `FriendListItem` type.

---

### Requirement Group 2 — Search Query Param for Friends Tabs

**Description:** Support deep-linking tabs in the Friends view using the URL query parameter `?tab=...`.

**UI/UX:**
- **Layout:** Reuses the existing tab bar design.
- **Navigation:**
  - `/friends?tab=friends` or `/friends` selects "My Friends".
  - `/friends?tab=requests` selects "Requests".
  - `/friends?tab=discover` selects "Discover".
  - `/friends?tab=leaderboard` selects "Leaderboard".
- **States:**
  - Synchronizes URL parameters automatically when changing tabs.

---

### Requirement Group 3 — Notification Path Alignment

**Description:** Align `NotificationItem` action pathways to use `/dashboard` instead of `/` for transaction approval requests and verify deep links.

**UI/UX:**
- **Navigation:** Clicking `TRANSACTION_APPROVAL_REQUEST` navigates the user directly to `/dashboard` where pending transactions are displayed.

---

## Codebase Integration

### Files to CREATE
*No new files required.*

### Files to MODIFY
| File Path | What Changes |
|---|---|
| `[d:/CRUD/frontend/src/pages/Friends.tsx](file:///d:/CRUD/frontend/src/pages/Friends.tsx)` | - Import `Link` and `useSearchParams` from `react-router-dom`. <br>- Update `activeTab` to initialize from and write to the query parameter `?tab=`. <br>- Wrap the top layout of the friend cards in a `<Link>` component pointing to `/profile/${friend.username}`. <br>- Call `e.stopPropagation()` in the "Remove Friend" onClick handler. |
| `[d:/CRUD/frontend/src/components/social/NotificationItem.tsx](file:///d:/CRUD/frontend/src/components/social/NotificationItem.tsx)` | - Change `TRANSACTION_APPROVAL_REQUEST` type return URL from `/` to `/dashboard`. |

### Files NOT to Change
| File Path | Why |
|---|---|
| `[d:/CRUD/frontend/src/pages/PublicProfile.tsx](file:///d:/CRUD/frontend/src/pages/PublicProfile.tsx)` | Public profiles are already fully implemented and query by username parameter; they do not need modification. |

### Existing Code to Reuse
| What | Where | How |
|---|---|---|
| `useSearchParams` | `Challenges.tsx` | Reuse tab parameter synchronization logic. |

### New Dependencies
*No new dependencies required.*

## Acceptance Criteria
- [x] **GIVEN** a user is on the Friends page, **WHEN** they click a tab, **THEN** the URL is updated with `?tab=[tab_name]`.
- [x] **GIVEN** a user has a pending friend request notification, **WHEN** they click it, **THEN** they are taken to `/friends?tab=requests` and the "Requests" tab is selected.
- [x] **GIVEN** a user is viewing their friends list, **WHEN** they click on a friend card, **THEN** they are navigated to `/profile/[username]`.
- [x] **GIVEN** a user hovers over a friend card and clicks "Remove Friend", **WHEN** clicked, **THEN** the confirmation dialog shows and they are NOT navigated to the profile page.
- [x] **GIVEN** a user clicks a transaction approval request notification, **WHEN** clicked, **THEN** they are navigated to `/dashboard`.
- [x] All changed code compiles without TypeScript errors.

## Edge Cases & Error Handling
| Scenario | Expected Behavior |
|---|---|
| Friend has no username set | The card does not render as a link; clicking it does nothing. |
| Non-existing tab param in URL | Defaults to the first tab ("My Friends"). |
| Click "Remove Friend" | Triggers standard confirmation dialog without launching page navigation. |

## Recommended Skills
| Skill | Purpose |
|---|---|
| `react-patterns` | State management and standard event handling |
| `clean-code` | Readable component layout and semantic structure |
