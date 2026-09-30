"use client";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getAuthUser } from "@/lib/api";
import { apiError, type Employee } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  IdCard,
  Pencil,
  Plus,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
  UserX,
} from "lucide-react";
import { useT } from "@/lib/i18n";

// ---------------------------------------------------------------------------
// Shapes the API hands back.
// ---------------------------------------------------------------------------

type RoleOption = {
  role: string;
  label: string;
  description: string;
  defaults: Record<string, boolean>;
};

type LinkedEmployee = { id: string; name: string; code: string | null };

type UserRow = {
  id: string;
  name: string;
  phone: string;
  role: string;
  isActive: boolean;
  permissions: Record<string, boolean> | null;
  employee: LinkedEmployee | null;
};

// ---------------------------------------------------------------------------
// The 23 permission flags, grouped so the editor reads like a job description
// rather than a wall of checkboxes. Keys must match the API exactly.
// ---------------------------------------------------------------------------

const PERM_GROUPS: { key: string; label: string; perms: { key: string; label: string }[] }[] = [
  {
    key: "shifts",
    label: "Shifts",
    perms: [
      { key: "canCreateShift", label: "Create new shift" },
      { key: "canEditNozzleReadings", label: "Edit nozzle readings" },
      { key: "canSubmitShift", label: "Submit shift" },
      { key: "canLockShift", label: "Lock shift (final)" },
      { key: "canEditStock", label: "Edit stock entries" },
      { key: "canEditTankerReceipts", label: "Add tanker receipts" },
    ],
  },
  {
    key: "money",
    label: "Money",
    perms: [
      { key: "canEditCollections", label: "Edit collections" },
      { key: "canEditOutstanding", label: "Edit outstanding receipts" },
      { key: "canEditExpenses", label: "Edit expenses" },
      { key: "canManageBankAndSettlement", label: "Bank deposits & settlement" },
    ],
  },
  {
    key: "people",
    label: "Customers & staff",
    perms: [
      { key: "canEditCreditSales", label: "Add credit sales" },
      { key: "canManageCreditCustomers", label: "Manage credit customers" },
      { key: "canManageEmployees", label: "Manage employees" },
    ],
  },
  {
    key: "books",
    label: "Books",
    perms: [
      { key: "canViewBooks", label: "View the books" },
      { key: "canPostJournalEntries", label: "Post journal entries" },
      { key: "canViewReports", label: "View reports" },
      { key: "canExportReports", label: "Export reports" },
    ],
  },
  {
    key: "setup",
    label: "Setup",
    perms: [
      { key: "canEditFuelRates", label: "Update fuel rates" },
      { key: "canManageExpenseCategories", label: "Manage expense categories" },
      { key: "canManageProducts", label: "Manage lubes & non-fuel" },
      { key: "canManageLicences", label: "Manage licences" },
      { key: "canManageUsers", label: "Manage users" },
      { key: "canManagePump", label: "Manage pump setup" },
    ],
  },
];

const ALL_PERMS = PERM_GROUPS.flatMap((g) => g.perms);

/** Only the 23 flags — the API also returns id / userId on the permission row. */
const pickPerms = (src: Record<string, boolean> | null | undefined): Record<string, boolean> => {
  const out: Record<string, boolean> = {};
  ALL_PERMS.forEach((p) => (out[p.key] = Boolean(src?.[p.key])));
  return out;
};

/** These roles only ever see the shifts they were personally rostered on. */
const isAttendantRole = (role: string) => role === "ATTENDANT" || role === "STAFF";

// ---------------------------------------------------------------------------

export default function UsersPage() {
  const { t } = useT();
  const signedIn = getAuthUser();
  const isOwner = signedIn?.role === "OWNER";
  const [addOpen, setAddOpen] = useState(false);

  const { data: users = [] } = useQuery<UserRow[]>({
    queryKey: ["users"],
    queryFn: async () => (await api.get("/api/users")).data,
  });

  const { data: roles = [] } = useQuery<RoleOption[]>({
    queryKey: ["user-roles"],
    queryFn: async () => (await api.get("/api/users/roles")).data,
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["employees"],
    queryFn: async () => (await api.get("/api/employees")).data,
  });

  // An owner cannot be created from here, so it is not offered.
  const assignable = roles.filter((r) => r.role !== "OWNER");

  const permLabel = (key: string) => {
    const found = ALL_PERMS.find((p) => p.key === key);
    return t(`settings.perm${key.slice(3)}`, found?.label ?? key);
  };

  const roleName = (role: string) => {
    const opt = roles.find((r) => r.role === role);
    return t(`settings.role${role}`, opt?.label ?? role);
  };

  const roleDescription = (role: string) => {
    const opt = roles.find((r) => r.role === role);
    return t(`settings.roleDesc${role}`, opt?.description ?? "");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">{t("settings.users", "Users & Permissions")}</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            {t("settings.usersDesc", "Give each person a role, then fine-tune exactly what they can do")}
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-1" /> {t("settings.addUser", "Add user")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("settings.addUserTitle", "Add User")}</DialogTitle>
            </DialogHeader>
            <AddUserForm
              roles={assignable}
              employees={employees}
              permLabel={permLabel}
              roleName={roleName}
              roleDescription={roleDescription}
              onDone={() => setAddOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {users.length === 0 && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            {t("settings.noUsers", "No logins yet.")}
          </CardContent>
        </Card>
      )}

      {users.map((u) => (
        <UserCard
          key={u.id}
          user={u}
          roles={assignable}
          employees={employees}
          isOwner={isOwner}
          isSelf={signedIn?.id === u.id}
          permLabel={permLabel}
          roleName={roleName}
          roleDescription={roleDescription}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

function AddUserForm({
  roles,
  employees,
  permLabel,
  roleName,
  roleDescription,
  onDone,
}: {
  roles: RoleOption[];
  employees: Employee[];
  permLabel: (key: string) => string;
  roleName: (role: string) => string;
  roleDescription: (role: string) => string;
  onDone: () => void;
}) {
  const { t } = useT();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState("");
  const [employeeId, setEmployeeId] = useState("none");
  const [error, setError] = useState("");

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post("/api/users", {
          name: name.trim(),
          phone: phone.trim(),
          pin,
          role,
          employeeId: employeeId === "none" ? null : employeeId,
        })
      ).data,
    onSuccess: () => {
      toast.success(t("settings.userCreated", "User created"));
      qc.invalidateQueries({ queryKey: ["users"] });
      onDone();
    },
    onError: (e) => {
      const msg = apiError(e, t("settings.failed", "Failed"));
      setError(msg);
      toast.error(msg);
    },
  });

  const needsStaffLink = isAttendantRole(role) && employeeId === "none";

  return (
    <div className="space-y-3">
      <div>
        <Label>{t("common.name", "Name")}</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <Label>{t("common.phone", "Phone")}</Label>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" />
      </div>
      <div>
        <Label>{t("settings.pinFourDigits", "PIN (4 digits)")}</Label>
        <Input type="password" value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" />
      </div>

      <div>
        <Label>{t("settings.role", "Role")}</Label>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger>
            <SelectValue placeholder={t("settings.rolePick", "Choose a role")} />
          </SelectTrigger>
          <SelectContent>
            {roles.map((r) => (
              <SelectItem key={r.role} value={r.role}>
                {roleName(r.role)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {role !== "" && (
        <RolePreview
          option={roles.find((r) => r.role === role)}
          permLabel={permLabel}
          roleDescription={roleDescription}
        />
      )}

      <div>
        <Label>{t("settings.linkedStaff", "This login belongs to staff member")}</Label>
        <Select value={employeeId} onValueChange={setEmployeeId}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t("settings.noStaffLink", "Not linked to any staff record")}</SelectItem>
            {employees.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.code ? `${e.name} (${e.code})` : e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-1">
          {t(
            "settings.linkedStaffHelp",
            "Linking the login to a staff record is what lets the app show a person the shifts they worked.",
          )}
        </p>
      </div>

      {needsStaffLink && (
        <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            {t(
              "settings.attendantNeedsStaff",
              "Nozzle staff see only the shifts they were rostered on. Without a linked staff record this login will see no shifts at all.",
            )}
          </span>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        className="w-full"
        onClick={() => {
          setError("");
          create.mutate();
        }}
        disabled={!name.trim() || !phone.trim() || !pin || !role || create.isPending}
      >
        {create.isPending ? t("common.saving", "Saving…") : t("common.add", "Add")}
      </Button>
    </div>
  );
}

/** What the chosen role means and what it grants — shown before it is applied. */
function RolePreview({
  option,
  permLabel,
  roleDescription,
}: {
  option: RoleOption | undefined;
  permLabel: (key: string) => string;
  roleDescription: (role: string) => string;
}) {
  const { t } = useT();
  if (!option) return null;
  const granted = ALL_PERMS.filter((p) => option.defaults?.[p.key]);
  return (
    <div className="rounded-md border bg-slate-50 p-3 space-y-2">
      <p className="text-sm">{roleDescription(option.role)}</p>
      <p className="text-xs font-medium text-muted-foreground">
        {t("settings.roleGrants", "This role grants {n} of {total} permissions:", {
          n: granted.length,
          total: ALL_PERMS.length,
        })}
      </p>
      {granted.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("settings.roleGrantsNone", "Nothing — read-only.")}</p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5">
          {granted.map((p) => (
            <li key={p.key} className="flex items-start gap-1.5 text-xs">
              <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 mt-0.5" />
              <span>{permLabel(p.key)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        {t("settings.roleTunableLater", "You can fine-tune any of these afterwards.")}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One user
// ---------------------------------------------------------------------------

function UserCard({
  user,
  roles,
  employees,
  isOwner,
  isSelf,
  permLabel,
  roleName,
  roleDescription,
}: {
  user: UserRow;
  roles: RoleOption[];
  employees: Employee[];
  isOwner: boolean;
  isSelf: boolean;
  permLabel: (key: string) => string;
  roleName: (role: string) => string;
  roleDescription: (role: string) => string;
}) {
  const { t } = useT();
  const qc = useQueryClient();
  const [permsOpen, setPermsOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ["users"] });

  const toggleActive = useMutation({
    mutationFn: async (activate: boolean) =>
      (await api.post(`/api/users/${user.id}/${activate ? "reactivate" : "deactivate"}`)).data,
    onSuccess: (_r, activate) => {
      toast.success(
        activate
          ? t("settings.userReactivated", "Login reactivated")
          : t("settings.userDeactivated", "Login deactivated"),
      );
      refresh();
    },
    onError: (e) => toast.error(apiError(e, t("settings.failed", "Failed"))),
  });

  const isOwnerAccount = user.role === "OWNER";
  const attendantWithoutStaff = isAttendantRole(user.role) && !user.employee;
  // The server refuses a role change on an owner account or on your own login.
  const canChangeRole = isOwner && !isOwnerAccount && !isSelf;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 shrink-0" /> {user.name}
          <Badge variant={isOwnerAccount ? "default" : "secondary"}>{roleName(user.role)}</Badge>
          {user.isActive ? (
            <Badge variant="success">{t("common.active", "Active")}</Badge>
          ) : (
            <Badge variant="destructive">{t("common.inactive", "Inactive")}</Badge>
          )}
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{user.phone}</span>
          <span className="flex items-center gap-1">
            <IdCard className="h-3.5 w-3.5" />
            {user.employee
              ? t("settings.staffLinkedTo", "Staff record: {name}", {
                  name: user.employee.code ? `${user.employee.name} (${user.employee.code})` : user.employee.name,
                })
              : t("settings.staffNotLinked", "No staff record linked")}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{roleDescription(user.role)}</p>

        {attendantWithoutStaff && (
          <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              {t(
                "settings.attendantNeedsStaff",
                "Nozzle staff see only the shifts they were rostered on. Without a linked staff record this login will see no shifts at all.",
              )}
            </span>
          </div>
        )}

        {isOwnerAccount ? (
          <p className="text-sm text-muted-foreground">
            {t("settings.ownerFullAccess", "Owner has full access — no per-permission toggles.")}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setPermsOpen(true)}>
              <SlidersHorizontal className="h-4 w-4 mr-1" /> {t("settings.editPermissions", "Permissions")}
            </Button>
            {canChangeRole && (
              <Button variant="outline" size="sm" onClick={() => setRoleOpen(true)}>
                <ShieldCheck className="h-4 w-4 mr-1" /> {t("settings.changeRole", "Change role")}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4 mr-1" /> {t("settings.editLogin", "Edit login")}
            </Button>
            {!isSelf && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleActive.mutate(!user.isActive)}
                disabled={toggleActive.isPending}
              >
                {user.isActive ? (
                  <>
                    <UserX className="h-4 w-4 mr-1" /> {t("settings.deactivate", "Deactivate")}
                  </>
                ) : (
                  <>
                    <UserCheck className="h-4 w-4 mr-1" /> {t("settings.activate", "Activate")}
                  </>
                )}
              </Button>
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={permsOpen} onOpenChange={setPermsOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("settings.permissionsFor", "Permissions — {name}", { name: user.name })}</DialogTitle>
          </DialogHeader>
          <PermissionEditor
            user={user}
            roles={roles}
            permLabel={permLabel}
            roleName={roleName}
            onDone={() => {
              setPermsOpen(false);
              refresh();
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={roleOpen} onOpenChange={setRoleOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("settings.changeRoleFor", "Change role — {name}", { name: user.name })}</DialogTitle>
          </DialogHeader>
          <ChangeRoleForm
            user={user}
            roles={roles}
            permLabel={permLabel}
            roleName={roleName}
            roleDescription={roleDescription}
            onDone={() => {
              setRoleOpen(false);
              refresh();
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("settings.editLoginFor", "Edit login — {name}", { name: user.name })}</DialogTitle>
          </DialogHeader>
          <EditLoginForm
            user={user}
            employees={employees}
            isOwner={isOwner}
            onDone={() => {
              setEditOpen(false);
              refresh();
            }}
          />
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Permission editor
// ---------------------------------------------------------------------------

function PermissionEditor({
  user,
  roles,
  permLabel,
  roleName,
  onDone,
}: {
  user: UserRow;
  roles: RoleOption[];
  permLabel: (key: string) => string;
  roleName: (role: string) => string;
  onDone: () => void;
}) {
  const { t } = useT();
  const [perms, setPerms] = useState<Record<string, boolean>>(() => pickPerms(user.permissions));
  const [error, setError] = useState("");
  const defaults = useMemo(() => roles.find((r) => r.role === user.role)?.defaults, [roles, user.role]);

  const save = useMutation({
    mutationFn: async () => (await api.put(`/api/users/${user.id}/permissions`, perms)).data,
    onSuccess: () => {
      toast.success(t("settings.permissionsUpdated", "Permissions updated"));
      onDone();
    },
    onError: (e) => {
      const msg = apiError(e, t("settings.failed", "Failed"));
      setError(msg);
      toast.error(msg);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {t("settings.permsIntro", "Role: {role}. Tick exactly what this person may do.", {
            role: roleName(user.role),
          })}
        </p>
        {defaults && (
          <Button variant="outline" size="sm" onClick={() => setPerms(pickPerms(defaults))}>
            <RotateCcw className="h-4 w-4 mr-1" /> {t("settings.resetToRoleDefaults", "Reset to role defaults")}
          </Button>
        )}
      </div>

      {PERM_GROUPS.map((group) => (
        <div key={group.key} className="space-y-2">
          <Separator />
          <h3 className="text-sm font-semibold">{t(`settings.permGroup.${group.key}`, group.label)}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4">
            {group.perms.map((p) => (
              <label key={p.key} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4"
                  checked={Boolean(perms[p.key])}
                  onChange={(e) => setPerms((s) => ({ ...s, [p.key]: e.target.checked }))}
                />
                <span>{permLabel(p.key)}</span>
              </label>
            ))}
          </div>
        </div>
      ))}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        className="w-full"
        onClick={() => {
          setError("");
          save.mutate();
        }}
        disabled={save.isPending}
      >
        {save.isPending ? t("common.saving", "Saving…") : t("settings.savePermissions", "Save permissions")}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Change role (owner only)
// ---------------------------------------------------------------------------

function ChangeRoleForm({
  user,
  roles,
  permLabel,
  roleName,
  roleDescription,
  onDone,
}: {
  user: UserRow;
  roles: RoleOption[];
  permLabel: (key: string) => string;
  roleName: (role: string) => string;
  roleDescription: (role: string) => string;
  onDone: () => void;
}) {
  const { t } = useT();
  const [role, setRole] = useState(user.role);
  const [resetPermissions, setResetPermissions] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  const change = useMutation({
    mutationFn: async () => (await api.post(`/api/users/${user.id}/role`, { role, resetPermissions })).data,
    onSuccess: () => {
      toast.success(t("settings.roleChanged", "Role changed"));
      onDone();
    },
    // The server has the last word here — a 403 or 400 from it is shown verbatim.
    onError: (e) => {
      const msg = apiError(e, t("settings.failed", "Failed"));
      setError(msg);
      toast.error(msg);
      setConfirming(false);
    },
  });

  if (confirming) {
    return (
      <div className="space-y-4">
        <p className="text-sm">
          {t("settings.confirmRoleLine", "{name} becomes {role}.", { name: user.name, role: roleName(role) })}
        </p>
        <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            {resetPermissions
              ? t(
                  "settings.confirmRoleReset",
                  "Their permissions will be replaced with this role's defaults. Any fine-tuning done earlier is discarded.",
                )
              : t(
                  "settings.confirmRoleKeep",
                  "Their existing permissions are kept exactly as they are — only the role label changes.",
                )}
          </span>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setConfirming(false)} disabled={change.isPending}>
            {t("common.back", "Back")}
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              setError("");
              change.mutate();
            }}
            disabled={change.isPending}
          >
            {change.isPending ? t("common.saving", "Saving…") : t("settings.confirmChangeRole", "Yes, change the role")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <Label>{t("settings.newRole", "New role")}</Label>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roles.map((r) => (
              <SelectItem key={r.role} value={r.role}>
                {roleName(r.role)}
              </SelectItem>
            ))}
            {/* The legacy role is not on offer, but someone may still hold it. */}
            {!roles.some((r) => r.role === user.role) && (
              <SelectItem value={user.role}>{roleName(user.role)}</SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      <RolePreview
        option={roles.find((r) => r.role === role)}
        permLabel={permLabel}
        roleDescription={roleDescription}
      />

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4"
          checked={resetPermissions}
          onChange={(e) => setResetPermissions(e.target.checked)}
        />
        <span>
          {t("settings.resetPermissions", "Apply this role's default permissions")}
          <span className="block text-xs text-muted-foreground">
            {t("settings.resetPermissionsHelp", "Unticked, the person keeps the permissions they have now.")}
          </span>
        </span>
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button className="w-full" onClick={() => setConfirming(true)} disabled={role === user.role}>
        {t("settings.continue", "Continue")}
      </Button>
      {role === user.role && (
        <p className="text-xs text-muted-foreground">
          {t("settings.roleUnchanged", "Pick a different role to continue.")}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit login (name / phone / PIN / linked staff record)
// ---------------------------------------------------------------------------

function EditLoginForm({
  user,
  employees,
  isOwner,
  onDone,
}: {
  user: UserRow;
  employees: Employee[];
  isOwner: boolean;
  onDone: () => void;
}) {
  const { t } = useT();
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone);
  const [pin, setPin] = useState("");
  const [employeeId, setEmployeeId] = useState(user.employee?.id ?? "none");
  const [error, setError] = useState("");

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.patch(`/api/users/${user.id}`, {
          name: name.trim(),
          phone: phone.trim(),
          ...(pin ? { pin } : {}),
          ...(isOwner ? { employeeId: employeeId === "none" ? null : employeeId } : {}),
        })
      ).data,
    onSuccess: () => {
      toast.success(t("settings.loginUpdated", "Login updated"));
      onDone();
    },
    onError: (e) => {
      const msg = apiError(e, t("settings.failed", "Failed"));
      setError(msg);
      toast.error(msg);
    },
  });

  return (
    <div className="space-y-3">
      <div>
        <Label>{t("common.name", "Name")}</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <Label>{t("common.phone", "Phone")}</Label>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" />
      </div>
      <div>
        <Label>{t("settings.newPin", "New PIN (leave blank to keep)")}</Label>
        <Input type="password" value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" />
      </div>
      {isOwner && (
        <div>
          <Label>{t("settings.linkedStaff", "This login belongs to staff member")}</Label>
          <Select value={employeeId} onValueChange={setEmployeeId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("settings.noStaffLink", "Not linked to any staff record")}</SelectItem>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.code ? `${e.name} (${e.code})` : e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        className="w-full"
        onClick={() => {
          setError("");
          save.mutate();
        }}
        disabled={!name.trim() || !phone.trim() || save.isPending}
      >
        {save.isPending ? t("common.saving", "Saving…") : t("settings.saveChanges", "Save changes")}
      </Button>
    </div>
  );
}
