export function extractTraktImage(
  obj:
    | {
        images?: Record<string, unknown> | null;
      }
    | null
    | undefined,
  types: ("screenshot" | "thumb" | "fanart" | "poster")[],
) {
  if (!obj?.images) return null;

  for (const type of types) {
    const target = obj.images[type];
    let rawUrl: string | null = null;

    if (Array.isArray(target) && target.length > 0) {
      rawUrl = typeof target[0] === "string" ? target[0] : null;
    } else if (typeof target === "string") {
      rawUrl = target;
    } else if (target && typeof target === "object") {
      const imageRecord = target as Record<string, unknown>;
      rawUrl =
        (typeof imageRecord.medium === "string" && imageRecord.medium) ||
        (typeof imageRecord.full === "string" && imageRecord.full) ||
        (typeof imageRecord.thumb === "string" && imageRecord.thumb) ||
        null;
    }

    if (rawUrl) {
      return rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
    }
  }

  return null;
}
