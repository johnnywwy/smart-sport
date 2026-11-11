DO $$ BEGIN
CREATE TABLE public.preset_role_overrides (
  role_id uuid PRIMARY KEY REFERENCES public.roles(id) ON DELETE CASCADE,
  data_scope varchar(32) CHECK (data_scope IN ('personal','dept','dept_and_below','all')),
  remark text,
  grants jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(grants)='array'),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0)
);
CREATE TRIGGER identity_context_preset_role_overrides
AFTER INSERT OR UPDATE OR DELETE ON public.preset_role_overrides
FOR EACH STATEMENT EXECUTE FUNCTION public.bump_identity_context_revision();
END $$;
