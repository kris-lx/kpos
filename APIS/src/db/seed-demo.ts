// KPOS - Demo seed entry point
//
// Demo and production must start from the same minimal platform catalog.
// The old demo seed created tenants, staff, products, and many built-in roles,
// which made a clean deployment disagree with the Super Admin workflow.
// Keep this command as a compatibility alias for existing deploy scripts.
import './seed-prod';
