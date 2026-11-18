DO $migration$ BEGIN
CREATE TABLE public.school_subscriptions (
 id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by uuid, updated_by uuid, deleted_at timestamptz, version integer NOT NULL DEFAULT 0,
 school_id uuid NOT NULL REFERENCES public.orgs(id), no text NOT NULL, contract_no text,
 service_start timestamptz NOT NULL, service_end timestamptz NOT NULL, grace_days integer NOT NULL DEFAULT 30, status text NOT NULL, sales_identity_id uuid REFERENCES public.identities(id),
 CONSTRAINT school_subscriptions_values CHECK(version>=0 AND grace_days BETWEEN 0 AND 365 AND service_start<=service_end AND status IN ('trial','active','grace','suspended') AND (contract_no IS NULL OR length(btrim(contract_no)) BETWEEN 1 AND 128))
);
CREATE UNIQUE INDEX school_subscriptions_school_active_unique ON public.school_subscriptions(school_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX school_subscriptions_no_active_unique ON public.school_subscriptions(no) WHERE deleted_at IS NULL;
CREATE TABLE public.school_apps (
 id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by uuid, updated_by uuid, deleted_at timestamptz, version integer NOT NULL DEFAULT 0,
 school_id uuid NOT NULL REFERENCES public.orgs(id), app_code text NOT NULL REFERENCES public.apps(code), start_date timestamptz NOT NULL, end_date timestamptz NOT NULL, source text NOT NULL,
 CONSTRAINT school_apps_values CHECK(version>=0 AND start_date<=end_date AND source IN ('contract','trial','gift'))
);
CREATE UNIQUE INDEX school_apps_active_unique ON public.school_apps(school_id,app_code) WHERE deleted_at IS NULL;
CREATE TABLE public.school_subscription_logs (
 id uuid PRIMARY KEY, school_id uuid NOT NULL REFERENCES public.orgs(id), subscription_id uuid NOT NULL REFERENCES public.school_subscriptions(id), action text NOT NULL CHECK(action IN ('initialize','status_changed')),
 previous_status text CHECK(previous_status IN ('trial','active','grace','suspended')), status text NOT NULL CHECK(status IN ('trial','active','grace','suspended')),
 service_start timestamptz NOT NULL, service_end timestamptz NOT NULL, grace_days integer NOT NULL CHECK(grace_days BETWEEN 0 AND 365), apps jsonb NOT NULL CHECK(jsonb_typeof(apps)='array'), created_at timestamptz NOT NULL DEFAULT now(), created_by uuid
);
CREATE INDEX school_subscription_logs_school_idx ON public.school_subscription_logs(school_id,created_at,id);
CREATE TRIGGER identity_context_school_subscriptions AFTER INSERT OR UPDATE OR DELETE ON public.school_subscriptions FOR EACH STATEMENT EXECUTE FUNCTION public.bump_identity_context_revision();
CREATE TRIGGER identity_context_school_apps AFTER INSERT OR UPDATE OR DELETE ON public.school_apps FOR EACH STATEMENT EXECUTE FUNCTION public.bump_identity_context_revision();
END $migration$;
