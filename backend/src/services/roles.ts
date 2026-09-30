// What each role can do by default.
//
// The role is a starting point, not a cage: permissions stay per-user, so an owner
// can still grant one manager the books or take rate changes away from another.
// Applying a preset overwrites the lot, which is exactly what "reset to role
// defaults" should mean.
//
// OWNER is deliberately absent — an owner passes every check without consulting
// this table (see makeOwnerPermissions in middleware/auth).

import { Role } from '@prisma/client';

export type PermissionKey =
  | 'canCreateShift'
  | 'canEditNozzleReadings'
  | 'canEditStock'
  | 'canEditTankerReceipts'
  | 'canEditCollections'
  | 'canEditOutstanding'
  | 'canEditExpenses'
  | 'canEditCreditSales'
  | 'canSubmitShift'
  | 'canLockShift'
  | 'canEditFuelRates'
  | 'canManageCreditCustomers'
  | 'canManageExpenseCategories'
  | 'canManageUsers'
  | 'canManagePump'
  | 'canViewReports'
  | 'canExportReports'
  | 'canManageEmployees'
  | 'canViewBooks'
  | 'canPostJournalEntries'
  | 'canManageBankAndSettlement'
  | 'canManageProducts'
  | 'canManageLicences';

export const ALL_PERMISSIONS: PermissionKey[] = [
  'canCreateShift',
  'canEditNozzleReadings',
  'canEditStock',
  'canEditTankerReceipts',
  'canEditCollections',
  'canEditOutstanding',
  'canEditExpenses',
  'canEditCreditSales',
  'canSubmitShift',
  'canLockShift',
  'canEditFuelRates',
  'canManageCreditCustomers',
  'canManageExpenseCategories',
  'canManageUsers',
  'canManagePump',
  'canViewReports',
  'canExportReports',
  'canManageEmployees',
  'canViewBooks',
  'canPostJournalEntries',
  'canManageBankAndSettlement',
  'canManageProducts',
  'canManageLicences',
];

const none = (): Record<PermissionKey, boolean> =>
  Object.fromEntries(ALL_PERMISSIONS.map((k) => [k, false])) as Record<PermissionKey, boolean>;

const grant = (...keys: PermissionKey[]): Record<PermissionKey, boolean> => {
  const base = none();
  for (const k of keys) base[k] = true;
  return base;
};

export const ROLE_PRESETS: Record<Exclude<Role, 'OWNER'>, Record<PermissionKey, boolean>> = {
  // Runs the pump day to day. Everything operational, including locking a shift —
  // but not other users, pump setup, or posting to the books by hand.
  MANAGER: grant(
    'canCreateShift',
    'canEditNozzleReadings',
    'canEditStock',
    'canEditTankerReceipts',
    'canEditCollections',
    'canEditOutstanding',
    'canEditExpenses',
    'canEditCreditSales',
    'canSubmitShift',
    'canLockShift',
    'canEditFuelRates',
    'canManageCreditCustomers',
    'canManageExpenseCategories',
    'canManageEmployees',
    'canViewReports',
    'canExportReports',
    'canViewBooks',
    'canManageProducts',
    'canManageLicences',
  ),

  // The books: ledger, statements, settlement, reports. Deliberately cannot enter
  // or lock a shift — the person who checks the figures should not also create them.
  ACCOUNTANT: grant(
    'canViewReports',
    'canExportReports',
    'canViewBooks',
    'canPostJournalEntries',
    'canManageBankAndSettlement',
    'canManageCreditCustomers',
    'canManageExpenseCategories',
  ),

  // Handles money during and after the shift: collections, drops, hand-overs,
  // deposits and the note count. Cannot lock a shift or change rates.
  CASHIER: grant(
    'canEditCollections',
    'canEditOutstanding',
    'canEditExpenses',
    'canSubmitShift',
    'canViewReports',
  ),

  // Nozzle staff. Sees the shifts they worked and can enter their own readings;
  // nothing else. Most pumps will not give them a login at all.
  ATTENDANT: grant('canEditNozzleReadings'),

  // Read-only, for the CA at year end.
  AUDITOR: grant('canViewReports', 'canExportReports', 'canViewBooks'),

  // Legacy role from the first release; treated as nozzle staff.
  STAFF: grant('canEditNozzleReadings'),
};

/** Human labels, used by the user-management screen. */
export const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  ACCOUNTANT: 'Accountant',
  CASHIER: 'Cashier',
  ATTENDANT: 'Nozzle staff',
  AUDITOR: 'Auditor (read-only)',
  STAFF: 'Staff (old role)',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  OWNER: 'Everything, including other pumps, users and the books.',
  MANAGER: 'Runs the pump day to day: shifts, staff, customers, rates. Can lock a shift.',
  ACCOUNTANT: 'The books, statements, settlement and reports. Cannot enter or lock shifts.',
  CASHIER: 'Collections, cash drops, hand-overs and deposits. Cannot lock a shift.',
  ATTENDANT: 'Nozzle staff: sees only the shifts they worked.',
  AUDITOR: 'Read-only access to reports and the books.',
  STAFF: 'Old role kept for existing logins; same as nozzle staff.',
};

/** The permissions a role starts with. An owner needs no table. */
export function presetFor(role: Role): Record<PermissionKey, boolean> {
  if (role === Role.OWNER) {
    return Object.fromEntries(ALL_PERMISSIONS.map((k) => [k, true])) as Record<
      PermissionKey,
      boolean
    >;
  }
  return ROLE_PRESETS[role as Exclude<Role, 'OWNER'>] ?? none();
}

/** Roles that only ever see the shifts they personally worked. */
export function isAttendantRole(role: Role) {
  return role === Role.ATTENDANT || role === Role.STAFF;
}
