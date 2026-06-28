-- Backfill VAT on existing orders whose tenant has tax enabled but vat_amount = 0.
-- Mirrors the new syncOrderTotals logic (exclusive vs inclusive).
WITH financial AS (
  SELECT
    o.id AS order_id,
    o.subtotal,
    o.discount_amount,
    o.delivery_amount,
    o.amount_paid,
    COALESCE(
      (SELECT (bs.setting_value)::numeric FROM branch_settings bs
        WHERE bs.branch_id = o.branch_id AND bs.category = 'financial' AND bs.setting_key = 'tax_rate'),
      (SELECT (ts.setting_value)::numeric FROM tenant_settings ts
        WHERE ts.tenant_id = o.tenant_id AND ts.category = 'financial' AND ts.setting_key = 'tax_rate'),
      0
    ) AS tax_rate,
    COALESCE(
      (SELECT (bs.setting_value)::boolean FROM branch_settings bs
        WHERE bs.branch_id = o.branch_id AND bs.category = 'financial' AND bs.setting_key = 'tax_enabled'),
      (SELECT (ts.setting_value)::boolean FROM tenant_settings ts
        WHERE ts.tenant_id = o.tenant_id AND ts.category = 'financial' AND ts.setting_key = 'tax_enabled'),
      true
    ) AS tax_enabled,
    COALESCE(
      (SELECT (bs.setting_value)::boolean FROM branch_settings bs
        WHERE bs.branch_id = o.branch_id AND bs.category = 'financial' AND bs.setting_key = 'tax_inclusive'),
      (SELECT (ts.setting_value)::boolean FROM tenant_settings ts
        WHERE ts.tenant_id = o.tenant_id AND ts.category = 'financial' AND ts.setting_key = 'tax_inclusive'),
      false
    ) AS tax_inclusive
  FROM orders o
  WHERE o.vat_amount = 0
    AND o.subtotal > 0
    AND COALESCE((o.metadata->>'vat_override')::boolean, false) = false
),
calc AS (
  SELECT
    f.order_id,
    (f.subtotal - f.discount_amount + f.delivery_amount) AS taxable,
    f.tax_rate, f.tax_enabled, f.tax_inclusive, f.amount_paid
  FROM financial f
  WHERE f.tax_enabled = true AND f.tax_rate > 0
),
vat AS (
  SELECT
    c.order_id,
    CASE WHEN c.tax_inclusive
      THEN ROUND(c.taxable - (c.taxable / (1 + c.tax_rate / 100.0)), 2)
      ELSE ROUND(c.taxable * (c.tax_rate / 100.0), 2)
    END AS vat_amount,
    CASE WHEN c.tax_inclusive
      THEN ROUND(c.taxable, 2)
      ELSE ROUND(c.taxable + (c.taxable * (c.tax_rate / 100.0)), 2)
    END AS total_amount,
    c.amount_paid
  FROM calc c
)
UPDATE orders o
SET
  vat_amount = v.vat_amount,
  total_amount = v.total_amount,
  amount_due = ROUND(v.total_amount - v.amount_paid, 2),
  updated_at = now()
FROM vat v
WHERE o.id = v.order_id;