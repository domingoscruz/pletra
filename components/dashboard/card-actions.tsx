"use client";

import { useState } from "react";
import { useRate } from "@/lib/mutations/use-rate";
import { useMarkWatched } from "@/lib/mutations/use-mark-watched";
import { useWatchlist } from "@/lib/mutations/use-watchlist";
import { StarRating } from "@/components/ui/star-rating";
import { useToast } from "@/lib/toast";

interface CardActionsProps {
	mediaType: "movies" | "shows" | "episodes";
	ids: Record<string, unknown>;
	userRating?: number;
	isInWatchlist?: boolean;
	onRated?: () => void;
}

export function CardActions({
	mediaType,
	ids,
	userRating,
	isInWatchlist = false,
	onRated,
}: CardActionsProps) {
	const [showRating, setShowRating] = useState(false);
	const [inWatchlist, setInWatchlist] = useState(isInWatchlist);
	const [watched, setWatched] = useState(false);
	const rate = useRate();
	const markWatched = useMarkWatched();
	const watchlist = useWatchlist();
	const { toast } = useToast();

	const watchedType = mediaType === "shows" ? "episodes" : mediaType;

	return (
		<div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100">
			{/* Dim overlay */}
			<div className="absolute inset-0 bg-black/60" />

			{/* Star rating panel */}
			{showRating && (
				<div className="animate-fade-in relative z-10 mb-3 rounded-lg bg-zinc-900/95 px-3 py-2.5 shadow-2xl ring-1 ring-white/15">
					<p className="mb-1.5 text-center text-[10px] font-medium text-zinc-400">Rate this</p>
					<StarRating
						value={userRating}
						size="sm"
						onChange={(rating) => {
							rate.mutate(
								{ type: mediaType, ids, rating },
								{ onError: () => toast("Failed to save rating") },
							);
							setShowRating(false);
							onRated?.();
						}}
					/>
				</div>
			)}

			{/* Action buttons - clean icon row */}
			<div className="relative z-10 flex items-center gap-3">
				{/* Rate */}
				<button
					onClick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						setShowRating(!showRating);
					}}
					className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition-all hover:scale-110 hover:bg-white/20"
					title="Rate"
				>
					<svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
						<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
					</svg>
				</button>

				{/* Mark watched */}
				<button
					onClick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						setWatched(true);
						markWatched.mutate(
							{ type: watchedType, ids },
							{
								onError: () => {
									setWatched(false);
									toast("Failed to mark as watched");
								},
							},
						);
					}}
					disabled={markWatched.isPending || watched}
					className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition-all hover:scale-110 disabled:opacity-50 ${
						watched ? "bg-green-500/30 text-green-400" : "bg-white/10 text-white hover:bg-white/20"
					}`}
					title="Mark as watched"
				>
					<svg
						className="h-4 w-4"
						fill="none"
						stroke="currentColor"
						strokeWidth={2.5}
						viewBox="0 0 24 24"
					>
						<path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
					</svg>
				</button>

				{/* Watchlist */}
				<button
					onClick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						const action = inWatchlist ? "remove" : "add";
						const wlType = mediaType === "episodes" ? "shows" : mediaType;
						const prev = inWatchlist;
						setInWatchlist(!inWatchlist);
						watchlist.mutate(
							{ action, type: wlType, ids },
							{
								onError: () => {
									setInWatchlist(prev);
									toast(`Failed to ${action === "add" ? "add to" : "remove from"} watchlist`);
								},
							},
						);
					}}
					disabled={watchlist.isPending}
					className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition-all hover:scale-110 disabled:opacity-50 ${
						inWatchlist ? "bg-accent/30 text-accent" : "bg-white/10 text-white hover:bg-white/20"
					}`}
					title={inWatchlist ? "Remove from watchlist" : "Add to watchlist"}
				>
					<svg
						className="h-4 w-4"
						fill={inWatchlist ? "currentColor" : "none"}
						stroke="currentColor"
						strokeWidth={2}
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
						/>
					</svg>
				</button>
			</div>
		</div>
	);
}
