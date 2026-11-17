DO $migration$ BEGIN
CREATE TABLE public.sys_params (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 0 CONSTRAINT sys_params_version_check CHECK (version >= 0),
  key varchar(64) NOT NULL,
  name varchar(64) NOT NULL,
  value jsonb NOT NULL,
  value_schema jsonb NOT NULL,
  remark text NOT NULL DEFAULT '',
  CONSTRAINT sys_params_value_check CHECK (
    jsonb_typeof(value) = 'number' AND
    CASE WHEN value::text ~ '^[0-9]+$' THEN
      CASE key
        WHEN 'password.min_length' THEN (value::text)::numeric BETWEEN 8 AND 64
        WHEN 'password.expire_days' THEN (value::text)::numeric BETWEEN 0 AND 365
        WHEN 'login.lock_threshold' THEN (value::text)::numeric BETWEEN 5 AND 100
        WHEN 'subscription.trial_days' THEN (value::text)::numeric BETWEEN 1 AND 365
        WHEN 'subscription.grace_days' THEN (value::text)::numeric BETWEEN 0 AND 365
        WHEN 'recycle.retention_days' THEN (value::text)::numeric BETWEEN 1 AND 365
        WHEN 'import.undo_hours' THEN (value::text)::numeric BETWEEN 1 AND 168
        WHEN 'rollover.undo_days' THEN (value::text)::numeric BETWEEN 1 AND 30
        ELSE false END
    ELSE false END
  )
);
CREATE UNIQUE INDEX sys_params_key_active_unique ON public.sys_params(key) WHERE deleted_at IS NULL;

END $migration$;
