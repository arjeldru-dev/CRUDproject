import React, { useEffect } from 'react';
import { useInView } from 'react-intersection-observer';
import { useFeedStore } from '../store/feedStore';
import FeedPostCard from '../components/social/FeedPostCard';
import { Sparkles, Coffee, AlertCircle } from 'lucide-react';

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
    fetchFeed(true); // Initial fetch (reset)
  }, []);

  useEffect(() => {
    if (inView && nextCursor && !isFetchingNextPage && !isLoading) {
      fetchFeed(false); // Fetch next page
    }
  }, [inView, nextCursor, isFetchingNextPage, isLoading]);

  return (
    <div className="max-w-3xl mx-auto space-y-10">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-display font-bold tracking-tight text-foreground flex items-center gap-3">
          Activity Feed
          <Sparkles className="w-8 h-8 text-primary animate-pulse" />
        </h1>
        <p className="text-muted text-lg">See what your friends are up to and stay on track together.</p>
      </div>

      {/* Main Feed */}
      <div className="space-y-6">
        {posts.map((post) => (
          <FeedPostCard key={post.id} post={post} />
        ))}

        {/* Loading State */}
        {(isLoading || isFetchingNextPage) && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            <p className="text-muted font-medium animate-pulse">Loading amazing activities...</p>
          </div>
        )}

        {/* End of Feed / Empty State */}
        {!isLoading && posts.length === 0 && !error && (
          <div className="bg-surface rounded-[32px] p-12 text-center border-2 border-dashed border-border-subtle animate-fadeIn">
            <div className="bg-primary/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Coffee className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-2xl font-display font-bold text-foreground mb-3">Quiet in here...</h2>
            <p className="text-muted max-w-md mx-auto leading-relaxed">
              Your feed is empty because your friends haven't logged any transactions yet, or you haven't added friends who share their activity.
            </p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-error/5 border border-error/20 rounded-2xl p-6 text-center animate-fadeIn">
            <AlertCircle className="w-8 h-8 text-error mx-auto mb-3" />
            <p className="text-error font-medium">{error}</p>
            <button
              onClick={() => fetchFeed(true)}
              className="mt-4 px-6 py-2 bg-error text-white rounded-xl font-bold hover:bg-error/90 transition-colors cursor-pointer"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Infinite Scroll Trigger */}
        <div ref={ref} className="h-10" />
      </div>
    </div>
  );
};

export default Feed;
