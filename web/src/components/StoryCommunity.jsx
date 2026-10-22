import { Heart, LogIn, MessageCircle, Reply, Send, ShieldCheck, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatCount } from '../lib/readingMode'
import { timeAgo } from '../lib/time'
import { Avatar } from './HeaderMenus'
import { useToast } from './ui'

/** Heart button with count. Guests are sent to sign in. */
export function LikeButton({ slug, liked, count, onChange, className = '' }) {
  const { user } = useAuth()
  const toast = useToast()
  const location = useLocation()
  const [busy, setBusy] = useState(false)
  const [pop, setPop] = useState(false)

  if (!user) {
    return (
      <Link to="/login" state={{ from: location.pathname }} className={`btn-ghost ${className}`} title="Sign in to like">
        <Heart className="h-4 w-4" /> {formatCount(count)}
      </Link>
    )
  }

  async function toggle() {
    setBusy(true)
    const next = !liked
    onChange({ liked: next, like_count: count + (next ? 1 : -1) }) // optimistic
    if (next) {
      setPop(true)
      setTimeout(() => setPop(false), 450)
    }
    try {
      onChange(next ? await api.post(`stories/${slug}/like/`) : await api.delete(`stories/${slug}/like/`))
    } catch (e) {
      onChange({ liked, like_count: count })
      toast(e, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={liked}
      className={`btn-ghost ${liked ? '!border-rose-400/60 !bg-rose-500/10 text-rose-400' : ''} ${className}`}
      title={liked ? 'Unlike' : 'Like this story'}
    >
      <Heart className={`h-4 w-4 transition-transform ${liked ? 'fill-current' : ''} ${pop ? 'scale-150' : ''}`} />
      {formatCount(count)} {liked ? 'Liked' : 'Like'}
    </button>
  )
}

function CommentBox({ onSubmit, placeholder = 'Share your thoughts…', autoFocus = false, onCancel }) {
  const { user } = useAuth()
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!body.trim()) return
    setBusy(true)
    try {
      await onSubmit(body.trim())
      setBody('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex items-start gap-3">
      <Avatar user={user} size="h-9 w-9" />
      <div className="flex-1">
        <textarea
          className="input min-h-20 resize-y"
          placeholder={placeholder}
          maxLength={1000}
          autoFocus={autoFocus}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key === 'Enter' && submit(e)}
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          <span className="mr-auto text-[11px] text-muted">{body.length}/1000</span>
          {onCancel && (
            <button type="button" className="btn-ghost !py-1.5" onClick={onCancel}>Cancel</button>
          )}
          <button className="btn-primary !py-1.5" disabled={busy || !body.trim()}>
            <Send className="h-4 w-4" /> {busy ? 'Posting…' : 'Post'}
          </button>
        </div>
      </div>
    </form>
  )
}

function CommentItem({ comment, onReply, onDelete, isReply = false }) {
  return (
    <div id={`comment-${comment.id}`} className="flex scroll-mt-28 gap-3">
      <Avatar user={comment.user} size={isReply ? 'h-8 w-8' : 'h-10 w-10'} />
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl rounded-tl-md bg-surface-2/70 px-4 py-2.5">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
            {comment.user.first_name} {comment.user.last_name}
            {comment.user.is_admin && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand">
                <ShieldCheck className="h-3 w-3" /> Author
              </span>
            )}
          </p>
          <p className="mt-0.5 text-sm whitespace-pre-wrap">{comment.body}</p>
        </div>
        <div className="mt-1 flex items-center gap-3 px-2 text-xs text-muted">
          <span title={new Date(comment.created_at).toLocaleString()}>{timeAgo(comment.created_at)}</span>
          {onReply && (
            <button type="button" className="inline-flex items-center gap-1 font-semibold hover:text-ink" onClick={onReply}>
              <Reply className="h-3.5 w-3.5" /> Reply
            </button>
          )}
          {comment.can_delete && (
            <button type="button" className="inline-flex items-center gap-1 hover:text-rose-400" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Comments under a story: newest first, one level of replies. */
export function StoryComments({ slug, onCounts }) {
  const { user } = useAuth()
  const toast = useToast()
  const location = useLocation()
  const [items, setItems] = useState(null)
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [replyTo, setReplyTo] = useState(null)

  const load = useCallback(
    async (p = 1) => {
      const data = await api.get(`stories/${slug}/comments/`, { page: p })
      setItems((list) => (p === 1 ? data.results : [...(list || []), ...data.results]))
      setCount(data.count)
      setHasMore(data.has_more)
      setPage(p)
      onCounts?.({ liked: data.liked, like_count: data.like_count, comment_count: data.count })
    },
    [slug], // eslint-disable-line react-hooks/exhaustive-deps
  )

  useEffect(() => {
    load(1).catch(() => setItems([]))
  }, [load, user?.id])

  // Links like /stories/x#comment-42 (from notifications) jump to that comment once loaded.
  useEffect(() => {
    if (!items || !location.hash.startsWith('#comment')) return
    requestAnimationFrame(() => document.querySelector(location.hash)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }, [items, location.hash])

  async function post(body, parent) {
    try {
      const { comment, count: total } = await api.post(`stories/${slug}/comments/`, { body, parent })
      setCount(total)
      onCounts?.({ comment_count: total })
      if (comment.parent) {
        setItems((list) => list.map((c) => (c.id === comment.parent ? { ...c, replies: [...c.replies, comment] } : c)))
        setReplyTo(null)
      } else {
        setItems((list) => [{ ...comment, replies: [] }, ...list])
      }
    } catch (e) {
      toast(e, 'error')
      throw e
    }
  }

  async function remove(comment) {
    if (!window.confirm('Delete this comment?')) return
    try {
      const { count: total } = await api.delete(`comments/${comment.id}/`)
      setCount(total)
      onCounts?.({ comment_count: total })
      setItems((list) =>
        comment.parent
          ? list.map((c) => (c.id === comment.parent ? { ...c, replies: c.replies.filter((r) => r.id !== comment.id) } : c))
          : list.filter((c) => c.id !== comment.id),
      )
    } catch (e) {
      toast(e, 'error')
    }
  }

  return (
    <section id="comments" className="card mt-8 scroll-mt-24 p-6">
      <h2 className="flex items-center gap-2 font-display text-2xl">
        <MessageCircle className="h-6 w-6 text-brand" /> Comments <span className="text-base text-muted">({count})</span>
      </h2>

      <div className="mt-5">
        {user ? (
          <CommentBox onSubmit={(body) => post(body)} />
        ) : (
          <Link to="/login" state={{ from: location.pathname }} className="flex items-center gap-2 rounded-xl border border-dashed border-line p-4 text-sm text-muted hover:border-brand hover:text-ink">
            <LogIn className="h-4 w-4" /> Sign in to join the conversation
          </Link>
        )}
      </div>

      <div className="mt-6 space-y-5">
        {items === null && <p className="text-sm text-muted">Loading comments…</p>}
        {items?.length === 0 && <p className="py-6 text-center text-sm text-muted">No comments yet. Be the first to share your thoughts!</p>}
        {items?.map((c) => (
          <div key={c.id}>
            <CommentItem comment={c} onReply={user ? () => setReplyTo(c.id) : null} onDelete={() => remove(c)} />
            <div className="mt-3 ml-12 space-y-3 border-l-2 border-line/70 pl-4">
              {c.replies.map((r) => (
                <CommentItem key={r.id} comment={r} isReply onReply={user ? () => setReplyTo(c.id) : null} onDelete={() => remove(r)} />
              ))}
              {replyTo === c.id && (
                <CommentBox
                  autoFocus
                  placeholder={`Reply to ${c.user.first_name}…`}
                  onSubmit={(body) => post(body, c.id)}
                  onCancel={() => setReplyTo(null)}
                />
              )}
            </div>
          </div>
        ))}
        {hasMore && (
          <button type="button" className="btn-ghost w-full" onClick={() => load(page + 1)}>
            Load more comments
          </button>
        )}
      </div>
    </section>
  )
}
