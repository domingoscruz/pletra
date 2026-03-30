"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { traktKeys } from "@/lib/queries/keys";

interface MarkWatchedParams {
  type: "movies" | "shows" | "episodes";
  ids: Record<string, unknown>;
  watchedAt?: string;
  action?: "add" | "remove"; // <-- Nova propriedade para decidir o que fazer
}

export function useMarkWatched() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ type, ids, watchedAt, action = "add" }: MarkWatchedParams) => {
      const isRemoving = action === "remove";

      // Muda a rota dependendo da ação
      const endpoint = isRemoving ? "/api/trakt/sync/history/remove" : "/api/trakt/sync/history";

      // Monta o payload. Se for remover, não envia data, só o ID.
      const payload: any = { ids };
      if (!isRemoving && watchedAt) {
        payload.watched_at = watchedAt;
      }

      const res = await fetch(endpoint, {
        method: "POST", // O Trakt usa POST para ambas as rotas
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [type]: [payload],
        }),
      });

      if (!res.ok)
        throw new Error(isRemoving ? "Failed to remove from history" : "Failed to mark as watched");
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: traktKeys.upNext() });
    },
  });
}
