CREATE TABLE IF NOT EXISTS staff (
  id uuid PRIMARY KEY,
  username text NOT NULL UNIQUE,
  full_name text NOT NULL,
  staff_number text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  staff_id uuid NOT NULL REFERENCES staff(id),
  csrf_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS batches (
  id text PRIMARY KEY,
  label text NOT NULL,
  activity text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'paused', 'closed')),
  income_limit numeric CHECK (income_limit >= 0),
  entitlement jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1
);
INSERT INTO batches(id,label,activity,status,entitlement)
VALUES ('HABAGAT-MM04-01','MM04 · Batch 01','Habagat Response · Metro Manila 04','active',
        '{"rice":6,"canned":4,"beef":4,"coffee":6,"cereal":6}') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS beneficiaries (
  id text PRIMARY KEY,
  profile jsonb NOT NULL,
  normalized_name text NOT NULL,
  birth_date date NOT NULL,
  normalized_valid_id text UNIQUE,
  version integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL REFERENCES staff(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS beneficiaries_identity ON beneficiaries(normalized_name,birth_date);
CREATE TABLE IF NOT EXISTS family_members (
  id uuid PRIMARY KEY,
  beneficiary_id text NOT NULL REFERENCES beneficiaries(id),
  related_beneficiary_id text REFERENCES beneficiaries(id),
  declared_name text NOT NULL,
  relationship text NOT NULL CHECK (relationship IN ('Spouse','Child','Parent','Sibling','Other')),
  declared_age integer CHECK (declared_age BETWEEN 0 AND 120),
  CHECK (related_beneficiary_id IS NULL OR related_beneficiary_id <> beneficiary_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS family_unique_link ON family_members(beneficiary_id,related_beneficiary_id)
WHERE related_beneficiary_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS family_owner ON family_members(beneficiary_id);
CREATE TABLE IF NOT EXISTS verifications (
  id uuid PRIMARY KEY,
  staff_id uuid NOT NULL REFERENCES staff(id),
  beneficiary_id text REFERENCES beneficiaries(id),
  method text NOT NULL CHECK (method IN ('simulated','manual')),
  details jsonb NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS assessments (
  id uuid PRIMARY KEY,
  staff_id uuid NOT NULL REFERENCES staff(id),
  beneficiary_id text NOT NULL REFERENCES beneficiaries(id),
  batch_id text NOT NULL REFERENCES batches(id),
  verification_id uuid NOT NULL REFERENCES verifications(id),
  profile_version integer NOT NULL,
  batch_version integer NOT NULL,
  eligible boolean NOT NULL,
  result jsonb NOT NULL,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS claims (
  id uuid PRIMARY KEY,
  beneficiary_id text NOT NULL REFERENCES beneficiaries(id),
  batch_id text NOT NULL REFERENCES batches(id),
  assessment_id uuid NOT NULL REFERENCES assessments(id),
  prepared_by uuid NOT NULL REFERENCES staff(id),
  released_by uuid REFERENCES staff(id),
  status text NOT NULL CHECK (status IN ('pending','released','cancelled')),
  idempotency_key uuid NOT NULL UNIQUE,
  request_hash text NOT NULL,
  receipt text UNIQUE,
  snapshot jsonb NOT NULL,
  variance_reason text NOT NULL DEFAULT '',
  prepared_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  CHECK ((status = 'released') = (released_at IS NOT NULL AND receipt IS NOT NULL))
);
-- A prepared handover also occupies the slot; cancellation frees it without erasing history.
CREATE UNIQUE INDEX IF NOT EXISTS claims_one_per_person_batch ON claims(beneficiary_id,batch_id)
WHERE status IN ('pending','released');
CREATE TABLE IF NOT EXISTS claim_items (
  claim_id uuid NOT NULL REFERENCES claims(id),
  item_key text NOT NULL,
  quantity integer NOT NULL CHECK (quantity >= 0),
  PRIMARY KEY (claim_id,item_key)
);
CREATE TABLE IF NOT EXISTS audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  staff_id uuid REFERENCES staff(id),
  action text NOT NULL,
  beneficiary_id text,
  details jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION preserve_audit_events() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit events are append-only'; END; $$;
DROP TRIGGER IF EXISTS audit_events_append_only ON audit_events;
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION preserve_audit_events();
CREATE TABLE IF NOT EXISTS staff_drafts (
  staff_id uuid PRIMARY KEY REFERENCES staff(id),
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
