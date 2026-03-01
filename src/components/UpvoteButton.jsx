import { useState, useEffect } from "react";
import {
  getUpvotes,
  toggleUpvote,
  subscribeToUpvotes,
  getUpvoteCount,
  isUpvotedBy,
} from "../lib/upvoteService";
import { useAuth } from "../context/AuthContext";
import { ThumbsUp } from "lucide-react";

function UpvoteButton({ fileId, compact = false }) {
  const { isAuthenticated, user } = useAuth();
  const [upvotes, setUpvotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);

  useEffect(() => {
    if (!fileId) return;

    const loadUpvotes = async () => {
      setLoading(true);
      const data = await getUpvotes(fileId);
      setUpvotes(data);
      setLoading(false);
    };

    loadUpvotes();

    const unsubscribe = subscribeToUpvotes(fileId, (data) => {
      setUpvotes(data);
    });

    return unsubscribe;
  }, [fileId]);

  const handleToggle = async () => {
    if (!isAuthenticated || isToggling) return;

    setIsToggling(true);
    try {
      await toggleUpvote(fileId);
    } catch (err) {
      console.error("Failed to toggle upvote:", err);
    } finally {
      setIsToggling(false);
    }
  };

  const count = getUpvoteCount(upvotes);
  const hasUpvoted = isUpvotedBy(upvotes, user?.address);

  if (compact) {
    return (
      <button
        className={`upvote-btn upvote-btn--compact ${hasUpvoted ? "upvote-btn--active" : ""}`}
        onClick={handleToggle}
        disabled={!isAuthenticated || isToggling}
        title={isAuthenticated ? (hasUpvoted ? "Remove upvote" : "Upvote") : "Sign in to upvote"}
      >
        <ThumbsUp size={14} />
        <span>{loading ? "..." : count}</span>
      </button>
    );
  }

  return (
    <button
      className={`upvote-btn ${hasUpvoted ? "upvote-btn--active" : ""}`}
      onClick={handleToggle}
      disabled={!isAuthenticated || isToggling}
      title={isAuthenticated ? (hasUpvoted ? "Remove upvote" : "Upvote") : "Sign in to upvote"}
    >
      <ThumbsUp size={16} />
      <span className="upvote-btn__count">{loading ? "..." : count}</span>
      {!compact && <span className="upvote-btn__label">{count === 1 ? "like" : "likes"}</span>}
    </button>
  );
}

export default UpvoteButton;
