-- Sequential order numbers (1, 2, 3, …) replacing the random 'AP' + YYMMDD + hex format.
--
-- WHY A SEQUENCE, NOT MAX()+1
-- Two concurrent place_order calls running MAX(order_number)+1 would read the same
-- max and produce the same number, and the UNIQUE constraint would make one of them
-- fail. nextval() is atomic and never hands the same value to two callers, even in
-- parallel transactions. Sequences can leave gaps when a transaction rolls back —
-- expected and acceptable for order numbers.
--
-- place_order() is NOT modified. It never references order_number; it relies on this
-- column DEFAULT. Changing the default alone is therefore sufficient, and the stock
-- lock (FOR UPDATE), price snapshot, price adjustment and cart clearing are untouched.
--
-- order_number stays TEXT: nothing in the app sorts by it (all order lists sort by
-- created_at), so lexicographic ordering never manifests, and keeping the type avoids
-- churn in types.ts, the invoice, tracking and admin views.

CREATE SEQUENCE IF NOT EXISTS public.order_number_seq
  AS bigint
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1
  NO MAXVALUE
  CACHE 1;

-- Renumber existing (test) orders sequentially in creation order: oldest = 1.
-- Old values all start with 'AP' and new values are digits, so no UNIQUE collision
-- can occur part-way through this UPDATE.
WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS n
  FROM public.orders
)
UPDATE public.orders o
SET order_number = numbered.n::text
FROM numbered
WHERE o.id = numbered.id;

-- stock_movements keeps a denormalized copy of order_number for the admin inventory
-- log. Re-sync it so the audit trail doesn't still show the old 'AP…' value.
UPDATE public.stock_movements sm
SET order_number = o.order_number
FROM public.orders o
WHERE sm.order_id = o.id
  AND sm.order_number IS DISTINCT FROM o.order_number;

-- Continue after the highest existing number.
--   no orders  -> setval(1, false) -> next nextval() = 1
--   N orders   -> setval(N, true)  -> next nextval() = N + 1
SELECT setval(
  'public.order_number_seq',
  GREATEST((SELECT COALESCE(MAX(order_number::bigint), 0) FROM public.orders), 1),
  (SELECT COUNT(*) > 0 FROM public.orders)
);

ALTER TABLE public.orders
  ALTER COLUMN order_number SET DEFAULT nextval('public.order_number_seq')::text;

-- Tie the sequence's lifetime to the column it feeds.
ALTER SEQUENCE public.order_number_seq OWNED BY public.orders.order_number;

-- place_order() is SECURITY DEFINER so it would work regardless, but grant usage
-- explicitly so any direct insert by an authenticated/admin client also succeeds.
GRANT USAGE, SELECT ON SEQUENCE public.order_number_seq TO authenticated, service_role;
