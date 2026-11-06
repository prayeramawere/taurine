# Taurine Real Estate Backend

This project provides a public real-estate website and staff workspace backed by Next.js API routes and Supabase PostgreSQL.

## Included backend

- CRUD route handlers for properties, clients, transactions, leases, financing, tax assessments, agents, and property media
- Supabase migration for the schema and indexes
- Shared Supabase client and JSON response helpers
- Consistent validation and error handling for route requests
- OpenAI conversational property assistant backed by live Supabase listings
- Consent-checked lead capture, duplicate detection, and database-triggered notifications
- Admin-protected lead and notification APIs with Supabase Realtime support
- Public live-property catalogue, property details, consent-aware AI chat, and staff workspace
- Role-aware task, waitlist, notification, lead assignment, and confirmation workflows

## Environment setup

Configure the local `.env` file directly with:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=...
ASSISTANT_SESSION_SECRET=...
OPENAI_MODEL=gpt-4.1-mini
```

Use the existing `.env` file for local configuration; `.env` files are ignored by Git. Keep service-role keys, AI keys, and the session secret private and server-side.

## Database migration

Apply the migration with your Supabase CLI:

```bash
supabase db push
```

This applies the lead, notification, property-location, and private conversation-store schema. Lead changes and viewing/callback requests create persistent notification rows in the same database transaction. `notifications` is added to `supabase_realtime`; row-level policies allow dashboard access only to Supabase Auth users whose trusted `app_metadata.agency_role` is `admin`.

Authenticate/link the Supabase CLI before pushing migrations:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

To enable admin APIs and Realtime for an agency user, assign this trusted Supabase Auth app metadata using an administrative mechanism (never client-editable `user_metadata`):

```json
{
  "agency_role": "admin",
  "agency_permissions": ["leads:delete"]
}
```

The `leads:delete` permission is required in addition to the admin role to delete a lead. Send the user's Supabase access token as `Authorization: Bearer <access-token>` to lead, notification, and agency CRUD APIs. Anonymous callers cannot read private CRM, transaction, lease, financing, tax, or agent records. Keep `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, and `ASSISTANT_SESSION_SECRET` server-side; do not prefix them with `NEXT_PUBLIC_`.

## AI assistant and CRM APIs

- `POST /api/assistant/chat` accepts `{ "message": "..." }` and returns `{ "message": "...", "sessionToken": "..." }`. Send the returned token with later messages as `sessionToken`. Conversation messages are stored server-side and the signed session token prevents clients from selecting another session. Send a UUID `Idempotency-Key` header when retrying a request so lead updates and their notifications are not duplicated.
- `GET|POST /api/leads` requires an active staff session and role permissions. The list is scoped to assigned leads unless the role grants `leads:read`; collection responses support pagination and status/type/property filters. Lead edits and deletes continue to use the trusted agency-admin API.
- `GET /api/notifications` and `PATCH /api/notifications/[id]` use staff sessions; non-admin staff can only read or update notifications addressed to their own Supabase user id.
- An authenticated dashboard can subscribe directly to the Supabase Realtime `public.notifications` table with its Supabase user session. RLS applies to Realtime reads.

Property search tools default to active listings and return only fields selected from live database rows. The assistant creates or updates a lead only after explicit contact consent, a user-supplied email or phone number, and successful database execution. Lead/contact deduplication and notification creation run through a restricted server-side database function and trigger; the model never receives database credentials or arbitrary SQL access.

## Frontend-to-backend coverage matrix

The current UI connects the following workflows to the backend; rows marked **Gap** are not represented as completed functionality.

| Capability | Interface | Backend | Permission / behavior | Verification |
|---|---|---|---|---|
| Public property catalogue, filters, sort | `/` | `GET /api/properties` | Public; prices and listing records come from the database. Filters and sorting run over the returned live list. | TypeScript, lint, existing property-filter unit tests |
| Property detail and media gallery | `/property/[id]` | `GET /api/properties/[id]`, `GET /api/properties/[id]/media` | Public; media displays only URLs returned by the API. | TypeScript and lint |
| Property recommendations and AI chat | Homepage consultant | `POST /api/assistant/chat` | Public; assistant is backed by the existing AI and database tools. Structured property tool results render as linked listing cards. | Existing assistant/provider tests |
| Viewing/follow-up enquiry | Property detail form | `POST /api/assistant/chat` → consent-checked lead tool | Requires contact details entered by the visitor and explicit contact consent. It records a request; it does **not** book an appointment. | Existing consent/action unit tests |
| Staff sign-in/session/logout | `/staff` | `POST|DELETE /api/staff/session`, `GET /api/staff/me` | Supabase Auth session in HttpOnly cookies; active staff profile and DB role required. | Existing auth unit tests; live credentials required for end-to-end verification |
| Role-aware overview | Staff workspace | `GET /api/staff/dashboard` | Active staff session; database summary function. | TypeScript and lint |
| Lead list/status/assignment | Staff Leads | `GET /api/leads`, `PATCH /api/leads/[id]`, `POST /api/staff/leads/assign` | List is scoped by role; status edit is admin-only; lead assignment requires `leads:assign` and creates audit/notification records. | TypeScript and lint |
| Task view/status/create | Staff Tasks | `GET|POST /api/tasks`, `PATCH /api/tasks/[id]` | Assigned scope and role permissions are enforced by the API; creation form appears only where allowed. | TypeScript and lint |
| Staff notifications | Staff Overview/Notifications | `GET /api/notifications`, `PATCH /api/notifications/[id]` | Non-admin staff are restricted to their own recipient id; refresh is manual. | TypeScript and lint |
| Waitlist/matching review | Staff Waitlist | `GET /api/staff/waitlist` | Admin or permitted lead-reading roles; uses persisted match records and does not send email/SMS. | TypeScript and lint |
| Property create/edit/delete | Admin Properties | `POST /api/properties`, `PATCH|DELETE /api/properties/[id]` | Trusted administrator only; delete is explicitly confirmed in the UI. | TypeScript and lint |
| Agency records | Admin Agency Records | Existing clients, transactions, leases, financing, tax-assessment, agents, staff, audit APIs | Read-only listing interface; existing create/update/delete endpoints are not yet surfaced as forms. | TypeScript and lint |
| Property media link management | Admin Properties | Existing property-media GET/POST/DELETE APIs | Admins can add URL-based image/video/virtual-tour records and remove links; binary upload/storage is not supported by the current backend. | TypeScript and lint |
| Client preference review/update/cancel | — | No authenticated client self-service endpoints | **Gap:** public waitlist preference management and notification opt-out are not implemented. | — |
| Lead history and assignment history | — | No lead detail/history endpoint surfaced | **Gap:** no unified lead profile or enquiry timeline interface. | — |
| Transactions, leases, financing, tax, clients CRUD | Admin Agency Records | Existing role-protected collection/item APIs | **Gap:** current interface lists records only; forms and record-level workflows are not implemented. | — |
| Realtime task/notification updates | — | Tasks are published to Supabase Realtime; notification publication/policies exist | **Gap:** workspace currently refreshes manually and does not subscribe to Realtime. | — |
| Property-manager assignment scope and maintenance workflows | — | Property assignment data exists; no complete assigned-property/maintenance API workflow | **Gap:** assignment-scoped property management and maintenance UI are not complete. | — |
| Staff assistant proposals | Staff Assistant | `POST /api/staff/assistant`, `POST /api/staff/actions/[id]/confirm` | Role-aware reads; proposed task/property actions show their target and payload and require explicit confirmation. | TypeScript and lint |

### Known integration limits

- The catalogue API currently returns a complete list; server-side pagination/filtering is not available, so the public controls filter the returned rows in the browser.
- The agency-record workspace is a read-only index, not the complete data-entry and record-editing suite.
- Property-match deliveries are queued only; no email/SMS delivery provider is configured. The public interface must not claim that a match notification was sent.
- The public waitlist has no authenticated self-service preference or consent-management API.
- Realtime is not yet wired to the UI; staff can refresh workspace panels manually.
- Browser/end-to-end tests against Supabase require a migrated test project and active staff credentials. Unit tests do not substitute for those live workflows.

## Tests

```bash
npm test
npx tsc --noEmit
npm run lint
```

The unit tests cover property filter validation, lead/consent validation, and signed conversation sessions. Apply migrations to a non-production Supabase project when running integration tests or manually exercising the assistant.

## Demo data

Load the fictional sample records into all database tables with:

```bash
supabase db query --linked --file supabase/seed.sql
```

The seed uses fixed IDs and upserts, so it can be safely re-run without duplicating its sample records. It adds demo properties, clients, agents, transactions, leases, financing records, tax assessments, and property media.

## API routes

The backend includes REST-style handlers for:

- `/api/properties`
- `/api/clients`
- `/api/transactions`
- `/api/leases`
- `/api/financing`
- `/api/tax-assessments`
- `/api/properties/[id]/media`
- `/api/agents`

Use the standard `GET`, `POST`, `PATCH`, and `DELETE` patterns described in the project specification.

## Validation

The project has been checked with:

```bash
npx tsc --noEmit
npm run lint
```

A full production build is still subject to the environment's local Next.js workspace-root setup and the presence of other lockfiles outside this project directory.
