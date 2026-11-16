DO $$ BEGIN
  CREATE FUNCTION public.valid_school_stages(stages smallint[], years jsonb)
  RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $fn$
  DECLARE stage smallint; year integer;
  BEGIN
    IF stages IS NULL OR years IS NULL OR jsonb_typeof(years) <> 'object'
    THEN RETURN false; END IF;
    IF cardinality(stages) NOT BETWEEN 1 AND 4 OR array_ndims(stages) <> 1
       OR array_lower(stages,1) <> 1
       OR cardinality(stages) <> (SELECT count(DISTINCT s) FROM unnest(stages) s)
       OR cardinality(stages) <> (SELECT count(*) FROM jsonb_object_keys(years))
    THEN RETURN false; END IF;
    FOREACH stage IN ARRAY stages LOOP
      IF stage NOT IN (1,2,3,4) OR stage IS NULL
         OR NOT (years ? stage::text)
         OR jsonb_typeof(years->stage::text) <> 'number'
      THEN RETURN false; END IF;
      IF (years->>stage::text) !~ '^[0-9]+$' THEN RETURN false; END IF;
      year := (years->>stage::text)::integer;
      IF NOT ((stage=1 AND year IN (5,6)) OR (stage=2 AND year IN (3,4))
          OR (stage=3 AND year=3) OR (stage=4 AND year IN (3,4,5)))
      THEN RETURN false; END IF;
    END LOOP;
    RETURN true;
  EXCEPTION WHEN numeric_value_out_of_range THEN RETURN false;
  END $fn$;
  CREATE TABLE public.school_profiles (
    school_id uuid PRIMARY KEY REFERENCES public.orgs(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    deleted_at timestamptz,
    version integer NOT NULL DEFAULT 0 CONSTRAINT school_profiles_version_check CHECK(version>=0),
    school_code varchar(10) NOT NULL CONSTRAINT school_profiles_code_check CHECK(school_code ~ '^[0-9]{10}$'),
    stages smallint[] NOT NULL,
    stage_years jsonb NOT NULL,
    nature varchar(2) NOT NULL CONSTRAINT school_profiles_nature_check CHECK(nature IN ('公办','民办')),
    address varchar(500),
    contact_name varchar(64),
    contact_phone text,
    contact_phone_hash varchar(64),
    CONSTRAINT school_profiles_stages_check CHECK(public.valid_school_stages(stages,stage_years)),
    CONSTRAINT school_profiles_phone_pair_check CHECK((contact_phone IS NULL)=(contact_phone_hash IS NULL)),
    CONSTRAINT school_profiles_phone_hash_check CHECK(contact_phone_hash ~ '^[0-9a-f]{64}$')
  );
  CREATE UNIQUE INDEX school_profiles_code_active_unique
    ON public.school_profiles(school_code) WHERE deleted_at IS NULL;
  CREATE TRIGGER identity_context_school_profiles
    AFTER INSERT OR UPDATE OR DELETE ON public.school_profiles
    FOR EACH STATEMENT EXECUTE FUNCTION public.bump_identity_context_revision();
END $$;
