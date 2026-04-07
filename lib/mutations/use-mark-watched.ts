"use client";

import { fetchTraktRouteJson, getErrorMessage } from "@/lib/api/trakt-route";
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

      try {
        return await fetchTraktRouteJson(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            [type]: [payload],
          }),
          timeoutMs: 10000,
        });
      } catch (error) {
        throw new Error(
          getErrorMessage(
            error,
            isRemoving ? "Failed to remove from history" : "Failed to mark as watched",
          ),
        );
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: traktKeys.upNext() });
    },
  });
}
