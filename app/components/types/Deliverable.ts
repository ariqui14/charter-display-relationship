export type Deliverable = {
  deliver_to: string;     // team name
  status: "complete" | "in-progress" | "not-started";
  text: string;           // description of the deliverable
};
