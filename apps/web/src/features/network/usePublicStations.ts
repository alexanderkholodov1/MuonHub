"use client";

import type { v2 as dp } from "@muonhub/data-provider";
import type { v2 } from "@muonhub/shared";
import { useDataProvider } from "@/lib/data/DataProviderContext";
import { useResource, type Resource } from "@/lib/data/useResource";

/** Every public projection, 100 per page (the rules' limit). */
export function usePublicStations(): Resource<v2.PublicStation[]> {
  const provider = useDataProvider();
  return useResource(provider === null ? null : "public-stations", async () => {
    if (provider === null) return [];
    const out: v2.PublicStation[] = [];
    let cursor: string | null = null;
    do {
      const page: dp.Page<v2.PublicStation> = await provider.listPublicStations({
        limit: 100,
        cursor,
      });
      out.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor !== null);
    return out;
  });
}
