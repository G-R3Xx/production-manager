# Workspace company logo for client correspondence

Adds a workspace-level company logo setting in Settings > Company settings.

## Included

- Workspace logo upload/change control on the Settings page.
- Optional logo URL field, with current logo preview.
- Supabase Storage upload to the `company-assets` bucket under tenant-scoped `branding/` paths.
- `app.tenant_settings.company_logo_url` and `company_logo_storage_path` columns.
- Public quote pages now use the workspace logo instead of the Production Manager app logo.
- Public artwork approval pages now show the workspace logo in the client-facing header.

## Notes

The Production Manager app shell/logo remains unchanged. This setting is specifically for client-facing correspondence branding.
