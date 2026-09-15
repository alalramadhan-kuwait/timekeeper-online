/**
 * What each role is CALLED, as distinct from what it is stored as.
 *
 * The stored values ('admin', 'staff', …) are written into the database
 * security rules and into role checks across both apps, so they stay exactly
 * as they are. What people read is a separate matter, and it was leaking the
 * stored word straight onto the screen: an owner was labelled "Admin", a
 * salesperson "Sales", and the shared shop login sat in the team list called
 * "Staff" as though it were a person.
 *
 * One map, used everywhere a role is shown.
 */
export const ROLE_LABEL: Record<string, string> = {
  admin: 'Owner',
  manager: 'Manager',
  sales: 'Salesperson',
  operations: 'Operations',
  marketing: 'Marketing',
  staff: 'Shared shop login',
  hr: 'HR',
  viewer: 'Read-only',
};

/** The display name for a stored role, falling back to the value itself so a
 *  role added later shows up as itself rather than blank. */
export const roleLabel = (role: string | null | undefined): string =>
  (role && ROLE_LABEL[role]) || role || '—';

/**
 * A manager's title says what they run.
 *
 * 'manager' is one role doing two jobs — head office and the shops — and
 * "Manager" alone is now ambiguous in exactly the place it matters, next to
 * an approval. Where the workplaces someone covers are known, they name them.
 */
export function managerLabel(locations: string[] | null | undefined): string {
  const l = (locations ?? []).filter(Boolean);
  if (!l.length) return 'Manager';
  const shops = l.filter((x) => x !== 'Timekeeper HQ');
  const hq = l.includes('Timekeeper HQ');
  if (hq && !shops.length) return 'Head Office Manager';
  if (shops.length && !hq) return shops.length > 1 ? 'Shops Manager' : `${shops[0]} Manager`;
  return 'Manager';
}

/** What the role grants, for the team list. Kept beside the names so the two
 *  cannot drift apart. */
export const ROLE_HINT: Record<string, string> = {
  admin: 'Everything, including settings and accounts',
  manager: 'Everything except settings and accounts',
  sales: 'CRM, follow-ups, VIP, demand list',
  operations: 'Supplier payments, consignments, limited projects, stock, repairs',
  marketing: 'Instagram performance, content planner',
  staff: 'Sales + purchasing view (legacy)',
  hr: 'Employees, leave, company documents',
  viewer: 'Read-only',
};
