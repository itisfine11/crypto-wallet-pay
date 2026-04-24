-- Add virtual payment contract tracking metadata to orders.
ALTER TABLE public.orders
ADD COLUMN payment_contract_id TEXT NOT NULL DEFAULT ('pc_' || replace(gen_random_uuid()::text, '-', '')),
ADD COLUMN contract_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
ADD COLUMN paid_at TIMESTAMPTZ;

CREATE UNIQUE INDEX idx_orders_payment_contract_id
  ON public.orders(payment_contract_id);
