-- Apply tenant RLS only to the finance/payroll tables added after the
-- original RLS migrations. Store/branch authorization remains an application
-- layer rule; RLS is the tenant-isolation backstop.
DO $$
DECLARE
    tbl text;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'expenses',
        'employee_compensation',
        'payroll_periods',
        'payroll_items',
        'payroll_payments',
        'payroll_tax_profiles'
    ]
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_tenant_isolation', tbl);
        EXECUTE format(
            'CREATE POLICY %I ON %I '
            'USING ( tenant_id IS NULL OR tenant_id::text = current_setting(''app.current_tenant_id'', true) OR current_setting(''app.bypass_rls'', true) = ''true'' ) '
            'WITH CHECK ( tenant_id IS NULL OR tenant_id::text = current_setting(''app.current_tenant_id'', true) OR current_setting(''app.bypass_rls'', true) = ''true'' )',
            tbl || '_tenant_isolation', tbl
        );
    END LOOP;
END;
$$;
