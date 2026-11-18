DO $migration$
BEGIN
  CREATE TABLE public.outbox_events (
    id uuid PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    deleted_at timestamptz,
    version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
    topic text NOT NULL CHECK (topic IN ('school.student.created','school.student.status_changed','subscription.changed','scope.changed')),
    school_id uuid,
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','failed')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 11),
    next_retry_at timestamptz DEFAULT now(),
    published_at timestamptz,
    last_error text CHECK (last_error IS NULL OR last_error='delivery_failed'),
    CONSTRAINT outbox_events_school_check CHECK (topic NOT LIKE 'school.%' OR school_id IS NOT NULL),
    CONSTRAINT outbox_events_lifecycle_check CHECK (
      (status='published')=(published_at IS NOT NULL)
      AND (status='pending')=(next_retry_at IS NOT NULL)
      AND (status<>'pending' OR attempts<11)
      AND (status<>'failed' OR attempts=11)
    )
  );
  CREATE INDEX outbox_events_due_idx ON public.outbox_events(next_retry_at,id) WHERE deleted_at IS NULL AND status='pending';
  CREATE INDEX outbox_events_failed_idx ON public.outbox_events(id) WHERE deleted_at IS NULL AND status='failed';
  CREATE TABLE public.outbox_consumptions (
    source_datasource text NOT NULL CHECK (source_datasource ~ '^[a-z][a-z0-9_]*$'),
    event_id uuid NOT NULL,
    consumer text NOT NULL CHECK (consumer ~ '^[a-z][a-z0-9._-]*$' AND length(consumer)<=100),
    consumed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(source_datasource,event_id,consumer)
  );
END
$migration$;
