DO $migration$ BEGIN
CREATE TABLE public.files (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 0,
  identity_id uuid NOT NULL,
  org_id uuid NOT NULL,
  object_key text NOT NULL,
  filename varchar(255) NOT NULL,
  content_type text NOT NULL,
  size integer NOT NULL,
  sha256 varchar(64) NOT NULL,
  school_id uuid,
  purpose text NOT NULL,
  expires_at timestamptz NOT NULL,
  CONSTRAINT files_upload_values CHECK (
    size BETWEEN 1 AND 20971520 AND purpose = 'import'
    AND sha256 ~ '^[0-9a-f]{64}$' AND expires_at > created_at
  )
);
CREATE UNIQUE INDEX files_object_key_unique ON public.files(object_key);
CREATE INDEX files_owner_active_idx ON public.files(identity_id) WHERE deleted_at IS NULL;
CREATE INDEX files_expiry_idx ON public.files(expires_at);
END $migration$;
