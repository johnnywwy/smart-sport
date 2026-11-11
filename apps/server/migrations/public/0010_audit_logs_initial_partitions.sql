DO $migration$
DECLARE
  month_start timestamptz;
  month_end timestamptz;
  partition_name text;
BEGIN
  FOR offset_month IN 0..1 LOOP
    month_start := (date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai') + make_interval(months => offset_month)) AT TIME ZONE 'Asia/Shanghai';
    month_end := (date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai') + make_interval(months => offset_month + 1)) AT TIME ZONE 'Asia/Shanghai';
    partition_name := 'audit_logs_' || to_char(month_start AT TIME ZONE 'Asia/Shanghai', 'YYYY_MM');
    EXECUTE format('CREATE TABLE public.%I PARTITION OF public.audit_logs FOR VALUES FROM (%L) TO (%L)', partition_name, month_start, month_end);
  END LOOP;
END
$migration$;
