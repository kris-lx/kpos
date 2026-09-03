-- Attendance is visible to every authenticated user so a missing grant is
-- understandable and fixable from the role UI. Visibility grants no action:
-- clock/view/manage APIs and CRUD buttons remain permission-protected.
UPDATE "menu_permissions"
SET "required_permission" = NULL, "updated_at" = now()
WHERE "key" = 'management.attendance';
