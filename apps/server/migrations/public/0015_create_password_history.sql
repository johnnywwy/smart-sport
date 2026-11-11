CREATE TABLE public.password_history (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id),
  password_hash varchar(255) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
