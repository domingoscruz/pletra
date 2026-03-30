"use client";

import { useState, useEffect, useCallback } from "react";
import { ProxiedImage as Image } from "@/components/ui/proxied-image";
import Link from "@/components/ui/link";
import { proxyImageUrl } from "@/lib/image-proxy";
import { useToast } from "@/lib/toast";

interface CommentUser {
	username?: string;
	name?: string;
	ids?: { slug?: string };
	images?: { avatar?: { full?: string } };
}

interface CommentData {
	id: number;
	parent_id?: number;
	comment: string;
	spoiler: boolean;
	review: boolean;
	created_at: string;
	likes: number;
	replies: number;
	user_stats?: { rating?: number | null };
	user?: CommentUser;
	user_rating?: { rating?: number };
}

type SortMode = "newest" | "oldest" | "likes" | "replies";

interface CommentsProps {
	mediaType: "movies" | "shows" | "episodes";
	slug: string;
	seasonNumber?: number;
	episodeNumber?: number;
	/** Trakt IDs for the entity — needed for episode comments to target the right entity */
	entityIds?: Record<string, unknown>;
	defaultCount?: number;
}

export function Comments({
	mediaType,
	slug,
	seasonNumber,
	episodeNumber,
	entityIds,
	defaultCount = 5,
}: CommentsProps) {
	const [comments, setComments] = useState<CommentData[]>([]);
	const [sort, setSort] = useState<SortMode>("likes");
	const [page, setPage] = useState(1);
	const [loading, setLoading] = useState(true);
	const [hasMore, setHasMore] = useState(false);
	const [expandedReplies, setExpandedReplies] = useState<Set<number>>(new Set());
	const [repliesMap, setRepliesMap] = useState<Map<number, CommentData[]>>(new Map());
	const [loadingReplies, setLoadingReplies] = useState<Set<number>>(new Set());
	const [totalLoaded, setTotalLoaded] = useState(0);

	const limit = defaultCount;

	const fetchComments = useCallback(
		async (p: number, s: SortMode) => {
			setLoading(true);
			try {
				let path: string;
				if (mediaType === "episodes" && seasonNumber != null && episodeNumber != null) {
					path = `/api/trakt/shows/${slug}/seasons/${seasonNumber}/episodes/${episodeNumber}/comments/${s}`;
				} else if (mediaType === "shows") {
					path = `/api/trakt/shows/${slug}/comments/${s}`;
				} else {
					path = `/api/trakt/movies/${slug}/comments/${s}`;
				}

				const res = await fetch(`${path}?page=${p}&limit=${limit}&extended=full`);
				if (res.ok) {
					const data: CommentData[] = await res.json();
					if (p === 1) {
						setComments(data);
						setTotalLoaded(data.length);
					} else {
						setComments((prev) => [...prev, ...data]);
						setTotalLoaded((prev) => prev + data.length);
					}
					setHasMore(data.length >= limit);
				}
			} catch {
				// non-critical
			} finally {
				setLoading(false);
			}
		},
		[mediaType, slug, seasonNumber, episodeNumber, limit],
	);

	useEffect(() => {
		setPage(1);
		setComments([]);
		setExpandedReplies(new Set());
		setRepliesMap(new Map());
		fetchComments(1, sort);
	}, [sort, fetchComments]);

	const loadMore = useCallback(() => {
		const nextPage = page + 1;
		setPage(nextPage);
		fetchComments(nextPage, sort);
	}, [page, sort, fetchComments]);

	const toggleReplies = useCallback(
		async (commentId: number) => {
			if (expandedReplies.has(commentId)) {
				setExpandedReplies((prev) => {
					const next = new Set(prev);
					next.delete(commentId);
					return next;
				});
				return;
			}

			// Fetch replies if not cached
			if (!repliesMap.has(commentId)) {
				setLoadingReplies((prev) => new Set(prev).add(commentId));
				try {
					const res = await fetch(
						`/api/trakt/comments/${commentId}/replies?page=1&limit=10&extended=full`,
					);
					if (res.ok) {
						const data: CommentData[] = await res.json();
						setRepliesMap((prev) => new Map(prev).set(commentId, data));
					}
				} catch {
					// non-critical
				} finally {
					setLoadingReplies((prev) => {
						const next = new Set(prev);
						next.delete(commentId);
						return next;
					});
				}
			}

			setExpandedReplies((prev) => new Set(prev).add(commentId));
		},
		[expandedReplies, repliesMap],
	);

	const { toast } = useToast();
	const [newComment, setNewComment] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [isSpoiler, setIsSpoiler] = useState(false);

	const submitComment = useCallback(async () => {
		if (!newComment.trim() || submitting) return;
		setSubmitting(true);
		try {
			const body: Record<string, unknown> = {
				comment: newComment.trim(),
				spoiler: isSpoiler,
			};
			if (mediaType === "episodes" && entityIds) {
				body.episode = { ids: entityIds };
			} else if (mediaType === "shows") {
				body.show = { ids: { slug } };
			} else {
				body.movie = { ids: { slug } };
			}
			const res = await fetch("/api/trakt/comments", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			if (!res.ok) {
				const errText = await res.text();
				let message = "Failed to post comment";
				if (res.status === 422) {
					message = "Comments must be at least 5 words long.";
				} else if (errText) {
					try {
						const parsed = JSON.parse(errText);
						message = parsed.error || parsed.message || errText;
					} catch {
						message = errText;
					}
				}
				throw new Error(message);
			}
			const posted = (await res.json()) as CommentData;
			setNewComment("");
			setIsSpoiler(false);
			// Optimistically add the new comment to the top
			setComments((prev) => [posted, ...prev]);
			setTotalLoaded((prev) => prev + 1);
		} catch (e) {
			toast(e instanceof Error ? e.message : "Failed to post comment");
		} finally {
			setSubmitting(false);
		}
	}, [newComment, submitting, isSpoiler, mediaType, slug, entityIds]);

	const sortOptions: { value: SortMode; label: string }[] = [
		{ value: "likes", label: "Top" },
		{ value: "newest", label: "Recent" },
		{ value: "oldest", label: "Oldest" },
		{ value: "replies", label: "Most Replied" },
	];

	return (
		<div>
			<div className="mb-4 flex items-center gap-3">
				<h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-200">Comments</h3>
				<div className="h-px flex-1 bg-zinc-700/50" />
				<div className="flex gap-1">
					{sortOptions.map((opt) => (
						<button
							key={opt.value}
							onClick={() => setSort(opt.value)}
							className={`cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
								sort === opt.value ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"
							}`}
						>
							{opt.label}
						</button>
					))}
				</div>
			</div>

			{loading && comments.length === 0 ? (
				<div className="space-y-4">
					{Array.from({ length: 3 }).map((_, i) => (
						<div key={i} className="flex gap-3">
							<div className="skeleton h-8 w-8 rounded-full" />
							<div className="flex-1 space-y-2">
								<div className="skeleton h-3 w-24 rounded" />
								<div className="skeleton h-3 w-full rounded" />
							</div>
						</div>
					))}
				</div>
			) : comments.length === 0 ? (
				<div className="text-sm text-zinc-600">No comments yet.</div>
			) : (
				<div className="space-y-4">
					{comments.map((comment) => {
						const replies = repliesMap.get(comment.id);
						const isExpanded = expandedReplies.has(comment.id);
						const isLoadingReplies = loadingReplies.has(comment.id);

						return (
							<div key={comment.id}>
								<CommentCard
									comment={comment}
									onToggleReplies={
										comment.replies > 0 ? () => toggleReplies(comment.id) : undefined
									}
									isExpanded={isExpanded}
									isLoadingReplies={isLoadingReplies}
								/>
								{isExpanded && replies && replies.length > 0 && (
									<div className="mt-2 ml-10 space-y-3 border-l border-zinc-800 pl-4">
										{replies.map((reply) => (
											<CommentCard key={reply.id} comment={reply} isReply />
										))}
									</div>
								)}
							</div>
						);
					})}

					{hasMore && (
						<button
							onClick={loadMore}
							disabled={loading}
							className="cursor-pointer text-sm text-zinc-400 transition-colors hover:text-white disabled:opacity-50"
						>
							{loading ? "Loading..." : "Load more comments"}
						</button>
					)}
				</div>
			)}

			{/* Comment form */}
			<div className="mt-6 space-y-2">
				<textarea
					value={newComment}
					onChange={(e) => setNewComment(e.target.value)}
					placeholder="Add a comment..."
					rows={2}
					className="w-full resize-none rounded-lg border border-zinc-800 bg-white/[0.03] px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-zinc-600 focus:bg-white/[0.05]"
				/>
				{newComment.trim() && (
					<div className="flex items-center justify-end gap-3">
						<button
							onClick={() => setIsSpoiler(!isSpoiler)}
							className={`cursor-pointer rounded-full px-2.5 py-1 text-[11px] transition-colors ${
								isSpoiler ? "bg-yellow-500/10 text-yellow-400" : "text-zinc-600 hover:text-zinc-400"
							}`}
						>
							{isSpoiler ? "⚠ Spoiler" : "Spoiler?"}
						</button>
						<button
							onClick={submitComment}
							disabled={submitting}
							className="cursor-pointer rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-default disabled:opacity-40"
						>
							{submitting ? "Posting..." : "Post"}
						</button>
					</div>
				)}
			</div>
		</div>
	);
}

function CommentCard({
	comment,
	isReply = false,
	onToggleReplies,
	isExpanded,
	isLoadingReplies,
}: {
	comment: CommentData;
	isReply?: boolean;
	onToggleReplies?: () => void;
	isExpanded?: boolean;
	isLoadingReplies?: boolean;
}) {
	const timeAgo = formatRelativeTime(comment.created_at);
	const displayName = comment.user?.name || comment.user?.username || "Anonymous";
	const avatarUrl = proxyImageUrl(comment.user?.images?.avatar?.full);
	const initial = displayName[0].toUpperCase();
	const userSlug = comment.user?.ids?.slug ?? comment.user?.username;
	const profileHref = userSlug ? `/users/${userSlug}` : undefined;

	return (
		<div className="flex items-start gap-3">
			{/* Avatar */}
			{profileHref ? (
				<Link
					href={profileHref}
					className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-zinc-800 transition-opacity hover:opacity-80"
				>
					{avatarUrl ? (
						<Image src={avatarUrl} alt={displayName} fill className="object-cover" sizes="32px" />
					) : (
						<div className="flex h-full w-full items-center justify-center text-xs font-medium text-zinc-400">
							{initial}
						</div>
					)}
				</Link>
			) : (
				<div className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-zinc-800">
					{avatarUrl ? (
						<Image src={avatarUrl} alt={displayName} fill className="object-cover" sizes="32px" />
					) : (
						<div className="flex h-full w-full items-center justify-center text-xs font-medium text-zinc-400">
							{initial}
						</div>
					)}
				</div>
			)}

			<div className="min-w-0 flex-1">
				{/* Header */}
				<div className="flex items-center gap-2">
					{profileHref ? (
						<Link
							href={profileHref}
							className="text-sm font-medium text-zinc-200 transition-colors hover:text-white"
						>
							{displayName}
						</Link>
					) : (
						<span className="text-sm font-medium text-zinc-200">{displayName}</span>
					)}
					{comment.user?.username && comment.user.name && (
						<span className="text-[11px] text-zinc-600">@{comment.user.username}</span>
					)}
					{comment.user_stats?.rating != null && (
						<span className="text-[11px] text-yellow-400">★ {comment.user_stats.rating}</span>
					)}
					{comment.review && (
						<span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-medium text-accent">
							Review
						</span>
					)}
					<span className="text-[11px] text-zinc-600">{timeAgo}</span>
				</div>

				{/* Content */}
				{comment.spoiler ? (
					<details className="mt-1.5">
						<summary className="cursor-pointer text-sm text-yellow-500/80 hover:text-yellow-400">
							Contains spoilers — tap to reveal
						</summary>
						<p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{comment.comment}</p>
					</details>
				) : (
					<p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{comment.comment}</p>
				)}

				{/* Footer */}
				<div className="mt-2 flex items-center gap-3 text-[11px] text-zinc-600">
					{comment.likes > 0 && (
						<span className="flex items-center gap-1">
							<svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
								<path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" />
							</svg>
							{comment.likes}
						</span>
					)}
					{!isReply && onToggleReplies && (
						<button
							onClick={onToggleReplies}
							className="flex cursor-pointer items-center gap-1 transition-colors hover:text-zinc-300"
						>
							<svg
								className="h-3 w-3"
								fill="none"
								stroke="currentColor"
								strokeWidth={1.5}
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z"
								/>
							</svg>
							{isLoadingReplies
								? "Loading..."
								: isExpanded
									? "Hide replies"
									: `${comment.replies} ${comment.replies === 1 ? "reply" : "replies"}`}
						</button>
					)}
				</div>
			</div>
		</div>
	);
}

function formatRelativeTime(dateStr: string) {
	const date = new Date(dateStr);
	const now = new Date();
	const diff = now.getTime() - date.getTime();
	const days = Math.floor(diff / 86400000);
	const months = Math.floor(days / 30);
	const years = Math.floor(days / 365);

	if (days < 1) return "today";
	if (days === 1) return "yesterday";
	if (days < 30) return `${days}d ago`;
	if (months < 12) return `${months}mo ago`;
	return `${years}y ago`;
}
