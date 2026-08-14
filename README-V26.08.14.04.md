# Production Manager V26.08.14.04

## Gmail SMTP for Production Manager outbound email

- Replaces the Resend-only Purchase Order sender with Gmail SMTP over TLS using the same Google Workspace pattern proven in Install Scheduler.
- Vercel settings are now `GMAIL_USER` and `GMAIL_APP_PASSWORD`.
- Recommended sender: `admin@tenderedge.com.au` with the dedicated Production Manager app password.
- Purchase Order emails display as `Tender Edge Purchasing <admin@tenderedge.com.au>` when `GMAIL_USER=admin@tenderedge.com.au`.
- PDF attachment, send history, archived sent PDF, independent MYOB sync, retry/resend and supplier PO-email fallback remain unchanged.
- Optional `PURCHASE_ORDER_REPLY_TO` is still supported; when omitted replies go to `GMAIL_USER`.
- No new npm dependency is required: the shared server email service uses Node TLS directly against `smtp.gmail.com:465`.

## Deployment

Add to Vercel Production environment and redeploy:

```text
GMAIL_USER=admin@tenderedge.com.au
GMAIL_APP_PASSWORD=<Production Manager Google App Password>
```

`RESEND_API_KEY` and `PURCHASE_ORDER_FROM_EMAIL` are no longer used by Production Manager.
