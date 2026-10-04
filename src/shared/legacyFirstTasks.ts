/**
 * Every pack's First task as it was written into Work styles before the first
 * task became a card (docs/designs/first-task-card.md). The one-time cleanup
 * (D1) takes a First task out of a team member's Work style only when its
 * words are one of these, so a section the owner edited stays. Frozen: never
 * add to it.
 */
export const LEGACY_FIRST_TASKS: readonly string[] = [
  "Ask the owner, through Michael, for the open deals: who, value, stage and next step. Build the pipeline and a first forecast from it.",
  "Ask the owner, through Michael, what is on the van and in storage today. Turn the answer into the first count.",
  "Ask the owner, through Michael, what shipped recently. Draft a blog post and a campaign from it for approval.",
  "Ask the owner, through Michael, which customers are due for a service and where past job records are kept. Turn the answer into the first due list.",
  "Ask the owner, through Michael, which systems and services the business runs on. Build the systems list from it, noting gaps.",
  "Ask the owner, through Michael, who has access to each system. Build the access list from it, flagging anything to review.",
  "Ask the owner, through Michael, who is on the team, with each person's role, start date and type. Build the team list from it.",
  "Ask the owner, through Michael, who the suppliers are and what comes from each. Turn the answer into the first supplier list.",
  "At 9am each day, draft the next day's special and send it to Michael for approval. If nothing has come in about what is on, ask the owner through Michael.",
  "At 9am on the first morning after setup, ask the owner through Michael which opening and closing checks the kitchen runs, to build the checklist.",
  "At 9am on the first morning after setup, ask the owner through Michael who is on the team, with roles and start dates.",
  "At 9am on the first morning after setup, ask the owner through Michael who the suppliers are and what comes from each, to start the list.",
  "At 9am on your first day, ask the owner through Michael for open leads and referrals, and build the pipeline from the answer.",
  "At 9am on your first day, ask the owner through Michael where client files live, and start the list.",
  "Bring the current inbox to zero. Archive mail older than 30 days that needs no action in one pass under the label Older, and report it to Michael as a count; give everything newer its outcome.",
  "Draft a reply to the first customer question that arrives, and start the support log with it.",
  "Draft a reply to the next customer question that arrives and send it to Michael for the owner's approval.",
  "Draft this season's service reminder and send it to Michael for the owner's approval.",
  "Draft this week's promotion on your first Monday at 9am and send it to Michael for the owner's approval.",
  "On the first Monday of the month, draft the note to past clients and send it to Michael for the owner's approval.",
  "On your first morning at 9am, ask the owner through Michael for current stock counts, then build the stock and reorder lists.",
  "On your first morning at 9am, ask the owner through Michael for the open wholesale and corporate orders, then build the buyer list.",
  "On your first morning at 9am, ask the owner through Michael for the suppliers, what the shop buys from each and their lead times, then start the supplier list.",
  "Prepare the first weekly money summary for Michael to pass to the owner, noting any missing records.",
  "Prepare the first weekly money summary for Monday at 9am and send it to Michael for the owner.",
  "Send Michael the first weekly money summary for the owner on Monday at 9am, listing any records you still need.",
  "When the first catering enquiry arrives, draft a reply with a quote and send it to Michael for the owner's approval.",
  "When the first quote request arrives, draft the reply and send it to Michael for the owner's approval.",
  "When the next client question arrives, draft a reply and send it to Michael for the owner's approval.",
];
