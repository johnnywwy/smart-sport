CREATE UNIQUE INDEX identities_active_unique ON public.identities (user_id, org_id, type) WHERE deleted_at IS NULL;
