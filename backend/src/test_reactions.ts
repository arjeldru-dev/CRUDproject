import './middleware/requireAuth';
import { prisma } from './config/db';
import {
  reactToPost,
  getPostReactors,
  reactToComment,
  getCommentReactors,
} from './controllers/feedController';

/**
 * Standalone integration test for the reactions/comment access-control rework.
 *
 * Verifies:
 *  - single-reaction-per-user semantics (add → switch → remove) on posts,
 *  - the same on comments,
 *  - reactor listings return the reacting user,
 *  - non-friends receive 403 on every reaction endpoint (post + comment),
 *  - invalid emojis are rejected with 400.
 *
 * Run: npx ts-node src/test_reactions.ts
 */

const EMAILS = {
  author: 'test_react_author@example.com',
  friend: 'test_react_friend@example.com',
  stranger: 'test_react_stranger@example.com',
};

/** Minimal mock res that captures the status code + json body of the last call. */
function makeMockRes() {
  const state: { code: number; data: any } = { code: 0, data: null };
  const res = {
    status: (code: number) => {
      state.code = code;
      return {
        json: (data: any) => {
          state.data = data;
          return data;
        },
      };
    },
  } as any;
  return { res, state };
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log('🧪 Starting Reactions access-control regression tests...');

  await cleanup();

  console.log('👤 Creating test users...');
  const stamp = Date.now();
  const author = await prisma.user.create({
    data: {
      username: 'test_react_author_' + stamp,
      email: EMAILS.author,
      passwordHash: 'dummy_hash',
      displayName: 'Author',
    },
  });
  const friend = await prisma.user.create({
    data: {
      username: 'test_react_friend_' + stamp,
      email: EMAILS.friend,
      passwordHash: 'dummy_hash',
      displayName: 'Friend',
    },
  });
  const stranger = await prisma.user.create({
    data: {
      username: 'test_react_stranger_' + stamp,
      email: EMAILS.stranger,
      passwordHash: 'dummy_hash',
      displayName: 'Stranger',
    },
  });

  // author <-> friend are friends; stranger is not.
  await prisma.friendship.create({
    data: { userAId: author.id, userBId: friend.id },
  });

  const post = await prisma.feedPost.create({
    data: {
      userId: author.id,
      type: 'EXPENSE_ADDED',
      content: JSON.stringify({ message: 'test post' }),
    },
  });

  const comment = await prisma.comment.create({
    data: { postId: post.id, userId: author.id, text: 'test comment' },
  });

  try {
    // ── Post reactions: add → switch → remove ──────────────────────────
    console.log('\n--- Post reactions (single-reaction semantics) ---');

    let m = makeMockRes();
    await reactToPost(
      { user: { id: friend.id }, params: { postId: post.id }, body: { emoji: '👍' } } as any,
      m.res,
    );
    assert(m.state.code === 200 && m.state.data.action === 'added', `friend adds 👍 → added (got ${m.state.code} ${JSON.stringify(m.state.data)})`);
    console.log('✅ Friend added 👍');

    let count = await prisma.reaction.count({ where: { postId: post.id, userId: friend.id } });
    assert(count === 1, `exactly one reaction row after add (got ${count})`);

    m = makeMockRes();
    await reactToPost(
      { user: { id: friend.id }, params: { postId: post.id }, body: { emoji: '❤️' } } as any,
      m.res,
    );
    assert(m.state.code === 200 && m.state.data.action === 'switched', `friend switches to ❤️ → switched (got ${JSON.stringify(m.state.data)})`);
    count = await prisma.reaction.count({ where: { postId: post.id, userId: friend.id } });
    assert(count === 1, `still exactly one reaction row after switch (got ${count})`);
    console.log('✅ Friend switched to ❤️ (still one row)');

    m = makeMockRes();
    await reactToPost(
      { user: { id: friend.id }, params: { postId: post.id }, body: { emoji: '❤️' } } as any,
      m.res,
    );
    assert(m.state.code === 200 && m.state.data.action === 'removed', `friend taps ❤️ again → removed (got ${JSON.stringify(m.state.data)})`);
    count = await prisma.reaction.count({ where: { postId: post.id, userId: friend.id } });
    assert(count === 0, `reaction row removed (got ${count})`);
    console.log('✅ Friend removed reaction by re-tapping');

    // Invalid emoji → 400
    m = makeMockRes();
    await reactToPost(
      { user: { id: friend.id }, params: { postId: post.id }, body: { emoji: '💩' } } as any,
      m.res,
    );
    assert(m.state.code === 400, `invalid emoji → 400 (got ${m.state.code})`);
    console.log('✅ Invalid emoji rejected with 400');

    // ── Access control: stranger is not a friend ───────────────────────
    console.log('\n--- Access control (non-friend forbidden) ---');

    m = makeMockRes();
    await reactToPost(
      { user: { id: stranger.id }, params: { postId: post.id }, body: { emoji: '👍' } } as any,
      m.res,
    );
    assert(m.state.code === 403, `stranger reactToPost → 403 (got ${m.state.code})`);
    console.log('✅ Stranger blocked from reacting to post (403)');

    m = makeMockRes();
    await getPostReactors(
      { user: { id: stranger.id }, params: { postId: post.id } } as any,
      m.res,
    );
    assert(m.state.code === 403, `stranger getPostReactors → 403 (got ${m.state.code})`);
    console.log('✅ Stranger blocked from listing post reactors (403)');

    m = makeMockRes();
    await reactToComment(
      { user: { id: stranger.id }, params: { commentId: comment.id }, body: { emoji: '👍' } } as any,
      m.res,
    );
    assert(m.state.code === 403, `stranger reactToComment → 403 (got ${m.state.code})`);
    console.log('✅ Stranger blocked from reacting to comment (403)');

    m = makeMockRes();
    await getCommentReactors(
      { user: { id: stranger.id }, params: { commentId: comment.id } } as any,
      m.res,
    );
    assert(m.state.code === 403, `stranger getCommentReactors → 403 (got ${m.state.code})`);
    console.log('✅ Stranger blocked from listing comment reactors (403)');

    // ── Comment reactions for a friend ─────────────────────────────────
    console.log('\n--- Comment reactions (friend) ---');

    m = makeMockRes();
    await reactToComment(
      { user: { id: friend.id }, params: { commentId: comment.id }, body: { emoji: '🔥' } } as any,
      m.res,
    );
    assert(m.state.code === 200 && m.state.data.userReaction === '🔥', `friend reacts 🔥 to comment (got ${JSON.stringify(m.state.data)})`);
    assert(m.state.data.reactionCount === 1, `comment reactionCount is 1 (got ${m.state.data.reactionCount})`);
    console.log('✅ Friend reacted 🔥 to comment');

    // Switch on comment
    m = makeMockRes();
    await reactToComment(
      { user: { id: friend.id }, params: { commentId: comment.id }, body: { emoji: '🏆' } } as any,
      m.res,
    );
    assert(m.state.data.userReaction === '🏆', `friend switches comment reaction to 🏆 (got ${JSON.stringify(m.state.data)})`);
    const likeCount = await prisma.commentLike.count({ where: { commentId: comment.id, userId: friend.id } });
    assert(likeCount === 1, `still one comment like row after switch (got ${likeCount})`);
    console.log('✅ Friend switched comment reaction (still one row)');

    // ── Reactor listings for a friend ──────────────────────────────────
    console.log('\n--- Reactor listings (friend) ---');

    // Ensure the friend has a post reaction to list.
    m = makeMockRes();
    await reactToPost(
      { user: { id: friend.id }, params: { postId: post.id }, body: { emoji: '🙏' } } as any,
      m.res,
    );

    m = makeMockRes();
    await getPostReactors(
      { user: { id: friend.id }, params: { postId: post.id } } as any,
      m.res,
    );
    assert(m.state.code === 200 && Array.isArray(m.state.data.reactors), `friend lists post reactors (got ${m.state.code})`);
    assert(
      m.state.data.reactors.some((r: any) => r.emoji === '🙏' && r.user.username?.includes('friend')),
      `post reactors include the friend with 🙏 (got ${JSON.stringify(m.state.data.reactors)})`,
    );
    console.log('✅ Friend listed post reactors');

    m = makeMockRes();
    await getCommentReactors(
      { user: { id: friend.id }, params: { commentId: comment.id } } as any,
      m.res,
    );
    assert(m.state.code === 200 && Array.isArray(m.state.data.reactors), `friend lists comment reactors (got ${m.state.code})`);
    assert(
      m.state.data.reactors.some((r: any) => r.emoji === '🏆'),
      `comment reactors include 🏆 (got ${JSON.stringify(m.state.data.reactors)})`,
    );
    console.log('✅ Friend listed comment reactors');

    console.log('\n🎉 ALL reactions access-control tests PASSED successfully!');
  } catch (error) {
    console.error('\n❌ Test execution failed:', error);
    process.exit(1);
  } finally {
    console.log('\n🧹 Cleaning up test data...');
    await cleanup();
    await prisma.$disconnect();
  }
}

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { in: [EMAILS.author, EMAILS.friend, EMAILS.stranger] } },
  });
  const userIds = users.map(u => u.id);
  if (userIds.length === 0) return;

  // Deleting users cascades to friendships, feed posts, comments, reactions,
  // comment likes and notifications (recipient), so this is sufficient.
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

runTests();
