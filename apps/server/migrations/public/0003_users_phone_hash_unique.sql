CREATE UNIQUE INDEX users_phone_hash_active_unique ON public.users (phone_hash) WHERE deleted_at IS NULL;
