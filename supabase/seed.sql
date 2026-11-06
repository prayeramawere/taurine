insert into public.properties (
  property_id, property_type, square_footage, lot_size, bedrooms, bathrooms,
  year_built, location, zoning_classification, listing_status, days_on_market,
  listing_price, virtual_tour_url, portfolio_id
) values
  (
    '10000000-0000-4000-8000-000000000001', 'single-family', 2180, 6200, 4, 2.5,
    2018, 'Fairview', 'Residential', 'active', 12, 685000,
    'https://example.com/tours/oak-street', null
  ),
  (
    '10000000-0000-4000-8000-000000000002', 'multi-family', 3920, 8400, 6, 4,
    2006, 'North Fairview', 'Multi-family Residential', 'active', 28, 1125000,
    'https://example.com/tours/pine-avenue', null
  ),
  (
    '10000000-0000-4000-8000-000000000003', 'commercial', 5600, 12500, null, null,
    1998, 'Central Fairview', 'Commercial', 'pending', 41, 1490000,
    'https://example.com/tours/market-square', null
  ),
  (
    '10000000-0000-4000-8000-000000000004', 'townhouse', 1740, 2100, 3, 2.5,
    2021, 'Riverside', 'Residential', 'sold', 19, 529000,
    'https://example.com/tours/river-road', null
  )
on conflict (property_id) do update set
  property_type = excluded.property_type,
  square_footage = excluded.square_footage,
  lot_size = excluded.lot_size,
  bedrooms = excluded.bedrooms,
  bathrooms = excluded.bathrooms,
  year_built = excluded.year_built,
  location = excluded.location,
  zoning_classification = excluded.zoning_classification,
  listing_status = excluded.listing_status,
  days_on_market = excluded.days_on_market,
  listing_price = excluded.listing_price,
  virtual_tour_url = excluded.virtual_tour_url,
  portfolio_id = excluded.portfolio_id;

insert into public.clients (
  client_id, first_name, last_name, phone_number, email, mailing_address,
  date_of_birth, purchase_anniversary, employer, lead_source, client_type, notes
) values
  (
    '20000000-0000-4000-8000-000000000001', 'Jordan', 'Reed', '555-0101',
    'jordan.reed@example.com', '14 Sample Lane, Fairview, CA 90001',
    '1988-04-12', null, 'Northstar Design', 'website', 'buyer',
    'Interested in single-family homes near parks.'
  ),
  (
    '20000000-0000-4000-8000-000000000002', 'Taylor', 'Brooks', '555-0102',
    'taylor.brooks@example.com', '28 Example Street, Fairview, CA 90002',
    '1982-09-23', null, 'Brooks Family Trust', 'referral', 'seller',
    'Preparing a multi-family property for sale.'
  ),
  (
    '20000000-0000-4000-8000-000000000003', 'Morgan', 'Diaz', '555-0103',
    'morgan.diaz@example.com', '7 Demo Court, Fairview, CA 90003',
    '1991-01-08', null, 'Cedar Health', 'open house', 'tenant',
    'Looking for a long-term rental.'
  ),
  (
    '20000000-0000-4000-8000-000000000004', 'Avery', 'Chen', '555-0104',
    'avery.chen@example.com', '52 Placeholder Road, Fairview, CA 90004',
    '1979-06-17', null, 'Chen & Co.', 'referral', 'buyer',
    'Seeking a small commercial investment.'
  ),
  (
    '20000000-0000-4000-8000-000000000005', 'Casey', 'Morgan', '555-0105',
    'casey.morgan@example.com', '91 Fictional Avenue, Fairview, CA 90005',
    '1985-11-30', null, 'Morgan Properties', 'website', 'seller',
    'Previous client; townhouse transaction completed.'
  )
on conflict (client_id) do update set
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  phone_number = excluded.phone_number,
  email = excluded.email,
  mailing_address = excluded.mailing_address,
  date_of_birth = excluded.date_of_birth,
  purchase_anniversary = excluded.purchase_anniversary,
  employer = excluded.employer,
  lead_source = excluded.lead_source,
  client_type = excluded.client_type,
  notes = excluded.notes;

insert into public.agents (
  agent_id, first_name, last_name, phone_number, email, license_number,
  agency_id, status
) values
  (
    '30000000-0000-4000-8000-000000000001', 'Riley', 'Parker', '555-0201',
    'riley.parker@example.com', 'DEMO-CA-10001',
    '30000000-0000-4000-8000-000000000099', 'active'
  ),
  (
    '30000000-0000-4000-8000-000000000002', 'Jamie', 'Patel', '555-0202',
    'jamie.patel@example.com', 'DEMO-CA-10002',
    '30000000-0000-4000-8000-000000000099', 'active'
  ),
  (
    '30000000-0000-4000-8000-000000000003', 'Alex', 'Kim', '555-0203',
    'alex.kim@example.com', 'DEMO-CA-10003',
    '30000000-0000-4000-8000-000000000099', 'inactive'
  )
on conflict (agent_id) do update set
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  phone_number = excluded.phone_number,
  email = excluded.email,
  license_number = excluded.license_number,
  agency_id = excluded.agency_id,
  status = excluded.status;

insert into public.transactions (
  transaction_id, property_id, transaction_type, transaction_status,
  sale_price, transaction_date, deed_type, document_number,
  buyer_id, seller_id, agent_id
) values
  (
    '40000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000004', 'sale', 'completed',
    517500, '2026-03-18', 'Grant deed', 'DEMO-DOC-2026-001',
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000005',
    '30000000-0000-4000-8000-000000000001'
  ),
  (
    '40000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000003', 'purchase', 'pending',
    null, null, null, null,
    '20000000-0000-4000-8000-000000000004',
    '20000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000002'
  )
on conflict (transaction_id) do update set
  property_id = excluded.property_id,
  transaction_type = excluded.transaction_type,
  transaction_status = excluded.transaction_status,
  sale_price = excluded.sale_price,
  transaction_date = excluded.transaction_date,
  deed_type = excluded.deed_type,
  document_number = excluded.document_number,
  buyer_id = excluded.buyer_id,
  seller_id = excluded.seller_id,
  agent_id = excluded.agent_id;

insert into public.leases (
  lease_id, property_id, tenant_id, lease_start_date, lease_end_date,
  lease_status, rent_amount, occupancy_rate, lease_terms
) values
  (
    '50000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000003',
    '2026-01-01', '2026-12-31', 'active', 2450, 100,
    '{"payment_day": 1, "pets_allowed": false, "renewal_option": true}'::jsonb
  ),
  (
    '50000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000003',
    '2025-06-01', '2025-11-30', 'expired', 2100, 100,
    '{"payment_day": 1, "pets_allowed": true}'::jsonb
  )
on conflict (lease_id) do update set
  property_id = excluded.property_id,
  tenant_id = excluded.tenant_id,
  lease_start_date = excluded.lease_start_date,
  lease_end_date = excluded.lease_end_date,
  lease_status = excluded.lease_status,
  rent_amount = excluded.rent_amount,
  occupancy_rate = excluded.occupancy_rate,
  lease_terms = excluded.lease_terms;

insert into public.financing (
  financing_id, property_id, loan_amount, loan_type, interest_rate,
  loan_term, mortgage_status, lien_amount, lien_status, title_history,
  plat_map_url
) values
  (
    '60000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    480000, 'conventional', 6.125, 30, 'active', 480000, 'active',
    '[{"event": "purchase", "date": "2021-06-15", "reference": "DEMO-TITLE-001"}]'::jsonb,
    'https://example.com/maps/oak-street'
  ),
  (
    '60000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000003',
    725000, 'commercial', 7.25, 20, 'active', 725000, 'active',
    '[{"event": "origination", "date": "2024-02-01", "reference": "DEMO-TITLE-002"}]'::jsonb,
    'https://example.com/maps/market-square'
  )
on conflict (financing_id) do update set
  property_id = excluded.property_id,
  loan_amount = excluded.loan_amount,
  loan_type = excluded.loan_type,
  interest_rate = excluded.interest_rate,
  loan_term = excluded.loan_term,
  mortgage_status = excluded.mortgage_status,
  lien_amount = excluded.lien_amount,
  lien_status = excluded.lien_status,
  title_history = excluded.title_history,
  plat_map_url = excluded.plat_map_url;

insert into public.tax_assessments (
  assessment_id, property_id, parcel_id, assessed_value, tax_amount,
  tax_year, assessment_date, previous_assessed_value
) values
  (
    '70000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'DEMO-PARCEL-001', 642000, 7704, 2026, '2026-01-15', 618000
  ),
  (
    '70000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    'DEMO-PARCEL-002', 1050000, 12600, 2026, '2026-01-15', 1015000
  ),
  (
    '70000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000003',
    'DEMO-PARCEL-003', 1380000, 16560, 2026, '2026-01-15', 1325000
  )
on conflict (assessment_id) do update set
  property_id = excluded.property_id,
  parcel_id = excluded.parcel_id,
  assessed_value = excluded.assessed_value,
  tax_amount = excluded.tax_amount,
  tax_year = excluded.tax_year,
  assessment_date = excluded.assessment_date,
  previous_assessed_value = excluded.previous_assessed_value;

insert into public.property_media (
  media_id, property_id, media_type, media_url, display_order, is_primary
) values
  (
    '80000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001', 'image',
    'https://example.com/media/oak-street/front.jpg', 1, true
  ),
  (
    '80000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001', 'image',
    'https://example.com/media/oak-street/kitchen.jpg', 2, false
  ),
  (
    '80000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000002', 'video',
    'https://example.com/media/pine-avenue/walkthrough.mp4', 1, true
  ),
  (
    '80000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000003', 'document',
    'https://example.com/media/market-square/floorplan.pdf', 1, true
  )
on conflict (media_id) do update set
  property_id = excluded.property_id,
  media_type = excluded.media_type,
  media_url = excluded.media_url,
  display_order = excluded.display_order,
  is_primary = excluded.is_primary;
