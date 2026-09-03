import { redirect } from "@sveltejs/kit";

/**
 * Keep old bookmarks working while making Staff > Roles the single tenant
 * role-management entry point.
 */
export function load() {
    throw redirect(307, "/staff/roles");
}
