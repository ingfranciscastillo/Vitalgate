import { queryOptions } from "@tanstack/react-query";
import { getBillingOverview } from "@/lib/billing.functions";

export const billingOverviewQueryOptions = () =>
	queryOptions({
		queryKey: ["billing"],
		queryFn: () => getBillingOverview(),
	});
