DO $$ BEGIN
  CREATE TABLE public.identity_scopes (
    identity_id uuid NOT NULL REFERENCES public.identities(id),
    scope_type varchar(16) NOT NULL,
    scope_value text NOT NULL,
    PRIMARY KEY(identity_id, scope_type, scope_value),
    CONSTRAINT identity_scopes_value_check CHECK (
      (scope_type IN ('school','college') AND scope_value ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
      OR (scope_type = 'region' AND scope_value ~ '^[0-9]{6}$')
      OR (scope_type = 'grade' AND scope_value ~ '^(1[1-6]|2[1-4]|3[1-3]|4[1-5])$')
    )
  );
  -- 范围修改与身份缓存共用数据库版本屏障，防止并发读回填旧快照。
  CREATE TRIGGER identity_context_identity_scopes
    AFTER INSERT OR UPDATE OR DELETE ON public.identity_scopes
    FOR EACH STATEMENT EXECUTE FUNCTION public.bump_identity_context_revision();
END $$;
