export function RatingDisplay({
  rating,
  votes,
  size = "lg",
}: {
  rating: number | null | undefined;
  votes?: number | null;
  size?: "sm" | "lg";
}) {
  if (rating == null) return null;

  const percent = Math.round(rating * 10);

  const color =
    percent >= 70 ? "text-green-400" : percent >= 50 ? "text-yellow-400" : "text-red-400";

  if (size === "sm") {
    return (
      <div className="flex items-center gap-1.5">
        <span className={`text-sm font-bold ${color}`}>{percent}%</span>
        {votes != null && <span className="text-xs text-muted">({votes.toLocaleString()})</span>}
      </div>
    );
  }

  return (
    <div className="text-right">
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{percent}%</p>
      {votes != null && (
        <p className="mt-0.5 text-xs text-zinc-400">{votes.toLocaleString()} votes</p>
      )}
    </div>
  );
}
