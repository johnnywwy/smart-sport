DO $migration$ BEGIN
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 0,
  no text NOT NULL,
  type text NOT NULL,
  identity_id uuid NOT NULL,
  org_id uuid NOT NULL,
  school_id uuid,
  status text NOT NULL DEFAULT 'queued',
  progress integer NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}',
  result_file_id uuid,
  error text,
  cancel_requested_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  CONSTRAINT tasks_values CHECK (
    type IN ('import','export','provision','rollover','tenant_export')
    AND status IN ('queued','running','succeeded','partial','failed','cancelled')
    AND progress BETWEEN 0 AND 100 AND version >= 0 AND jsonb_typeof(summary)='object'
  ),
  CONSTRAINT tasks_lifecycle CHECK (
    (status IN ('queued','running'))=(finished_at IS NULL)
    AND (status NOT IN ('succeeded','partial') OR progress=100)
    AND (status<>'queued' OR (progress=0 AND started_at IS NULL AND cancel_requested_at IS NULL))
    AND (status NOT IN ('running','succeeded','partial','failed') OR started_at IS NOT NULL)
    AND (status NOT IN ('queued','running') OR progress<100)
    AND (status<>'cancelled' OR cancel_requested_at IS NOT NULL)
  )
);
CREATE UNIQUE INDEX tasks_no_active_unique ON public.tasks(no) WHERE deleted_at IS NULL;
CREATE INDEX tasks_owner_active_idx ON public.tasks(identity_id,created_at,id) WHERE deleted_at IS NULL;
CREATE INDEX tasks_owner_status_active_idx ON public.tasks(identity_id,status) WHERE deleted_at IS NULL;
END $migration$;
