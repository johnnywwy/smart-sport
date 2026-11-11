CREATE UNIQUE INDEX users_username_active_unique ON public.users (username) WHERE deleted_at IS NULL;
