# Several team members on one mailbox

Status: CEO review in progress (2026-10-06). Approach approved (D2); see the decision ledger.

## Request (owner, 2026-10-06)

"Small businesses might need to use the same mailbox for two different capabilities. For
example, they may have an admin on the CEO mailbox with the ability to read and send
emails. However, they may want the sales agent to be able to send emails using the same
account and read emails only relevant to sales. So, being able to let multiple agents
share the same mailbox as a capability would be ideal. However, this poses a risk of
multiple agents polling the same email periodically via the schedule option. So, do not
let multiple agents create a schedule on the same mailbox."

## What exists today (from the code)

- One mailbox per agent (owner, 2026-09-26): `email.mailboxes[0]`, `mailAccess` in
  src/shared/mailboxes.ts.
- One agent per mailbox (owner, 2026-09-27, "so no inbox is ever worked twice"):
  `mailboxHolder`; picking a held mailbox asks to move it and turns the holder's email off
  (CapabilitiesTab.tsx, `setAgentCapabilities` in src/main/mail.ts). The request as written
  would reverse that rule; the owner kept it (D1).
- Sending is per agent: Can send, Send on approval or Draft only, with standing approvals
  (docs/designs/send-on-approval.md).
- The md-mail tools search the inbox, sent, archive or a label; archive, mark read and mark
  junk organize the inbox (docs/designs/inbox-zero.md).
- Pam's inbox zero Work style routes each email to a role and archives it "with that role as
  the label" (resources/packs/*.json), so sales mail already lands under a "Sales" style label.
- Schedules (src/shared/missions.ts `ScheduledMission`) belong to an agent and name a job and
  a focus; they do not reference a mailbox. A schedule cannot be tied to a mailbox today.

## Landscape (2026-10-06)

Shared inbox tools (Front, Help Scout, Missive, Hiver) let many people work one address by
giving each conversation one owner (assignment and routing) and warning on collisions, not
by limiting who may check the inbox on a timer.

## Proposal

A mailbox keeps one owner who reads and works it (D1). Other members may be given Send
only from it, each with their own Sending mode (D2, A2).

Accepted scope:
1. **Send only grant.** On a member's Access tab, under Email, "Also sends from" lists the
   connected mailboxes; adding one gives that member Send only from it with its own Sending
   choice (Can send, Send on approval, Draft only; Draft only saves into that mailbox's
   Drafts). A member keeps at most one own mailbox and may hold at most one Send only grant
   alongside it (S1, D8). Data: `AgentCapabilities.sendOnly?: { mailbox: string; sending: SendingMode }`, beside
   `email` rather than inside it (OV2: every writer of `email` replaces the whole object, mail.ts:906,
   CapabilitiesTab.tsx:91), with its own IPC setter like `quickbooks:setAccess`; `setAgentCapabilities` keeps only known mailboxes, drops a grant on the
   member's own mailbox, and never counts grants in `mailboxHolder` (one owner per mailbox).
   A member with only a grant (email off) still gets the md-mail tools: md-mail attaches at
   spawn when the member owns a mailbox or holds a grant. `restartNeeded` is true when the mail
   tools go from not attached to attached (owns a mailbox or holds a grant, before and after),
   replacing `emailJustEnabled`, and turning email off does not clear a restart a new grant
   still needs (OV10). The grant is its own field: turning Can check
   email off keeps it, moving a mailbox between owners keeps it, and `setAgentCapabilities`
   validates `sendOnly` separately from `email.enabled` and the owned mailbox. The Access tab
   shows "Also sends from" whether Can check email is on or off.
2. **The rule.** `mailAccess` takes the call's references (reply_to, forward, attach_from) as
   well as the op (the hook's `tool_input` type gains those fields), so the hook and the broker
   share one rule. It checks a grant for the named mailbox before the Can check email gate. For a Send only member on that
   mailbox it allows `list`, `draft`, `propose` and `send` under the grant's Sending mode and
   that member's standing approvals for that mailbox; it refuses `read` and `organize`
   (search, read, archive, mark read, mark junk), and any `forward` or `attach_from`.
3. **Threaded follow ups (E1, mechanism E1b, D11).** A Send only member may use `reply_to`
   only on an email it sent itself from that mailbox. Every send by a Send only member (send,
   approved proposal, standing approval send) records `{ agentId, mailbox, messageId, references,
   to, subject, sentAt }` (deduplicated by Message-ID; `MailApprovals.load` and `save` keep the
   list, OV9)
   in the app's existing mail store (mail-proposals.json, beside proposals and standing
   approvals; the newest 500 per member kept). The broker builds In-Reply-To and References
   from that record alone and fetches nothing from the mailbox (`compose()` does not load
   source for a grant). Any other id, on any path (draft, propose, send, standing send), is
   refused before a lookup with one text: "Reply only to an email you sent from here; send
   anything else as a new email." The prospect's reply sits in the same thread, so the follow
   up lands in it. The member finds its ids in the grant's `list_mailboxes` entry, which lists
   its own recent sends there (Message-ID, to, subject, sent at: its own words, nothing from the
   mailbox); the `reply_to` schema text says so (OV4). The own sends check runs in the broker
   (the records live in main); the hook checks the op, `forward` and `attach_from`. A Draft only
   grant sends new emails only, since the human sends its drafts. Sending an approved proposal
   or a standing send under a grant applies the same reference rules to the stored proposal
   before `svc.send` (OV5: today it uses the proposal's stored references, mail.ts:731).
3a. **list_mailboxes** is allowed with only a grant and returns it as `{ mailbox, address,
   access: "send only", sending, how, standing_approvals }` after the member's own mailbox if
   any; the top level `sending` and `how` describe the own mailbox and are left out when the
   member owns none (OV7). The tool and server descriptions mention the send only entry.
3b. **Lifecycle.** A mailbox removed in Settings drops its grants. A grant does not depend on
   who owns the mailbox: moving ownership keeps grants; a member that becomes the owner loses
   its grant (ownership covers it). While nobody owns the mailbox a grant is paused (S3, D10):
   draft, propose and send are refused with "Nobody reads <address> right now, so its replies
   would go unanswered; tell Michael.", the Access tab shows "Paused: nobody reads <address>",
   Michael is told once, and it resumes when an owner is set. "Nobody owns" means no current
   member (on the roster, not archived) has Can check email on with that mailbox picked; the
   hook, the broker, the Access tab and E3 share one `isActiveMember` check, since
   `mailboxHolder` alone counts archived members (OV1). The notice is a hive inform from the
   app to Michael sent when the change happens (the owner's email turned off, the mailbox moved
   away, the owner archived, or a grant made on an unowned mailbox), not on a refused call,
   since the hook refuses before the broker and `mailAccess` cannot send (OV3). When a grant
   is removed, switched to Draft only or paused, that member's waiting and approved proposals
   for the mailbox are marked not sent with the reason, and the approved unsent sweep skips
   members who cannot send (OV6). The roster line says "paused" (OV10). A mailbox in needs-attention
   status does not pause grants; its sends fail with the existing mailbox error until fixed.
3d. **A member removed** (fired or archived) keeps its stored capabilities, as today (archive
   never deletes them, store.ts:1103), so its grant is inert while archived, and E3 lists only
   current members (OV1).
3e. **Strings** for the Access tab ("Also sends from", "Send only", "Paused: nobody reads
   <address>", "Also sends from here: <name> (<Sending choice>)") in en, zh-CN and ar, no dashes.
3f. **Tests** pin: the hook and the broker refuse read, search, archive, mark read, mark junk,
   forward and attach_from for a Send only member, including on an approved proposal's stored
   references; a removed or paused grant marks its proposals not sent; an archived owner pauses
   grants; filing a proposal keeps send records; the profile Uses row names the grant; reply_to on another id is refused with
   the same text before any lookup; a send records the Message-ID; a grant survives email off
   and moves; a paused grant refuses and tells Michael once; list_mailboxes returns the grant;
   the roster line names it; Settings and the owner's tab list senders.
3c. **Standing approvals** show per grant on the member's Access tab, one block per mailbox
   (proposals and standing approvals are already keyed by agent and mailbox).
4. **Replies** to a Send only member's email land in the owner's inbox; the owner routes them
   through Michael as today, by content (E2 declined).
5. **Who sends is visible (E3).** The owner's Access tab, under the mailbox, and the mailbox row
   in Settings, Mailboxes show "Also sends from here: <name> (<Sending choice>)", read only.
5a. **Profile:** the Uses row on the profile names the grant (ProfileTab.tsx:119 has no case for
   `send-only` today, OV10).
6. **Michael knows (S2, D9).** The roster access line names the grant: "sends only from ceo@
   (Settings, Connections, Mailboxes; send on approval, set on their Access tab, Email)", via a
   new `AccessItem` kind `send-only`; no dashes.
7. **No schedule rule is needed:** a Send only member cannot read the mailbox, so it cannot
   poll it on a schedule or otherwise; only the owner works the inbox.

## Decision ledger

| ID and owner | Contract and evidence | Current | Proposed | Status | Exact approval and scope |
|---|---|---|---|---|---|
| A1 approach (owner) | Owner request above; one agent per mailbox rule (mailboxes.ts `mailboxHolder`) | one agent per mailbox (kept) | A, B, C offered | declined | Owner, D1 2026-10-06: none of A to C. "Letting multiple agents access the same mailbox is the wrong design as it breaks the architecture of one agent owner of mailbox and passing info to relevant agents." The real case: Dwight reads his pipeline in HubSpot and must send outreach, a doing task; today he would ask Michael, who does not know whether Pam, Kelly or Erin should send, and whoever sends must ask Dwight for the content: "a lot of circus". Explore how this works in practice without over engineering and without workarounds. |
| A2 how a teammate sends from a mailbox it does not own (owner) | D1 answer; roster access line (agentAccess.ts `accessLine`) already lists who sends from which mailbox | one agent per mailbox; others go through Michael | A | approved | Owner, D2 2026-10-06: A) Send only access for extra members. The mailbox keeps one owner who reads and works it; on another member's Access tab the owner can grant "Send only" from that mailbox, with that member's own Can send, Send on approval or Draft only (and standing approvals). A send only member cannot read, search or organize the mailbox, so no schedule rule is needed. Prospect replies land in the owner's inbox and are routed back as today. |
| E1 threaded follow ups (owner) | D4 | new messages only | A | reopened | Owner, D4 2026-10-06: A) Add. A send only member may use reply_to on a message id (routed to it); the broker reads only that message's threading headers and never returns its content; forward and attach_from stay refused for send only members. | Reopened after spec review round 3: the To-match mechanism still lets a member probe sequential ids; see currentDecision E1b.
| E1b threading on own sends (owner) | Spec review round 3, feasibility 1; mail.ts compose() | reply_to any id with To-match (reopened) | A | approved | Owner, D11 2026-10-06: A) reply_to accepts only an email this member sent from that mailbox; the app keeps the Message-ID of each send by a Send only member; other ids are refused before any lookup. Supersedes E1's mechanism. |
| E2 replies find their sender (owner) | D5 | owner routes by content | C | declined | Owner, D5 2026-10-06: C) Skip. Routing stays with the mailbox owner's judgment; no sent message record. |
| E3 the owner side shows who else sends (owner) | D6 | only on the sender's tab | A | approved | Owner, D6 2026-10-06: A) Add. The mailbox owner's Access tab (under the mailbox) and the mailbox row in Settings, Mailboxes show "Also sends from here: <name> (<Sending mode>)", read only; the grant stays on the sender's tab. |
| E4 hire offers Send only (owner) | D7 | Access tab only | B | deferred | Owner, D7 2026-10-06: B) Defer to TODOS.md. Grant on the Access tab for now; the hire wizard may offer it later. |
| S1 grants per member (owner) | Spec review scope 4.1; one mailbox per agent rule (owner, 2026-09-26, mailboxes.ts) | not decided | B | approved | Owner, D8 2026-10-06: B) A member keeps at most one own mailbox and may hold at most one Send only grant alongside it. |
| S2 roster names grants (owner) | Spec review scope 4.2; accessLine in agentAccess.ts; owner's D1 "Michael won't know which one to use" | not decided | A | approved | Owner, D9 2026-10-06: A) Add. The roster access line names the grant, e.g. "sends only from ceo@ (Settings, Connections, Mailboxes; send on approval, set on their Access tab, Email)". |
| S3 a grant on a mailbox nobody owns (owner) | Spec review round 2, completeness 1; plan 3b vs item 4 (replies routed by the owner) | grants allowed to send | A | approved | Owner, D10 2026-10-06: A) Pause. While nobody owns the mailbox the grant stays but cannot send (draft, propose and send refused with a plain reason); the member's Access tab shows "Paused: nobody reads <address>"; Michael is told once; it resumes when an owner is set. |
| O1 log sends under a grant (Section 8) | Section 8; hive appendLog audits (mail.ts mail-sent-standing, mail-sent-approved) | no log line | office log entry per send; fields amended by O1b | approved (D12), amended (D14) | none |
| OV1-OV10 outside voice findings (Claude reviewer) | Outside voice section below | various | applied as listed | applied | none |
| OV6b standing approvals when a grant ends | OV6; mailProposals.ts:53-57 keys standing by agent and mailbox only | kept | revoke on grant removal, with the usual memory note | approved (D13) | none |
| O1b reopen O1: where to log recipients and subjects | OV8; hive.ts:880-888 log.jsonl committed and "non-sensitive"; hive.ts:1809 agents read it | D12: to and subject in the office log | ids in the office log; to and subject in the app private send record | approved (D14, supersedes D12 detail) | none |

## Step 0 (CEO review)

**0A Premise.** The real problem is two agents working the same email (both answering,
both archiving), not schedules as such. Schedules hold no mailbox today, so a "one schedule
per mailbox" rule needs a link that does not exist, and an agent can still search the
whole inbox on any turn Michael wakes it. Doing nothing keeps the owner choosing one agent
per address, so a sales agent cannot write from the owner's own account.

**0B Existing code.** Reuse `mailAccess` (one rule for hook and broker), per agent Sending,
proposals and standing approvals (already keyed by agent and mailbox, in mail-proposals.json,
which also gets the send record), MB-8's same mailbox check, and the CapabilitiesTab picker.

**0C Dream state.**
```
  CURRENT                         THIS PLAN                          12 MONTHS
  one agent per mailbox  --->  one owner reads and works     --->  any address a team member
                               the inbox; other members may       needs to speak from, with the
                               send only, as allowed              owner still the only reader
```

## Answered decision A2 (approved, D2)
Commitment comparison:
Commitment | Source/approval or pending | Current | A | B | C
Who owns and reads the mailbox | D1 (kept) | one agent | one agent | one agent | one agent each
Dwight sends outreach | pending | not possible | himself, send only, from the owner's mailbox | Pam sends a complete email Dwight wrote, routed by Michael | himself, from his own address
Replies from prospects | pending | n/a | land in the owner's inbox; the owner routes them to Dwight as today | same, through Pam | land in Dwight's own inbox
Double polling | D1 | none | impossible: send only cannot read | none | none
New capability | pending | none | "Send only" grant per extra member, with its own Sending mode | none: roster and instructions only | none: owner sets up sales@
Effort and risk | pending | none | M, low | S, medium (extra turns per email) | S, low (needs a second address)

Question: D2 — A2: How should Dwight send outreach from a mailbox another agent owns? <gstack-qid:plan-ceo-review-send-only-access>
Project: shared mailboxes on main, nothing built.
ELI10: One agent owns each mailbox and reads it, and that stays. But Dwight's outreach is a doing task: he has to send, not read. Today that turns into a relay through Michael and Pam, and nobody knows who should send. The question is how Dwight sends without anyone else reading the inbox and without the relay.
Stakes if we pick wrong: either every outreach email costs three agents' turns and a back and forth, or the one owner rule gets bent.
Recommendation: A, because sending is a doing capability, not access to the inbox: Pam keeps owning and reading ceo@, Dwight only sends, and prospect replies come back through Pam like any other mail.
Note: options differ in kind, not coverage, so no completeness score.
A) Send only access for extra members (recommended) (effort M, risk low)
Pam keeps owning and reading ceo@; on Dwight's Access tab you give him "Send only" from ceo@, with his own Can send, Send on approval or Draft only. ✅ No relay: Dwight sends his own outreach, and his Sending mode and standing approvals apply. ✅ Nobody else reads the inbox, so no double polling and no schedule rule needed; replies route back through Pam as today. ❌ A new kind of grant to explain on the Access tab, and Dwight's follow ups wait for Pam to route the prospect's reply.
B) No new access: make the relay cheap (effort S, risk medium)
Keep one agent per mailbox. Michael's roster already shows who sends from which mailbox; Dwight hands Michael a complete email (to, subject, body, which address), and the owner sends or proposes it. ✅ No new capability at all. ✅ Every outbound email still goes through the owner. ❌ Every email costs Michael's and Pam's turns, and Pam is sending mail she didn't write.
C) Give Dwight his own address (effort S, risk low)
The owner connects sales@ (or similar) for Dwight; no code change beyond guidance. ✅ Fits today's rule exactly. ✅ Prospect replies go straight to Dwight. ❌ Needs a second address and app password, and outreach no longer comes from the CEO's own account.
Net: a narrow send only grant versus a relay or a second address.

## Mode

SELECTIVE EXPANSION (owner, D3, 2026-10-06). Core scope: A2. HOLD checks: about 13
changed files, no new service; nothing deferrable without breaking the goal; invariant: a
send only member never reads, searches or organizes the mailbox.

## Expansion candidates (answered: see the ledger)

- E1 threaded follow ups: Dwight replies to a prospect's answer in the same thread.
- E2 replies find their sender: a reply to an email Dwight sent is marked for him, so Pam routes it without guessing.
- E3 the owner's side shows who else sends: Pam's Access tab lists "Also sends from here: Dwight".
- E4 hire offers it: hiring a sales role suggests Send only from an existing mailbox.

## Answered decision E1 (approved, D4)
Commitment comparison:
Commitment | Source/approval or pending | Current | A | B | C
Send only member reads mail | A2 approved: never | never | never | never | never
Reply threads with the prospect's message | pending | no (new message only) | yes: Dwight may use reply_to on a message id routed to him; the app reads only that message's threading headers, never shows him its text | deferred to TODOS.md | no
Effort and risk | pending | none | S, low | none now | none

Question: D4 — E1: Should Dwight's follow ups thread with the prospect's reply? <gstack-qid:plan-ceo-review-split-threaded-follow-ups>
Project: shared mailboxes on main, nothing built.
ELI10: A prospect answers Dwight's outreach. That reply lands in Pam's inbox and she routes it to Dwight with its id. When Dwight answers, it should land in the same email thread for the prospect, which needs the original message's thread headers. Dwight still can't read the mailbox; the app fetches only those headers behind the scenes.
Stakes if we pick wrong: the prospect gets each follow up as a brand new email instead of a tidy thread.
Recommendation: A, because a broken thread looks sloppy to a prospect, and the app can do it without Dwight ever reading the inbox.
Note: options differ in kind, not coverage, so no completeness score.
A) Add to this plan's scope (recommended) (effort S, risk low)
Send only members may reply_to a message id; the broker uses only its thread headers and never returns its content. ✅ Follow ups stay in one thread for the prospect. ✅ Keeps the never read rule: no text comes back to Dwight. ❌ The broker must refuse forward and attach_from for send only members, one more rule to test.
B) Defer to TODOS.md (effort S, risk low)
Ship send only for new emails first; threading comes later. ✅ Smaller first version. ✅ Nothing to undo later. ❌ Early follow ups arrive as separate emails.
C) Skip (effort S, risk low)
Send only stays new emails only. ✅ Simplest rule: no reply_to at all. ✅ Least to explain. ❌ Every follow up starts a new thread for good.

## Answered decision E2 (skipped, D5)
Commitment comparison:
Commitment | Source/approval or pending | Current | A | B | C
Who routes prospect replies | A2: the mailbox owner | the owner | the owner | the owner | the owner
The owner knows who sent the original | pending | no | yes: the app records which member sent each message id; a reply to it shows "reply to Dwight's email" in the owner's search and read | deferred | no; the owner guesses from content or asks Michael
Effort and risk | pending | none | S, low | none now | none

Question: D5 — E2: Should a reply to Dwight's email be marked for Dwight, so Pam routes it without guessing? <gstack-qid:plan-ceo-review-split-reply-finds-sender>
Project: shared mailboxes on main, nothing built.
ELI10: When a prospect answers Dwight's outreach, the answer lands in Pam's inbox. Pam has to work out it belongs to Dwight. The app knows which team member sent each email, so it can label the reply "reply to Dwight's email" when Pam reads it.
Stakes if we pick wrong: replies to outreach get routed to the wrong person or sit while Michael asks around.
Recommendation: A, because the app already has the fact, and it turns Pam's guess into a one line route to Michael.
Note: options differ in kind, not coverage, so no completeness score.
A) Add to this plan's scope (recommended) (effort S, risk low)
The app records the sender of each message sent from the mailbox; when Pam searches or reads a reply to it, the result says whose email it answers. ✅ Pam routes it to Dwight first time, no back and forth. ✅ Works for every send only member, not just sales. ❌ A small record of sent message ids per mailbox to keep.
B) Defer to TODOS.md (effort S, risk low)
Pam works it out from the content for now. ✅ Smaller first version. ✅ No new record yet. ❌ Some replies will be routed wrong or slowly.
C) Skip (effort S, risk low)
Leave routing to Pam's judgment. ✅ Nothing new. ✅ Pam's Work style already routes by content. ❌ The fact the app knows is thrown away.

## Answered decision E3 (approved, D6)
Commitment comparison:
Commitment | Source/approval or pending | Current | A | B | C
Where send only is granted | A2: the sender's Access tab | sender's tab | sender's tab | sender's tab | sender's tab
The owner's side shows who else sends | pending | no | yes: the mailbox owner's Access tab and Settings, Mailboxes list "Also sends from here: Dwight (Send on approval)" | deferred | no
Effort and risk | pending | none | S, low | none now | none

Question: D6 — E3: Should the mailbox's owner side show who else can send from it? <gstack-qid:plan-ceo-review-split-owner-sees-senders>
Project: shared mailboxes on main, nothing built.
ELI10: You grant Send only on Dwight's Access tab. Later, looking at Pam or at Settings, Mailboxes, you'd have no idea Dwight can also send from ceo@ unless you open his tab. A short line on the mailbox shows everyone who sends from it.
Stakes if we pick wrong: you forget someone can send as the CEO address, and mail goes out from it that you didn't expect.
Recommendation: A, because whoever sends as the CEO's address should be visible where the address is managed (only what's real, fields first).
Note: options differ in kind, not coverage, so no completeness score.
A) Add to this plan's scope (recommended) (effort S, risk low)
Pam's Access tab (under her mailbox) and the mailbox row in Settings, Mailboxes show "Also sends from here: Dwight (Send on approval)". ✅ One look tells you everyone who can send as that address. ✅ Read only text; the grant stays on the sender's tab. ❌ One more line on two screens.
B) Defer to TODOS.md (effort S, risk low)
Visible only on each sender's own tab for now. ✅ Smaller first version. ✅ No layout change. ❌ Senders are easy to forget.
C) Skip (effort S, risk low)
Each sender's tab is the only place. ✅ Fewer words on screen (less verbose UI). ✅ Nothing new. ❌ No single place lists who sends as an address.

## Answered decision E4 (deferred, D7)
Commitment comparison:
Commitment | Source/approval or pending | Current | A | B | C
Where send only is granted | A2: the sender's Access tab | sender's tab | sender's tab | sender's tab | sender's tab
Hiring a role that sends | pending | hire picks its own mailbox or none | the hire wizard also offers Send only from an existing mailbox when the role's pack card sends mail | deferred | no
Effort and risk | pending | none | S, low | none now | none

Question: D7 — E4: Should hiring a sales role offer Send only from an existing mailbox? <gstack-qid:plan-ceo-review-split-hire-offers-send-only>
Project: shared mailboxes on main, nothing built.
ELI10: When you hire Dwight today, the wizard can give him a mailbox of his own, or none. With Send only, the wizard could also offer "send from ceo@ (Pam's)" right there, so you don't have to find his Access tab afterwards.
Stakes if we pick wrong: a new sales hire starts unable to send until you discover the Access tab setting.
Recommendation: B, because the Access tab already covers it and the hire wizard is a busy screen; offer it once owners actually use Send only.
Note: options differ in kind, not coverage, so no completeness score.
A) Add to this plan's scope (effort S, risk low)
The hire wizard's mailbox step also lists "Send only from <address> (<owner>)" for roles whose card sends mail. ✅ A new sales hire can send from day one. ✅ Teaches the option where it matters. ❌ One more choice in an already full wizard step.
B) Defer to TODOS.md (recommended) (effort S, risk low)
Grant it on the Access tab for now; revisit the wizard later. ✅ Keeps the wizard as it is. ✅ The Access tab is the one place to learn it. ❌ New hires need a second step to send.
C) Skip (effort S, risk low)
The Access tab is the only place, permanently. ✅ Simplest. ✅ No wizard change ever. ❌ Every sending hire needs that extra step.

## NOT in scope

- Several agents reading or working one mailbox (A1, declined: one owner per mailbox).
- A schedule rule per mailbox (A1): unnecessary once only the owner can read.
- Marking replies for their sender (E2, skipped): the owner routes by content.
- The hire wizard offering Send only (E4, deferred to TODOS.md).

## Answered decision S1 (approved, D8)
Commitment comparison:
Commitment | Source/approval or pending | Current | A | B | C
Own mailbox (read and work) | owner 2026-09-26 | at most one | at most one | at most one | at most one
Send only grants per member | pending | none | any number | at most one | one, only for members without their own mailbox
Own mailbox plus a grant together | pending | n/a | yes | yes | no
Effort and risk | pending | none | S, medium (agent must pick the right From) | S, low | S, low

Question: D8 — S1: How many Send only grants may one team member hold? <gstack-qid:plan-ceo-review-send-only-count>
Project: shared mailboxes on main, nothing built.
ELI10: Each member keeps at most one mailbox of its own (your rule from September). The question is how many other addresses it may send from. Dwight might need only ceo@; a support member might own support@ and also send from ceo@ now and then.
Stakes if we pick wrong: too strict and a real case is blocked; too loose and an agent sends from the wrong address.
Recommendation: B, because it covers the real cases (own address plus the CEO's) while each agent only ever chooses between two From addresses, matching your one mailbox rule.
Note: options differ in kind, not coverage, so no completeness score.
A) Any number of grants (effort S, risk medium)
Own mailbox (at most one) plus as many Send only grants as you give. ✅ Covers every arrangement without another change. ✅ Simple rule to state. ❌ An agent with several From addresses can pick the wrong one.
B) At most one grant, alongside its own mailbox (recommended) (effort S, risk low)
Own mailbox (at most one) plus at most one Send only grant. ✅ Covers Dwight sending as the CEO and a support member who also sends as the CEO. ✅ Never more than two From addresses to choose from. ❌ A third address needs a change later.
C) One grant, only for members without a mailbox (effort S, risk low)
A member either owns a mailbox or sends only from one, never both. ✅ Exactly one From address per member, nothing to choose. ✅ Simplest to explain. ❌ A member with its own mailbox can never also send as the CEO.

## Answered decision S2 (approved, D9)
Commitment comparison:
Commitment | Source/approval or pending | Current | A | B
Roster line for a member with a grant | pending | names only its own mailbox | also "sends only from ceo@ (send on approval)" | unchanged
Effort and risk | pending | none | S, low | none

Question: D9 — S2: Should Michael's team roster name each member's Send only grant? <gstack-qid:plan-ceo-review-roster-names-grants>
Project: shared mailboxes on main, nothing built.
ELI10: You said the relay was a circus partly because Michael doesn't know who can send from which address. Michael's roster already lists each member's own mailbox and how it sends. Adding the Send only grant to that line lets him hand "email the prospect from the CEO's address" straight to Dwight.
Stakes if we pick wrong: Michael keeps routing sending jobs to Pam or Kelly by guess.
Recommendation: A, because it is one more phrase on a line Michael already reads, and it fixes the exact routing problem you described.
Note: options differ in kind, not coverage, so no completeness score.
A) Add to this plan's scope (recommended) (effort S, risk low)
The roster line for Dwight reads "sends only from ceo@ (Settings, Connections, Mailboxes; send on approval, set on their Access tab, Email)". ✅ Michael routes sending work to the member who can send. ✅ No new screen; reuses the roster line. ❌ The roster line gets a little longer.
B) Leave the roster unchanged (effort S, risk low)
Dwight uses his grant for his own work; Michael is not told. ✅ No change to Michael's context. ✅ Nothing to keep in sync. ❌ Michael still guesses who should send when a sending job comes to him.

## Answered decision S3 (approved, D10)
Commitment comparison:
Commitment | Source/approval or pending | Current | A | B | C
Who reads replies to a grant's email | A2: the mailbox owner | the owner | the owner | nobody until an owner exists | nobody
Grant on a mailbox with no owner | pending | allowed (plan 3b) | paused: the grant cannot send until someone owns the mailbox; the Access tab says so and Michael is told once | allowed, with a warning on the Access tab | allowed, no warning
Effort and risk | pending | none | S, low | S, medium | S, high

Question: D10 — S3: What happens to Send only when nobody owns the mailbox? <gstack-qid:plan-ceo-review-grant-without-owner>
Project: shared mailboxes on main, nothing built.
ELI10: Send only works because the mailbox's owner reads the replies and routes them back. If you turn Pam's email off (or move ceo@ away and nobody holds it), Dwight could keep sending from ceo@, but every prospect reply would sit unread.
Stakes if we pick wrong: outreach goes out and the answers are never seen.
Recommendation: A, because a send only grant is only safe while someone reads the replies, so it pauses on its own and comes back when an owner is set.
Note: options differ in kind, not coverage, so no completeness score.
A) Pause the grant until someone owns it (recommended) (effort S, risk low)
The grant stays but cannot send; Dwight's Access tab shows "Paused: nobody reads ceo@", and Michael is told once. ✅ No email leaves without someone to read its replies. ✅ Comes back on its own when an owner is set. ❌ Dwight's outreach stops until you fix the owner.
B) Allow it, with a warning (effort S, risk medium)
Dwight keeps sending; his Access tab warns that nobody reads replies. ✅ Outreach never stops. ✅ You see the warning. ❌ Replies pile up unread until you notice.
C) Allow it silently (effort S, risk high)
As the plan said before review. ✅ Nothing to build. ✅ Nothing stops. ❌ Replies are lost without anyone knowing.

## Answered decision E1b (approved, D11)
Commitment comparison:
Commitment | Source/approval or pending | Current | A | B | C
Send only member reads mail | A2: never | never | never, nothing fetched | never text, but ids can be probed for who sent them | never
Threaded follow ups | E1 (D4), reopened | reply_to any id when `to` matches its sender | reply_to only on an email the member itself sent from that mailbox (the app records the Message-ID of each of its sends); the prospect's reply sits in that same thread | as D4 plus the To-match rule; probing risk signed off | none: new emails only
Effort and risk | pending | S | S, low | S, medium | none

Question: D11 — E1b: How should Dwight's follow ups thread, given the probing risk? <gstack-qid:plan-ceo-review-threading-own-sends>
Project: shared mailboxes on main, nothing built.
ELI10: You approved threaded follow ups. The reviewer showed that letting Dwight reply to any email in ceo@ (even with the reply-to-sender check) lets him guess message numbers and learn who wrote them, which breaks "never reads". There is a cleaner way: Dwight threads onto the email he sent himself. The prospect's reply already sits in that thread, so his follow up lands in the same conversation, and the app never touches anyone else's message.
Stakes if we pick wrong: either Dwight can piece together who emails the CEO, or follow ups start new threads.
Recommendation: A, because it keeps one tidy thread for the prospect while the app reads nothing at all from the mailbox.
Note: options differ in kind, not coverage, so no completeness score.
A) Thread on his own sent email (recommended) (effort S, risk low)
reply_to accepts only an email this member sent from that mailbox; the app keeps the Message-IDs of each member's sends. ✅ The prospect sees one thread; nothing is read from the mailbox. ✅ Nothing to probe: other ids are refused before any lookup. ❌ If the prospect starts a brand new email instead of replying, the follow up starts a new thread too.
B) Keep D4 with the reply-to-sender check, accept the risk (effort S, risk medium)
Any id may be used when the email goes to that message's sender. ✅ Threads even onto emails the prospect started fresh. ✅ Already written into the plan. ❌ Guessing ids reveals who emailed the mailbox, against the never reads rule.
C) Drop threading: new emails only (effort S, risk low)
Follow ups are new emails with the same subject. ✅ Simplest; nothing to protect. ✅ No record of sends. ❌ Prospects see each follow up as a separate email in many mail apps.

## Document approval

Owner, 2026-10-06: A) Approve these document versions and continue (CEO summary
~/.gstack/projects/agentvivekkumar-dontbemichael/ceo-plans/2026-10-06-send-only-mailbox-access.md
and this plan). Implementation remains unapproved.

## Build timeline (0I)

```
  HOUR 1 (foundations):  the grant field and its setter; mailAccess with references; the
                         hook passing reply_to, forward, attach_from (human ~4h / CC ~20min)
  HOUR 2-3 (core logic): broker: list_mailboxes grant entry, send record, own sends only
                         threading, pause while unowned and the one notice (human ~1d / CC ~45min)
  HOUR 4-5 (integration): md-mail attach for a grant alone and restartNeeded; roster
                         AccessItem; Access tab "Also sends from", paused line, per grant
                         standing approvals; owner side and Settings senders list (human ~1d / CC ~1h)
  HOUR 6+ (polish/tests): locales x3, refusal path tests, docs (human ~1d / CC ~45min)
```
Feasibility blockers: none found. Surprises to expect: CapabilitiesTab hides email fields
while Can check email is off (line 174), and setAgentCapabilities rebuilds `email` whole.

## Review sections (CEO review, 2026-10-06)

### Section 1: Architecture

```
  Access tab (renderer)                       main                                   mail server
  ------------------------                    ------------------------------------   -----------
  Email: own mailbox ------------------+      config.agentCapabilities[id].email
  Also sends from: ceo@ (Sending) -----+--->    { enabled, mailboxes[0], sending,    
                                              sendOnly?: { mailbox, sending } }
                                                         |
  agent ── md-mail tool call ──> hook PreToolUse ──> mailAccess(cfg, agent, mailbox, op, refs)
                                         |                 |  grant branch before enabled gate
                                         v                 v
                                 broker /mail/<tool> ──> mailAccess again ──> MailService
                                                           |                   send / draft (Drafts)
                                                           +--> mail-proposals.json
                                                                 proposals, standing, send records
  roster line (accessLine) <── agentAccessSummary (AccessItem kind send-only)
  owner side + Settings "Also sends from here" <── config scan of sendOnly grants
```

- Data flows (send under a grant): happy, the email goes out from ceo@ under the grant's
  Sending mode; nil, no grant for that mailbox, refused like a missing mailbox; empty, no
  to or subject, the existing 400; error, SMTP failure, the existing "Not sent." error.
- State per grant: active, paused (no owner), removed. Paused happens only through owner
  loss; nothing but an owner returning resumes it.
- Coupling: mail-proposals.json gains send records beside proposals and standing approvals,
  the same owner (the app's mail module). Justified: one app owned mail store.
- Scale: one grant per member; send records capped at 500 per member. Nothing breaks at 10x.
- Security boundary: the grant gives send, draft, propose and list only; covered in 3.
- Rollback: an older build ignores `sendOnly` in config, so the grant simply stops working;
  no migration to undo.
- Default Sending for a new grant: Draft only, carried from the owner's earlier answer that
  members start on Draft only (send-on-approval review, "Draft only, as today").
No decision needed in this section.

### Section 2: Error and rescue map

```
  CODEPATH                          | WHAT CAN GO WRONG               | RESCUE                         | AGENT OR OWNER SEES
  ----------------------------------|---------------------------------|--------------------------------|-----------------------------
  setAgentCapabilities(sendOnly)    | unknown mailbox, own mailbox    | grant dropped on save          | Access tab shows no grant
  mailAccess grant branch           | read/organize/forward/attach    | refuse with a reason           | plain refusal to the agent
                                    | paused (no owner)               | refuse, notice to Michael once | refusal text; paused line
  broker reply_to under a grant     | id not in the member's sends    | refuse before lookup           | "Reply only to an email you sent from here"
  MailService.send under a grant    | SMTP down, password broken      | existing classifyMailError     | "Not sent. <reason>"
  send record write after a send    | mail-proposals.json write fails | log the error; send stands     | later reply_to on it refused; agent sends new email
  pause notice to Michael           | hive send fails                 | log; retried next refusal      | Michael may hear later
```
No silent failure: every row ends in a refusal the agent reads or a logged error. The send
record write failure is logged with the agent, mailbox and Message-ID (required detail).

### Section 3: Security

| Threat | Likelihood | Impact | Mitigated |
|---|---|---|---|
| A grantee reads the owner's mail | Med | High | Yes: read and organize refused in hook and broker; threading uses only its own send records |
| Probing message ids | Med | Med | Yes: other ids refused before any lookup (E1b) |
| Forward or attach mail out of the mailbox | Low | High | Yes: refused for grants |
| An agent edits config to grant itself | Low | High | Partly: depends on the open task "Keep agents out of the app's data folder" |
| Sending as the CEO without oversight | Med | Med | Yes: Sending mode per grant, Draft only first, standing approvals checked |
| Prompt injection telling Dwight to send | Med | Med | As today: Sending mode and approvals apply |
No decision needed beyond the open data folder task, already raised.

### Section 4: Data flow and interaction edge cases

| Interaction | Edge case | Handled | How |
|---|---|---|---|
| Add a grant | member is running | Yes | restartNeeded, like turning email on |
| Add a grant | the mailbox is the member's own | Yes | dropped on save |
| Remove a grant | a proposal for that mailbox is waiting or approved | Yes (after OV6) | proposals marked not sent with the reason; the sweep skips members who cannot send |
| Owner turns email off | grantee sends | Yes | paused, refusal, Michael told once |
| Owner fixes ownership | paused grant | Yes | resumes on the next call |
| Double click on add | Yes | the setter is idempotent |
Ordering: the grant and ownership are read from config on every call in both the hook and
the broker; a change between the two checks is caught by the broker's check.

### Section 5: Code quality

`mailAccess` would pass five branches with the grant rules; the grant checks go in their own
function called first from `mailAccess` (arrangement chosen under the owner's standing rule).
Naming: `sendOnly` for the field, "Send only" in the UI, `send-only` for the AccessItem kind.
No issues needing a decision.

### Section 6: Tests

```
  [GAP] hook refuses read, search, archive, mark_read, mark_junk for a grantee
  [GAP] broker refuses the same, plus forward and attach_from
  [GAP] reply_to on another id refused before lookup, same text
  [GAP] a send under a grant records its Message-ID; reply_to on it threads
  [GAP] grant survives email off and moves; setter drops a grant on the own mailbox
  [GAP] paused grant refuses and tells Michael once; resumes with an owner
  [GAP] list_mailboxes returns the grant; md-mail attaches for a grant alone
  [GAP] roster line names the grant; owner side and Settings list senders
  [GAP] locales have the new strings in en, zh-CN, ar
```
All are required proof of approved behavior (plan item 3f). No eval scope (no prompt change
beyond the roster line, which a test pins).

### Section 7: Performance

Send records: at most 500 per member in mail-proposals.json, read on reply_to only. Config
scan for "Also sends from here" is over agentCapabilities, small. No issues.

### Section 8: Observability

Today sends are logged to the hive log only for standing approvals and approved proposals.
A send under a grant (an agent writing as another member's address) has no log line. See
currentDecision O1.

Decision O1 (D12): approved; fields amended by O1b (D14) below.

### Section 9: Deployment and rollout

- No migration: `sendOnly` is a new optional field in config.json; send records are a new
  optional list in mail-proposals.json. Older files load unchanged.
- No flag: nothing changes until the owner adds a grant on an Access tab.
- Rollback: install the previous DMG. The old build ignores `sendOnly`, so a granted member
  simply loses the extra From address; its own mailbox works as before. Its first save of
  mail-proposals.json drops the send records (OV9), so threading on earlier sends stops after
  a rollback and a return; new sends thread again.
- Mixed versions: a single desktop app, so old and new code never run together. A member
  already running when the grant is added needs the existing restart (restartNeeded).
- After install: add a grant to a test member, send under Draft only (a draft lands in the
  owner mailbox's Drafts), try a read (refused), and check the roster line and the owner's
  "Also sends from here". Windows ships the same build untested (standing owner rule).
No decision needed.

### Section 10: Long term trajectory

- Debt: one more branch in the access rule, isolated in its own function; the send record
  list is capped. Docs to update: README, docs/FEATURES.md, docs/ARCHITECTURE.md (mail access).
- Reversibility: 5 of 5. Removing a grant restores today's behavior; the field can be dropped.
- Fit: builds on the existing mailbox owner rule, mailAccess, Sending modes, standing
  approvals and the hive routing; no parallel store (owner's standing rule).
- Next: the hire wizard offer (E4, TODOS.md). The send record list could later back other
  "my own sent emails" uses without new storage.
- Retrospective: declining A1 (shared reading) and E2 (reply markers) kept one owner per
  mailbox; neither is load bearing for the accepted items, since the owner routes replies.
No decision needed.

### Section 11: Design and UX

```
  Dwight > Access > Email
    [Can check email: off]          (own mailbox, unchanged)
    Also sends from  [ none v ]  (i)
          | pick ceo@ (Pam)          other mailboxes listed; its own mailbox greyed
          v
    Also sends from  [ ceo@ v ]  Sending: (o) Draft only ( ) Send on approval ( ) Can send
          | Pam loses ceo@ or email
          v
    Paused: nobody reads ceo@        (grant kept; resumes when an owner is set)

  Pam > Access > Email > ceo@          Settings > Mailboxes > ceo@
    Also sends from here: Dwight (Draft only)      (read only)
```

| Feature | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| Also sends from picker | existing tab load | "none" | save error toast (existing) | grant line shows | member running: restart note (existing) |
| Owner side line | none | line hidden | none | names and Sending | paused grant shows "Paused" after the name |

- First thing seen: the picker sits under the member's own email setting; the explanation is
  behind an InfoTip (owner's less verbose rule). Every mailbox is listed, its own greyed,
  never hidden (owner's never filter rule).
- DESIGN.md: reuses the Access tab radio group and read only line styles; no new pattern.
- Keyboard: the picker and radios are native controls. Mobile: not applicable (desktop app).
No decision needed. UI scope is small; /plan-design-review is optional, not required.

## Outside voice (Claude reviewer, 2026-10-06)
Codex is reserved for the adversarial pass (owner rule), so a Claude Plan reviewer ran, as in the
last two reviews. 10 findings (1 blocker, 8 should fix, 1 nit); claims checked against the code.
- OV1 pause check counts archived owners (mailboxes.ts:203, store.ts:1103): applied, `isActiveMember`; 3d corrected.
- OV2 grant inside `email` is erased by existing writers (mail.ts:906): applied, grant beside `email`.
- OV3 the refusal triggered notice never fires (hook refuses first): applied, notice on the change.
- OV4 threading had no way to find own ids; Draft only cannot thread: applied, own sends in list_mailboxes.
- OV5 approved proposals skip reference rules (mail.ts:731): applied, rule on stored proposal.
- OV6 pending proposals on a removed or paused grant: applied, marked not sent; sweep skips. Standing approvals: OV6b question.
- OV7 list_mailboxes top level misleads a grant only member: applied.
- OV8 office log is committed to git and read by agents: reopens O1 (O1b question).
- OV9 MailApprovals save drops unknown lists (mailApprovals.ts:59): applied; rollback note corrected.
- OV10 profile Uses row, roster "paused", restart flag: applied.

Decision OV6b (D13): approved. Removing a grant revokes that member's standing approvals for the
mailbox through `revokeStanding` (with its memory note); a test pins it.

Decision O1b (D14): approved, supersedes D12's fields. A direct send under a grant logs
`{kind: mail-sent, agentId, mailbox, messageId, grant: true}`; approved and standing sends add
`grant: true` to their existing kinds. To and subject stay in the app private send record
(mail-proposals.json) and the member's Access tab lists its recent sends under the grant. A
test pins that no recipient or subject reaches log.jsonl.

## Remaining TODO choices
None remain. E4 is already deferred to TODOS.md (D7); every outside voice finding was applied
in scope or answered (D13, D14). No new TODOs.

Approval readiness: PASS. Checked rows: A1 declined (D1), A2 (D2), mode (D3), E1 (D4), E2
skipped (D5), E3 (D6), E4 deferred (D7), S1 (D8), S2 (D9), S3 (D10), E1b (D11), O1 (D12)
amended by O1b (D14), OV6b (D13), OV1 to OV10 applied as corrections that carry out the
approved D2, D10, D11 and D12 commitments (no new behavior beyond them). Nothing unresolved.

## Required outputs

### NOT in scope (full)
- Rejected: several agents reading one mailbox (A1, D1): breaks one owner per mailbox.
- Rejected: a schedule rule per mailbox (A1, D1): only the owner reads, so nothing to schedule.
- Rejected: replies marked for their sender (E2, D5): the owner routes by content.
- Deferred: the hire wizard offering Send only (E4, D7): in TODOS.md.
- Rejected: recipients and subjects in the office log (O1b, D14): kept app private.

### What already exists
| Need | Existing code | Reused |
|---|---|---|
| One rule for hook and broker | `mailAccess` (mailboxes.ts) | yes, grant branch in its own function called first |
| Sending modes, proposals, standing approvals | mail.ts, mailProposals.ts, mailApprovals.ts | yes, per agent and mailbox already |
| One owner per mailbox | `mailboxHolder`, move flow in `setAgentCapabilities` | yes, plus an active member check |
| Telling Michael | hive inform from the app | yes |
| Roster access text | `agentAccessSummary`, `accessLine` (agentAccess.ts) | yes, new kind `send-only` |
| Separate capability setter | `quickbooks:setAccess` IPC | yes, same pattern |
| Office log | `appendLog` and existing mail kinds | yes, ids only |

### Dream state delta
12 month ideal: any address the business runs can be the voice of several members, each under
its own Sending mode and earned trust, while one owner keeps the inbox. This plan gets there for
one extra address per member. Left for later: offering the grant at hire (E4), more than one
grant per member if real offices ask, and showing a member's sends under each grant in one view
across the office.

### Error and rescue registry
| Method | Failure | Rescue | User impact |
|---|---|---|---|
| setSendOnly (IPC) | unknown mailbox, own mailbox, archived member | dropped, `ok:false` | Access tab shows no grant |
| grant check in `mailAccess` | read, organize, forward, attach_from | refusal with reason | agent reads the refusal |
| grant check in `mailAccess` | paused (no active owner) | refusal "Nobody reads ..." | agent tells Michael; tab shows Paused |
| broker reply_to check | id not in own send records | 403 before lookup | "Reply only to an email you sent from here" |
| send of approved proposal under grant | stored forward or attach, or foreign reply_to | 403 before `svc.send` | card shows not sent with reason |
| `svc.send` | SMTP or auth failure | existing classifyMailError | "Not sent. <reason>" |
| send record save | file write error | logged; the send stands | reply_to on it later refused |
| grant change hooks | proposals waiting or approved | marked not sent with reason | card shows reason |
| pause notice | hive send fails | logged | Michael hears from the agent's refusal text instead |

### Failure modes registry
```
  CODEPATH                    | FAILURE MODE                 | RESCUED? | TEST? | USER SEES?            | LOGGED?
  ----------------------------|------------------------------|----------|-------|-----------------------|--------
  grant read refusal          | grantee asks to read         | Y        | Y     | refusal               | N (no send)
  pause                       | owner archived or email off  | Y        | Y     | Paused line, refusal  | Y (notice)
  reply_to under grant        | foreign id                   | Y        | Y     | refusal               | N
  approved proposal send      | stored forward under grant   | Y        | Y     | not sent reason       | Y
  grant removed               | pending proposals            | Y        | Y     | not sent reason       | Y
  grant removed               | standing approvals left      | Y        | Y     | revoked, memory note  | Y
  send record write           | disk error                   | Y        | N     | later reply refused   | Y
  office log                  | recipient leak               | Y        | Y     | nothing leaked        | ids only
  rollback                    | send records dropped         | N        | N     | threading stops       | N
```
No critical gap: the rollback row is a known, documented loss of threading only (not silent at
send time, nothing wrong is sent).

### Scope expansion decisions
Full record: ~/.gstack/projects/agentvivekkumar-dontbemichael/ceo-plans/2026-10-06-send-only-mailbox-access.md
- Accepted: A2, E1 with E1b, E3, S1, S2, S3.
- Deferred: E4.
- Skipped: A1, E2.

### Diagrams
Architecture: Section 1. Error flow: Section 2. User flow: Section 11.

Data flow with shadow paths (a send under a grant):
```
  agent send(mailbox=ceo@) -> hook: grant op ok? --no--> refuse (read/organize/forward/attach)
                                   | yes
                                   v
                           broker: active owner? --no--> refuse "Nobody reads ceo@"
                                   | yes
                           reply_to? --yes--> in own send records? --no--> refuse before lookup
                                   |                       | yes -> In-Reply-To/References from record
                           Sending mode: draft -> save to ceo@ Drafts (no record)
                                         approval -> proposal card -> owner approves -> rules on stored proposal -> send
                                         send / standing -> send
                                   v
                           send record {messageId, references, to, subject} (app private)
                           office log {agentId, mailbox, messageId, grant:true}
```

Grant state machine:
```
  none --add--> active --owner lost (email off, moved, archived, removed)--> paused
   ^              |  ^                                                        |
   |              |  +---------------- active owner set ----------------------+
   +--remove------+  (remove: proposals not sent, standing revoked)
   +--mailbox removed in Settings (from active or paused)
   active --member becomes owner of that mailbox--> none (ownership covers it)
```

Deployment sequence: build, tests, DMG (Mac and Windows), install, add a grant to a test member,
Draft only send, refused read, roster and owner side lines.

Rollback:
```
  problem found -> install previous DMG -> grants ignored (config field kept)
                -> first proposals save drops send records -> threading on old sends stops
                -> reinstall fixed build -> grants work again; new sends thread
```

### Stale diagram audit
docs/ARCHITECTURE.md: the file tree note for mailboxes.ts (line 87) and the Access tab note
(line 126) need a Send only mention at implementation; its ASCII diagrams do not cover mail
access and stay accurate. No other touched file has a diagram.

## Implementation Tasks
Synthesized from this review's findings. Each task derives from a specific finding above.

- [ ] **T1 (P1, human: ~3h / CC: ~15min)** shared and main: grant data and setter
  - Surfaced by: OV2, S1; Files: src/shared/mailboxes.ts, src/main/mail.ts, src/main/index.ts, src/preload/index.ts
  - Verify: setter drops own mailbox and unknown mailbox; email off and moves keep the grant
- [ ] **T2 (P1, human: ~4h / CC: ~20min)** access rule: grant branch before the email gate
  - Surfaced by: Item 2, OV1 (active owner), S3; Files: src/shared/mailboxes.ts, src/main/hooks.ts, src/main/mail.ts
  - Verify: hook and broker refuse read, search, archive, mark read, mark junk, forward, attach_from; paused refuses
- [ ] **T3 (P1, human: ~4h / CC: ~20min)** threading on own sends
  - Surfaced by: E1b, OV4, OV9; Files: src/main/mail.ts, src/main/mailApprovals.ts, src/shared/mailProposals.ts, resources/md-mail-mcp.cjs
  - Verify: send records kept by load/save; foreign id refused before lookup; own id threads
- [ ] **T4 (P1, human: ~2h / CC: ~10min)** approved and standing sends apply grant reference rules
  - Surfaced by: OV5; Files: src/main/mail.ts
  - Verify: an approved proposal with a stored forward under a grant is refused
- [ ] **T5 (P1, human: ~3h / CC: ~15min)** lifecycle: pause notice on change, proposals not sent, standing revoked
  - Surfaced by: OV3, OV6, D13; Files: src/main/mail.ts, src/main/mailApprovals.ts, src/main/index.ts
  - Verify: Michael told once per pause; removing a grant marks proposals not sent and revokes standing
- [ ] **T6 (P1, human: ~2h / CC: ~10min)** list_mailboxes grant entry and tool text
  - Surfaced by: 3a, OV7; Files: src/main/mail.ts, resources/md-mail-mcp.cjs
  - Verify: grant only member gets no top level sending; entry lists own recent sends
- [ ] **T7 (P2, human: ~1h / CC: ~5min)** office log ids only
  - Surfaced by: O1, D14; Files: src/main/mail.ts
  - Verify: no recipient or subject reaches log.jsonl
- [ ] **T8 (P1, human: ~5h / CC: ~25min)** Access tab, owner side, Settings, profile, restart flag
  - Surfaced by: Items 1, 3c, 5, 5a, OV10, Section 11; Files: src/renderer/src/components/CapabilitiesTab.tsx, ProfileTab.tsx, Settings mailboxes screen, locales en, zh-CN, ar
  - Verify: tests for the strings and lines; no dashes
- [ ] **T9 (P1, human: ~1h / CC: ~5min)** roster line names the grant and pause
  - Surfaced by: S2, OV10; Files: src/shared/agentAccess.ts
  - Verify: roster test pins "sends only from ceo@" and "paused"
- [ ] **T10 (P2, human: ~1h / CC: ~5min)** docs
  - Surfaced by: Section 10, stale diagram audit; Files: README.md, docs/FEATURES.md, docs/ARCHITECTURE.md
  - Verify: docs name Send only and its limits

### Completion summary
```
  +====================================================================+
  |            MEGA PLAN REVIEW — COMPLETION SUMMARY                   |
  +====================================================================+
  | Mode selected        | SELECTIVE EXPANSION                         |
  | System Audit         | grant must sit beside email; archived owners|
  |                      | count today; proposals file drops unknowns  |
  | Step 0               | send only grant (A2), 6 cherry picks        |
  | Section 1  (Arch)    | 0 issues found                              |
  | Section 2  (Errors)  | 6 error paths mapped, 0 GAPS                |
  | Section 3  (Security)| 1 issue (data folder task), 0 High open     |
  | Section 4  (Data/UX) | 6 edge cases mapped, 0 unhandled (OV6)      |
  | Section 5  (Quality) | 0 issues found                              |
  | Section 6  (Tests)   | Diagram produced, 9 gaps (all planned)      |
  | Section 7  (Perf)    | 0 issues found                              |
  | Section 8  (Observ)  | 1 gap found (O1, resolved)                  |
  | Section 9  (Deploy)  | 1 risk flagged (rollback drops records)     |
  | Section 10 (Future)  | Reversibility: 5/5, debt items: 1           |
  | Section 11 (Design)  | 0 issues                                    |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (5 items)                           |
  | What already exists  | written                                     |
  | Dream state delta    | written                                     |
  | Error/rescue registry| 9 rows, 0 CRITICAL GAPS                     |
  | Failure modes        | 9 total, 0 CRITICAL GAPS                    |
  | TODOS.md updates     | 0 items proposed (E4 already there)         |
  | Scope proposals      | 10 proposed, 7 accepted (EXP + SEL)         |
  | CEO plan             | written                                     |
  | Outside voice        | Claude reviewer (native), completed, 10     |
  |                      | findings, 10 resolved; no external review   |
  | Lake Score           | N/A (no coverage scored questions)          |
  | Diagrams produced    | 6 (architecture, data flow, state, error,   |
  |                      | deployment, rollback) plus user flow        |
  | Stale diagrams found | 0 (2 text notes to update)                  |
  | Unresolved decisions | 0                                           |
  +====================================================================+
```

### Unresolved decisions
None.

## Engineering review (2026-10-07)
Target: this plan (docs/designs/shared-mailboxes.md), as cleared by the CEO review.

### Scope challenge
- Already solved: the access rule (`mailAccess`), Sending modes, proposals and standing
  approvals (mail-proposals.json), the md-mail spawn hook (index.ts:3586), the roster file main
  already reads (`RosterStore`, index.ts:352), hive informs to Michael. No new service or class.
- Complexity: about 17 changed files (mailboxes.ts, mailProposals.ts, mail.ts, mailApprovals.ts,
  hooks.ts, index.ts, preload, md-mail-mcp.cjs, agentAccess.ts, CapabilitiesTab.tsx,
  ProfileTab.tsx, the Settings mailboxes screen, 3 locales, docs) plus tests; 0 new classes.
  The gate trips on files. Feature cuts proposed: none (scope approved in the CEO review,
  D2 to D14). Structure: the plan's arrangement, chosen under the owner's standing rule never to
  ask file or module layout questions. Scope record: feature answers none; structure original
  (owner rule); accepted scope as the CEO review; pending remedies ER4.
- Search: no new architectural pattern, infrastructure or concurrency approach; every piece
  reuses an existing one, so no web search was needed [Layer 1].
- TODOS: "Keep each agent's mail pass out of other agents' reach" matters more with grants (a
  leaked token could send as ceo@), but does not block this plan. "Log every mail call" stays
  separate; this plan logs only sends under a grant (D14).
- Distribution: no new artifact.
Result: scope accepted as is.

### Findings
- ER1 [P1] (confidence 9/10) src/main/hive.ts:1294 and src/main/index.ts:651: the hive registry
  flag `archived` means "no live terminal" (set on every terminal exit and by the orphan sweep at
  index.ts:1023), not "off the team". If OV1's "not archived" check reads it, every grant on a
  mailbox pauses whenever its owner's terminal is closed or restarting, with a notice each time.
  Correction: a current member is an id in roster.json `agents` (`RosterStore.read()`, the file
  `standingGoalFromRoster` already reads); if the roster can't be read, fall back to the config
  only owner check. Carries out D10 as approved; no question.
- ER2 [P2] (8/10) plan 3b: "Michael is told once" needs a record and two triggers (config saves
  and roster writes, the second from the renderer's archive). Mechanism: one
  `noticePausedGrants()` run after each config save and roster write, comparing the paused set
  with `pausedNotified` keys in mail-proposals.json; tell once, clear the key on resume. Carries
  out D10; no question.
- ER3 [P2] (9/10) src/main/mail.ts:510-523: `compose()` reads every reference from the sending
  mailbox via `parseMessageId`, which refuses a Message-ID. Mechanism for E1b: the broker turns
  the member's send record into `input.thread = { inReplyTo, references }` and clears `replyTo`
  before `compose()`, which uses `thread` and fetches nothing. Carries out D11; no question.
- ER4 [P1] (8/10) src/main/mail.ts:713: the same mailbox check covers draft and send only:
  `if (foreign && (op === 'draft' || op === 'send'))`. A proposal can name a forward or attachment
  from another mailbox; after approval, the send path (mail.ts:731) passes the stored reference to
  `compose()`, which fetches that id from the SENDING mailbox (mail.ts:517), so a different email
  goes to an outside recipient. Pre existing, independent of grants. See currentDecision ER4.
- ER5 [P2] (8/10) src/main/mailApprovals.ts:86-97: `revokeStanding` sends one message per rule.
  Ending a grant with several standing approvals would send several. `endGrant()` revokes them in
  one save with one message and a memory line each. Carries out D13; no question.
- ER6 [P2] (8/10) src/shared/mailProposals.ts:15: states are waiting, approved, changes,
  declined, sent. Marking a cancelled grant's proposals "declined" would tell the agent the owner
  said no. Add `cancelled` with a reason; Ask me and the late sweep skip it. Carries out OV6.
- ER7 [P3] (8/10) src/main/index.ts:4814: the focus check passes only the own mailbox's Sending,
  so a grant only member's outreach job is checked with no Sending line. Add the grant's line
  ("sends only from ceo@: draft only"). Carries out the owner's rule that work styles never
  contradict the Sending setting; no question.
- ER8 [P3] (7/10) src/shared/mailboxes.ts:163: `mailAccess` takes five positional arguments and
  would take seven (references, current members). Use one options object; arrangement, picked.

### Decision ledger (engineering)

### ER4: same mailbox check for proposals
Finding: ER4, P1, confidence 8/10, src/main/mail.ts:713 and :731, Claude review.
Plan baseline: not in the plan; OV5 applies grant rules to stored proposals only.
Runtime evidence: mail.ts:713 checks draft and send only; proposalSendProblem
(mailProposals.ts:192) checks owner, mailbox and state, not references; compose fetches by id
from the sending mailbox (mail.ts:517).
Comparison grid:
Choice | Current | A | B
ER4 same mailbox check on propose and on approved send | none | refuse foreign references at propose and again before an approved send, with a test | unchanged
Other approved values (D2 to D14, OV1 to OV10, ER1 to ER3, ER5 to ER8) | as approved | unchanged | unchanged
Question D1:
D1 — ER4: Close the gap where an approved email can forward the wrong message? <gstack-qid:plan-eng-review-mb8-propose>
Project: shared mailboxes plan on main; found while checking the send path.
ELI10: When a member proposes an email that forwards or attaches another message, the app doesn't check that the message comes from the same mailbox. After you approve it, the app looks up that message number in the sending mailbox instead, so a different, unrelated email can be forwarded to the outside recipient. This exists today, separate from Send only, but grants add more proposals going through this path.
Stakes if we pick wrong: an unrelated customer email is forwarded to someone outside, after you approved what looked like a normal card.
Recommendation: A, because it's the same one line check draft and send already have, plus a test.
Note: options differ in kind, not coverage, so no completeness score.
Net: a small fix now against a rare but serious leak.
Header: D1 Forward
Options:
A) Fix it in this change (recommended)
Refuse a forward, attachment or reply from another mailbox at propose, and check the stored proposal again before an approved send. ✅ An approved card can never send a message other than the one it names. ✅ Same rule draft and send already follow, so agents see one consistent refusal. ❌ A few more lines and one more test in a change that is already large. (human: ~1 hour / CC: ~5 min)
B) Leave it
Keep today's behavior and handle it later. ✅ This change stays focused on Send only grants. ✅ Nothing extra to test now. ❌ The wrong email can still go out to an outside recipient after an approval.
State: approved
Actual answer: A) Fix it in this change (D1, 2026-10-07)
Accepted scope: the same mailbox check also runs at propose (mail.ts:713) and on the stored proposal before an approved send (mail.ts:731); a test pins both refusals.
History: none

### Section 1: Architecture
Findings: ER1 [P1], ER4 [P1], ER2 [P2], ER3 [P2] (above). Added here:
- ER9 [P2] (8/10) src/main/hooks.ts:514-523: the hook builds `mailAccess` input from `mcpConfig()`
  only; the pause check (ER1) needs the current member list there too. Give `HookServer` a
  `currentMembers()` dependency backed by the same `RosterStore` read the broker uses, so the
  hook and broker never disagree. Carries out D10; no question.
Production failure per new path: roster.json unreadable mid write: fall back to the config only
owner check (ER1), so a grant neither sends with nobody reading nor blocks on a transient read.
SMTP down under a grant: existing "Not sent." path. mail-proposals.json write fails after a
send: logged, the send stands (Section 2 of the CEO review).
Security: a leaked md-mail token now also sends as the grant's address; the open TODO "Keep each
agent's mail pass out of other agents' reach" covers it.
Dispositions: ER1, ER2, ER3, ER9 applied (carry out D10, D11); ER4 approved (D1).

### Section 2: Code quality
Findings: ER5 [P2], ER6 [P2], ER7 [P3], ER8 [P3] (above). Added here:
- ER10 [P3] (8/10) src/main/index.ts:3586 and src/shared/mailboxes.ts:214: "has the mail tools"
  is decided in two places (spawn checks `email.enabled`, restart checks `emailJustEnabled`). One
  `hasMailTools(caps)` (own mailbox or grant) used by both keeps them in step (OV10). Two real
  callers, same behavior; about 6 lines added, 3 removed. Applied.
Diagrams: docs/ARCHITECTURE.md notes at lines 87 and 126 need a Send only mention; no ASCII
diagram there covers mail access.
Dispositions: ER5, ER6, ER7, ER8, ER10 applied.

### Section 3: Tests
Framework: node:test, `node --test test/*.test.cjs`, plus `npm run -s typecheck`.

```
CODE PATHS                                              USER FLOWS
[+] src/shared/mailboxes.ts                             [+] Owner grants Send only
  ├── grant check (before email gate)                     ├── [★★ TESTED] Draft only on first email (multi-mailbox-ui:40)
  │   ├── [GAP] list/draft/propose/send allowed           ├── [GAP] Also sends from picker saves sendOnly
  │   ├── [GAP] read/search/organize refused              ├── [GAP] own mailbox greyed, every mailbox listed
  │   ├── [GAP] forward/attach_from refused               └── [GAP] Paused line when the owner leaves
  │   └── [GAP] paused when no current owner (roster)
  ├── mailAccess today  [★★★ TESTED] mail-edges:74      [+] Agent under a grant
  └── hasMailTools      [GAP] spawn and restart agree     ├── [GAP] list_mailboxes shows the grant and own sends
[+] src/main/mail.ts handleMailRequest                    ├── [GAP] [→E2E] send, then reply_to own Message-ID threads
  ├── same mailbox check  [★★ TESTED] forward (mail-edges:206)  └── [GAP] reply_to another id refused, same text
  │   └── [GAP] propose and approved send refuse foreign refs (ER4, D1)
  ├── reply_to under grant: record → thread, no fetch  [GAP]   [+] Grant ends
  ├── send record kept by proposals save  [GAP] (OV9)            ├── [GAP] proposals cancelled with reason
  ├── office log ids only  [GAP] (D14)                           ├── [GAP] standing revoked, one message (D13)
  ├── approved send  [★★★ TESTED] send-on-approval:71            └── [GAP] Michael told once; resumes silently
  └── standing send  [★★★ TESTED] send-on-approval:222
[+] src/main/hooks.ts md-mail gate  [★★ TESTED] mail-folders:167 (source pin)
  └── [GAP] grant refusals and pause with current members
[+] src/shared/agentAccess.ts  [★★★ TESTED] agent-access:31
  └── [GAP] send-only item, "paused" in the roster line, profile Uses row
[+] src/main/index.ts focus check  [GAP] grant Sending line (ER7)

COVERAGE: 6/26 paths tested (23%) | Code paths: 5/18 | User flows: 1/8
QUALITY: ★★★:4 ★★:3 ★:0 | GAPS: 20 (1 E2E, 0 eval)
```
Legend: ★★★ behavior + edge + error | ★★ happy path | ★ smoke check | [→E2E] integration test

Tests to add (all required proof of approved behavior; one table driven block where noted):
- test/send-only-grants.test.cjs (new file, unit plus broker level with the fake mail server used
  by mail-edges):
  - Access table: for a grant member, list/draft/propose/send allowed and read, search, archive,
    mark_read, mark_junk, forward, attach_from refused in both the hook and the broker.
    Value: protects=a grantee never reads the owner's mailbox; fails_when=the grant branch lets a read op through; why_new=mail-edges:74 covers owners only; seam=none
  - Pause: owner off the roster (roster.json), email off, or mailbox moved pauses; terminal exit
    (registry archived) does not; unreadable roster falls back to the config check.
    Value: protects=grants pause only when nobody reads the mailbox; fails_when=pause reads the registry flag or ignores the roster; why_new=no roster based check exists; seam=none
  - Threading: send records Message-ID, references, to, subject; reply_to on it sets In-Reply-To
    and References with no IMAP fetch; another id is refused with the one text before lookup.
    Value: protects=follow ups thread without reading the mailbox; fails_when=compose fetches for a grant or accepts a foreign id; why_new=compose always fetches today; seam=none
  - Records survive: filing a proposal, deciding it and a standing send keep send records.
    Value: protects=threading data is not wiped; fails_when=load or save drops the sends list; why_new=mailApprovals.save keeps two lists today; seam=none
  - Grant end: removing a grant or switching to Draft only cancels waiting and approved proposals
    with a reason, revokes standing approvals with one message, and the late sweep skips them.
    Value: protects=no dead errands and no silent revived trust; fails_when=cancel or revoke is skipped; why_new=no grant lifecycle exists; seam=none
  - Notice: Michael is told once per pause across a restart; resume clears it.
    Value: protects=Michael hears once; fails_when=the notice repeats or never fires; why_new=new; seam=none
  - Log: a direct send under a grant writes mail-sent with grant true and no to or subject.
    Value: protects=no recipients in git; fails_when=to or subject reach log.jsonl; why_new=new log line; seam=none
- test/mail-edges.test.cjs (extend): propose with a forward from another mailbox is refused, and a
  stored proposal with one is refused before send (ER4, D1). CRITICAL regression: draft and send
  keep their current refusal text.
  Value: protects=an approved card never forwards an unrelated email; fails_when=the check stays draft and send only; why_new=mail-edges:206 covers same mailbox forwards only; seam=none
- test/agent-access.test.cjs (extend the table): send-only item and "paused" in accessLine;
  profile Uses row names the grant.
- test/multi-mailbox-ui.test.cjs (extend): picker lists every mailbox with its own greyed;
  md-mail attaches for a grant alone (extend the line 98 pin); hasMailTools decides restart.
- test/send-on-approval.test.cjs (extend :175): the focus check passes the grant's Sending line.
- Locale pin (extend the existing locale key test): new keys in en, zh-CN, ar, no dashes.
Tests made obsolete: none. No LLM eval scope: the only prompt text change is the roster line and
tool descriptions, pinned by the tests above.
Test plan artifact: written (see report).
Dispositions: all gaps are required proof of approved behavior (D2 to D14, D1); no new choice.

### Section 4: Performance
- roster.json is read and parsed on every md-mail call, in the hook and in the broker (two
  reads). The file is small (tens of KB) and the hook already reads it per prompt for standing
  goals; calls are a few per minute. No issue.
- mail-proposals.json grows by at most 500 send records per grant member (about 300 bytes each,
  so about 150 KB per member) and is read on each mail call. No issue at a handful of members;
  revisit if offices grow to dozens of grant members.
No issues found.

### Outside voice (engineering, Claude reviewer, 2026-10-07)
Codex stays reserved for the adversarial pass (owner rule). 8 findings; the main claims were
checked against the code (store.ts:1271-1296, index.ts:4150, mailProposals.ts:192-197,
CapabilitiesTab.tsx:101). Verified fine: roster ids equal hive agent ids; the approval message
goes to the grant member with the grant mailbox; every config writer keeps a sibling field.
- EV1 [P1] (9/10) store.ts:1277: at every launch `reconcileWithLivePtys` moves every member but
  Michael from roster `agents` to `restorable` until auto restore respawns them, and a hire saves
  config before the roster flush. ER1's "id in `agents`" would pause every grant at each launch.
  Applied: an owner is present when its id is in roster `agents` or `restorable`, or the hive
  registry has it and no roster list does yet (a hire in flight); gone only when it is in
  `archived` or deleted. The Michael notice waits until a pause has lasted 5 minutes, checked on
  the existing sweep tick (index.ts:6437). A pause holds proposals instead of cancelling them
  (replaces OV6's "or paused"): sends stay refused while paused, the late sweep skips paused
  grants, and they can go after resume. Only owner actions (grant removed, switched to Draft only)
  cancel. CapabilitiesTab.tsx:101 `onTeam` uses the same helper, so moving a mailbox from a
  restorable owner asks first, as the owner's one agent per mailbox rule says (test added).
- EV2 [P1] (8/10) mailProposals.ts:192-197 refuses waiting, changes and declined, then returns
  null for anything else; a new `cancelled` state would fall through and send unapproved text.
  Applied: an allowlist, only `approved` with `p.approved` present proceeds, `sent` returns the
  repeat, everything else is refused with its reason (test added).
- EV3 [P2] (8/10) mailApprovals.ts:59 keeps only proposals and standing. Applied: `save()` keeps
  every current key (`{ ...cur, ...next }`), so `sends` and `pausedNotified` survive (test).
- EV4 [P2] (7/10) index.ts:4150 roster:write runs about every 500 ms. Applied: the pause check
  runs only on `ok: true` writes and on `mailAdmin.saveConfig` and the new grant setter, not on
  every config write; the 5 minute wait removes the hire double fire.
- EV5 [P2] (7/10) test gaps. Applied: an owner Send on approval reply keeps `inReplyTo` after the
  mail.ts:731 change (CRITICAL regression); the boot sequence (owner restorable) neither pauses
  nor tells Michael; a cancelled proposal cannot be sent; the hook test builds a real HookServer
  with `currentMembers`, as quickbooks-capability.test.cjs does.
- EV6 [P3] (7/10) mail.ts:561 send once key. Applied: `ComposeInput.thread` joins the hash.
- EV7 [P3] (6/10) ER4 loose ends. Applied: a send refused for a foreign reference marks that
  proposal cancelled with the reason, so the late sweep does not loop. The Ask me card shows no
  forward or attachment today (MailProposalCards.tsx has none): see currentDecision EV7b.
- EV8 [P3] (6/10) Applied: `list` is allowed when email is on or a grant exists (rule order
  spelled out); a member becoming the mailbox's owner drops its grant without `endGrant()`, so
  its proposals and standing approvals stay (they are keyed by agent and mailbox).

### EV7b: show forwards and attachments on the Ask me card
Finding: EV7, P3, confidence 6/10, src/renderer/src/components/MailProposalCards.tsx (no forward or attach rendering), Claude reviewer.
Plan baseline: not in the plan.
Runtime evidence: grep finds no forward, attach or replyTo in MailProposalCards.tsx.
Comparison grid:
Choice | Current | A | B
EV7b card names a forward or attachments | not shown | one short line ("Forwards 1 email", "Attaches files from 2 emails") under the subject, three locales, test | unchanged
Other approved values | as approved | unchanged | unchanged
Question D2:
D2 — EV7b: Should the Ask me approval card say when an email forwards or attaches something? <gstack-qid:plan-eng-review-card-forwards>
Project: shared mailboxes plan on main; found by the outside reviewer.
ELI10: When a member asks you to approve an email, the card shows who it goes to, the subject and the text. It doesn't show that the email also forwards another message or attaches files. You could approve sending a customer's email to someone outside without knowing it was attached.
Stakes if we pick wrong: you approve an email that carries more than you saw.
Recommendation: A, because approving should mean seeing everything that goes out, and it's one line.
Note: options differ in kind, not coverage, so no completeness score.
Net: one short line on the card against approving blind.
Header: D2 Card
Options:
A) Add the line (recommended)
One short line under the subject: "Forwards 1 email" or "Attaches files from 2 emails", in en, zh-CN and ar. ✅ You see everything that leaves before you approve. ✅ One line, matching the less verbose screens rule. ❌ Doesn't show the forwarded email itself, only that there is one. (human: ~1 hour / CC: ~5 min)
B) Leave the card as is
✅ No change to a card you already use. ✅ Smaller change. ❌ Forwards and attachments stay invisible when you approve.
State: approved
Actual answer: A) Add the line (D2, 2026-10-07)
Accepted scope: the Ask me mail card shows one short line under the subject when the email forwards a message or attaches files from emails, in en, zh-CN and ar, no dashes; a test pins it.
History: none

### Final planning decisions (engineering)
TODOs: none new. The open TODO "Keep each agent's mail pass out of other agents' reach" is
unchanged and now also covers grant tokens.
Approval readiness: PASS. ER4 (D1), EV7b (D2) approved by their answers. ER1 to ER3, ER5 to
ER10 and EV1 to EV8 carry out approved CEO decisions D2, D10, D11, D12/D14, D13 and D1 (mechanism
and required proof only); EV1 replaces OV6's cancel on pause with hold on pause, which keeps D10
("cannot send while paused") and removes cancellations the owner never asked for. Regression
contracts: draft and send keep their foreign reference refusal text; an owner's approved reply
keeps threading through the fetch. Nothing unresolved.

### Engineering outputs
NOT in scope: the hire wizard offer (E4, TODOS.md); showing the forwarded email itself on the
card (D2 shows only that one is there); a lower send record cap (revisit with dozens of grant
members, Section 4).

What already exists: `mailAccess` and `MAIL_TOOL_OPS` (extended, not copied); MB-8's same mailbox
check (extended to propose, D1); `MailApprovals` (gains `endGrant`, `cancelled`, kept keys);
`RosterStore.read` (reused for current members); the approval sweep tick (reused for the 5 minute
notice); `revokeStanding` logic (reused in one batch). Shared helper accepted: `hasMailTools`
(ER10, two real callers). New file: test/send-only-grants.test.cjs only.

Owner presence (EV1):
```
  id in roster agents ----------------------------+
  id in roster restorable (boot, before respawn) -+--> present --> grant active
  in hive registry, in no roster list (hiring) ---+
  id in roster archived, or deleted ---------------------> gone ----> grant paused
                                                     paused >= 5 min on sweep tick --> tell Michael once
  roster unreadable --> config only owner check (mailboxHolder)
```

Failure modes:
| Path | Production failure | Test | Handling | User sees |
|---|---|---|---|---|
| owner presence | app launch shuffles roster | yes (EV5) | restorable counts as present | nothing |
| owner presence | roster.json unreadable | yes | config only fallback | nothing |
| pause notice | repeated across restarts | yes | `pausedNotified` kept by save (EV3) | one notice |
| approved send | cancelled proposal resent | yes (EV2) | allowlist refusal | refusal with reason |
| approved send | foreign reference stored | yes (D1) | refused, proposal cancelled | card reason |
| thread send | same text, two threads | yes (EV6) | thread in send once key | both sent |
| send record | write error | no | logged, send stands | later reply refused, plain |
No critical gap.

Worktree parallelization:
| Step | Modules touched | Depends on |
|---|---|---|
| Rule and data | src/shared | none |
| Broker, approvals, hook, IPC | src/main, resources | Rule and data |
| Screens and locales | src/renderer, src/preload | Broker (IPC names) |
| Docs | docs, README | all |
Lane A: rule and data, then broker (shared and main). Lane B: screens after the IPC names are
fixed. Sequential in practice: one change, two lanes at most, B starts after A's IPC lands.

## Implementation Tasks (engineering, supersedes the CEO list)
- [ ] **T1 (P1, human: ~3h / CC: ~15min)** grant data, setter, `hasMailTools`
  - Surfaced by: OV2, S1, ER10; Files: src/shared/mailboxes.ts, src/main/mail.ts, src/main/index.ts, src/preload/index.ts
  - Verify: setter drops own and unknown mailbox; email off and moves keep the grant; spawn and restart agree
- [ ] **T2 (P1, human: ~4h / CC: ~20min)** access rule with grant branch, list order, options object
  - Surfaced by: item 2, ER8, EV8; Files: src/shared/mailboxes.ts, src/main/hooks.ts
  - Verify: access table in test/send-only-grants.test.cjs, hook via a real HookServer
- [ ] **T3 (P1, human: ~3h / CC: ~15min)** owner presence and pause
  - Surfaced by: ER1, ER9, EV1; Files: src/main/index.ts, src/main/hooks.ts, src/main/mail.ts, src/renderer/src/components/CapabilitiesTab.tsx
  - Verify: boot shuffle does not pause; archived owner pauses; restorable owner asks before a move
- [ ] **T4 (P1, human: ~4h / CC: ~20min)** threading on own sends
  - Surfaced by: E1b, ER3, EV6, OV4; Files: src/main/mail.ts, src/main/mailApprovals.ts, resources/md-mail-mcp.cjs
  - Verify: thread headers with no fetch; foreign id refused before lookup; send once key includes thread
- [ ] **T5 (P1, human: ~2h / CC: ~10min)** same mailbox check at propose and before approved send
  - Surfaced by: ER4 (D1), EV7, OV5; Files: src/main/mail.ts
  - Verify: both refusals; draft and send keep their text; owner approved reply still threads
- [ ] **T6 (P1, human: ~3h / CC: ~15min)** approvals: allowlist, `cancelled`, kept keys, `endGrant`, hold on pause
  - Surfaced by: EV2, EV3, ER5, ER6, D13; Files: src/shared/mailProposals.ts, src/main/mailApprovals.ts
  - Verify: cancelled cannot send; decide and file keep sends and pausedNotified; one revoke message
- [ ] **T7 (P2, human: ~2h / CC: ~10min)** pause notice on the sweep tick
  - Surfaced by: ER2, EV4; Files: src/main/index.ts, src/main/mailApprovals.ts
  - Verify: told once after 5 minutes, across a restart; resume clears
- [ ] **T8 (P1, human: ~2h / CC: ~10min)** list_mailboxes grant entry, tool text, office log ids only
  - Surfaced by: 3a, OV7, D14; Files: src/main/mail.ts, resources/md-mail-mcp.cjs
  - Verify: grant only member has no top level sending; no to or subject in log.jsonl
- [ ] **T9 (P1, human: ~5h / CC: ~25min)** screens: Access tab, owner side, Settings, profile, card line
  - Surfaced by: items 1, 3c, 5, 5a, D2; Files: src/renderer/src/components/CapabilitiesTab.tsx, ProfileTab.tsx, MailProposalCards.tsx, Settings mailboxes screen, locales en, zh-CN, ar
  - Verify: UI pins and locale keys, no dashes
- [ ] **T10 (P2, human: ~1h / CC: ~5min)** roster line, focus check line
  - Surfaced by: S2, OV10, ER7; Files: src/shared/agentAccess.ts, src/main/index.ts
  - Verify: roster and focus check tests
- [ ] **T11 (P2, human: ~1h / CC: ~5min)** docs
  - Surfaced by: Section 2 diagram audit; Files: README.md, docs/FEATURES.md, docs/ARCHITECTURE.md
  - Verify: docs name Send only and its limits

### Engineering completion summary
- Step 0: Scope Challenge: scope accepted as is
- Architecture Review: 5 issues found (ER1, ER2, ER3, ER4, ER9)
- Code Quality Review: 5 issues found (ER5, ER6, ER7, ER8, ER10)
- Test Review: diagram produced, 20 gaps identified
- Performance Review: 0 issues found
- NOT in scope: written
- What already exists: written
- TODOS.md updates: 0 items proposed to user
- Failure modes: 0 critical gaps flagged
- Unresolved decisions: 0 in this review
- Outside voice: native Claude reviewer, completed, 8 findings, 8 resolved; no external review (Codex kept for the adversarial pass)
- Parallelization: 2 lanes, 0 parallel / 2 sequential
- Lake Score: N/A (no answers scored for Completeness)

### Suppressed findings
None below confidence 5.

### Implementation notes (2026-10-07)
- Owner presence (EV1) uses roster.json `agents` and `restorable` only. The plan's "in the hive
  registry, in no roster list" case was dropped: the registry keeps deleted members, so they would
  count as present forever. A hire in flight is absent for under a second; the 5 minute notice
  wait covers it.
- The Access tab's move check (`onTeam`) adds restorable members and keeps archived ones, so taking
  a mailbox from an archived holder still asks, as before.
- The pause notice runs on the existing 5 minute owner sweep (index.ts), not the 30 minute one.
- Tests: test/send-only-grants.test.cjs (18 tests); six source pins updated for the new wiring.

### Access tab layout (owner, 2026-10-07)
The first build put Send only under an "Also sends from" picker below the Can check email switch,
which read as sending while email was off. The owner chose option A of
docs/designs/shared-mailboxes-ux.html: the Email section is the list of addresses the member uses,
each with Inbox (who watches it) and Sending; no on/off switch; Add a mailbox asks Watch the inbox
or Send only, greying a choice it can't make with the reason. Rules and data are unchanged.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR | 10 proposals, 7 accepted, 1 deferred |
| Outside Review | native Claude Plan reviewer, in CEO and Eng reviews (Codex kept for the adversarial pass) | Independent 2nd opinion | 2 | completed (native) | 18 findings; 18 resolved; 0 unresolved |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 18 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | not run on this plan | none |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | not run | none |

- **OUTSIDE COVERAGE:** CEO phase: native Claude reviewer, completed, 10 findings, all resolved. Eng phase: native Claude reviewer, completed, 8 findings, all resolved. No completed external (Codex) review.
- **VERDICT:** CEO + ENG CLEARED, ready to implement.

NO UNRESOLVED DECISIONS
