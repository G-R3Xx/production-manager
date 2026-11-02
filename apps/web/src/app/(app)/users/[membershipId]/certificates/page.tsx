import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { canManageStaff } from "@/server/users";
import { listStaffCertificates, staffMemberInTenant } from "@/server/staff-certificates";
import { australianLocalDate, certificateDaysRemaining, certificateExpiryState, STAFF_CERTIFICATE_CATEGORIES } from "@/lib/staff-certificate";
import { CertificateEditor } from "./CertificateEditor";
import { DeleteCertificateForm } from "./DeleteCertificateForm";

type Props = { params: Promise<{ membershipId: string }>; searchParams?: Promise<{ message?: string }> };
const panel = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 18, padding: 22, display: "grid", gap: 16 } as const;

export default async function StaffCertificatesPage({ params, searchParams }: Props) {
  const user = await getRequiredSessionUser();
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) redirect("/bootstrap");
  if (tenant.membershipStatus !== "active" || !canManageStaff(tenant.tenantRole)) redirect("/users?error=Staff%20training%20is%20restricted%20to%20managers");
  const { membershipId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(membershipId)) notFound();
  const staff = await staffMemberInTenant(tenant.tenantId, membershipId);
  if (!staff || (tenant.tenantRole !== "owner" && staff.tenantRole === "owner")) notFound();
  const certificates = await listStaffCertificates(tenant.tenantId, membershipId);
  const today = australianLocalDate();
  const { message } = (await searchParams) ?? {};

  return <div style={{ maxWidth: 1050, margin: "0 auto", display: "grid", gap: 18 }}>
    <section style={panel}>
      <Link href="/users" prefetch={false} style={{ color: "#2563eb", fontWeight: 800, fontSize: 13 }}>← Staff & Roles</Link>
      <div><p style={{ color: "#4f46e5", fontSize: 12, fontWeight: 900, margin: 0, textTransform: "uppercase", letterSpacing: ".06em" }}>Staff / Training & Certificates</p>
        <h1 style={{ fontSize: 30, margin: "8px 0 0" }}>{staff.fullName || staff.email}</h1>
        <p style={{ color: "#64748b", margin: "8px 0 0" }}>Licences, tickets, inductions, training, qualifications and private supporting documents. Alerts appear for managers in the existing Alerts menu.</p></div>
      {message ? <div role="status" style={{ color: "#166534", background: "#f0fdf4", padding: 12, borderRadius: 10 }}>{message}</div> : null}
    </section>

    <section style={panel}><h2 style={{ margin: 0, fontSize: 20 }}>Add training or certificate</h2><CertificateEditor membershipId={membershipId}/></section>
    <section style={{ display: "grid", gap: 12 }}><h2 style={{ margin: "10px 0 0", fontSize: 22 }}>Recorded certificates ({certificates.length})</h2>
      {certificates.length === 0 ? <div style={panel}>No training or certificates recorded for this staff member yet.</div> : certificates.map((cert) => {
        const state = certificateExpiryState(cert.expiryDate, cert.reminderDays, today);
        const remaining = certificateDaysRemaining(cert.expiryDate, today);
        const category = STAFF_CERTIFICATE_CATEGORIES.find((item) => item.value === cert.category)?.label ?? "Other";
        const statusText = state === "expired" ? `Expired ${Math.abs(remaining ?? 0)} days ago` : state === "due" ? `Expires in ${remaining} days` : cert.expiryDate ? `Expires ${cert.expiryDate}` : "No expiry";
        return <article key={cert.id} style={panel}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "grid", gap: 6 }}><strong style={{ fontSize: 18 }}>{cert.title}</strong><span style={{ color: "#64748b", fontSize: 13 }}>{category}{cert.issuingOrganisation ? ` · ${cert.issuingOrganisation}` : ""}{cert.certificateNumber ? ` · ${cert.certificateNumber}` : ""}</span></div>
            <span style={{ borderRadius: 999, border: "1px solid", borderColor: state === "expired" ? "#fecaca" : state === "due" ? "#fed7aa" : "#dbeafe", background: state === "expired" ? "#fef2f2" : state === "due" ? "#fff7ed" : "#eff6ff", color: state === "expired" ? "#b91c1c" : state === "due" ? "#9a3412" : "#1d4ed8", padding: "8px 12px", fontWeight: 800, fontSize: 12 }}>{statusText}</span>
          </div>
          {cert.filePath ? <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            {cert.fileType?.startsWith("image/") ? <a href={`/api/staff-certificates/file/${cert.id}`} target="_blank" rel="noreferrer"><img src={`/api/staff-certificates/file/${cert.id}`} alt={`${cert.title} certificate`} style={{ maxWidth: 150, maxHeight: 120, objectFit: "contain", border: "1px solid #e2e8f0", borderRadius: 8 }}/></a> : null}
            <a href={`/api/staff-certificates/file/${cert.id}`} target="_blank" rel="noreferrer" style={{ color: "#2563eb", fontWeight: 800 }}>View uploaded {cert.fileType === "application/pdf" ? "PDF" : "image"} — {cert.fileName}</a>
          </div> : null}
          <details><summary style={{ color: "#2563eb", fontWeight: 850, cursor: "pointer", padding: "8px 0" }}>Edit details / replace document</summary><div style={{ marginTop: 14 }}><CertificateEditor membershipId={membershipId} existing={cert}/></div></details>
          <DeleteCertificateForm membershipId={membershipId} certificateId={cert.id} title={cert.title} />
        </article>;
      })}
    </section>
  </div>;
}
