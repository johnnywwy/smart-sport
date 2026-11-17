DO $$ BEGIN
  CREATE TABLE public.academic_years (
    id uuid PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    deleted_at timestamptz,
    version integer NOT NULL DEFAULT 0 CONSTRAINT academic_years_version_check CHECK(version>=0),
    name varchar(32) NOT NULL,
    start_date timestamptz NOT NULL,
    end_date timestamptz NOT NULL,
    is_current boolean NOT NULL DEFAULT false,
    status varchar(8) NOT NULL DEFAULT 'draft',
    CONSTRAINT academic_years_dates_check CHECK(start_date<=end_date),
    CONSTRAINT academic_years_status_check CHECK(
      status IN ('draft','current','closed') AND is_current=(status='current'))
  );
  CREATE UNIQUE INDEX academic_years_start_active_unique
    ON public.academic_years(start_date) WHERE deleted_at IS NULL;
  CREATE UNIQUE INDEX academic_years_current_active_unique
    ON public.academic_years(is_current) WHERE is_current AND deleted_at IS NULL;
  CREATE TABLE public.semesters (
    id uuid PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    deleted_at timestamptz,
    version integer NOT NULL DEFAULT 0 CONSTRAINT semesters_version_check CHECK(version>=0),
    academic_year_id uuid NOT NULL REFERENCES public.academic_years(id),
    term smallint NOT NULL CONSTRAINT semesters_term_check CHECK(term IN (1,2)),
    name varchar(32) NOT NULL,
    start_date timestamptz NOT NULL,
    end_date timestamptz NOT NULL,
    is_current boolean NOT NULL DEFAULT false,
    CONSTRAINT semesters_dates_check CHECK(start_date<=end_date)
  );
  CREATE UNIQUE INDEX semesters_year_term_active_unique
    ON public.semesters(academic_year_id,term) WHERE deleted_at IS NULL;
  CREATE UNIQUE INDEX semesters_current_active_unique
    ON public.semesters(is_current) WHERE is_current AND deleted_at IS NULL;
END $$;
