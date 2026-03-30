"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { traktKeys } from "@/lib/queries/keys";
import { useToast } from "@/lib/toast";

interface WatchStatusProps {
	mediaType: "movies" | "episodes";
	ids: Record<string, unknown>;
	initialWatched: boolean;
	plays?: number;
	lastWatchedAt?: string | null;
	showProgress?: {
		completed: number;
		aired: number;
	} | null;
}

export function WatchStatus({
	mediaType,
	ids,
	initialWatched,
	plays,
	lastWatchedAt,
	showProgress,
}: WatchStatusProps) {
	const [watched, setWatched] = useState(initialWatched);
	const [currentPlays, setCurrentPlays] = useState(plays ?? 0);
	const queryClient = useQueryClient();
	const { toast } = useToast();

	const markWatched = useMutation({
		mutationFn: async () => {
			const res = await fetch("/api/trakt/sync/history", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					[mediaType]: [{ ids, watched_at: new Date().toISOString() }],
				}),
			});
			if (!res.ok) throw new Error("Failed to mark as watched");
			return res.json();
		},
		onMutate: () => {
			setWatched(true);
			setCurrentPlays((p) => p + 1);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: traktKeys.history() });
		},
		onError: () => {
			setWatched(false);
			setCurrentPlays((p) => Math.max(0, p - 1));
			toast("Failed to mark as watched");
		},
	});

	const removeWatch = useMutation({
		mutationFn: async () => {
			const res = await fetch("/api/trakt/sync/history/remove", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					[mediaType]: [{ ids }],
				}),
			});
			if (!res.ok) throw new Error("Failed to remove from history");
			return res.json();
		},
		onMutate: () => {
			const prevWatched = watched;
			const prevPlays = currentPlays;
			setWatched(false);
			setCurrentPlays(0);
			return { prevWatched, prevPlays };
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: traktKeys.history() });
		},
		onError: (_err, _vars, context) => {
			if (context) {
				setWatched(context.prevWatched);
				setCurrentPlays(context.prevPlays);
			}
			toast("Failed to remove from history");
		},
	});

	const isPending = markWatched.isPending || removeWatch.isPending;

	// Show progress pill for shows
	if (showProgress) {
		const pct =
			showProgress.aired > 0 ? Math.round((showProgress.completed / showProgress.aired) * 100) : 0;
		const isComplete = showProgress.completed >= showProgress.aired && showProgress.aired > 0;

		return (
			<div
				className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm ${
					isComplete ? "bg-green-500/10 text-green-400" : "bg-white/[0.06] text-zinc-300"
				}`}
			>
				{isComplete ? (
					<>
						<svg
							className="h-3.5 w-3.5"
							fill="none"
							stroke="currentColor"
							strokeWidth={2.5}
							viewBox="0 0 24 24"
						>
							<path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
						</svg>
						<span className="text-sm">Watched</span>
					</>
				) : (
					<>
						<div className="h-1 w-12 overflow-hidden rounded-full bg-zinc-700">
							<div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
						</div>
						<span className="text-xs tabular-nums text-zinc-400">
							{showProgress.completed}/{showProgress.aired}
						</span>
					</>
				)}
			</div>
		);
	}

	// Movie/episode: watched pill
	if (watched) {
		const label = lastWatchedAt ? formatRelativeDate(lastWatchedAt) : "Watched";
		return (
			<div className="flex items-center gap-1">
				<div className="flex items-center gap-1.5 rounded-full bg-green-500/10 px-3 py-1.5 text-sm text-green-400">
					<svg
						className="h-3.5 w-3.5"
						fill="none"
						stroke="currentColor"
						strokeWidth={2.5}
						viewBox="0 0 24 24"
					>
						<path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
					</svg>
					{label}
					{currentPlays > 1 && <span className="text-xs text-green-400/60">{currentPlays}x</span>}
				</div>
				<button
					onClick={() => removeWatch.mutate()}
					disabled={isPending}
					className="cursor-pointer rounded-full p-1.5 text-zinc-600 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
					title="Remove from history"
				>
					<svg
						className="h-3.5 w-3.5"
						fill="none"
						stroke="currentColor"
						strokeWidth={2}
						viewBox="0 0 24 24"
					>
						<path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
		);
	}

	return (
		<button
			onClick={() => markWatched.mutate()}
			disabled={isPending}
			className="flex cursor-pointer items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-200 disabled:opacity-50"
		>
			<svg
				className="h-3.5 w-3.5"
				fill="none"
				stroke="currentColor"
				strokeWidth={2}
				viewBox="0 0 24 24"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
				/>
				<path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
			</svg>
			{markWatched.isPending ? "Marking..." : "Watched"}
		</button>
	);
}

function formatRelativeDate(dateStr: string): string {
	const date = new Date(dateStr);
	const now = new Date();
	const diff = now.getTime() - date.getTime();
	const days = Math.floor(diff / 86400000);

	if (days < 1) return "Today";
	if (days === 1) return "Yesterday";
	if (days < 7) return `${days}d ago`;
	if (days < 30) return `${Math.floor(days / 7)}w ago`;
	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	});
}
