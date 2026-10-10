import { queryOptions } from "@tanstack/react-query";
import {
	getOrgPulls,
	getOrgPullsPage,
	getPullDetail,
} from "@/lib/pulls.functions";

export const orgPullsQueryOptions = () =>
	queryOptions({
		queryKey: ["pulls"],
		queryFn: () => getOrgPulls(),
	});

export const pullDetailQueryOptions = (prId: string) =>
	queryOptions({
		queryKey: ["pulls", prId],
		queryFn: () => getPullDetail({ data: prId }),
	});

export interface PullsPageParams {
	page: number;
	q?: string;
	repoId?: string;
}

export const orgPullsPageQueryOptions = (params: PullsPageParams) =>
	queryOptions({
		queryKey: ["pulls", "page", params],
		queryFn: () => getOrgPullsPage({ data: params }),
	});
