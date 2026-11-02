import "server-only";

import { pool } from "@production-manager/db";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { STAFF_CERTIFICATE_BUCKET, STAFF_CERTIFICATE_MIME_TYPES } from "@/lib/staff-certificate";

export type StaffCertificate = {
  id: string;
  tenantId: string;
  membershipId: string;
  title: string;
  category: string;
  issuingOrganisation: string | null;
  certificateNumber: string | null;
  issuedDate: string | null;
  expiryDate: string | null;
  reminderDays: number;
  notes: string | null;
  filePath: string | null;
  fileName: string | null;
  fileType: string | null;
  createdAt: string;
  updatedAt: string;
};

const CERTIFICATE_COLUMNS = `
 id::text AS "id", tenant_id::text AS "tenantId", membership_id::text AS "membershipId",
 title, category, issuing_organisation AS "issuingOrganisation", certificate_number AS "certificateNumber",
 issued_date::text AS "issuedDate", expiry_date::text AS "expiryDate", reminder_days AS "reminderDays",
 notes, file_path AS "filePath", file_name AS "fileName", file_type AS "fileType",
 created_at::text AS "createdAt", updated_at::text AS "updatedAt"`;

export async function staffMemberInTenant(tenantId: string, membershipId: string): Promise<{ fullName: string; email: string; tenantRole: string } | null> {
  const result = await pool.query<{ fullName: string; email: string; tenantRole: string }>(`
    SELECT up.full_name AS "fullName", up.email, m.tenant_role::text AS "tenantRole"
    FROM app.memberships m INNER JOIN app.user_profiles up ON up.id=m.user_profile_id
    WHERE m.tenant_id=$1::uuid AND m.id=$2::uuid
  `, [tenantId, membershipId]);
  return result.rows[0] ?? null;
}

export async function listStaffCertificates(tenantId: string, membershipId: string): Promise<StaffCertificate[]> {
  const result = await pool.query<StaffCertificate>(`
    SELECT ${CERTIFICATE_COLUMNS} FROM app.staff_certificates
    WHERE tenant_id=$1::uuid AND membership_id=$2::uuid
    ORDER BY expiry_date ASC NULLS LAST, title ASC, created_at DESC
  `, [tenantId, membershipId]);
  return result.rows;
}

export async function getStaffCertificate(tenantId: string, certificateId: string): Promise<StaffCertificate | null> {
  const result = await pool.query<StaffCertificate>(`
    SELECT ${CERTIFICATE_COLUMNS} FROM app.staff_certificates
    WHERE tenant_id=$1::uuid AND id=$2::uuid
  `, [tenantId, certificateId]);
  return result.rows[0] ?? null;
}

export async function saveStaffCertificate(tenantId: string, membershipId: string, input: {
  certificateId?: string;
  title: string;
  category: string;
  issuingOrganisation: string | null;
  certificateNumber: string | null;
  issuedDate: string | null;
  expiryDate: string | null;
  reminderDays: number;
  notes: string | null;
  filePath: string | null;
  fileName: string | null;
  fileType: string | null;
}): Promise<void> {
  const existing = input.certificateId ? await getStaffCertificate(tenantId, input.certificateId) : null;
  if (input.certificateId && (!existing || existing.membershipId !== membershipId)) throw new Error("Certificate not found for this staff member.");
  if (input.filePath && !input.filePath.startsWith(`${tenantId}/${membershipId}/`)) throw new Error("Invalid attachment location.");
  if (input.fileType && !STAFF_CERTIFICATE_MIME_TYPES.some((value) => value === input.fileType)) throw new Error("Invalid file type.");

  const values = [tenantId, membershipId, input.title, input.category, input.issuingOrganisation,
    input.certificateNumber, input.issuedDate, input.expiryDate, input.reminderDays, input.notes,
    input.filePath, input.fileName, input.fileType];
  if (existing) {
    await pool.query(`
      UPDATE app.staff_certificates SET title=$3,category=$4,issuing_organisation=$5,certificate_number=$6,
        issued_date=$7::date,expiry_date=$8::date,reminder_days=$9,notes=$10,
        file_path=COALESCE($11,file_path),file_name=COALESCE($12,file_name),file_type=COALESCE($13,file_type),updated_at=now()
      WHERE tenant_id=$1::uuid AND membership_id=$2::uuid AND id=$14::uuid
    `, [...values, existing.id]);
    // Only a change in the expiry date supersedes old warnings.
    if (existing.expiryDate !== input.expiryDate) {
      await pool.query(`
        UPDATE app.notifications SET is_read=true,read_at=COALESCE(read_at,now())
        WHERE tenant_id=$1::uuid AND event_type='staff_certificate_expiry' AND is_read=false
          AND payload_json->>'certificateId'=$2
      `, [tenantId, existing.id]).catch((error) => console.error("Could not clear previous certificate alerts", error));
    }
    if (input.filePath && existing.filePath && existing.filePath !== input.filePath) {
      await getSupabaseServiceRoleClient().storage.from(STAFF_CERTIFICATE_BUCKET).remove([existing.filePath]).catch(() => undefined);
    }
  } else {
    await pool.query(`
      INSERT INTO app.staff_certificates
        (tenant_id,membership_id,title,category,issuing_organisation,certificate_number,issued_date,expiry_date,reminder_days,notes,file_path,file_name,file_type)
      VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7::date,$8::date,$9,$10,$11,$12,$13)
    `, values);
  }
}

export async function deleteStaffCertificate(tenantId: string, membershipId: string, certificateId: string): Promise<boolean> {
  const existing = await getStaffCertificate(tenantId, certificateId);
  if (!existing || existing.membershipId !== membershipId) return false;
  const result = await pool.query(`
    DELETE FROM app.staff_certificates WHERE tenant_id=$1::uuid AND membership_id=$2::uuid AND id=$3::uuid
  `, [tenantId, membershipId, certificateId]);
  if (!result.rowCount) return false;
  await pool.query(`
    DELETE FROM app.notifications WHERE tenant_id=$1::uuid AND event_type='staff_certificate_expiry'
      AND payload_json->>'certificateId'=$2
  `, [tenantId, certificateId]).catch((error) => console.error("Could not clear deleted certificate alerts", error));
  if (existing.filePath) {
    await getSupabaseServiceRoleClient().storage.from(STAFF_CERTIFICATE_BUCKET).remove([existing.filePath]).catch(() => undefined);
  }
  return true;
}

// Enqueue once per certificate and expiry stage. Idempotent across Vercel instances.
// Only called when a manager accesses Alerts, not on every page render.
export async function generateStaffCertificateAlerts(tenantId: string): Promise<void> {
  await pool.query(`
    WITH eligible AS (
      SELECT c.tenant_id,c.id AS certificate_id,c.expiry_date,
        CASE WHEN c.expiry_date < (now() AT TIME ZONE 'Australia/Sydney')::date THEN 'expired' ELSE 'due' END AS stage,
        up.full_name AS staff_name,c.title,c.reminder_days
      FROM app.staff_certificates c
      INNER JOIN app.memberships m ON m.id=c.membership_id AND m.tenant_id=c.tenant_id
      INNER JOIN app.user_profiles up ON up.id=m.user_profile_id
      WHERE c.tenant_id=$1::uuid AND m.status='active' AND c.expiry_date IS NOT NULL
        AND (c.expiry_date < (now() AT TIME ZONE 'Australia/Sydney')::date
          OR c.expiry_date = (now() AT TIME ZONE 'Australia/Sydney')::date
          OR (c.reminder_days > 0 AND c.expiry_date <= (now() AT TIME ZONE 'Australia/Sydney')::date + c.reminder_days))
    ), inserted AS (
      INSERT INTO app.staff_certificate_alert_events (tenant_id,certificate_id,expiry_date,stage)
      SELECT tenant_id,certificate_id,expiry_date,stage FROM eligible WHERE true
      ON CONFLICT DO NOTHING
      RETURNING tenant_id,certificate_id,expiry_date,stage
    )
    INSERT INTO app.notifications (tenant_id,event_type,title,message,href,payload_json)
    SELECT i.tenant_id,'staff_certificate_expiry',
      CASE WHEN i.stage='expired' THEN 'Expired staff certificate' ELSE 'Staff certificate expiring' END,
      e.staff_name || ': ' || e.title || ' — ' || to_char(i.expiry_date, 'DD Mon YYYY'),
      '/users/' || (SELECT m.id::text FROM app.staff_certificates c JOIN app.memberships m ON m.id=c.membership_id WHERE c.id=i.certificate_id) || '/certificates',
      jsonb_build_object('certificateId',i.certificate_id::text,'stage',i.stage)
    FROM inserted i JOIN eligible e ON e.certificate_id=i.certificate_id AND e.stage=i.stage
  `, [tenantId]);
}
