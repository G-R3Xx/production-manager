/**
 * Compile-only regression test for client contact helpers.
 * Prevents weak-type TS2345 failures when MYOB/customer payloads have no
 * declared `contacts` key yet (contacts live in their extensible JSONB payload).
 * Run: tsc --noEmit --strict --target es2022 --module esnext --moduleResolution bundler scripts/tests/client-contacts-types.ts
 */
import { clientContactsForCustomer, selectedClientContact } from "../../apps/web/src/lib/client-contacts";

type CustomerRecordLike = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  payloadJson: { source?: string; abn?: string; billingAddress?: string };
};

type ClientOptionLike = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  payloadJson: {
    defaultSiteAddress?: unknown;
    billingAddress?: unknown;
    [key: string]: unknown;
  };
};

declare const serverCustomer: CustomerRecordLike;
declare const browserCustomer: ClientOptionLike;

clientContactsForCustomer(serverCustomer);
clientContactsForCustomer(serverCustomer as CustomerRecordLike | null);
selectedClientContact(serverCustomer, "legacy-primary");
clientContactsForCustomer(browserCustomer);
clientContactsForCustomer(browserCustomer as ClientOptionLike | null);
selectedClientContact(browserCustomer, "contact-1");
