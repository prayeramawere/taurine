create extension if not exists "pgcrypto";

create table if not exists public.properties (
  property_id uuid primary key default gen_random_uuid(),
  property_type varchar(50) not null check (length(trim(property_type)) > 0),
  square_footage decimal(12,2) not null check (square_footage >= 0),
  lot_size decimal(12,2) check (lot_size >= 0),
  bedrooms integer check (bedrooms >= 0),
  bathrooms decimal(4,2) check (bathrooms >= 0),
  year_built integer check (year_built between 1800 and 2100),
  zoning_classification varchar(100),
  listing_status varchar(40) not null default 'active' check (length(trim(listing_status)) > 0),
  days_on_market integer default 0 check (days_on_market >= 0),
  listing_price decimal(14,2) not null check (listing_price >= 0),
  virtual_tour_url text,
  portfolio_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clients (
  client_id uuid primary key default gen_random_uuid(),
  first_name varchar(100) not null check (length(trim(first_name)) > 0),
  last_name varchar(100) not null check (length(trim(last_name)) > 0),
  phone_number varchar(30),
  email varchar(255) unique,
  mailing_address text,
  linkedin_url text,
  facebook_url text,
  instagram_handle varchar(100),
  date_of_birth date,
  purchase_anniversary date,
  family_notes text,
  employer varchar(150),
  lead_source varchar(80),
  client_type varchar(40) not null check (length(trim(client_type)) > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agents (
  agent_id uuid primary key default gen_random_uuid(),
  first_name varchar(100) not null check (length(trim(first_name)) > 0),
  last_name varchar(100) not null check (length(trim(last_name)) > 0),
  phone_number varchar(30),
  email varchar(255) unique not null,
  license_number varchar(80) unique,
  agency_id uuid,
  status varchar(30) not null default 'active' check (length(trim(status)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transactions (
  transaction_id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(property_id) on delete cascade,
  transaction_type varchar(40) not null check (length(trim(transaction_type)) > 0),
  transaction_status varchar(40) not null default 'pending' check (length(trim(transaction_status)) > 0),
  sale_price decimal(14,2) check (sale_price >= 0),
  transaction_date date,
  deed_type varchar(80),
  document_number varchar(120),
  buyer_id uuid not null references public.clients(client_id) on delete restrict,
  seller_id uuid not null references public.clients(client_id) on delete restrict,
  agent_id uuid not null references public.agents(agent_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (buyer_id <> seller_id)
);

create table if not exists public.leases (
  lease_id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(property_id) on delete cascade,
  tenant_id uuid not null references public.clients(client_id) on delete restrict,
  lease_start_date date not null,
  lease_end_date date,
  lease_status varchar(40) not null default 'active' check (length(trim(lease_status)) > 0),
  rent_amount decimal(14,2) not null check (rent_amount >= 0),
  occupancy_rate decimal(5,2) default 0 check (occupancy_rate >= 0 and occupancy_rate <= 100),
  lease_terms jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (lease_end_date is null or lease_end_date >= lease_start_date)
);

create table if not exists public.financing (
  financing_id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(property_id) on delete cascade,
  loan_amount decimal(14,2) not null check (loan_amount >= 0),
  loan_type varchar(80) not null check (length(trim(loan_type)) > 0),
  interest_rate decimal(6,3) check (interest_rate >= 0),
  loan_term integer check (loan_term > 0),
  mortgage_status varchar(40) not null default 'active' check (length(trim(mortgage_status)) > 0),
  lien_amount decimal(14,2) default 0 check (lien_amount >= 0),
  lien_status varchar(40) default 'active' check (lien_status is null or length(trim(lien_status)) > 0),
  title_history jsonb not null default '{}'::jsonb,
  plat_map_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tax_assessments (
  assessment_id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(property_id) on delete cascade,
  parcel_id varchar(80) not null check (length(trim(parcel_id)) > 0),
  assessed_value decimal(14,2) not null check (assessed_value >= 0),
  tax_amount decimal(14,2) not null check (tax_amount >= 0),
  tax_year integer not null check (tax_year between 1900 and 2100),
  assessment_date date not null,
  previous_assessed_value decimal(14,2) check (previous_assessed_value >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.property_media (
  media_id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(property_id) on delete cascade,
  media_type varchar(40) not null check (length(trim(media_type)) > 0),
  media_url text not null check (length(trim(media_url)) > 0),
  display_order integer not null default 1 check (display_order >= 1),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at
before update on public.properties
for each row
execute function public.set_updated_at();

create trigger set_updated_at
before update on public.clients
for each row
execute function public.set_updated_at();

create trigger set_updated_at
before update on public.agents
for each row
execute function public.set_updated_at();

create trigger set_updated_at
before update on public.transactions
for each row
execute function public.set_updated_at();

create trigger set_updated_at
before update on public.leases
for each row
execute function public.set_updated_at();

create trigger set_updated_at
before update on public.financing
for each row
execute function public.set_updated_at();

create trigger set_updated_at
before update on public.tax_assessments
for each row
execute function public.set_updated_at();

create trigger set_updated_at
before update on public.property_media
for each row
execute function public.set_updated_at();

create index if not exists idx_properties_listing_status on public.properties(listing_status);
create index if not exists idx_properties_portfolio_id on public.properties(portfolio_id);
create index if not exists idx_clients_email on public.clients(email);
create index if not exists idx_clients_client_type on public.clients(client_type);
create index if not exists idx_agents_email on public.agents(email);
create index if not exists idx_agents_status on public.agents(status);
create index if not exists idx_transactions_property_id on public.transactions(property_id);
create index if not exists idx_transactions_buyer_id on public.transactions(buyer_id);
create index if not exists idx_transactions_seller_id on public.transactions(seller_id);
create index if not exists idx_transactions_agent_id on public.transactions(agent_id);
create index if not exists idx_transactions_status on public.transactions(transaction_status);
create index if not exists idx_leases_property_id on public.leases(property_id);
create index if not exists idx_leases_tenant_id on public.leases(tenant_id);
create index if not exists idx_leases_status on public.leases(lease_status);
create index if not exists idx_financing_property_id on public.financing(property_id);
create index if not exists idx_financing_mortgage_status on public.financing(mortgage_status);
create index if not exists idx_tax_assessments_property_id on public.tax_assessments(property_id);
create index if not exists idx_tax_assessments_tax_year on public.tax_assessments(tax_year);
create index if not exists idx_property_media_property_id on public.property_media(property_id);
create index if not exists idx_property_media_primary on public.property_media(property_id, is_primary);
