INSERT INTO public.refresh_tokens (token_hash, session_id, token_version, created_at)
SELECT s.refresh_token_hash, s.id, u.token_version, s.created_at
FROM public.user_sessions s JOIN public.users u ON u.id = s.user_id
WHERE s.revoked_at IS NULL AND s.deleted_at IS NULL AND s.expires_at > now();
