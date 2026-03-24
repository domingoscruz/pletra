import Image from "next/image";
import Link from "@/components/ui/link";
import { CardActions } from "./card-actions";

export interface MediaCardProps {
	title: string;
	subtitle?: string;
	href: string;
	backdropUrl: string | null;
	posterUrl?: string | null;
	rating?: number;
	userRating?: number;
	mediaType: "movies" | "shows" | "episodes";
	ids: Record<string, unknown>;
	progress?: { aired: number; completed: number };
	timestamp?: string;
	variant?: "landscape" | "poster";
	disableHover?: boolean;
}

export function MediaCard({
	title,
	subtitle,
	href,
	backdropUrl,
	posterUrl,
	rating,
	userRating,
	mediaType,
	ids,
	progress,
	timestamp,
	variant = "landscape",
	disableHover = false,
}: MediaCardProps) {
	const ratingPercent = rating != null ? Math.round(rating * 10) : null;
	const isPoster = variant === "poster";
	const imageUrl = isPoster ? (posterUrl ?? backdropUrl) : backdropUrl;

	return (
		<Link href={href} className="group relative overflow-hidden rounded-lg bg-zinc-900">
			<div className={`relative ${isPoster ? "aspect-[2/3]" : "aspect-[16/10]"}`}>
				{imageUrl ? (
					<>
						<div className="skeleton absolute inset-0 z-0" />
						<Image
							src={imageUrl}
							alt={title}
							fill
							className={`relative z-10 object-cover ${disableHover ? "" : "transition-transform duration-300 group-hover:scale-105"}`}
							sizes={
								isPoster
									? "(max-width: 640px) 33vw, 14vw"
									: "(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
							}
						/>
					</>
				) : (
					<div className="flex h-full items-center justify-center bg-zinc-800/80 text-muted">
						<span className="text-xl">🎬</span>
					</div>
				)}

				{/* Ratings - top right stack */}
				<div className="absolute top-1.5 right-1.5 flex flex-col items-end gap-1">
					{ratingPercent != null && (
						<div
							className={`rounded px-1.5 py-0.5 text-[10px] font-bold leading-none ${
								ratingPercent >= 70
									? "bg-green-500/90 text-white"
									: ratingPercent >= 50
										? "bg-yellow-500/90 text-black"
										: "bg-red-500/90 text-white"
							}`}
						>
							{ratingPercent}%
						</div>
					)}
					{userRating != null && (
						<div className="rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-bold leading-none text-zinc-900">
							★ {userRating}
						</div>
					)}
				</div>

				{/* Timestamp - top left */}
				{timestamp && (
					<div className="absolute top-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] leading-none text-zinc-300 backdrop-blur-sm">
						{timestamp}
					</div>
				)}

				{/* Title overlay */}
				<div
					className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent px-2.5 pb-2 ${isPoster ? "pt-16" : "pt-10"}`}
				>
					<p className="truncate text-xs font-semibold leading-tight text-white">{title}</p>
					{subtitle && (
						<p className="mt-0.5 truncate text-[10px] leading-tight text-zinc-400">{subtitle}</p>
					)}
				</div>

				{/* Progress bar */}
				{progress && progress.aired > 0 && (
					<div className="absolute inset-x-0 bottom-0 h-[3px] bg-zinc-800/60">
						<div
							className="h-full bg-accent"
							style={{ width: `${(progress.completed / progress.aired) * 100}%` }}
						/>
					</div>
				)}

				{/* Hover actions */}
				{!disableHover && <CardActions mediaType={mediaType} ids={ids} userRating={userRating} />}
			</div>
		</Link>
	);
}
