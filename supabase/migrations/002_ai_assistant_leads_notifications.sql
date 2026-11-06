alter table public.properties
  add column if not exists location text;

create index if not exists idx_properties_location on public.properties(location);

create table if not exists public.leads (
  lead_id uuid primary key default gen_random_uuid(),
  first_name varchar(100),
  last_name varchar(100),
  phone_number varchar(30),
  email varchar(255),
  lead_type varchar(40) check (
    lead_type is null or lead_type in ('buyer', 'seller', 'tenant', 'landlord', 'other')
  ),
  budget_min numeric(14, 2) check (budget_min is null or budget_min >= 0),
  budget_max numeric(14, 2) check (budget_max is null or budget_max >= 0),
  preferred_location text,
  preferred_property_type varchar(50),
  bedrooms_required integer check (bedrooms_required is null or bedrooms_required >= 0),
  property_id uuid references public.properties(property_id) on delete set null,
  lead_source varchar(80) not null default 'AI assistant',
  lead_status varchar(30) not null default 'new'
    check (lead_status in ('new', 'contacted', 'qualified', 'converted', 'closed')),
  notes text,
  consent_to_contact boolean not null default false,
  requested_action varchar(20) not null default 'none'
    check (requested_action in ('none', 'viewing', 'callback', 'information')),
  request_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (budget_min is null or budget_max is null or budget_min <= budget_max)
);

create unique index if not exists idx_leads_email_normalized
  on public.leads (lower(trim(email)))
  where email is not null and length(trim(email)) > 0;

create unique index if not exists idx_leads_phone_normalized
  on public.leads (regexp_replace(phone_number, '[^0-9]', '', 'g'))
  where phone_number is not null and length(regexp_replace(phone_number, '[^0-9]', '', 'g')) > 0;

create index if not exists idx_leads_status_created_at
  on public.leads (lead_status, created_at desc);
create index if not exists idx_leads_property_id on public.leads(property_id);

create or replace function public.set_lead_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
before update on public.leads
for each row execute function public.set_lead_updated_at();

create table if not exists public.notifications (
  notification_id uuid primary key default gen_random_uuid(),
  event_type varchar(40) not null
    check (event_type in ('lead.created', 'lead.updated', 'viewing.requested', 'callback.requested')),
  lead_id uuid references public.leads(lead_id) on delete set null,
  property_id uuid references public.properties(property_id) on delete set null,
  title varchar(120) not null,
  message text not null,
  is_read boolean not null default false,
  dedupe_key text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.assistant_conversations (
  session_id uuid primary key,
  messages jsonb not null default '[]'::jsonb
    check (jsonb_typeof(messages) = 'array'),
  expires_at timestamptz not null default now() + interval '30 days',
  updated_at timestamptz not null default now()
);

create table if not exists public.assistant_lead_requests (
  request_id uuid primary key,
  lead_id uuid not null references public.leads(lead_id) on delete cascade,
  was_created boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_created_at
  on public.notifications (created_at desc);
create index if not exists idx_notifications_unread
  on public.notifications (created_at desc)
  where is_read = false;
create index if not exists idx_assistant_conversations_expiry
  on public.assistant_conversations(expires_at);

create or replace function public.notify_lead_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  change_key text;
  should_notify_action boolean := false;
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (
      event_type, lead_id, property_id, title, message, dedupe_key
    ) values (
      'lead.created',
      new.lead_id,
      new.property_id,
      'New lead',
      'A new enquiry has been recorded.',
      'lead:' || new.lead_id::text || ':created'
    ) on conflict (dedupe_key) do nothing;
    change_key := coalesce(new.request_id::text, new.lead_id::text || ':' || new.updated_at::text);
  else
    change_key := coalesce(new.request_id::text, new.lead_id::text || ':' || new.updated_at::text);
    insert into public.notifications (
      event_type, lead_id, property_id, title, message, dedupe_key
    ) values (
      'lead.updated',
      new.lead_id,
      new.property_id,
      'Lead updated',
      'An enquiry record has been updated.',
      'lead:' || new.lead_id::text || ':updated:' || change_key
    ) on conflict (dedupe_key) do nothing;
  end if;

  if new.requested_action in ('viewing', 'callback')
     and tg_op = 'INSERT' then
    should_notify_action := true;
  elsif new.requested_action in ('viewing', 'callback')
     and old.request_id is distinct from new.request_id then
    should_notify_action := true;
  end if;

  if should_notify_action then
    insert into public.notifications (
      event_type, lead_id, property_id, title, message, dedupe_key
    ) values (
      case new.requested_action
        when 'viewing' then 'viewing.requested'
        else 'callback.requested'
      end,
      new.lead_id,
      new.property_id,
      case new.requested_action
        when 'viewing' then 'Viewing requested'
        else 'Callback requested'
      end,
      case new.requested_action
        when 'viewing' then 'A prospect requested a property viewing.'
        else 'A prospect requested a callback.'
      end,
      'lead:' || new.lead_id::text || ':action:' || change_key
    ) on conflict (dedupe_key) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists leads_notify_change on public.leads;
create trigger leads_notify_change
after insert or update on public.leads
for each row execute function public.notify_lead_change();

create or replace function public.create_or_update_assistant_lead(
  p_lead jsonb,
  p_request_id uuid
)
returns table (lead_id uuid, was_created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate public.leads%rowtype;
  previous_request public.assistant_lead_requests%rowtype;
  normalized_email text := nullif(lower(trim(p_lead->>'email')), '');
  normalized_phone text := nullif(regexp_replace(coalesce(p_lead->>'phone_number', ''), '[^0-9]', '', 'g'), '');
begin
  if p_request_id is null then
    raise exception 'request id is required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('lead-request:' || p_request_id::text, 0));

  select * into previous_request
    from public.assistant_lead_requests r
    where r.request_id = p_request_id;
  if found then
    return query select previous_request.lead_id, previous_request.was_created;
    return;
  end if;

  if normalized_email is null and normalized_phone is null then
    raise exception 'an email address or phone number is required' using errcode = '22023';
  end if;

  if normalized_email is not null then
    perform pg_advisory_xact_lock(hashtextextended('lead-email:' || normalized_email, 0));
  end if;
  if normalized_phone is not null then
    perform pg_advisory_xact_lock(hashtextextended('lead-phone:' || normalized_phone, 0));
  end if;

  if normalized_email is not null then
    select * into candidate
      from public.leads l
      where lower(trim(l.email)) = normalized_email
      order by l.created_at
      limit 1
      for update;
  end if;

  if candidate.lead_id is null and normalized_phone is not null then
    select * into candidate
      from public.leads l
      where regexp_replace(l.phone_number, '[^0-9]', '', 'g') = normalized_phone
      order by l.created_at
      limit 1
      for update;
  end if;

  if candidate.lead_id is not null then
    update public.leads l set
      first_name = coalesce(nullif(trim(p_lead->>'first_name'), ''), l.first_name),
      last_name = coalesce(nullif(trim(p_lead->>'last_name'), ''), l.last_name),
      phone_number = coalesce(nullif(trim(p_lead->>'phone_number'), ''), l.phone_number),
      email = coalesce(normalized_email, l.email),
      lead_type = coalesce(nullif(p_lead->>'lead_type', '')::varchar, l.lead_type),
      budget_min = coalesce(nullif(p_lead->>'budget_min', '')::numeric, l.budget_min),
      budget_max = coalesce(nullif(p_lead->>'budget_max', '')::numeric, l.budget_max),
      preferred_location = coalesce(nullif(trim(p_lead->>'preferred_location'), ''), l.preferred_location),
      preferred_property_type = coalesce(nullif(trim(p_lead->>'preferred_property_type'), ''), l.preferred_property_type),
      bedrooms_required = coalesce(nullif(p_lead->>'bedrooms_required', '')::integer, l.bedrooms_required),
      property_id = coalesce(nullif(p_lead->>'property_id', '')::uuid, l.property_id),
      notes = case
        when nullif(trim(p_lead->>'notes'), '') is null then l.notes
        when nullif(trim(l.notes), '') is null then trim(p_lead->>'notes')
        else l.notes || E'\n' || trim(p_lead->>'notes')
      end,
      consent_to_contact = l.consent_to_contact or coalesce((p_lead->>'consent_to_contact')::boolean, false),
      lead_source = coalesce(nullif(trim(p_lead->>'lead_source'), ''), l.lead_source),
      requested_action = coalesce(nullif(p_lead->>'requested_action', ''), 'none'),
      request_id = p_request_id
    where l.lead_id = candidate.lead_id
    returning l.* into candidate;

    insert into public.assistant_lead_requests (request_id, lead_id, was_created)
      values (p_request_id, candidate.lead_id, false);
    return query select candidate.lead_id, false;
    return;
  end if;

  insert into public.leads (
    first_name, last_name, phone_number, email, lead_type,
    budget_min, budget_max, preferred_location, preferred_property_type,
    bedrooms_required, property_id, lead_source, lead_status, notes,
    consent_to_contact, requested_action, request_id
  ) values (
    nullif(trim(p_lead->>'first_name'), ''),
    nullif(trim(p_lead->>'last_name'), ''),
    nullif(trim(p_lead->>'phone_number'), ''),
    normalized_email,
    nullif(p_lead->>'lead_type', ''),
    nullif(p_lead->>'budget_min', '')::numeric,
    nullif(p_lead->>'budget_max', '')::numeric,
    nullif(trim(p_lead->>'preferred_location'), ''),
    nullif(trim(p_lead->>'preferred_property_type'), ''),
    nullif(p_lead->>'bedrooms_required', '')::integer,
    nullif(p_lead->>'property_id', '')::uuid,
    coalesce(nullif(trim(p_lead->>'lead_source'), ''), 'AI assistant'),
    'new',
    nullif(trim(p_lead->>'notes'), ''),
    coalesce((p_lead->>'consent_to_contact')::boolean, false),
    coalesce(nullif(p_lead->>'requested_action', ''), 'none'),
    p_request_id
  ) returning * into candidate;

  insert into public.assistant_lead_requests (request_id, lead_id, was_created)
    values (p_request_id, candidate.lead_id, true);
  return query select candidate.lead_id, true;
end;
$$;

revoke all on function public.create_or_update_assistant_lead(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.create_or_update_assistant_lead(jsonb, uuid) to service_role;

alter table public.leads enable row level security;
alter table public.notifications enable row level security;
alter table public.assistant_conversations enable row level security;
alter table public.assistant_lead_requests enable row level security;
alter table public.properties enable row level security;
alter table public.property_media enable row level security;
alter table public.clients enable row level security;
alter table public.agents enable row level security;
alter table public.transactions enable row level security;
alter table public.leases enable row level security;
alter table public.financing enable row level security;
alter table public.tax_assessments enable row level security;

drop policy if exists "Public can read properties" on public.properties;
create policy "Public can read properties"
  on public.properties
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Agency admins manage properties" on public.properties;
create policy "Agency admins manage properties"
  on public.properties
  for all
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'agency_role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'agency_role') = 'admin');

drop policy if exists "Public can read property media" on public.property_media;
create policy "Public can read property media"
  on public.property_media
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Agency admins manage property media" on public.property_media;
create policy "Agency admins manage property media"
  on public.property_media
  for all
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'agency_role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'agency_role') = 'admin');

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'clients', 'agents', 'transactions', 'leases', 'financing', 'tax_assessments'
  ] loop
    execute format('drop policy if exists %I on public.%I', 'Agency admins manage ' || table_name, table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((auth.jwt() -> ''app_metadata'' ->> ''agency_role'') = ''admin'') with check ((auth.jwt() -> ''app_metadata'' ->> ''agency_role'') = ''admin'')',
      'Agency admins manage ' || table_name,
      table_name
    );
  end loop;
end;
$$;

drop policy if exists "Agency admins manage leads" on public.leads;
drop policy if exists "Agency admins read leads" on public.leads;
create policy "Agency admins read leads"
  on public.leads
  for select
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'agency_role') = 'admin');

drop policy if exists "Agency admins create leads" on public.leads;
create policy "Agency admins create leads"
  on public.leads
  for insert
  to authenticated
  with check ((auth.jwt() -> 'app_metadata' ->> 'agency_role') = 'admin');

drop policy if exists "Agency admins update leads" on public.leads;
create policy "Agency admins update leads"
  on public.leads
  for update
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'agency_role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'agency_role') = 'admin');

drop policy if exists "Permitted agency admins delete leads" on public.leads;
create policy "Permitted agency admins delete leads"
  on public.leads
  for delete
  to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'agency_role') = 'admin'
    and coalesce(auth.jwt() -> 'app_metadata' -> 'agency_permissions', '[]'::jsonb) ? 'leads:delete'
  );

drop policy if exists "Agency admins read notifications" on public.notifications;
create policy "Agency admins read notifications"
  on public.notifications
  for select
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'agency_role') = 'admin');

drop policy if exists "Agency admins update notifications" on public.notifications;
create policy "Agency admins update notifications"
  on public.notifications
  for update
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'agency_role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'agency_role') = 'admin');

revoke all on public.clients, public.agents, public.transactions, public.leases,
  public.financing, public.tax_assessments, public.leads, public.notifications
  from public, anon;
revoke all on public.properties, public.property_media from public, anon, authenticated;
grant select, insert, update, delete on public.clients, public.agents,
  public.transactions, public.leases, public.financing, public.tax_assessments,
  public.leads to authenticated;
grant select on public.notifications to authenticated;
grant update (is_read) on public.notifications to authenticated;
grant all on public.clients, public.agents, public.transactions, public.leases,
  public.financing, public.tax_assessments, public.leads, public.notifications,
  public.assistant_conversations, public.properties, public.property_media
  to service_role;
revoke insert, update, delete on public.properties, public.property_media from anon;
grant select on public.properties, public.property_media to anon, authenticated;
grant insert, update, delete on public.properties, public.property_media to authenticated;

revoke all on public.assistant_conversations from public, anon, authenticated;
grant select, insert, update, delete on public.assistant_conversations to service_role;
revoke all on public.assistant_lead_requests from public, anon, authenticated;
grant all on public.assistant_lead_requests to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
