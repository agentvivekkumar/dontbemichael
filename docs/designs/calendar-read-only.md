# Calendar read only integration (Issue #374, Phases 2B and 2C)

The implementation follows the [business calendars proposal](https://github.com/Yong-Park/dontbemichael/blob/docs/business-calendars/docs/designs/business-calendars.md).
Phase 2B adds the main-process service and owner IPC. Phase 2C adds calendar
settings, per-agent access controls, authenticated broker routes, hooks and
read-only MCP tools. Proposals and all calendar writes remain out of scope.

## Services

`CalendarService.testConnection(accountId)` reads the existing encrypted app
password in main and discovers `current-user-principal`, `calendar-home-set`
and calendar collections through authenticated PROPFIND requests. Discovery
reads display names, supported components, calendar-query support and read
privileges when available. Origin-only endpoints returning 404 fall back to
`/.well-known/caldav`; iCloud supports Apple's explicit CalDAV shard hosts.
Fastmail, Zoho and custom/Nextcloud servers use the configured HTTPS origin.

Only completed discovery can mark an account connected. Results are applied
against the original account snapshot so a delayed response cannot verify a
replacement password or overwrite newer settings. Known collection IDs and
selections survive discovery. New collections start disabled, and grants for
removed collections are revoked in the same config write. Passwords remain
in the existing encrypted integration secret store.

`events(calendarId, range, context)` and `availability(...)` accept UTC start
and end strings with second precision, and an optional explicit IANA timezone
for floating times and all-day dates. Ranges are half open and at most 90 days,
between 1900 and 2200. A REPORT requests both a time-range filter and CALDAV
expand, with 48 hours of padding on either side to cover differences between
server and caller timezone interpretation of dates and floating times. The
server window is therefore at most 94 days; results are filtered to the original
interval locally. The client never evaluates a recurrence rule. Required event fields
are checked; optional missing fields remain absent. UTC timestamps accompany
the original dates, times and TZID. Availability clips and merges busy spans,
ignores cancelled and transparent events, and returns the free complement.

Agent reads use the Phase 1 permission rule. The caller context must be supplied
by trusted main code; owner IPC never accepts a claimed agent identity. Access
and account snapshots are checked before sending requests and before returning
data. The broker derives the agent ID from its authenticated token.

## Security and bounds

Only PROPFIND and REPORT can be sent. HTTPS and normal TLS certificate validation
are mandatory. All DNS answers must be public addresses. Private, loopback,
link-local, multicast, reserved, documentation and IPv6 transition ranges are
rejected. DNS is resolved for each request and redirect; the selected validated
IP is pinned in the socket lookup while the original hostname is used for TLS.
No environment proxies or pooled connections are used.

Redirects are limited to three and preserve the DAV method. Credentials stay on
the configured origin. The sole cross-origin exception is between Apple's
`caldav.icloud.com` and `p<number>-caldav.icloud.com` HTTPS endpoints for an
explicit iCloud account. A custom server cannot opt into this exception just by
selecting that provider. Discovered links use the same policy. Collection
resources returned by REPORT must stay inside the requested collection.

Each operation has a 30 second deadline including DNS, redirects and discovery.
Responses are bounded to 4 MiB, HTTP headers to 16 KiB, discovery to 200 calendars,
and event results to 10,000 events. Compressed responses are refused. XML is
parsed by namespace with limits on depth and node count; DTDs, external/custom
entities and processing instructions are rejected. Failed propstat values are
never treated as successful properties. Partial/error resources fail the read.

Errors are fixed actionable messages. Server bodies, OS errors and passwords
are never echoed or logged. Reflected passwords or Basic credentials in parsed
discovery/event values are rejected before returning or persisting them.
Tests inject DNS and the socket transport while
retaining the production endpoint policy; there is no local-server bypass.

## Dependencies

`saxes` supplies strict namespace-aware XML parsing; `ical.js` supplies content
line parsing, parameters, escaping, folding and duration syntax; `ipaddr.js`
supplies reviewed IPv4/IPv6 classification. The existing XML parser `sax` and
IP library were only transitive dependencies; there was no iCalendar parser.
These are direct pure JavaScript dependencies used only in main. No CalDAV
framework is added and no recurrence expansion runs in the client. The dependency
implementations remain external to the Electron main bundle, and nothing is
added to the renderer bundle.

## Explicit limitations

The service supports Basic authentication with app passwords; Google/Microsoft
OAuth and Digest authentication remain out of scope. Live provider accounts
were not used in automated tests. Unrelated cross-origin DAV deployments and
multiple calendar homes are refused rather than forwarding credentials broadly.

Unexpanded RRULE/RDATE/EXDATE/EXRULE properties, recurrence RANGE overrides,
embedded VTIMEZONE definitions, unknown timezones and ambiguous/nonexistent DST
wall times return unsupported. Recognized IANA TZID values on concrete events
can be resolved with ICU; UTC-expanded events are preferred. The client relies
on a conforming server for the completeness of successful expanded REPORTs;
it cannot independently prove that a server omitted no occurrences. Explicit
partial responses and leftover recurrence definitions fail closed.

Missing event ends are preserved by event retrieval, but availability returns
unsupported for an opaque, active event without a trustworthy end. It does not
invent an end or silently announce that interval free. The optional timezone
is an explicit interpretation for dates/floating times, not a guessed machine
local zone. Calendar timezone inference and custom VTIMEZONE evaluation remain
unsupported. The supported date range and response limits fail explicitly.

Phase 2C adds owner controls and read tools below. Approval and booking phases
remain separate.

## Phase 2C: owner controls and read tools

Settings > Connections > Calendars supports iCloud, Fastmail, Zoho and custom
CalDAV app-password accounts. Preset addresses are editable for regional and
custom endpoints. A new password is submitted only to the existing main-process
account API, then cleared from the form. There is no API to retrieve a saved
password. Save and test uses fresh discovery metadata, and only the authenticated
service marks an account connected. Failed authentication leaves the saved
account available for repair without creating duplicate accounts on retry.
Newly discovered calendars start disabled. Selection uses a main-process delta
operation; removal revokes the account's grants and uses existing secret cleanup.

The Access tab starts with no grants for every identity. Turning a calendar on
creates Read only access. Read only, Book on approval and Can book are stored
using a validated main-process grant delta that preserves other capabilities.
Disabled, removed and unverified calendars remain unavailable. Research cannot
hold calendar access. The UI explains that approval and booking are configuration
for future functionality; neither enables writes in this phase. Copy is provided
in English, Simplified Chinese and Arabic, using existing design tokens.

`resources/md-calendar-mcp.cjs` is a credential-free stdio adapter with exactly
three tools. The shared pure JavaScript contract validates arguments identically
in the MCP server, the hook and the broker, including prototype names, unknown
fields, duplicate IDs and bounded UTC intervals:

| Tool | Arguments | Successful result |
| --- | --- | --- |
| `list_calendars` | Empty object | Granted, enabled, connected calendar IDs, names and configured levels; no account or credential metadata |
| `search_events` | `calendar`, `start`, `end`, optional `time_zone`, `text`, `limit` | Events, total matched count and explicit `limited` flag |
| `free_busy` | `calendars`, `start`, `end`, optional `time_zone` | Union of busy spans and its free complement across every requested calendar |

Times are explicit UTC seconds and intervals are limited to 90 days. Floating
and all-day events require an explicit IANA `time_zone` where interpretation is
necessary. Search defaults to 100 results, with a maximum of 500; text is a
literal case-insensitive substring of UID, summary, location or description.
Free/busy accepts one to ten unique calendar IDs and never uses limited search
results. Any uncertain schedule, incomplete response or authorization failure
fails the entire free/busy request. It never returns partial availability.

The existing loopback integration broker accepts only authenticated POST requests
to `/calendar/<tool>`. Agent identity comes exclusively from a live capability
with a trusted agent binding; temporary worker capabilities have no fallback.
Membership and shared `calendarAccess` checks run before any read and again
before returning results. Multi-calendar authorization is checked as a whole
before dispatch. Revoked tokens are checked after body parsing and after the
handler returns. Bodies are limited to 16 KiB with a five second deadline;
responses are limited to 4 MiB. Errors omit server diagnostics and credentials.
The MCP adapter requires an exact IPv4 loopback broker address, does not follow
redirects, has a 40 second request timeout and bounds stdin lines and responses.
All CalDAV networking and credentials remain in the Phase 2B main service.

The connector gate recognizes `md-calendar`, then the dedicated PreToolUse hook
uses the same tool contract and calendar rule as the broker. All calendar MCP
resources and every tool outside the three above are refused, including proposal
and write tools under Book grants. The broker remains authoritative even when
a client bypasses the hook. Existing mail and connector policies are preserved.

Claude sessions with explicit calendar access receive the server using the
existing private agent MCP configuration. Mail and calendar share one minted
capability per session, avoiding token rotation conflicts. The private file is
mode 0600 and is removed with its capability at teardown. No new dependency is
introduced. Only Claude Code is currently offered by the application; other
engine-specific MCP adapters remain outside this phase. Running sessions that
started without calendar tools are queued for the existing idle restart flow
when an explicit grant becomes usable, including after re-enabling an account's
calendar. Pending restarts can be recovered after a renderer reload. Revocations
apply immediately, without waiting for a restart.

## Remaining Phase 3 work

Trusted, durable proposals and owner approval, exact approved-change verification,
write-capable CalDAV operations and automatic booking are still unimplemented.
There are no calendar writes, proposal tools or OAuth flows in this phase.
The Phase 2B interoperability and recurrence limitations above still apply.
Automated tests use mock transports; live provider account verification and an
interactive Electron UI smoke test remain manual release checks.
