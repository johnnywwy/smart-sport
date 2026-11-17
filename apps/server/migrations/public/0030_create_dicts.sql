DO $migration$ BEGIN
CREATE TABLE public.dict_types (
  id uuid PRIMARY KEY,
  code varchar(32) NOT NULL UNIQUE,
  name varchar(64) NOT NULL,
  is_system boolean NOT NULL DEFAULT true CHECK (is_system),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz CHECK (deleted_at IS NULL),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0)
);
CREATE TABLE public.dict_items (
  id uuid PRIMARY KEY,
  type_code varchar(32) NOT NULL REFERENCES public.dict_types(code),
  value varchar(64) NOT NULL,
  label varchar(64) NOT NULL CHECK (length(trim(label)) > 0),
  description varchar(500) NOT NULL DEFAULT '',
  sort integer NOT NULL DEFAULT 0 CHECK (sort BETWEEN 0 AND 999999),
  enabled boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz,
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  CONSTRAINT dict_items_value_unique UNIQUE(type_code,value),
  CONSTRAINT dict_items_system_active CHECK (NOT is_system OR (enabled AND deleted_at IS NULL)),
  CONSTRAINT dict_items_used_active CHECK (used_at IS NULL OR deleted_at IS NULL)
);
CREATE UNIQUE INDEX dict_items_label_active_unique ON public.dict_items(type_code,label) WHERE deleted_at IS NULL;
CREATE INDEX dict_items_type_sort_active ON public.dict_items(type_code,sort,id) WHERE deleted_at IS NULL;
-- 首次使用不可抹除；删除后也不复用旧值，避免历史记录被新选项冒名替换。
CREATE FUNCTION public.protect_dict_item_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.is_system OR OLD.used_at IS NOT NULL THEN
      RAISE EXCEPTION 'protected dictionary item' USING ERRCODE='23514';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.type_code IS DISTINCT FROM OLD.type_code
     OR NEW.value IS DISTINCT FROM OLD.value OR NEW.is_system IS DISTINCT FROM OLD.is_system
     OR (OLD.used_at IS NOT NULL AND NEW.used_at IS DISTINCT FROM OLD.used_at) THEN
    RAISE EXCEPTION 'immutable dictionary identity or usage' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_dict_item_identity BEFORE UPDATE OR DELETE ON public.dict_items
FOR EACH ROW EXECUTE FUNCTION public.protect_dict_item_identity();

END $migration$;
