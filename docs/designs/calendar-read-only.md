# Calendar read only service (Issue #374, Phase 2B)

The implementation follows the [business calendars proposal](https://github.com/Yong-Park/dontbemichael/blob/docs/business-calendars/docs/designs/business-calendars.md).
It adds main process services and owner IPC only. Calendar UI, broker routes,
agent hooks, MCP tools, proposals and all calendar writes remain out of scope.

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
data. The later broker must derive the agent ID from its authenticated token.

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

## Explicit limitations and Phase 2C

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

Phase 2C still needs owner connection and calendar-selection UI, agent grant
management, broker routes, credential-free MCP tools and hook enforcement.
Those surfaces should call this service and derive agent identity from the
broker token. Later approval and booking phases remain separate.
