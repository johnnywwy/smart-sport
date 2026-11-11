CREATE INDEX password_history_user_index
ON public.password_history(user_id, created_at DESC);
