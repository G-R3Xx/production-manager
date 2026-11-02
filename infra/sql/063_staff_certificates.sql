-- V26.11.02.05: Training, licences and qualifications for workspace staff.
-- Run once in Supabase SQL Editor BEFORE deploying this version.
CREATE TABLE IF NOT EXISTS app.staff_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES app.memberships(id) ON DELETE CASCADE,
  title varchar(200) NOT NULL,
  category varchar(60) NOT NULL DEFAULT 'training',
  issuing_organisation varchar(200),
  certificate_number varchar(150),
  issued_date date,
  expiry_date date,
  reminder_days integer NOT NULL DEFAULT 30 CHECK (reminder_days BETWEEN 0 AND 365),
  notes text,
  file_path text,
  file_name varchar(255),
  file_type varchar(80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_certificate_dates_valid CHECK (expiry_date IS NULL OR issued_date IS NULL OR expiry_date >= issued_date)
);
CREATE INDEX IF NOT EXISTS staff_certificates_by_staff_idx
  ON app.staff_certificates (tenant_id, membership_id, expiry_date);
CREATE INDEX IF NOT EXISTS staff_certificates_expiry_idx
  ON app.staff_certificates (tenant_id, expiry_date)
  WHERE expiry_date IS NOT NULL;
-- Guarantees one notification per reminder/expiry stage, even under concurrent app requests.
CREATE TABLE IF NOT EXISTS app.staff_certificate_alert_events (
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  certificate_id uuid NOT NULL REFERENCES app.staff_certificates(id) ON DELETE CASCADE,
  expiry_date date NOT NULL,
  stage varchar(12) NOT NULL CHECK (stage IN ('due', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, certificate_id, expiry_date, stage)
);
-- Keep images and PDFs PRIVATE. A server-side signed URL is required to read them.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('staff-certificates', 'staff-certificates', false, 15728640, ARRAY['image/jpeg','image/png','image/webp','application/pdf']::text[])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
COMMENT ON TABLE app.staff_certificates IS 'Tenant-isolated training / licence records and their private uploaded evidence.';
