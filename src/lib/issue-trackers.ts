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
