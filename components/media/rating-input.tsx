"use client";

import { useState, useRef, useEffect } from "react";
import { useRate } from "@/lib/mutations/use-rate";
import { useToast } from "@/lib/toast";

export function RatingInput({
	mediaType,
	ids,
	currentRating,
}: {
	mediaType: "movies" | "shows" | "episodes";
	ids: Record<string, unknown>;
	currentRating?: number;
}) {
	const rate = useRate();
	const { toast } = useToast();
	const [open, setOpen] = useState(false);
	const [hovered, setHovered] = useState(0);
	const [localRating, setLocalRating] = useState<number | undefined>(currentRating);
	const popoverRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
				setOpen(false);
				setHovered(0);
			}
		}
		if (open) {
			document.addEventListener("mousedown", handleClickOutside);
			return () => document.removeEventListener("mousedown", handleClickOutside);
		}
	}, [open]);

	const hasRating = localRating != null;

	return (
		<div ref={popoverRef} className="relative">
			<button
				onClick={() => {
					setOpen(!open);
					setHovered(0);
				}}
				className={`flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${
					hasRating
						? "bg-yellow-400/10 text-yellow-400 hover:bg-yellow-400/15"
						: "bg-white/[0.06] text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
				}`}
			>
				<span className="text-xs">{hasRating ? "★" : "☆"}</span>
				{hasRating ? `${localRating}/10` : "Rate"}
			</button>

			{open && (
				<div className="absolute bottom-full left-0 z-10 mb-2 flex items-center gap-px rounded-full bg-zinc-900/95 px-2 py-1.5 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl">
					{Array.from({ length: 10 }, (_, i) => {
						const star = i + 1;
						const active = hovered > 0 ? star <= hovered : star <= (localRating ?? 0);
						return (
							<button
								key={star}
								type="button"
								className={`cursor-pointer px-0.5 text-base transition-colors ${
									active ? "text-yellow-400" : "text-zinc-600 hover:text-zinc-400"
								}`}
								onMouseEnter={() => setHovered(star)}
								onMouseLeave={() => setHovered(0)}
								onClick={() => {
									const prev = localRating;
									setLocalRating(star);
									rate.mutate(
										{ type: mediaType, ids, rating: star },
										{
											onError: () => {
												setLocalRating(prev);
												toast("Failed to save rating");
											},
										},
									);
									setOpen(false);
									setHovered(0);
								}}
							>
								{active ? "★" : "☆"}
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}
