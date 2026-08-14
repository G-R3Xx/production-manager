# Production Manager V26.08.14.09

## Direct quote email

- Replaces the Quotes `mailto:` link with server-side Gmail SMTP using the same shared outbound-email service already proven by Purchase Orders.
- `Email quote` now sends the customer-facing public quote link directly from Production Manager and automatically marks the quote as sent.
- Stores independent quote email state: not sent, pending, sent or failed, including recipient, timestamp, Gmail message ID and last error.
- Existing sent quotes can be resent without opening Outlook.
- Client-facing per-line Approve / Cancel / Request changes workflow is unchanged.
- Purchase Order email/MYOB workflow and V26.08.14.08 inline quote-line component editor are preserved.
