import React, { useEffect } from 'react';
import { useInView } from 'react-intersection-observer';
import { useFeedStore } from '../store/feedStore';
import FeedPostCard from '../components/social/FeedPostCard';
import FeedBudgetSidebar from '../components/social/FeedBudgetSidebar';
import FeedFriendsSidebar from '../components/social/FeedFriendsSidebar';
import { Coffee, AlertCircle } from 'lucide-react';

const Feed: React.FC = () => {
  const { 
    posts, 
    isLoading, 
    isFetchingNextPage, 
    nextCursor, 
    error, 
    fetchFeed 
  } = useFeedStore();

  const { ref, inView } = useInView({
    threshold: 0,
    rootMargin: '100px',
  });

  useEffect(() => {
    // Only perform an initial fetch if feed is currently empty, to avoid navigation layout flash
    if (posts.length === 0) {
      fetchFeed(true);
    }
  }, [fetchFeed, posts.length]);

  useEffect(() => {
    if (inView && nextCursor && !isFetchingNextPage && !isLoading) {
      fetchFeed(false); // Fetch next page
    }
  }, [inView, nextCursor, isFetchingNextPage, isLoading, fetchFeed]);

  return (
    <div className="w-full max-w-[1304px] xl:max-w-[1424px] 2xl:max-w-[1544px] mx-auto pb-20 px-0 sm:px-4 relative animate-fadeInFast">
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_280px] xl:grid-cols-[340px_1fr_340px] 2xl:grid-cols-[400px_1fr_400px] gap-8 items-start">
        {/* Left Column: Budget Category Quick Tracker (Sticky) */}
        <div className="hidden lg:block animate-sidebar-left sticky top-24 self-start">
          <FeedBudgetSidebar />
        </div>

        {/* Center Column: Scrollable Activity Feed List */}
        <div className="w-full max-w-[680px] mx-auto">
          {/* Feed Header */}
          <div className="mb-2">
            <h1 className="font-display font-bold text-fluid-h1 text-foreground leading-tight">
              Activity Feed
            </h1>
            <p className="text-sm text-muted mt-1">
              See what your friends are up to and stay on track together.
            </p>
          </div>

          {/* Main Feed Content */}
          <div className="flex flex-col gap-4">
            {posts.map((post, index) => (
              <FeedPostCard key={post.id} post={post} index={index} />
            ))}

            {/* Loading Indicator Spinner */}
            {(isLoading || isFetchingNextPage) && (
              <div className="flex flex-col items-center justify-center py-12 gap-3" role="status" aria-live="polite">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-muted text-sm font-medium">Loading activity...</p>
              </div>
            )}

            {/* Feed Empty State */}
            {!isLoading && posts.length === 0 && !error && (
              <div className="bg-surface rounded-xl p-12 text-center border border-border animate-fadeIn">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Coffee className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-lg font-display font-bold text-foreground mb-2">Quiet in here</h2>
                <p className="text-muted text-sm max-w-sm mx-auto leading-relaxed">
                  Your feed is empty. Add friends who share their activity to see updates here.
                </p>
              </div>
            )}

            {/* Error Retrieval UI Banner */}
            {error && (
              <div className="bg-error/5 border border-error/20 rounded-xl p-6 text-center animate-fadeIn" role="alert">
                <AlertCircle className="w-6 h-6 text-error mx-auto mb-2" />
                <p className="text-error text-sm font-medium">{error}</p>
                <button
                  onClick={() => fetchFeed(true)}
                  disabled={isLoading}
                  className="mt-3 px-4 py-2 bg-error text-white rounded-lg text-sm font-semibold hover:bg-error/90 transition-colors cursor-pointer btn-press disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Retrying...' : 'Try Again'}
                </button>
              </div>
            )}

            {/* Infinite Scroll Trigger */}
            <div ref={ref} className="h-10" />
          </div>
        </div>

        {/* Right Column: Friends Ledger Summary (Sticky) */}
        <div className="hidden lg:block animate-sidebar-right sticky top-24 self-start">
          <FeedFriendsSidebar />
        </div>
      </div>
    </div>
  );
};

export default Feed;
