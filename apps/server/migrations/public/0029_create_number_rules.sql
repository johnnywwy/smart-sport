DO $$ BEGIN
  CREATE TABLE public.number_rules (
    id uuid PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    deleted_at timestamptz,
    version integer NOT NULL DEFAULT 0 CHECK(version>=0),
    type varchar(32) NOT NULL CHECK(type IN
      ('subscription','subscription_request','transfer','task','todo','import')),
    prefix varchar(12) NOT NULL CHECK(prefix ~ '^[A-Z][A-Z0-9]{0,11}$'),
    digits smallint NOT NULL CHECK(digits BETWEEN 1 AND 12),
    reset varchar(8) NOT NULL CHECK(reset IN ('yearly','never')),
    year smallint NOT NULL CHECK(year BETWEEN 1 AND 9999),
    current_value bigint NOT NULL DEFAULT 0 CHECK(current_value BETWEEN 0 AND 999999999999)
  );
  CREATE UNIQUE INDEX number_rules_type_active_unique ON public.number_rules(type)
    WHERE deleted_at IS NULL;
  CREATE UNIQUE INDEX number_rules_prefix_active_unique ON public.number_rules(prefix)
    WHERE deleted_at IS NULL;
  -- 永久保留已提交编号，规则改前缀或恢复预置记录也不能重复分配。
  CREATE TABLE public.number_issues (
    id uuid PRIMARY KEY,
    rule_id uuid NOT NULL REFERENCES public.number_rules(id),
    prefix varchar(12) NOT NULL CHECK(prefix ~ '^[A-Z][A-Z0-9]{0,11}$'),
    year smallint NOT NULL CHECK(year BETWEEN 1 AND 9999),
    value bigint NOT NULL CHECK(value BETWEEN 1 AND 999999999999),
    no varchar(30) NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(prefix,year,value),
    CHECK(no ~ '^[A-Z][A-Z0-9]{0,11}-[0-9]{4}-[0-9]{1,12}$')
  );
END $$;
