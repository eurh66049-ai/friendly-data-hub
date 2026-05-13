
-- Subscriptions table
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('monthly','yearly')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','expired','cancelled')),
  paypal_txn_id TEXT,
  amount_usd NUMERIC(10,2),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_active ON public.subscriptions(user_id, status, expires_at);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own subscriptions"
  ON public.subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own subscriptions"
  ON public.subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Public read of active status (for verified badge display) via security definer fn below

-- Profile customizations table
CREATE TABLE IF NOT EXISTS public.profile_customizations (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  avatar_frame TEXT DEFAULT 'none',
  profile_theme TEXT DEFAULT 'default',
  seasonal_badge TEXT DEFAULT 'none',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_customizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view profile customizations"
  ON public.profile_customizations FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Users can upsert their own customizations"
  ON public.profile_customizations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own customizations"
  ON public.profile_customizations FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Helper function: is user verified (has active subscription)?
CREATE OR REPLACE FUNCTION public.is_user_verified(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = _user_id
      AND status = 'active'
      AND expires_at > now()
  );
$$;

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_subs_updated ON public.subscriptions;
CREATE TRIGGER trg_subs_updated BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_pc_updated ON public.profile_customizations;
CREATE TRIGGER trg_pc_updated BEFORE UPDATE ON public.profile_customizations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
