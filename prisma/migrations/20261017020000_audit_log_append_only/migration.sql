-- AuditLog bersifat append-only. UPDATE dan DELETE ditolak di level database,
-- sehingga bug aplikasi atau query manual tidak bisa mengubah jejak audit secara diam-diam.
-- Untuk pembersihan yang disengaja (mis. retensi), DBA harus menonaktifkan trigger secara eksplisit.
CREATE OR REPLACE FUNCTION audit_log_reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only (% rejected)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_reject_mutation();

CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON "AuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_reject_mutation();
