# Fixes for Social Friends Network

This document outlines the required changes to address the critical and major issues identified during the code review of the social friends feature.

## Proposed Changes

### backend/src/controllers/feedController.ts

#### [MODIFY] feedController.ts
- **Fix missing authorization in `reactToPost` and `addComment`**: 
  Add logic to fetch the `post` first. If `post.userId !== req.user.id`, check the `Friendship` table to ensure the current user and the post author are friends. If not, return a `403 Forbidden` error. This prevents users from interacting with posts belonging to strangers or users who blocked them.

### backend/src/controllers/friendRequestController.ts

#### [MODIFY] friendRequestController.ts
- **Fix N+1 query in `searchUsers`**:
  Instead of calling `getRelationshipStatus` (which runs 3 queries) inside a loop, extract all found `userIds`. Run two bulk queries: one to find all `friendships` involving `req.user.id` and the `userIds`, and another to find all `friendRequests`. Map the statuses in-memory to drastically reduce database load.
- **Filter blocked users in `searchUsers`**:
  Query the `BlockedUser` table to find all users blocking or blocked by `req.user.id`, and exclude those IDs from the `users` query results.
- **Enforce block check in `sendFriendRequest`**:
  Before allowing a request, query the `BlockedUser` table to ensure no block exists between the sender and the target. Return a `403 Forbidden` if a block is found.
- **Fix N+1 query in `getFriendsList`**:
  Instead of fetching `LedgerEntry` rows per friend in a loop, fetch all relevant `LedgerEntry` rows for all friends in a single query (using `friendProfileId: { in: friendProfileIds }`) and group the balances in memory, similar to how `getBalances` is implemented in the transaction controller.

### backend/src/controllers/transactionController.ts

#### [MODIFY] transactionController.ts
- **Fix brittle budget milestone logic (`checkBudgetMilestones`)**:
  Modify the milestone logic. Instead of checking if `percentage >= 100 && percentage < 110`, calculate the *previous* percentage before the current transaction. Trigger the milestone only if `previousPercentage < 100 && newPercentage >= 100` (or 50%). This ensures large transactions don't skip over the hardcoded upper bounds.

### frontend/src/pages/Friends.tsx

#### [MODIFY] Friends.tsx
- **Implement Ghost Profile Linking functionality**:
  The "Link" button for legacy ghost profiles is currently cosmetic and has no `onClick` handler. Implement the modal/prompt to select a real user and wire it to the `/api/friends/ghost/:id/claim` endpoint to fulfill the feature specification.

## Verification Plan

### Automated Tests
- Verify that `tsc --noEmit` passes without type errors after implementing these fixes.

### Manual Verification
- **Feed Interactivity**: Attempt to comment or react to a feed post belonging to a non-friend (using Postman or directly via the frontend by hardcoding a post ID) and confirm it returns `403`.
- **Search Efficiency**: Use a query that returns ~20 users and check the console/database logs to ensure only ~3 queries are run instead of 60+.
- **Blocking**: Block a user, then attempt to send them a friend request. It should fail.
- **Budget Milestones**: Add a single large transaction that pushes the category from 40% to 120%. Verify that the 100% milestone feed post is still correctly generated.
- **Ghost Profile Linking**: Verify that clicking the "Link" button on a ghost profile opens a prompt to select a user and successfully associates the ghost.

## Previously "Missing / Not Checked" Items

I have now reviewed the remaining items and can confirm they are correctly implemented:

- ✅ **`frontend/public/sw.js`**: The Service Worker correctly handles push event parsing and `notificationclick` navigation. It cleanly checks for an existing open window to focus, or opens a new window if none exists, correctly passing the deep link payload.
- ✅ **`backend/src/server.ts`**: The `express.static` route maps `/uploads` to `path.resolve(__dirname, '../uploads')`, which perfectly aligns with `profileController.ts` resolving to `../../uploads/avatars`. The avatars will be served successfully without 404s, both in development (ts-node) and production (dist folder). No fixes required here!
- ✅ **`backend/src/services/notificationService.ts`**: Upon closer inspection, `createNotification` DOES correctly query the `BlockedUser` table and aborts the notification if a block exists. It is perfectly implemented!
