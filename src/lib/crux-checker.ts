import { z } from "zod";

/** Input of the public Core Web Vitals checker — also its URL search params. */
export const cruxCheckSchema = z.object({
	url: z.string().trim().min(1).max(2048),
	device: z.enum(["all", "phone", "desktop"]).default("all"),
});

export type CruxCheckDevice = z.infer<typeof cruxCheckSchema>["device"];
