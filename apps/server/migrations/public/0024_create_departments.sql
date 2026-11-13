DO $$ BEGIN
  CREATE TABLE public.departments (
    id uuid PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs(id),
    parent_id uuid,
    path text NOT NULL,
    name varchar(64) NOT NULL CHECK (length(trim(name)) > 0),
    code varchar(128) NOT NULL,
    sort integer NOT NULL DEFAULT 0 CHECK(sort >= 0),
    is_preset boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid, updated_by uuid, deleted_at timestamptz,
    version integer NOT NULL DEFAULT 0 CHECK(version >= 0),
    CONSTRAINT departments_org_id_unique UNIQUE(org_id,id),
    CONSTRAINT departments_parent_org_fk FOREIGN KEY(org_id,parent_id) REFERENCES public.departments(org_id,id),
    CONSTRAINT departments_not_self CHECK (parent_id IS DISTINCT FROM id)
  );
  CREATE UNIQUE INDEX departments_sibling_name_unique ON public.departments(org_id,coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) WHERE deleted_at IS NULL;
  CREATE UNIQUE INDEX departments_code_unique ON public.departments(org_id,code) WHERE deleted_at IS NULL;
  CREATE INDEX departments_org_path ON public.departments(org_id,path text_pattern_ops) WHERE deleted_at IS NULL;
  CREATE TABLE public.department_scopes (
    department_id uuid NOT NULL REFERENCES public.departments(id),
    scope_type varchar(16) NOT NULL CHECK(scope_type IN ('school','region','grade','college')),
    scope_value text NOT NULL,
    PRIMARY KEY(department_id,scope_type,scope_value)
  );
  ALTER TABLE public.identities ADD CONSTRAINT identities_department_org_fk FOREIGN KEY(org_id,department_id) REFERENCES public.departments(org_id,id);
  CREATE INDEX identities_department_active ON public.identities(department_id) WHERE deleted_at IS NULL;
  -- 成员分配与部门删除共用行锁，避免检查后恰好被分配新成员。
  CREATE FUNCTION public.check_active_identity_department() RETURNS trigger LANGUAGE plpgsql AS $fn$
  BEGIN
    IF NEW.department_id IS NOT NULL AND NEW.deleted_at IS NULL THEN
      PERFORM id FROM public.departments WHERE id=NEW.department_id AND org_id=NEW.org_id AND deleted_at IS NULL FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'department does not exist in organization' USING ERRCODE='23503'; END IF;
    END IF;
    RETURN NEW;
  END $fn$;
  CREATE TRIGGER identity_department_active BEFORE INSERT OR UPDATE OF department_id,org_id,deleted_at ON public.identities FOR EACH ROW EXECUTE FUNCTION public.check_active_identity_department();
  CREATE TRIGGER identity_context_departments AFTER INSERT OR UPDATE OR DELETE ON public.departments FOR EACH STATEMENT EXECUTE FUNCTION public.bump_identity_context_revision();
  CREATE TRIGGER identity_context_department_scopes AFTER INSERT OR UPDATE OR DELETE ON public.department_scopes FOR EACH STATEMENT EXECUTE FUNCTION public.bump_identity_context_revision();
END $$;
