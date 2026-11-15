CREATE TRIGGER identity_context_regions
AFTER INSERT OR UPDATE OR DELETE ON public.regions
FOR EACH STATEMENT EXECUTE FUNCTION public.bump_identity_context_revision();
