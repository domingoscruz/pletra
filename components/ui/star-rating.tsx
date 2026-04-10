"use client";

import { useState } from "react";

export function StarRating({
  value = 0,
  onChange,
  readonly = false,
  size = "md",
}: {
  value?: number;
  onChange?: (rating: number) => void;
  readonly?: boolean;
  size?: "sm" | "md";
}) {
  const [hovered, setHovered] = useState(0);

  const sizeClass = size === "sm" ? "text-sm gap-0.5" : "text-lg gap-1";

  return (
    <div
      className={`flex items-center ${sizeClass}`}
      onMouseLeave={() => !readonly && setHovered(0)}
    >
      {Array.from({ length: 10 }, (_, i) => {
        const star = i + 1;
        const active = star <= (hovered || value);
        return (
          <button
            key={star}
            type="button"
            disabled={readonly}
            aria-label={readonly ? `Rating ${star} out of 10` : `Set rating to ${star} out of 10`}
            title={readonly ? `Rating ${star} out of 10` : `Set rating to ${star} out of 10`}
            className={`cursor-pointer transition-colors ${
              active ? "text-yellow-400" : "text-zinc-600"
            } ${readonly ? "cursor-default" : "hover:scale-110"}`}
            onMouseEnter={() => !readonly && setHovered(star)}
            onClick={() => onChange?.(star)}
          >
            {active ? "★" : "☆"}
          </button>
        );
      })}
    </div>
  );
}
