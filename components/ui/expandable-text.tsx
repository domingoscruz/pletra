"use client";

import { useState } from "react";

export function ExpandableText({
  text,
  lines = 4,
  className = "",
}: {
  text: string;
  lines?: number;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <p
        className={className}
        style={
          expanded
            ? undefined
            : {
                display: "-webkit-box",
                WebkitLineClamp: lines,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }
        }
      >
        {text}
      </p>
      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-1.5 cursor-pointer text-xs text-zinc-500 transition-colors hover:text-zinc-300"
      >
        {expanded ? "Show less" : "Show more"}
      </button>
    </div>
  );
}
