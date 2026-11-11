CREATE UNIQUE INDEX users_email_active_unique ON public.users (email) WHERE deleted_at IS NULL;
