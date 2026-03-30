"use client";

import { useState } from "react";
import { useWatchlist } from "@/lib/mutations/use-watchlist";
import { useToast } from "@/lib/toast";

export function WatchlistButton({
	mediaType,
	ids,
	initialInWatchlist = false,
}: {
	mediaType: "movies" | "shows";
	ids: Record<string, unknown>;
	initialInWatchlist?: boolean;
}) {
	const [inWatchlist, setInWatchlist] = useState(initialInWatchlist);
	const watchlist = useWatchlist();
	const { toast } = useToast();

	return (
		<button
			onClick={() => {
				const action = inWatchlist ? "remove" : "add";
				setInWatchlist(!inWatchlist);
				watchlist.mutate(
					{ action, type: mediaType, ids },
					{
						onError: () => {
							setInWatchlist(inWatchlist);
							toast(`Failed to ${action === "add" ? "add to" : "remove from"} watchlist`);
						},
					},
				);
			}}
			disabled={watchlist.isPending}
			className={`flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ${
				inWatchlist
					? "bg-accent/10 text-accent hover:bg-accent/15"
					: "bg-white/[0.06] text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
			}`}
			title={inWatchlist ? "Remove from watchlist" : "Add to watchlist"}
		>
			<svg
				className="h-3.5 w-3.5"
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
			{inWatchlist ? "Watchlist" : "Watchlist"}
		</button>
	);
}
