CREATE TABLE IF NOT EXISTS registration_requests (
  request_key uuid PRIMARY KEY,
  staff_id uuid NOT NULL REFERENCES staff(id),
  request_hash text NOT NULL,
  beneficiary_id text NOT NULL REFERENCES beneficiaries(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
