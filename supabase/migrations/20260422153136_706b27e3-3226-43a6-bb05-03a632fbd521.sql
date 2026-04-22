
-- Order status enum
CREATE TYPE public.order_status AS ENUM ('Pending', 'Process', 'Paid', 'Expired');

-- Orders table
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  merchant TEXT NOT NULL DEFAULT 'Lovable Crypto Store',
  coin TEXT NOT NULL,
  network TEXT NOT NULL,
  deposit_address TEXT NOT NULL,
  subtotal NUMERIC(18, 6) NOT NULL,
  fee NUMERIC(18, 6) NOT NULL,
  amount_due NUMERIC(18, 6) NOT NULL,
  status public.order_status NOT NULL DEFAULT 'Pending',
  tx_hash TEXT,
  confirmations INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_status ON public.orders(status) WHERE status IN ('Pending', 'Process');
CREATE INDEX idx_orders_amount ON public.orders(amount_due);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_orders_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Anyone can read orders (needed for the public payment page)
CREATE POLICY "Anyone can view orders"
  ON public.orders FOR SELECT
  USING (true);

-- Anyone can create an order (demo: no auth)
CREATE POLICY "Anyone can create orders"
  ON public.orders FOR INSERT
  WITH CHECK (true);

-- No one can update or delete from the client (only edge function via service role)
-- (no UPDATE/DELETE policies = blocked for anon/authenticated)

-- Realtime
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
