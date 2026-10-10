import { queryOptions } from "@tanstack/react-query";
import { getRealUserMetrics } from "@/lib/crux.functions";

export const realUserMetricsQueryOptions = (repoId: string) =>
	queryOptions({
		queryKey: ["repos", repoId, "real-users"],
		queryFn: () => getRealUserMetrics({ data: repoId }),
		// Changes at most daily; no need to refetch on every focus.
		staleTime: 60 * 60 * 1000,
	});
