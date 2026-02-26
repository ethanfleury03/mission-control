-- Audit log immutability: reject UPDATE and DELETE
CREATE OR REPLACE FUNCTION registry_audit_log_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'registry_audit_log is append-only: UPDATE and DELETE are not allowed';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS registry_audit_log_no_update ON registry_audit_log;
CREATE TRIGGER registry_audit_log_no_update
  BEFORE UPDATE ON registry_audit_log
  FOR EACH ROW EXECUTE PROCEDURE registry_audit_log_immutable();

DROP TRIGGER IF EXISTS registry_audit_log_no_delete ON registry_audit_log;
CREATE TRIGGER registry_audit_log_no_delete
  BEFORE DELETE ON registry_audit_log
  FOR EACH ROW EXECUTE PROCEDURE registry_audit_log_immutable();
