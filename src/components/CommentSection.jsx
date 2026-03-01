import { useState, useEffect, useRef } from "react";
import {
  getComments,
  addComment,
  editComment,
  subscribeToComments,
  getCommentsArray,
  getCommentCount,
  COMMENT_MAX_LENGTH,
} from "../lib/commentService";
import { useAuth } from "../context/AuthContext";
import { useProfile } from "../hooks/useProfile";
import { UserAvatar } from "./Avatar";
import { MessageSquare, Send, X, Pencil, Check, ChevronDown, ChevronUp } from "lucide-react";

function getTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  
  return new Date(timestamp).toLocaleDateString();
}

function CommentItem({ comment, isOwner, onEdit }) {
  const { profile } = useProfile(comment.author);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.text);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleStartEdit = () => {
    setEditText(comment.text);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setEditText(comment.text);
    setIsEditing(false);
  };

  const handleSaveEdit = async () => {
    if (!editText.trim() || editText.trim() === comment.text) {
      handleCancelEdit();
      return;
    }

    setIsSaving(true);
    try {
      await onEdit(comment.key, editText.trim());
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to edit comment:", err);
      alert(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === "Escape") {
      handleCancelEdit();
    }
  };

  const displayName = profile?.username || comment.author?.slice(0, 8) + "...";

  return (
    <div className="comment-item">
      <UserAvatar 
        address={comment.author} 
        name={profile?.username}
        src={profile?.avatar}
        size={32} 
      />
      <div className="comment-item__content">
        <div className="comment-item__header">
          <span className="comment-item__author">{displayName}</span>
          <span className="comment-item__time">{getTimeAgo(comment.timestamp)}</span>
          {comment.editedAt && (
            <span className="comment-item__edited">(edited)</span>
          )}
        </div>
        {isEditing ? (
          <div className="comment-item__edit">
            <div className="comment-item__edit-textarea-wrapper">
              <textarea
                ref={inputRef}
                value={editText}
                onChange={(e) => setEditText(e.target.value.slice(0, COMMENT_MAX_LENGTH))}
                onKeyDown={handleKeyDown}
                rows={2}
                disabled={isSaving}
              />
              <span className={`comment-form__counter ${editText.length >= COMMENT_MAX_LENGTH ? "comment-form__counter--error" : editText.length > COMMENT_MAX_LENGTH * 0.9 ? "comment-form__counter--warning" : ""}`}>
                {editText.length}/{COMMENT_MAX_LENGTH}
              </span>
            </div>
            <div className="comment-item__edit-actions">
              <button
                className="btn btn-primary btn-xs"
                onClick={handleSaveEdit}
                disabled={isSaving || !editText.trim() || editText.length > COMMENT_MAX_LENGTH}
              >
                <Check size={12} />
                {isSaving ? "Saving..." : "Save"}
              </button>
              <button
                className="btn btn-secondary btn-xs"
                onClick={handleCancelEdit}
                disabled={isSaving}
              >
                <X size={12} />
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="comment-item__text">{comment.text}</p>
        )}
      </div>
      {isOwner && !isEditing && (
        <button
          className="comment-item__edit-btn"
          onClick={handleStartEdit}
          title="Edit comment"
        >
          <Pencil size={14} />
        </button>
      )}
    </div>
  );
}

const COMMENTS_PER_PAGE = 5;

function CommentSection({ fileId, initiallyExpanded = false }) {
  const { isAuthenticated, user } = useAuth();
  const [comments, setComments] = useState({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [newComment, setNewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [visibleCount, setVisibleCount] = useState(COMMENTS_PER_PAGE);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!fileId) return;

    const loadComments = async () => {
      setLoading(true);
      const data = await getComments(fileId);
      setComments(data);
      setLoading(false);
    };

    loadComments();

    const unsubscribe = subscribeToComments(fileId, (data) => {
      setComments(data);
    });

    return unsubscribe;
  }, [fileId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await addComment(fileId, newComment.trim());
      setNewComment("");
      setExpanded(true); // Expand to show the new comment
    } catch (err) {
      console.error("Failed to add comment:", err);
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async (commentKey, newText) => {
    await editComment(fileId, commentKey, newText);
  };

  const commentCount = getCommentCount(comments);
  const commentsArray = getCommentsArray(comments);
  const visibleComments = commentsArray.slice(0, visibleCount);
  const hasMoreComments = commentsArray.length > visibleCount;
  const remainingCount = commentsArray.length - visibleCount;

  const handleLoadMore = () => {
    setVisibleCount(prev => prev + COMMENTS_PER_PAGE);
  };

  return (
    <div className="comment-section">
      <button
        className="comment-section__toggle"
        onClick={() => setExpanded(!expanded)}
      >
        <MessageSquare size={16} />
        <span>{commentCount} {commentCount === 1 ? "comment" : "comments"}</span>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {expanded && (
        <div className="comment-section__content">
          {loading ? (
            <div className="comment-section__loading">Loading comments...</div>
          ) : (
            <>
              {commentsArray.length === 0 ? (
                <div className="comment-section__empty">
                  No comments yet. Be the first to comment!
                </div>
              ) : (
                <>
                  <div className="comment-list">
                    {visibleComments.map((comment) => (
                      <CommentItem
                        key={comment.key}
                        comment={comment}
                        isOwner={user?.address === comment.author}
                        onEdit={handleEdit}
                      />
                    ))}
                  </div>
                  {hasMoreComments && (
                    <button 
                      className="comment-section__load-more"
                      onClick={handleLoadMore}
                    >
                      Load more ({remainingCount} more {remainingCount === 1 ? "comment" : "comments"})
                    </button>
                  )}
                </>
              )}

              {isAuthenticated ? (
                <form className="comment-form" onSubmit={handleSubmit}>
                  <UserAvatar 
                    address={user?.address} 
                    name={user?.username}
                    src={user?.avatar}
                    size={32} 
                  />
                  <div className="comment-form__input-wrapper">
                    <input
                      ref={inputRef}
                      type="text"
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value.slice(0, COMMENT_MAX_LENGTH))}
                      placeholder={`Write a comment... (max ${COMMENT_MAX_LENGTH} chars)`}
                      disabled={isSubmitting}
                    />
                    <span className={`comment-form__counter ${newComment.length >= COMMENT_MAX_LENGTH ? "comment-form__counter--error" : newComment.length > COMMENT_MAX_LENGTH * 0.9 ? "comment-form__counter--warning" : ""}`}>
                      {newComment.length}/{COMMENT_MAX_LENGTH}
                    </span>
                  </div>
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    disabled={isSubmitting || !newComment.trim() || newComment.length > COMMENT_MAX_LENGTH}
                  >
                    <Send size={14} />
                  </button>
                </form>
              ) : (
                <div className="comment-section__auth-prompt">
                  Sign in to leave a comment
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default CommentSection;
