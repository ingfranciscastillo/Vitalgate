/** Where an issue tracker integration files issues. Shared by server and UI. */
export type IssueTrackerConfig =
	| { kind: "linear"; teamId: string; teamName: string }
	| {
			kind: "jira";
			projectKey: string;
			projectName: string;
			issueTypeId: string;
	  };

export interface IssueTrackerTarget {
	id: string;
	name: string;
}

/** The results table out of a Vitalgate PR comment: header cells and rows. */
export function parseResultsTable(markdown: string): {
	header: string[];
	rows: string[][];
} {
	const cells = (line: string) =>
		line
			.trim()
			.replace(/^\||\|$/g, "")
			.split("|")
			.map((c) => c.trim());
	const lines = markdown
		.split("\n")
		.filter((l) => l.trim().startsWith("|") && !/^\|\s*-/.test(l.trim()));
	const [header = [], ...rows] = lines.map(cells);
	return { header, rows };
}

/** As a Markdown table (Linear): the rows only, no headline or footer. */
export function resultsAsMarkdown(markdown: string): string {
	const { header, rows } = parseResultsTable(markdown);
	if (header.length === 0) return "";
	const line = (c: string[]) => `| ${c.join(" | ")} |`;
	return [line(header), line(header.map(() => "---")), ...rows.map(line)].join(
		"\n",
	);
}

const JIRA_RESULT: Record<string, string> = {
	"❌": "(x)",
	"⚠️": "(!)",
	"✅": "(/)",
};

/**
 * As Jira wiki markup: a real table, result marks as Jira's own icons and
 * changes coloured red (worse) or green (better). Pipes and braces in cells
 * are stripped so a value can't break the table.
 */
export function resultsAsJiraTable(markdown: string): string {
	const { header, rows } = parseResultsTable(markdown);
	if (header.length === 0) return "";
	const clean = (c: string) => c.replace(/[|{}[\]]/g, " ").trim();
	const cell = (c: string) => {
		const trimmed = c.trim();
		if (JIRA_RESULT[trimmed]) return JIRA_RESULT[trimmed];
		const change = trimmed.match(/^(.*?)\s*(🔴|🟢)$/u);
		if (change) {
			const color = change[2] === "🔴" ? "#de350b" : "#00875a";
			return `{color:${color}}${clean(change[1])}{color}`;
		}
		return clean(trimmed) || " ";
	};
	return [
		`||${header.map((h) => clean(h) || " ").join("||")}||`,
		...rows.map((r) => `|${r.map(cell).join("|")}|`),
	].join("\n");
}
