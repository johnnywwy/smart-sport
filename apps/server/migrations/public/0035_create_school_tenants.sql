DO $migration$ BEGIN
CREATE TABLE public.school_tenants (
  school_id uuid PRIMARY KEY REFERENCES public.orgs(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 0,
  schema_name varchar(39) NOT NULL CONSTRAINT school_tenants_schema_name_unique UNIQUE,
  datasource text NOT NULL DEFAULT 'default',
  schema_version integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'provisioning',
  last_error text,
  CONSTRAINT school_tenants_schema_check CHECK (
    schema_name ~ '^school_[0-9a-f]{32}$'
    AND schema_name = 'school_' || replace(school_id::text, '-', '')
  ),
  CONSTRAINT school_tenants_datasource_check CHECK (datasource ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT school_tenants_values_check CHECK (
    schema_version >= 0 AND version >= 0
    AND status IN ('provisioning','active','failed','suspended','archived','destroyed')
  )
);
CREATE TABLE public.tenant_registry_revision (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0)
);
INSERT INTO public.tenant_registry_revision(singleton) VALUES(true);
CREATE FUNCTION public.bump_tenant_registry_revision() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
  UPDATE public.tenant_registry_revision SET version=version+1 WHERE singleton=true;
  RETURN NULL;
END $function$;
CREATE TRIGGER school_tenants_revision
  AFTER INSERT OR UPDATE OR DELETE ON public.school_tenants
  FOR EACH STATEMENT EXECUTE FUNCTION public.bump_tenant_registry_revision();
CREATE TRIGGER orgs_tenant_revision
  AFTER UPDATE OF type,status,deleted_at OR DELETE ON public.orgs
  FOR EACH STATEMENT EXECUTE FUNCTION public.bump_tenant_registry_revision();
END $migration$;
