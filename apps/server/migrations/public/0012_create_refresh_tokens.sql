CREATE TABLE public.refresh_tokens (
  token_hash varchar(64) PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  session_id uuid NOT NULL REFERENCES public.user_sessions(id),
  token_version integer NOT NULL CHECK (token_version >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz
);
