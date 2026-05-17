-- TradeEdge initial schema
-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/ymjxpkkmohbhdtvuktzn/sql

-- ── User profiles ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id         UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email      TEXT,
  full_name  TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Delta Exchange API credentials (one row per user) ─────────────────────────
-- NOTE: stored as plaintext protected by RLS. A future version may encrypt them.
CREATE TABLE IF NOT EXISTS user_credentials (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID        REFERENCES auth.users ON DELETE CASCADE NOT NULL UNIQUE,
  api_key    TEXT        NOT NULL,
  api_secret TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Trade journal notes ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trade_notes (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID        REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  fill_id    TEXT        NOT NULL,
  note       TEXT,
  emotion    TEXT,
  setup      TEXT,
  tags       TEXT[]      DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, fill_id)
);

-- ── Enable Row-Level Security ─────────────────────────────────────────────────
ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_notes      ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Users view own profile"   ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Credentials — users manage their own; service role key bypasses RLS
CREATE POLICY "Users view own creds"   ON user_credentials FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own creds" ON user_credentials FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own creds" ON user_credentials FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own creds" ON user_credentials FOR DELETE USING (auth.uid() = user_id);

-- Trade notes
CREATE POLICY "Users manage own notes" ON trade_notes
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Auto-create profile on sign-up ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── updated_at helper ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER set_user_credentials_updated_at
  BEFORE UPDATE ON user_credentials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_trade_notes_updated_at
  BEFORE UPDATE ON trade_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
