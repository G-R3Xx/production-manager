ALTER TABLE app.enquiries
  ADD COLUMN IF NOT EXISTS client_purchase_order_number varchar(120);
