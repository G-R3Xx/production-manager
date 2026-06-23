# Production chain print-ready checkoff workflow

This batch adds the first production workflow after artwork approval.

## Flow

- Quote accepted creates artwork approval.
- Artwork approval creates proof pages from signage/small-format quote lines.
- When artwork is approved by the client or directly by staff, a Production job is automatically created.
- Production jobs can also be created manually from any approved artwork approval pack that has not yet created one.

## Production job

A production job stores:

- client/project/quote reference
- approved artwork approval reference
- due date, priority, assigned staff and internal notes
- status: ready to start, waiting on files, waiting on material, in production, ready for install/pickup/delivery, completed, deleted

## Production items

Each approved artwork approval page becomes a production item. The item keeps the approved proof separate from the print-ready production file.

Each item supports:

- approved proof preview/link
- print-ready file upload/link
- notes/version/RIP notes
- generated item procedure

## Procedure checkoff

Checklist steps are auto-generated from artwork page/quote-line details.

Examples:

- signage: artwork checked, print-ready file attached, material allocated, print, laminate, mount/apply, cut/route/finish, QC, pack, ready out
- small format: artwork checked, print-ready file attached, stock allocated, print, cello/laminate, fold/score, bind/staple, trim, QC, pack

Staff can check off steps, reopen steps, and add manual item-specific steps.

## SQL

Run `infra/sql/024_production_chain_print_ready_checkoff.sql` once in Supabase.
