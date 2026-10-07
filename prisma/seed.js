const { createPrismaClient } = require("./createPrismaClient");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

const prisma = createPrismaClient();

const SUPPLIER_SUBHEAD_SETTINGS_ID = "SUPPLIER_SUBHEAD";

const STUDENT_ROLE_ID = "a2000001-0002-4002-8002-000000000008";
const PARENT_ROLE_ID = "a2000001-0002-4002-8002-000000000009";
const SYSTEM_ADMIN_ROLE_ID = "a2000001-0002-4002-8002-000000000002";
const ACCOUNTANT_ROLE_ID = "a2000001-0002-4002-8002-000000000004";
const REGISTRAR_ROLE_ID = "a2000001-0002-4002-8002-000000000005";
const STORE_CLERK_ROLE_ID = "a2000001-0002-4002-8002-000000000006";
const CLASS_TEACHER_ROLE_ID = "a2000001-0002-4002-8002-000000000010";
const SUBJECT_TEACHER_ROLE_ID = "a2000001-0002-4002-8002-000000000011";

const MENU_SCHOOL_MANAGEMENT_ID = "menu0001-0000-4000-8000-000000000001";
const MENU_INVENTORY_OPS_ID = "menu0001-0000-4000-8000-000000000002";
const MENU_INVENTORY_INFLOWS_ID = "menu0001-0000-4000-8000-000000000003";
const MENU_INVENTORY_OUTFLOWS_ID = "menu0001-0000-4000-8000-000000000004";
const MENU_ASSESSMENT_SETUP_ID = "menu0001-0000-4000-8000-000000000005";
const MENU_INVENTORY_REPORTS_ID = "menu0001-0000-4000-8000-000000000006";
const MENU_STUDENT_BILLINGS_ID = "menu0001-0000-4000-8000-000000000007";
const MENU_STUDENT_FINANCIAL_REPORTS_ID = "menu0001-0000-4000-8000-000000000008";
const MENU_ACCOUNT_SETTINGS_ID = "menu0001-0000-4000-8000-000000000009";
const MENU_ACCOUNTING_REPORTS_ID = "menu0001-0000-4000-8000-00000000000a";
const MENU_ACCOUNT_POSTING_ID = "menu0001-0000-4000-8000-00000000000b";
const MENU_FACILITY_SETUP_ID = "menu0001-0000-4000-8000-00000000000c";
const MENU_ACCESS_MANAGEMENT_ID = "menu0001-0000-4000-8000-00000000000d";

async function ensureRoleMenu(roleId, menuId) {
  const existing = await prisma.roleMenu.findFirst({
    where: { roleId, menuId },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.roleMenu.create({
    data: { roleId, menuId },
    select: { id: true },
  });
  return created.id;
}

async function ensureRoleMenuChild(roleMenuId, menuChildId) {
  const existing = await prisma.roleMenuChild.findFirst({
    where: { roleMenuId, menuChildId },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.roleMenuChild.create({
    data: { roleMenuId, menuChildId },
    select: { id: true },
  });
  return created.id;
}

async function assignUserAppRole(userId, roleId) {
  if (!userId || !roleId) return;
  await prisma.userRole.upsert({
    where: { userId },
    update: { roleId },
    create: { userId, roleId },
  });
}

/** Mirror SupplierService.createSupplier — ledger under SUPPLIER_SUBHEAD (Accounts Payable). */
async function ensureSupplierLedgerAccount(supplier) {
  const defaultSubhead = await prisma.defaulSubheadSettings.findUnique({
    where: { settingsId: SUPPLIER_SUBHEAD_SETTINGS_ID },
    select: { subheadId: true },
  });
  if (!defaultSubhead?.subheadId) {
    return null;
  }

  const subhead = await prisma.accountSubhead.findUnique({
    where: { id: defaultSubhead.subheadId },
    select: { id: true, groupId: true, headId: true },
  });
  if (!subhead) {
    return null;
  }

  const accountDescription = supplier.name.trim();
  const byRef = await prisma.accountChart.findFirst({
    where: { subheadId: subhead.id, accountRef: supplier.id },
    select: { id: true },
  });

  if (byRef) {
    await prisma.accountChart.update({
      where: { id: byRef.id },
      data: {
        accountDescription,
        status: supplier.status,
        groupId: subhead.groupId,
        headId: subhead.headId,
      },
    });
    return byRef.id;
  }

  const byDescription = await prisma.accountChart.findFirst({
    where: { subheadId: subhead.id, accountDescription },
    select: { id: true, accountRef: true },
  });

  if (byDescription) {
    await prisma.accountChart.update({
      where: { id: byDescription.id },
      data: {
        accountRef: supplier.id,
        status: supplier.status,
        groupId: subhead.groupId,
        headId: subhead.headId,
      },
    });
    return byDescription.id;
  }

  const maxRank = await prisma.accountChart.aggregate({
    where: { subheadId: subhead.id },
    _max: { rank: true },
  });

  const created = await prisma.accountChart.create({
    data: {
      groupId: subhead.groupId,
      headId: subhead.headId,
      subheadId: subhead.id,
      accountDescription,
      accountRef: supplier.id,
      accountNo: null,
      rank: (maxRank._max.rank ?? 0) + 1,
      status: supplier.status,
    },
  });
  return created.id;
}

function splitStaffName(fullName) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/** Mirror StaffService.createStaffWithUser — linked User + Staff row. */
async function upsertStaffWithUser(hashedPassword, input) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedStaffNumber = input.StaffNumber.trim();
  const normalizedName = input.name.trim();
  const { firstName, lastName } = splitStaffName(normalizedName);

  const user = await prisma.user.upsert({
    where: { email: normalizedEmail },
    update: {
      password: hashedPassword,
      firstName,
      lastName,
      userType: input.userType ?? "Staff",
      isActive: true,
      isVerified: true,
      isEmailVerified: true,
      isPhoneVerified: false,
      isDeleted: false,
      status: "active",
    },
    create: {
      id: input.userId,
      email: normalizedEmail,
      password: hashedPassword,
      firstName,
      lastName,
      userType: input.userType ?? "Staff",
      isActive: true,
      isVerified: true,
      isEmailVerified: true,
      isPhoneVerified: false,
      isDeleted: false,
      status: "active",
      createdById: input.createdById,
    },
  });

  const position = input.position ?? input.role ?? "teacher";
  const staffData = {
    email: normalizedEmail,
    name: normalizedName,
    position,
    employmentType: input.employmentType ?? "Permanent",
    status: input.status ?? "Active",
    profileImageUrl: input.profileImageUrl ?? null,
    createdById: input.createdById,
    userId: user.id,
    gradeLevelId: input.gradeLevelId ?? null,
    departmentId: input.departmentId ?? null,
    step: input.step ?? 0,
    salary: input.salary ?? 0,
    dateOfBirth: input.dateOfBirth ?? null,
    dateOfAppointment: input.dateOfAppointment ?? null,
    dateOfResignation: input.dateOfResignation ?? null,
    dateOfTermination: input.dateOfTermination ?? null,
  };

  await prisma.staff.upsert({
    where: { id: input.id },
    update: {
      StaffNumber: normalizedStaffNumber,
      ...staffData,
    },
    create: {
      id: input.id,
      StaffNumber: normalizedStaffNumber,
      ...staffData,
    },
  });

  if (input.appRoleId) {
    await assignUserAppRole(user.id, input.appRoleId);
  }

  return user.id;
}

/** Seed Bank rows from banks.json (bankCode, bankName; optional id from file). */
async function seedBanks() {
  const banksPath = path.join(__dirname, "..", "banks.json");
  if (!fs.existsSync(banksPath)) {
    console.warn("   ⚠ banks.json not found — skipping bank seed");
    return { seeded: 0, skipped: 0 };
  }

  const raw = JSON.parse(fs.readFileSync(banksPath, "utf8"));
  if (!Array.isArray(raw)) {
    throw new Error("banks.json must be a JSON array");
  }

  const seenCodes = new Set();
  let seeded = 0;
  let skipped = 0;

  for (const row of raw) {
    const bankCode = String(row.bankCode ?? "").trim();
    const bankName = String(row.bankName ?? "").trim();
    if (!bankCode || !bankName) {
      skipped += 1;
      continue;
    }
    if (seenCodes.has(bankCode)) {
      skipped += 1;
      continue;
    }
    seenCodes.add(bankCode);

    const id =
      typeof row.id === "string" && /^[0-9a-f-]{36}$/i.test(row.id.trim())
        ? row.id.trim()
        : undefined;

    await prisma.bank.upsert({
      where: { bankCode },
      update: { bankName },
      create: {
        ...(id ? { id } : {}),
        bankCode,
        bankName,
      },
    });
    seeded += 1;
  }

  return { seeded, skipped };
}

async function main() {
  console.log("🌱 Starting database seeding...");

  try {
    // Create sample users
    const hashedPassword = await bcrypt.hash("12345", 10);

    await prisma.user.upsert({
      where: { email: "admin@admin.com" },
      update: {
        password: hashedPassword,
        firstName: "Admin",
        lastName: "User",
        userType: "SuperAdmin",
        isActive: true,
        isVerified: true,
        isEmailVerified: true,
        isPhoneVerified: false,
        isDeleted: false,
        status: "active",
      },
      create: {
        id: "77e7a005-b0a5-4a6e-897c-f827333924d4",
        email: "admin@admin.com",
        password: hashedPassword,
        firstName: "Admin",
        lastName: "User",
        userType: "SuperAdmin",
        isActive: true,
        isVerified: true,
        isEmailVerified: true,
        isPhoneVerified: false,
        isDeleted: false,
        status: "active",
      },
    });

    await prisma.user.upsert({
      where: { email: "admin@example.com" },
      update: {
        password: hashedPassword,
        firstName: "Admin",
        lastName: "User",
        userType: "SuperAdmin",
        isActive: true,
        isVerified: true,
        isEmailVerified: true,
        isPhoneVerified: false,
        isDeleted: false,
        status: "active",
      },
      create: {
        id: "39fc583a-a071-49f3-980f-8932fa6cb6c9",
        email: "admin@example.com",
        password: hashedPassword,
        firstName: "Admin",
        lastName: "User",
        userType: "SuperAdmin",
        isActive: true,
        isVerified: true,
        isEmailVerified: true,
        isPhoneVerified: false,
        isDeleted: false,
        status: "active",
      },
    });

    console.log("🏦 Seeding banks from banks.json...");
    const { seeded: banksSeeded, skipped: banksSkipped } = await seedBanks();
    console.log(`   ✓ ${banksSeeded} banks (${banksSkipped} skipped)`);

    // Privileges (RBAC) — derived from API routes in src/routes (excludes auth)
    console.log("🔐 Seeding privileges...");
    // Do not hard-code IDs here; older databases may already contain rows with those IDs.
    // We upsert by unique `name` and let Prisma/DB handle the primary key.
    const priv = (name, description) => ({ name, description });

    const crud = (resource, routePrefix, label) => [
      priv(`${resource}.read`, `${label}: list and view (GET ${routePrefix})`),
      priv(`${resource}.write`, `${label}: create and update (POST/PUT/PATCH ${routePrefix})`),
      priv(`${resource}.delete`, `${label}: delete (DELETE ${routePrefix})`),
    ];

    const privileges = [
      // —— Users (/users) ——
      priv("users.read", "List/view users, privileges, menus, store access (GET /users…)"),
      priv(
        "users.privileges.manage",
        "Assign user privileges (POST/DELETE /users/:userId/privileges)"
      ),
      priv(
        "users.roles.manage",
        "Assign user application roles (POST/DELETE /users/:userId/roles)"
      ),

      // —— App roles (/app-roles) ——
      priv("app_roles.read", "List/view roles, role menus (GET /app-roles…)"),
      priv("app_roles.write", "Create and update roles (POST/PUT /app-roles)"),
      priv("app_roles.delete", "Delete roles (DELETE /app-roles/:id)"),
      priv(
        "app_roles.privileges.manage",
        "Assign role privileges (POST/DELETE /app-roles/:id/privileges)"
      ),
      priv("app_roles.menus.manage", "Assign role menus (POST/GET/DELETE /app-roles/:id/menus)"),

      priv("privileges.read", "List privilege definitions (GET /privileges)"),

      ...crud("menus", "/menus", "Navigation menus"),

      // —— Accounting: read-only catalogs ——
      priv("banks.read", "List/search banks (GET /banks…)"),
      priv("account_groups.read", "List account groups (GET /account-groups)"),
      priv("account_heads.read", "List account heads (GET /account-heads)"),

      ...crud("account_subheads", "/account-subheads", "Account subheads"),
      ...crud("account_charts", "/account-charts", "Account chart of accounts"),

      priv(
        "account_transactions.read",
        "Account reports, balances, transaction logs (GET /account-transactions…)"
      ),
      priv(
        "account_transactions.write",
        "Debit, credit, student journal post (POST /account-transactions…)"
      ),
      priv(
        "account_transactions.delete",
        "Rollback transactions (DELETE /account-transactions/rollback/:ref)"
      ),

      priv(
        "default_subhead_settings.read",
        "View default subhead settings (GET /default-subhead-settings)"
      ),
      priv(
        "default_subhead_settings.write",
        "Update default subhead settings (PATCH /default-subhead-settings/:id)"
      ),
      priv(
        "default_account_settings.read",
        "View default account settings (GET /default-account-settings)"
      ),
      priv(
        "default_account_settings.write",
        "Update default account settings (PATCH /default-account-settings/:id)"
      ),

      ...crud("billing_items", "/billing-items", "Billing items"),
      ...crud("concession_discounts", "/concession-discounts", "Concession discounts"),
      ...crud("class_default_billings", "/class-default-billings", "Class default billings"),
      ...crud("student_billings", "/student-billings", "Student billings"),
      ...crud(
        "student_concession_discounts",
        "/student-concession-discounts",
        "Student concession discounts"
      ),
      ...crud("temp_journal_transfers", "/temp-journal-transfers", "Temporary journal transfers"),

      ...crud("categories", "/categories", "Inventory categories"),
      ...crud("sub_categories", "/sub-categories", "Inventory sub-categories"),
      ...crud("brands", "/brands", "Product brands"),
      ...crud("uoms", "/uoms", "Units of measure"),
      ...crud("inventory_items", "/inventory-items", "Inventory items"),
      ...crud("suppliers", "/suppliers", "Suppliers"),
      ...crud("purchases", "/purchases", "Purchases"),
      ...crud("donations", "/donations", "Donations"),

      ...crud("school_classes", "/school-classes", "School classes"),
      ...crud("students", "/students", "Students"),
      ...crud("sub_classes", "/sub-classes", "Sub-classes"),
      ...crud("terms", "/terms", "Academic terms"),
      ...crud("sessions", "/sessions", "Academic sessions"),
      ...crud("staff", "/staff", "Staff"),

      priv("active_period.read", "View active period (GET /active-period)"),
      priv("active_period.write", "Set active period (PUT /active-period)"),
      priv(
        "default_billing_period.read",
        "View default billing period (GET /default-billing-period)"
      ),
      priv(
        "default_billing_period.write",
        "Set default billing period (PUT /default-billing-period)"
      ),

      ...crud("projects", "/projects", "Projects"),
      ...crud("project_collections", "/project-collections", "Project collections"),

      ...crud("stores", "/stores", "Stores"),
      priv("stores.users.manage", "Assign store users (POST/DELETE /stores/:id/users)"),

      priv("user_stores.read", "List user–store assignments (GET /user-stores…)"),
      priv("user_stores.write", "Grant/revoke store access (POST/DELETE /user-stores)"),

      priv("store_transfers.read", "List store transfers (GET /store-transfers)"),
      priv("store_transfers.write", "Transfer stock between stores (POST /store-transfers)"),

      ...crud("student_collections", "/student-collections", "Student collections"),
      ...crud("staff_collections", "/staff-collections", "Staff collections"),
      ...crud("facilities", "/facilities", "Facilities"),
      ...crud("facility_collections", "/facility-collections", "Facility collections"),

      priv(
        "inventory_receive_acknowledgements.write",
        "Acknowledge inventory receipt (POST /inventory-receive-acknowledgements)"
      ),
      priv("upload.write", "Upload and validate files (POST /upload…)"),
    ];

    for (const p of privileges) {
      await prisma.privilege.upsert({
        where: { name: p.name },
        update: { description: p.description },
        create: { name: p.name, description: p.description },
      });
    }
    console.log(`   ✓ ${privileges.length} privileges`);

    // Application roles (AppRole) with default privilege sets
    console.log("👤 Seeding application roles...");
    const allPrivileges = await prisma.privilege.findMany({
      select: { id: true, name: true },
    });
    const privilegeIdByName = Object.fromEntries(allPrivileges.map((p) => [p.name, p.id]));

    const resolvePrivilegeIds = (names) =>
      names.map((name) => privilegeIdByName[name]).filter(Boolean);

    const pickResource = (resource, actions = ["read", "write", "delete"]) =>
      actions.map((action) => `${resource}.${action}`);
    const pickResources = (resources, actions = ["read", "write", "delete"]) =>
      resources.flatMap((resource) => pickResource(resource, actions));

    const allPrivilegeNames = allPrivileges.map((p) => p.name);
    const allReadPrivilegeNames = allPrivilegeNames.filter((name) => name.endsWith(".read"));

    const inventoryResources = [
      "categories",
      "sub_categories",
      "brands",
      "uoms",
      "inventory_items",
      "suppliers",
      "purchases",
      "donations",
      "stores",
      "student_collections",
      "staff_collections",
    ];

    const schoolResources = [
      "school_classes",
      "students",
      "sub_classes",
      "terms",
      "sessions",
      "staff",
    ];

    const billingResources = [
      "billing_items",
      "concession_discounts",
      "class_default_billings",
      "student_billings",
      "student_concession_discounts",
    ];

    const accountingResources = [
      "account_subheads",
      "account_charts",
      "account_transactions",
      "temp_journal_transfers",
    ];

    const teacherBasePrivileges = [
      "active_period.read",
      "sessions.read",
      "terms.read",
      ...pickResources(["school_classes", "students", "sub_classes", "staff"], ["read"]),
    ];

    const appRoles = [
      {
        id: "a2000001-0002-4002-8002-000000000001",
        name: "Super Admin",
        status: "active",
        privilegeNames: allPrivilegeNames,
      },
      {
        id: SYSTEM_ADMIN_ROLE_ID,
        name: "System Administrator",
        status: "active",
        privilegeNames: allPrivilegeNames.filter((name) => name !== "upload.write"),
      },
      {
        id: "a2000001-0002-4002-8002-000000000003",
        name: "Inventory Manager",
        status: "active",
        privilegeNames: [
          ...pickResources(inventoryResources),
          "stores.users.manage",
          "user_stores.read",
          "user_stores.write",
          "store_transfers.read",
          "store_transfers.write",
          "inventory_receive_acknowledgements.write",
          "facilities.read",
          "facility_collections.read",
          "students.read",
          "school_classes.read",
          "staff.read",
        ],
      },
      {
        id: ACCOUNTANT_ROLE_ID,
        name: "Accountant",
        status: "active",
        privilegeNames: [
          "banks.read",
          "account_groups.read",
          "account_heads.read",
          ...pickResources(accountingResources),
          "default_subhead_settings.read",
          "default_subhead_settings.write",
          "default_account_settings.read",
          "default_account_settings.write",
          ...pickResources(billingResources),
          "active_period.read",
          "active_period.write",
          "default_billing_period.read",
          "default_billing_period.write",
          "students.read",
          "inventory_items.read",
          "purchases.read",
          "donations.read",
        ],
      },
      {
        id: REGISTRAR_ROLE_ID,
        name: "Registrar",
        status: "active",
        privilegeNames: [
          ...pickResources(schoolResources),
          ...pickResources(billingResources),
          "active_period.read",
          "default_billing_period.read",
        ],
      },
      {
        id: STORE_CLERK_ROLE_ID,
        name: "Store Clerk",
        status: "active",
        privilegeNames: [
          ...pickResources(
            ["inventory_items", "purchases", "donations", "suppliers", "categories", "uoms"],
            ["read", "write"]
          ),
          "store_transfers.read",
          "store_transfers.write",
          "stores.read",
          "inventory_receive_acknowledgements.write",
          "student_collections.read",
          "staff_collections.read",
        ],
      },
      {
        id: "a2000001-0002-4002-8002-000000000007",
        name: "Viewer",
        status: "active",
        privilegeNames: allReadPrivilegeNames,
      },
      {
        id: STUDENT_ROLE_ID,
        name: "Student",
        status: "active",
        privilegeNames: [
          "active_period.read",
          "sessions.read",
          "terms.read",
          "school_classes.read",
          "sub_classes.read",
        ],
      },
      {
        id: PARENT_ROLE_ID,
        name: "Parent",
        status: "active",
        privilegeNames: ["active_period.read", "students.read", "sessions.read", "terms.read"],
      },
      {
        id: CLASS_TEACHER_ROLE_ID,
        name: "Class Teacher",
        status: "active",
        privilegeNames: teacherBasePrivileges,
      },
      {
        id: SUBJECT_TEACHER_ROLE_ID,
        name: "Subject Teacher",
        status: "active",
        privilegeNames: teacherBasePrivileges,
      },
    ];

    const superAdminRoleId = appRoles[0].id;

    for (const role of appRoles) {
      const privilegeIds = resolvePrivilegeIds(role.privilegeNames);
      const { privilegeNames: _privilegeNames, ...roleData } = role;

      await prisma.appRole.upsert({
        where: { id: role.id },
        update: {
          name: roleData.name,
          status: roleData.status,
        },
        create: {
          ...roleData,
        },
      });

      await prisma.appRoleToPrivilege.deleteMany({ where: { appRoleId: role.id } });
      if (privilegeIds.length > 0) {
        await prisma.appRoleToPrivilege.createMany({
          data: privilegeIds.map((privilegeId) => ({
            appRoleId: role.id,
            privilegeId,
          })),
          skipDuplicates: true,
        });
      }
    }
    console.log(`   ✓ ${appRoles.length} application roles`);

    // Assign Super Admin application role to seeded admin users
    const adminUserIds = [
      "77e7a005-b0a5-4a6e-897c-f827333924d4",
      "39fc583a-a071-49f3-980f-8932fa6cb6c9",
    ];
    for (const userId of adminUserIds) {
      await prisma.userRole.upsert({
        where: { userId },
        update: { roleId: superAdminRoleId },
        create: { userId, roleId: superAdminRoleId },
      });
    }
    console.log(`   ✓ ${adminUserIds.length} admin users linked to Super Admin role`);

    // Navigation menus (flattened from frontend sidebarNavSections)
    console.log("📋 Seeding menus...");
    const sidebarMenus = [
      // Main
      { route: "/", caption: "Dashboard" },
      { route: "/project-disbursement", caption: "Project disbursement" },
      { route: "/facility-item-distribution", caption: "Facility item distribution" },
      { route: "/sales", caption: "Sales" },
      { route: "/suppliers", caption: "Suppliers" },
      { route: "/projects", caption: "Projects" },
      { route: "/facility-setup", caption: "Facility/unit setup" },
      { route: "/store-transfers", caption: "Store transfers" },
      // School Management
      { route: "/classes", caption: "Classes & sub-classes" },
      { route: "/assignment-setup", caption: "Assignments setup" },
      { route: "/assessment-score-entry", caption: "Assessment score entry" },
      { route: "/subject-setup", caption: "subject Setup" },
      { route: "/students", caption: "Students" },
      { route: "/staff", caption: "Staff" },
      { route: "/sessions", caption: "Sessions & terms" },
      { route: "/student-collections", caption: "Student Collections" },
      { route: "/staff-collections", caption: "Staff Collections" },
      { route: "/my-assignments", caption: "My Assignments" },
      { route: "/my-results", caption: "My results" },
      { route: "/student-results", caption: "Student results" },

      // Analytics

      { route: "/reports/inventory", caption: "Inventory reports" },

      { route: "/reports/student-billing-summary", caption: "Student billing summary" },
      { route: "/reports/student-balances", caption: "Student balances" },
      { route: "/account/posting", caption: "Account Posting" },
      { route: "/reports/accounting", caption: "Account Report & Analytics" },
      // Accounting
      { route: "/account-settings", caption: "Account settings" },
      // { route: "/administrative-expense-components", caption: "Administrative expense components" },
      { route: "/administrative-expenses", caption: "Administrative expenses" },
      { route: "/billing", caption: "Student Billings" },
      { route: "/reports/student-accounts", caption: "Student financial reports" },
      // Setup
      { route: "/inventory", caption: "Inventory" },
      { route: "/access-management", caption: "Access management" },
      { route: "/menus", caption: "Menu management" },

      // payroll
      { route: "/payroll/salary-components", caption: "Salary components" },
      { route: "/payroll/salary-charts", caption: "Salary charts" },
      { route: "/payroll/report", caption: "Payroll reports" },
      // parent
      { route: "/parent/assignments", caption: "Parent assignments" },
      { route: "/parent/results", caption: "Results" },
      { route: "/parent/billing", caption: "Billing" },
      // attendance
      { route: "/student-attendance", caption: "Attendance records" },
      // transportation
      { route: "/transportation-settings", caption: "Transportation settings" },
      { route: "/student-transports", caption: "Student transports" },
      { route: "/vehicle-trips", caption: "Vehicle trips" },
    ];

    for (const item of sidebarMenus) {
      await prisma.menu.upsert({
        where: { route: item.route },
        update: { caption: item.caption, status: "Active" },
        create: { route: item.route, caption: item.caption, status: "Active" },
      });
    }
    console.log(`   ✓ ${sidebarMenus.length} menus`);

    const groupedMenus = [
      {
        id: MENU_SCHOOL_MANAGEMENT_ID,
        route: "/school-management",
        caption: "School Management",
      },
      {
        id: MENU_INVENTORY_OPS_ID,
        route: "/inventory-operations",
        caption: "Inventory Operations",
      },
      {
        id: MENU_INVENTORY_INFLOWS_ID,
        route: "/inventory-inflows",
        caption: "Inventory inflows",
      },
      {
        id: MENU_INVENTORY_OUTFLOWS_ID,
        route: "/inventory-outflows",
        caption: "Inventory outflows",
      },
      {
        id: MENU_ASSESSMENT_SETUP_ID,
        route: "/assessment-setup",
        caption: "Assessment setup",
      },
      {
        id: MENU_INVENTORY_REPORTS_ID,
        route: "/reports/inventory",
        caption: "Inventory reports",
      },
      {
        id: MENU_STUDENT_BILLINGS_ID,
        route: "/billing",
        caption: "Student Billings",
      },
      {
        id: MENU_STUDENT_FINANCIAL_REPORTS_ID,
        route: "/reports/student-accounts",
        caption: "Student financial reports",
      },
      {
        id: MENU_ACCOUNT_SETTINGS_ID,
        route: "/account-settings",
        caption: "Account settings",
      },
      {
        id: MENU_ACCOUNTING_REPORTS_ID,
        route: "/reports/accounting",
        caption: "Account Report & Analytics",
      },
      {
        id: MENU_ACCOUNT_POSTING_ID,
        route: "/account/posting",
        caption: "Account Posting",
      },
      {
        id: MENU_FACILITY_SETUP_ID,
        route: "/facility-setup",
        caption: "Facility/unit setup",
      },
      {
        id: MENU_ACCESS_MANAGEMENT_ID,
        route: "/access-management",
        caption: "Access management",
      },
    ];

    for (const menu of groupedMenus) {
      await prisma.menu.upsert({
        where: { route: menu.route },
        update: { caption: menu.caption, status: "Active" },
        create: { ...menu, status: "Active" },
      });
    }

    const groupedMenuIdBySeedId = Object.fromEntries(
      (
        await prisma.menu.findMany({
          where: { route: { in: groupedMenus.map((menu) => menu.route) } },
          select: { id: true, route: true },
        })
      ).map((row) => {
        const seedMenu = groupedMenus.find((menu) => menu.route === row.route);
        return [seedMenu.id, row.id];
      })
    );

    const menuChildren = [
      {
        id: "mc000001-0000-4000-8000-000000000001",
        menuId: MENU_SCHOOL_MANAGEMENT_ID,
        name: "Academic setup",
        route: "#",
      },
      {
        id: "mc000001-0000-4000-8000-000000000002",
        menuId: MENU_SCHOOL_MANAGEMENT_ID,
        name: "Classes & sub-classes",
        route: "/classes",
      },
      {
        id: "mc000001-0000-4000-8000-000000000003",
        menuId: MENU_SCHOOL_MANAGEMENT_ID,
        name: "Students",
        route: "/students",
      },
      {
        id: "mc000001-0000-4000-8000-000000000004",
        menuId: MENU_SCHOOL_MANAGEMENT_ID,
        name: "Staff",
        route: "/staff",
      },
      {
        id: "mc000001-0000-4000-8000-000000000005",
        menuId: MENU_SCHOOL_MANAGEMENT_ID,
        name: "Sessions & terms",
        route: "/sessions",
      },
      {
        id: "mc000001-0000-4000-8000-000000000006",
        menuId: MENU_SCHOOL_MANAGEMENT_ID,
        name: "Assessment setup",
        route: "/assessment-setup",
      },
      {
        id: "mc000001-0000-4000-8000-000000000007",
        menuId: MENU_SCHOOL_MANAGEMENT_ID,
        name: "Assignments setup",
        route: "/assignment-setup",
      },
      {
        id: "mc000001-0000-4000-8000-000000000008",
        menuId: MENU_SCHOOL_MANAGEMENT_ID,
        name: "Subject setup",
        route: "/subject-setup",
      },
      {
        id: "mc000001-0000-4000-8000-000000000009",
        menuId: MENU_INVENTORY_OPS_ID,
        name: "Stock movement",
        route: "#",
      },
      {
        id: "mc000001-0000-4000-8000-00000000000a",
        menuId: MENU_INVENTORY_OPS_ID,
        name: "Purchases",
        route: "/purchases",
      },
      {
        id: "mc000001-0000-4000-8000-00000000000b",
        menuId: MENU_INVENTORY_OPS_ID,
        name: "Store transfers",
        route: "/store-transfers",
      },
      {
        id: "mc000001-0000-4000-8000-00000000000c",
        menuId: MENU_INVENTORY_OPS_ID,
        name: "Suppliers",
        route: "/suppliers",
      },
      {
        id: "mc000001-0000-4000-8000-00000000000d",
        menuId: MENU_INVENTORY_INFLOWS_ID,
        name: "Purchases",
        route: "/purchases",
      },
      {
        id: "mc000001-0000-4000-8000-00000000000e",
        menuId: MENU_INVENTORY_INFLOWS_ID,
        name: "Donations",
        route: "/donations",
      },
      {
        id: "mc000001-0000-4000-8000-00000000000f",
        menuId: MENU_INVENTORY_INFLOWS_ID,
        name: "Transfers",
        route: "/store-transfers",
      },
      {
        id: "mc000001-0000-4000-8000-000000000010",
        menuId: MENU_INVENTORY_OUTFLOWS_ID,
        name: "Students",
        route: "/outflow-students",
      },
      {
        id: "mc000001-0000-4000-8000-000000000011",
        menuId: MENU_INVENTORY_OUTFLOWS_ID,
        name: "Staff",
        route: "/outflow-staff",
      },
      {
        id: "mc000001-0000-4000-8000-000000000012",
        menuId: MENU_INVENTORY_OUTFLOWS_ID,
        name: "Projects",
        route: "/outflow-projects",
      },
      {
        id: "mc000001-0000-4000-8000-000000000013",
        menuId: MENU_INVENTORY_OUTFLOWS_ID,
        name: "Facility",
        route: "/outflow-facility",
      },
      {
        id: "mc000001-0000-4000-8000-000000000014",
        menuId: MENU_INVENTORY_OUTFLOWS_ID,
        name: "Sales",
        route: "/outflow-sales",
      },
      {
        id: "mc000001-0000-4000-8000-000000000015",
        menuId: MENU_ASSESSMENT_SETUP_ID,
        name: "Assessment Templates",
        route: "/assessment-templates",
      },
      {
        id: "mc000001-0000-4000-8000-000000000016",
        menuId: MENU_ASSESSMENT_SETUP_ID,
        name: "Class Templates",
        route: "/class-assessment-templates",
      },
      {
        id: "mc000001-0000-4000-8000-000000000017",
        menuId: MENU_ASSESSMENT_SETUP_ID,
        name: "Assessment Grading",
        route: "/grading-templates",
      },
      {
        id: "mc000001-0000-4000-8000-000000000018",
        menuId: MENU_ASSESSMENT_SETUP_ID,
        name: "Behavioural Templates",
        route: "/behavioural-assessment-templates",
      },
      {
        id: "mc000001-0000-4000-8000-000000000019",
        menuId: MENU_ASSESSMENT_SETUP_ID,
        name: "Behavioural Grading",
        route: "/behavioural-grading-templates",
      },
      {
        id: "mc000001-0000-4000-8000-00000000001a",
        menuId: MENU_INVENTORY_REPORTS_ID,
        name: "Student collections summary",
        route: "/reports/student-inventory",
      },
      {
        id: "mc000001-0000-4000-8000-00000000001b",
        menuId: MENU_INVENTORY_REPORTS_ID,
        name: "Store inventory matrix",
        route: "/reports/store-inventory-balance-matrix",
      },
      {
        id: "mc000001-0000-4000-8000-00000000001c",
        menuId: MENU_INVENTORY_REPORTS_ID,
        name: "Student items received",
        route: "/reports/student-items-received",
      },
      {
        id: "mc000001-0000-4000-8000-00000000001d",
        menuId: MENU_INVENTORY_REPORTS_ID,
        name: "Item balance report",
        route: "/reports/item-balances",
      },
      {
        id: "mc000001-0000-4000-8000-00000000001e",
        menuId: MENU_INVENTORY_REPORTS_ID,
        name: "Item transaction log",
        route: "/reports/item-transaction-log",
      },
      {
        id: "mc000001-0000-4000-8000-00000000001f",
        menuId: MENU_STUDENT_BILLINGS_ID,
        name: "Billing items",
        route: "/billing-items",
      },
      {
        id: "mc000001-0000-4000-8000-0000000004d",
        menuId: MENU_STUDENT_BILLINGS_ID,
        name: "Student billing",
        route: "/student-billing",
      },
      {
        id: "mc000001-0000-4000-8000-000000000021",
        menuId: MENU_STUDENT_BILLINGS_ID,
        name: "Class default billing",
        route: "/class-default-billings",
      },
      {
        id: "mc000001-0000-4000-8000-000000000022",
        menuId: MENU_STUDENT_BILLINGS_ID,
        name: "Student journal transfers",
        route: "/student-journal-transfers",
      },
      {
        id: "mc000001-0000-4000-8000-000000000023",
        menuId: MENU_STUDENT_FINANCIAL_REPORTS_ID,
        name: "Student billing summary",
        route: "/reports/student-billing-summary",
      },
      {
        id: "mc000001-0000-4000-8000-000000000024",
        menuId: MENU_STUDENT_FINANCIAL_REPORTS_ID,
        name: "Student balances",
        route: "/reports/student-balances",
      },
      {
        id: "mc000001-0000-4000-8000-000000000025",
        menuId: MENU_STUDENT_FINANCIAL_REPORTS_ID,
        name: "Student transaction log",
        route: "/reports/student-transaction-log",
      },
      {
        id: "mc000001-0000-4000-8000-000000000026",
        menuId: MENU_ACCOUNT_SETTINGS_ID,
        name: "Account subheads",
        route: "/account-subheads",
      },
      {
        id: "mc000001-0000-4000-8000-000000000027",
        menuId: MENU_ACCOUNT_SETTINGS_ID,
        name: "Account chart setup",
        route: "/account-chart-setup",
      },
      {
        id: "mc000001-0000-4000-8000-000000000028",
        menuId: MENU_ACCOUNT_SETTINGS_ID,
        name: "Cashiers",
        route: "/cashiers",
      },
      {
        id: "mc000001-0000-4000-8000-000000000029",
        menuId: MENU_ACCOUNT_SETTINGS_ID,
        name: "Cashier setup",
        route: "/cashier-setup",
      },
      {
        id: "mc000001-0000-4000-8000-00000000002a",
        menuId: MENU_ACCOUNT_SETTINGS_ID,
        name: "Default settings",
        route: "/default-settings",
      },
      {
        id: "mc000001-0000-4000-8000-00000000002b",
        menuId: MENU_ACCOUNT_SETTINGS_ID,
        name: "Default subhead settings",
        route: "/default-subhead-settings",
      },
      {
        id: "mc000001-0000-4000-8000-00000000002c",
        menuId: MENU_ACCOUNT_SETTINGS_ID,
        name: "Default account settings",
        route: "/default-account-settings",
      },
      {
        id: "mc000001-0000-4000-8000-000000000020",
        menuId: MENU_ACCOUNT_SETTINGS_ID,
        name: "Administrative expenses",
        route: "/administrative-expenses",
      },
      {
        id: "mc000001-0000-4000-8000-00000000002d",
        menuId: MENU_ACCOUNTING_REPORTS_ID,
        name: "Staff balances",
        route: "/reports/staff-balances",
      },
      {
        id: "mc000001-0000-4000-8000-00000000002e",
        menuId: MENU_ACCOUNTING_REPORTS_ID,
        name: "Staff transaction log",
        route: "/reports/staff-transaction-log",
      },
      {
        id: "mc000001-0000-4000-8000-00000000002f",
        menuId: MENU_ACCOUNTING_REPORTS_ID,
        name: "Account statement",
        route: "/reports/account-statement",
      },
      {
        id: "mc000001-0000-4000-8000-000000000030",
        menuId: MENU_ACCOUNTING_REPORTS_ID,
        name: "Trial balance",
        route: "/reports/trial-balance",
      },
      {
        id: "mc000001-0000-4000-8000-000000000031",
        menuId: MENU_ACCOUNTING_REPORTS_ID,
        name: "Balance sheet",
        route: "/reports/balance-sheet",
      },
      {
        id: "mc000001-0000-4000-8000-000000000032",
        menuId: MENU_ACCOUNTING_REPORTS_ID,
        name: "Profit & loss",
        route: "/reports/profit-and-loss",
      },
      {
        id: "mc000001-0000-4000-8000-000000000033",
        menuId: MENU_ACCOUNT_POSTING_ID,
        name: "Staff journal transfers",
        route: "/staff-journal-transfers",
      },
      {
        id: "mc000001-0000-4000-8000-000000000034",
        menuId: MENU_ACCOUNT_POSTING_ID,
        name: "Journal transfers",
        route: "/journal-transfers",
      },
      {
        id: "mc000001-0000-4000-8000-000000000035",
        menuId: MENU_ACCOUNT_POSTING_ID,
        name: "Administrative expenses",
        route: "/administrative-expenses-posting",
      },
      {
        id: "mc000001-0000-4000-8000-000000000036",
        menuId: MENU_FACILITY_SETUP_ID,
        name: "Projects setup",
        route: "/projects-setup",
      },
      {
        id: "mc000001-0000-4000-8000-000000000037",
        menuId: MENU_FACILITY_SETUP_ID,
        name: "Facility unit setup",
        route: "/facility-unit-setup",
      },
      {
        id: "mc000001-0000-4000-8000-000000000038",
        menuId: MENU_FACILITY_SETUP_ID,
        name: "Store setup",
        route: "/store-setup",
      },
      {
        id: "mc000001-0000-4000-8000-000000000039",
        menuId: MENU_ACCESS_MANAGEMENT_ID,
        name: "Users setup",
        route: "/users-setup",
      },
      {
        id: "mc000001-0000-4000-8000-00000000003a",
        menuId: MENU_ACCESS_MANAGEMENT_ID,
        name: "Role management",
        route: "/app-roles",
      },
    ];

    for (const child of menuChildren) {
      const menuId = groupedMenuIdBySeedId[child.menuId] ?? child.menuId;
      await prisma.menuChildren.upsert({
        where: { id: child.id },
        update: {
          menuId,
          name: child.name,
          route: child.route,
          status: "Active",
        },
        create: { ...child, menuId, status: "Active" },
      });
    }
    console.log(`   ✓ ${groupedMenus.length} grouped menus, ${menuChildren.length} menu children`);

    const systemAdminRoleId = appRoles[1].id;
    const allMenus = await prisma.menu.findMany({ select: { id: true } });
    for (const menu of allMenus) {
      for (const roleId of [superAdminRoleId, systemAdminRoleId]) {
        const existing = await prisma.roleMenu.findFirst({
          where: { roleId, menuId: menu.id },
        });
        if (!existing) {
          await prisma.roleMenu.create({ data: { roleId, menuId: menu.id } });
        }
      }
    }
    console.log(`   ✓ menus linked to Super Admin and System Administrator roles`);

    const studentMenuRoutes = ["/my-assignments", "/my-results"];
    for (const route of studentMenuRoutes) {
      const studentMenu = await prisma.menu.findUnique({
        where: { route },
        select: { id: true },
      });
      if (studentMenu) {
        await ensureRoleMenu(STUDENT_ROLE_ID, studentMenu.id);
      }
    }
    console.log("   ✓ Student menus linked to Student role");

    const parentMenuRoutes = [
      "/parent/assignments",
      "/parent/results",
      "/parent/billing",
    ];
    for (const route of parentMenuRoutes) {
      const parentMenu = await prisma.menu.findUnique({
        where: { route },
        select: { id: true },
      });
      if (parentMenu) {
        await ensureRoleMenu(PARENT_ROLE_ID, parentMenu.id);
      }
    }
    console.log("   ✓ Parent menus linked to Parent role");

    for (const roleId of [CLASS_TEACHER_ROLE_ID, SUBJECT_TEACHER_ROLE_ID]) {
      const roleMenuId = await ensureRoleMenu(roleId, MENU_SCHOOL_MANAGEMENT_ID);
      await ensureRoleMenuChild(roleMenuId, "mc000001-0000-4000-8000-000000000007");
    }
    console.log(
      "   ✓ School Management parent menu linked to Class Teacher and Subject Teacher with Assignments setup child only"
    );

    const studentResultsMenu = await prisma.menu.findUnique({
      where: { route: "/student-results" },
      select: { id: true },
    });
    if (studentResultsMenu) {
      await ensureRoleMenu(CLASS_TEACHER_ROLE_ID, studentResultsMenu.id);
    }
    console.log("   ✓ Student results menu linked to Class Teacher role");

    const registrarRoleMenuId = await ensureRoleMenu(REGISTRAR_ROLE_ID, MENU_SCHOOL_MANAGEMENT_ID);
    for (const childId of [
      "mc000001-0000-4000-8000-000000000002",
      "mc000001-0000-4000-8000-000000000003",
      "mc000001-0000-4000-8000-000000000004",
      "mc000001-0000-4000-8000-000000000005",
    ]) {
      await ensureRoleMenuChild(registrarRoleMenuId, childId);
    }

    const storeClerkRoleMenuId = await ensureRoleMenu(STORE_CLERK_ROLE_ID, MENU_INVENTORY_OPS_ID);
    for (const childId of [
      "mc000001-0000-4000-8000-00000000000a",
      "mc000001-0000-4000-8000-00000000000b",
      "mc000001-0000-4000-8000-00000000000c",
    ]) {
      await ensureRoleMenuChild(storeClerkRoleMenuId, childId);
    }
    console.log("   ✓ Registrar and Store Clerk role menu children seeded");

    // Chart of accounts — AccountGroup & AccountHead (fixed IDs for idempotent re-seeding)
    console.log("📒 Seeding account groups and account heads...");

    const accountGroups = [
      { id: 1, name: "Assets", rank: 1 },
      { id: 2, name: "Liabilities", rank: 2 },
      { id: 3, name: "Equity", rank: 3 },
      { id: 4, name: "Expenses", rank: 4 },
      { id: 5, name: "Incomes", rank: 5 },
    ];

    for (const g of accountGroups) {
      await prisma.accountGroup.upsert({
        where: { id: g.id },
        update: { name: g.name, rank: g.rank },
        create: g,
      });
    }

    const accountHeads = [
      { id: 1, groupId: 1, code: "11", name: "Current Assets", rank: 1 },
      { id: 2, groupId: 1, code: "12", name: "Fixed Assets", rank: 2 },
      { id: 3, groupId: 2, code: "21", name: "Current Liabilities", rank: 3 },
      { id: 4, groupId: 2, code: "22", name: "Long-term Liabilities", rank: 4 },
      { id: 5, groupId: 3, code: "31", name: "Equity/Capital", rank: 5 },
      { id: 6, groupId: 4, code: "41", name: "Expenses", rank: 6 },
      { id: 7, groupId: 5, code: "51", name: "Income", rank: 7 },
    ];

    for (const h of accountHeads) {
      await prisma.accountHead.upsert({
        where: { id: h.id },
        update: {
          groupId: h.groupId,
          code: h.code,
          name: h.name,
          rank: h.rank,
        },
        create: h,
      });
    }

    console.log(
      `   ✓ ${accountGroups.length} account groups, ${accountHeads.length} account heads`
    );

    // Account subheads (under seeded groups / heads)
    console.log("📑 Seeding account subheads...");
    const accountSubheads = [
      // Assets — Current Assets (head 1)
      {
        id: 1,
        groupId: 1,
        headId: 1,
        code: "1101",
        name: "Cash and Bank",
        accountType: "Cash",
        status: "Active",
        rank: 1,
      },
      {
        id: 2,
        groupId: 1,
        headId: 1,
        code: "1102",
        name: "Accounts Receivable",
        accountType: "NonCash",
        status: "Active",
        rank: 2,
      },
      {
        id: 3,
        groupId: 1,
        headId: 1,
        code: "1103",
        name: "Inventory",
        status: "Active",
        rank: 3,
        accountType: "NonCash",
      },
      // Assets — Fixed Assets (head 2)
      {
        id: 4,
        groupId: 1,
        headId: 2,
        code: "1201",
        name: "Furniture and Fixtures",
        accountType: "NonCash",
        status: "Active",
        rank: 4,
      },
      {
        id: 5,
        groupId: 1,
        headId: 2,
        code: "1202",
        name: "ICT Equipment",
        accountType: "NonCash",
        status: "Active",
        rank: 5,
      },
      // Liabilities — Current (head 3)
      {
        id: 6,
        groupId: 2,
        headId: 3,
        code: "2101",
        name: "Accounts Payable",
        accountType: "NonCash",
        status: "Active",
        rank: 6,
      },
      {
        id: 7,
        groupId: 2,
        headId: 3,
        code: "2102",
        name: "Student Deposits",
        accountType: "NonCash",
        status: "Active",
        rank: 7,
      },
      // Liabilities — Long-term (head 4)
      {
        id: 8,
        groupId: 2,
        headId: 4,
        code: "2201",
        name: "Long-term Loans",
        accountType: "NonCash",
        status: "Active",
        rank: 8,
      },
      // Equity (head 5)
      {
        id: 9,
        groupId: 3,
        headId: 5,
        code: "3101",
        name: "Capital",
        accountType: "NonCash",
        status: "Active",
        rank: 9,
      },
      {
        id: 10,
        groupId: 3,
        headId: 5,
        code: "3102",
        name: "Retained Earnings",
        accountType: "NonCash",
        status: "Active",
        rank: 10,
      },
      // Expenses (head 6)
      {
        id: 11,
        groupId: 4,
        headId: 6,
        code: "4101",
        name: "Salaries and Wages",
        accountType: "NonCash",
        status: "Active",
        rank: 11,
      },
      {
        id: 12,
        groupId: 4,
        headId: 6,
        code: "4102",
        name: "Consumable Expenses",
        accountType: "NonCash",
        status: "Active",
        rank: 12,
      },
      {
        id: 13,
        groupId: 4,
        headId: 6,
        code: "4103",
        name: "Utilities",
        accountType: "NonCash",
        status: "Active",
        rank: 13,
      },
      {
        id: 14,
        groupId: 4,
        headId: 6,
        code: "4104",
        name: "Maintenance and Repairs",
        accountType: "NonCash",
        status: "Active",
        rank: 14,
      },
      {
        id: 15,
        groupId: 4,
        headId: 6,
        code: "4105",
        name: "Discounts and Concessions",
        accountType: "NonCash",
        status: "Active",
        rank: 15,
      },
      // Income (head 7)
      {
        id: 16,
        groupId: 5,
        headId: 7,
        code: "5101",
        name: "Tuition and Fees",
        accountType: "NonCash",
        status: "Active",
        rank: 16,
      },
      {
        id: 17,
        groupId: 5,
        headId: 7,
        code: "5102",
        name: "Other Income",
        accountType: "NonCash",
        status: "Active",
        rank: 17,
      },
      {
        id: 18,
        groupId: 5,
        headId: 7,
        code: "5103",
        name: "Student Collections",
        accountType: "NonCash",
        status: "Active",
        rank: 18,
      },
      // Liabilities — payroll (head 3)
      {
        id: 19,
        groupId: 2,
        headId: 3,
        code: "2103",
        name: "Payroll Liabilities",
        accountType: "NonCash",
        status: "Active",
        rank: 19,
      },
    ];

    for (const s of accountSubheads) {
      await prisma.accountSubhead.upsert({
        where: { id: s.id },
        update: {
          groupId: s.groupId,
          headId: s.headId,
          code: s.code,
          name: s.name,
          status: s.status,
          rank: s.rank,
        },
        create: {
          ...s,
          afs: null,
          paymentMethod: null,
        },
      });
    }
    console.log(`   ✓ ${accountSubheads.length} account subheads`);

    // Account charts (ledger accounts under subheads)
    console.log("📊 Seeding account charts...");
    const accountCharts = [
      {
        id: 1,
        groupId: 1,
        headId: 1,
        subheadId: 1,
        accountNo: "1101001",
        accountRef: "CASH-PETTY",
        accountDescription: "Petty Cash",
        status: "Active",
        rank: 1,
      },
      {
        id: 2,
        groupId: 1,
        headId: 1,
        subheadId: 1,
        accountNo: "1101002",
        accountRef: "CASH-BANK",
        accountDescription: "Main Bank Account",
        status: "Active",
        rank: 2,
      },
      {
        id: 3,
        groupId: 1,
        headId: 1,
        subheadId: 2,
        accountNo: "1102001",
        accountRef: "AR-STUDENT",
        accountDescription: "Student Accounts Receivable",
        status: "Active",
        rank: 3,
      },
      {
        id: 4,
        groupId: 1,
        headId: 1,
        subheadId: 3,
        accountNo: "1103001",
        accountRef: "INV-GENERAL",
        accountDescription: "Inventory - General Stock",
        status: "Active",
        rank: 4,
      },
      {
        id: 5,
        groupId: 1,
        headId: 2,
        subheadId: 4,
        accountNo: "1201001",
        accountRef: "FA-FURN",
        accountDescription: "Furniture and Fixtures",
        status: "Active",
        rank: 5,
      },
      {
        id: 6,
        groupId: 1,
        headId: 2,
        subheadId: 5,
        accountNo: "1202001",
        accountRef: "FA-ICT",
        accountDescription: "ICT Equipment",
        status: "Active",
        rank: 6,
      },
      {
        id: 7,
        groupId: 2,
        headId: 3,
        subheadId: 6,
        accountNo: "2101001",
        accountRef: "AP-TRADE",
        accountDescription: "Trade Payables",
        status: "Active",
        rank: 7,
      },
      {
        id: 8,
        groupId: 2,
        headId: 3,
        subheadId: 7,
        accountNo: "2102001",
        accountRef: "DEP-STUDENT",
        accountDescription: "Student Deposits Payable",
        status: "Active",
        rank: 8,
      },
      {
        id: 9,
        groupId: 2,
        headId: 4,
        subheadId: 8,
        accountNo: "2201001",
        accountRef: "LT-LOAN",
        accountDescription: "Long-term Bank Loan",
        status: "Active",
        rank: 9,
      },
      {
        id: 10,
        groupId: 3,
        headId: 5,
        subheadId: 9,
        accountNo: "3101001",
        accountRef: "EQ-CAP",
        accountDescription: "Capital Account",
        status: "Active",
        rank: 10,
      },
      {
        id: 11,
        groupId: 3,
        headId: 5,
        subheadId: 10,
        accountNo: "3102001",
        accountRef: "EQ-RET",
        accountDescription: "Retained Earnings",
        status: "Active",
        rank: 11,
      },
      {
        id: 12,
        groupId: 4,
        headId: 6,
        subheadId: 11,
        accountNo: "4101001",
        accountRef: "EXP-SAL",
        accountDescription: "Staff Salaries",
        status: "Active",
        rank: 12,
      },
      {
        id: 13,
        groupId: 4,
        headId: 6,
        subheadId: 12,
        accountNo: "4102001",
        accountRef: "EXP-CONS",
        accountDescription: "Consumable Expenses",
        status: "Active",
        rank: 13,
      },
      {
        id: 14,
        groupId: 4,
        headId: 6,
        subheadId: 13,
        accountNo: "4103001",
        accountRef: "EXP-UTIL",
        accountDescription: "Utilities Expense",
        status: "Active",
        rank: 14,
      },
      {
        id: 15,
        groupId: 4,
        headId: 6,
        subheadId: 14,
        accountNo: "4104001",
        accountRef: "EXP-MAINT",
        accountDescription: "Maintenance Expense",
        status: "Active",
        rank: 15,
      },
      {
        id: 16,
        groupId: 4,
        headId: 6,
        subheadId: 15,
        accountNo: "4105001",
        accountRef: "EXP-DISC",
        accountDescription: "Discounts and Concessions",
        status: "Active",
        rank: 16,
      },
      {
        id: 17,
        groupId: 5,
        headId: 7,
        subheadId: 16,
        accountNo: "5101001",
        accountRef: "INC-TUIT",
        accountDescription: "Tuition Income",
        status: "Active",
        rank: 17,
      },
      {
        id: 18,
        groupId: 5,
        headId: 7,
        subheadId: 17,
        accountNo: "5102001",
        accountRef: "INC-OTHER",
        accountDescription: "Other Operating Income",
        status: "Active",
        rank: 18,
      },
      {
        id: 19,
        groupId: 5,
        headId: 7,
        subheadId: 18,
        accountNo: "5103001",
        accountRef: "INC-COLL",
        accountDescription: "Student Fee Collections",
        status: "Active",
        rank: 19,
      },
      // Payroll expenses (subhead 11 — Salaries and Wages)
      {
        id: 20,
        groupId: 4,
        headId: 6,
        subheadId: 11,
        accountNo: "4101002",
        accountRef: "EXP-SALARY",
        accountDescription: "Salary Expense",
        status: "Active",
        rank: 20,
      },
      {
        id: 21,
        groupId: 4,
        headId: 6,
        subheadId: 11,
        accountNo: "4101003",
        accountRef: "EXP-HOUSING",
        accountDescription: "Housing Allowance Expense",
        status: "Active",
        rank: 21,
      },
      {
        id: 22,
        groupId: 4,
        headId: 6,
        subheadId: 11,
        accountNo: "4101004",
        accountRef: "EXP-TRANSPORT",
        accountDescription: "Transport Allowance Expense",
        status: "Active",
        rank: 22,
      },
      // Payroll liabilities (subhead 19)
      {
        id: 23,
        groupId: 2,
        headId: 3,
        subheadId: 19,
        accountNo: "2103001",
        accountRef: "AP-SALARIES",
        accountDescription: "Salaries Payable",
        status: "Active",
        rank: 23,
      },
      {
        id: 24,
        groupId: 2,
        headId: 3,
        subheadId: 19,
        accountNo: "2103002",
        accountRef: "AP-PAYE",
        accountDescription: "PAYE Tax Payable",
        status: "Active",
        rank: 24,
      },
      {
        id: 25,
        groupId: 2,
        headId: 3,
        subheadId: 19,
        accountNo: "2103003",
        accountRef: "AP-PEN-EMP",
        accountDescription: "Employee Pension Payable",
        status: "Active",
        rank: 25,
      },
      {
        id: 26,
        groupId: 2,
        headId: 3,
        subheadId: 19,
        accountNo: "2103004",
        accountRef: "AP-PEN-ER",
        accountDescription: "Employer Pension Payable",
        status: "Active",
        rank: 26,
      },
      {
        id: 27,
        groupId: 2,
        headId: 3,
        subheadId: 19,
        accountNo: "2103005",
        accountRef: "AP-NHF",
        accountDescription: "NHF Payable",
        status: "Active",
        rank: 27,
      },
      // Staff loan receivable (subhead 2 — Accounts Receivable)
      {
        id: 28,
        groupId: 1,
        headId: 1,
        subheadId: 2,
        accountNo: "1102002",
        accountRef: "AR-STAFF-LOAN",
        accountDescription: "Staff Loan Receivable",
        status: "Active",
        rank: 28,
      },
      // Bank (subhead 1 — Cash and Bank)
      {
        id: 29,
        groupId: 1,
        headId: 1,
        subheadId: 1,
        accountNo: "1101003",
        accountRef: "BANK-ACCOUNT",
        accountDescription: "Bank Account",
        status: "Active",
        rank: 29,
      },
      // Category inventory asset ledgers (subhead 3 — Inventory)
      {
        id: 30,
        groupId: 1,
        headId: 1,
        subheadId: 3,
        accountNo: "1103002",
        accountRef: "INV-OFFICE",
        accountDescription: "Inventory - Office Supplies",
        status: "Active",
        rank: 30,
      },
      {
        id: 31,
        groupId: 1,
        headId: 1,
        subheadId: 3,
        accountNo: "1103003",
        accountRef: "INV-STATIONERY",
        accountDescription: "Inventory - Stationery",
        status: "Active",
        rank: 31,
      },
      {
        id: 32,
        groupId: 1,
        headId: 1,
        subheadId: 3,
        accountNo: "1103004",
        accountRef: "INV-CLEANING",
        accountDescription: "Inventory - Cleaning Supplies",
        status: "Active",
        rank: 32,
      },
      {
        id: 33,
        groupId: 1,
        headId: 1,
        subheadId: 3,
        accountNo: "1103005",
        accountRef: "INV-LAB",
        accountDescription: "Inventory - Laboratory Supplies",
        status: "Active",
        rank: 33,
      },
      {
        id: 34,
        groupId: 1,
        headId: 1,
        subheadId: 3,
        accountNo: "1103006",
        accountRef: "INV-SPORTS",
        accountDescription: "Inventory - Sports and PE Equipment",
        status: "Active",
        rank: 34,
      },
      {
        id: 35,
        groupId: 1,
        headId: 1,
        subheadId: 3,
        accountNo: "1103007",
        accountRef: "INV-MAINT",
        accountDescription: "Inventory - Building and Maintenance",
        status: "Active",
        rank: 35,
      },
      // Additional payroll expense ledgers (subhead 11)
      {
        id: 36,
        groupId: 4,
        headId: 6,
        subheadId: 11,
        accountNo: "4101005",
        accountRef: "EXP-MEAL",
        accountDescription: "Meal Allowance Expense",
        status: "Active",
        rank: 36,
      },
      {
        id: 37,
        groupId: 4,
        headId: 6,
        subheadId: 11,
        accountNo: "4101006",
        accountRef: "EXP-OVERTIME",
        accountDescription: "Overtime Expense",
        status: "Active",
        rank: 37,
      },
      {
        id: 38,
        groupId: 4,
        headId: 6,
        subheadId: 11,
        accountNo: "4101007",
        accountRef: "EXP-BONUS",
        accountDescription: "Bonus Expense",
        status: "Active",
        rank: 38,
      },
      {
        id: 39,
        groupId: 4,
        headId: 6,
        subheadId: 11,
        accountNo: "4101008",
        accountRef: "EXP-LEAVE",
        accountDescription: "Leave Allowance Expense",
        status: "Active",
        rank: 39,
      },
      // Additional payroll liability ledgers (subhead 19 — Accounts Payable)
      {
        id: 40,
        groupId: 2,
        headId: 3,
        subheadId: 19,
        accountNo: "2103006",
        accountRef: "AP-NSITF",
        accountDescription: "NSITF Payable",
        status: "Active",
        rank: 40,
      },
      {
        id: 41,
        groupId: 2,
        headId: 3,
        subheadId: 19,
        accountNo: "2103007",
        accountRef: "AP-ITF",
        accountDescription: "ITF Payable",
        status: "Active",
        rank: 41,
      },
      {
        id: 42,
        groupId: 2,
        headId: 3,
        subheadId: 19,
        accountNo: "2103008",
        accountRef: "AP-COOP",
        accountDescription: "Cooperative Payable",
        status: "Active",
        rank: 42,
      },
      {
        id: 43,
        groupId: 2,
        headId: 3,
        subheadId: 19,
        accountNo: "2103009",
        accountRef: "AP-UNION",
        accountDescription: "Union Dues Payable",
        status: "Active",
        rank: 43,
      },
      // Staff payroll receivables (subhead 2 — Accounts Receivable)
      {
        id: 44,
        groupId: 1,
        headId: 1,
        subheadId: 2,
        accountNo: "1102003",
        accountRef: "AR-STAFF-ADVANCE",
        accountDescription: "Staff Advance Salary Receivable",
        status: "Active",
        rank: 44,
      },
      {
        id: 45,
        groupId: 1,
        headId: 1,
        subheadId: 2,
        accountNo: "1102004",
        accountRef: "AR-STAFF",
        accountDescription: "Staff Accounts Receivable",
        status: "Active",
        rank: 45,
      },
      {
        id: 46,
        groupId: 5,
        headId: 7,
        subheadId: 17,
        accountNo: "5102002",
        accountRef: "INC-SALES",
        accountDescription: "Sales Income",
        status: "Active",
        rank: 46,
      },
      // Cashier tills (subhead 1 — Cash and Bank)
      {
        id: 47,
        groupId: 1,
        headId: 1,
        subheadId: 1,
        accountNo: "1101010",
        accountRef: "CASH-ADMIN",
        accountDescription: "Cashier Ledger - School Admin",
        status: "Active",
        rank: 47,
      },
      {
        id: 48,
        groupId: 1,
        headId: 1,
        subheadId: 1,
        accountNo: "1101011",
        accountRef: "CASH-ACCTS",
        accountDescription: "Cashier Ledger - Accounts Office",
        status: "Active",
        rank: 48,
      },
      {
        id: 49,
        groupId: 1,
        headId: 1,
        subheadId: 1,
        accountNo: "1101012",
        accountRef: "CASH-STORE",
        accountDescription: "Cashier Ledger - Store Sales",
        status: "Active",
        rank: 49,
      },
      {
        id: 50,
        groupId: 1,
        headId: 1,
        subheadId: 1,
        accountNo: "1101013",
        accountRef: "CASH-RECEPTION",
        accountDescription: "Cashier Ledger - Reception",
        status: "Active",
        rank: 50,
      },
    ];

    for (const c of accountCharts) {
      await prisma.accountChart.upsert({
        where: { id: c.id },
        update: {
          groupId: c.groupId,
          headId: c.headId,
          subheadId: c.subheadId,
          accountNo: c.accountNo,
          accountRef: c.accountRef,
          accountDescription: c.accountDescription,
          status: c.status,
          rank: c.rank,
        },
        create: c,
      });
    }
    console.log(`   ✓ ${accountCharts.length} account charts`);

    // Default subhead settings (linked to seeded subheads)
    console.log("⚙️ Seeding default subhead settings...");
    const defaultSubheadSettings = [
      {
        settingsId: "STUDENT_SUBHEAD",
        settings: "Default subhead for student-related postings",
        subheadId: 2,
      },
      {
        settingsId: "SUPPLIER_SUBHEAD",
        settings: "Default subhead for supplier-related postings",
        subheadId: 6,
      },
      {
        settingsId: "DISCOUNT_SUBHEAD",
        settings: "Default subhead for discount/concession postings",
        subheadId: 15,
      },
      {
        settingsId: "COLLECTION_SUBHEAD",
        settings: "Default subhead for collection postings",
        subheadId: 18,
      },
      {
        settingsId: "COMSUMABLE_EXPENSE_SUBHEAD",
        settings: "Default subhead for consumable expense postings",
        subheadId: 12,
      },
      {
        settingsId: "STAFF_SUBHEAD",
        settings: "Default subhead for staff receivable postings (mirrors student AR subhead)",
        subheadId: 2,
      },
    ];

    for (const s of defaultSubheadSettings) {
      await prisma.defaulSubheadSettings.upsert({
        where: { settingsId: s.settingsId },
        update: {
          settings: s.settings,
          subheadId: s.subheadId,
        },
        create: s,
      });
    }
    console.log(`   ✓ ${defaultSubheadSettings.length} default subhead settings`);

    // Default account settings (linked to seeded account charts)
    console.log("🏦 Seeding default account settings...");
    const defaultAccountSettings = [
      {
        settingsId: "STUDENT_ACCOUNT",
        settings: "Default account for student account receivable",
        accountId: 3,
      },
      {
        settingsId: "SUPPLIER_ACCOUNT",
        settings: "Default account for direct market Suppliers",
        accountId: 7,
      },
      {
        settingsId: "DISCOUNT_ACCOUNT",
        settings: "Default account for discount/concession postings",
        accountId: 16,
      },

      {
        settingsId: "COMSUMABLE_EXPENSE_ACCOUNT",
        settings: "Default account for consumable expense postings",
        accountId: 13,
      },
      {
        settingsId: "SALES_ACCOUNT",
        settings: "Default income account for inventory and sales postings",
        accountId: 46,
      },
      {
        settingsId: "STAFF_ACCOUNT",
        settings:
          "Default accounts receivable ledger for staff (sales, collections, and staff sub-ledger)",
        accountId: 45,
      },
      {
        settingsId: "STAFF_SALARY_PAYABLE_ACCOUNT",
        settings: "Default accounts payable ledger for net staff salary liability",
        accountId: 23,
      },
      {
        settingsId: "TRANSPORTATION_ACCOUNT",
        settings: "Default income account for student transportation subscriptions and billings",
        accountId: 18,
      },
      {
        settingsId: "ADMINISTRATIVE_ASSET_ACCOUNT",
        settings:
          "Default asset (cash) ledger administrative expenses are paid from — Cashier Ledger - School Admin",
        accountId: 47,
      },
    ];

    for (const s of defaultAccountSettings) {
      await prisma.defaultAccountSettings.upsert({
        where: { settingsId: s.settingsId },
        update: {
          settings: s.settings,
          accountId: s.accountId,
        },
        create: s,
      });
    }
    console.log(`   ✓ ${defaultAccountSettings.length} default account settings`);

    // Suppliers (+ ledger accounts under SUPPLIER_SUBHEAD / Accounts Payable)
    console.log("🏭 Seeding suppliers...");
    const adminUserId = "77e7a005-b0a5-4a6e-897c-f827333924d4";
    const suppliers = [
      {
        id: "e1f2a3b4-c5d6-4789-e012-345678901001",
        name: "OfficeMart Nigeria Ltd",
        contactName: "Ada Okonkwo",
        email: "sales@officemart.ng",
        phone: "+2348012345678",
        address: "12 Allen Avenue",
        city: "Ikeja",
        state: "Lagos",
        country: "Nigeria",
        website: "https://officemart.ng",
        notes: "Primary office consumables vendor",
        status: "Active",
        createdById: adminUserId,
      },
      {
        id: "e1f2a3b4-c5d6-4789-e012-345678901002",
        name: "TechSupply Africa Limited",
        contactName: "Emeka Nwosu",
        email: "procurement@techsupply.africa",
        phone: "+2348023456789",
        address: "45 Computer Village",
        city: "Ikeja",
        state: "Lagos",
        country: "Nigeria",
        website: null,
        notes: "ICT hardware and peripherals",
        status: "Active",
        createdById: adminUserId,
      },
      {
        id: "e1f2a3b4-c5d6-4789-e012-345678901003",
        name: "CleanPro Janitorial Services",
        contactName: "Fatima Bello",
        email: "orders@cleanpro.ng",
        phone: "+2348034567890",
        address: "8 Industrial Estate Road",
        city: "Abuja",
        state: "FCT",
        country: "Nigeria",
        website: null,
        notes: "Cleaning supplies and hygiene products",
        status: "Active",
        createdById: adminUserId,
      },
      {
        id: "e1f2a3b4-c5d6-4789-e012-345678901004",
        name: "LabEquip Scientific Supplies",
        contactName: "Dr. James Adeyemi",
        email: "lab@labequip.ng",
        phone: "+2348045678901",
        address: "3 Science Park Close",
        city: "Ibadan",
        state: "Oyo",
        country: "Nigeria",
        website: "https://labequip.ng",
        notes: "Laboratory chemicals and glassware",
        status: "Active",
        createdById: adminUserId,
      },
      {
        id: "e1f2a3b4-c5d6-4789-e012-345678901005",
        name: "Furniture World Nigeria Ltd",
        contactName: "Chidi Okafor",
        email: "info@furnitureworld.ng",
        phone: "+2348056789012",
        address: "21 Warehouse Road",
        city: "Port Harcourt",
        state: "Rivers",
        country: "Nigeria",
        website: null,
        notes: "Desks, chairs, and storage furniture",
        status: "Active",
        createdById: adminUserId,
      },
      {
        id: "e1f2a3b4-c5d6-4789-e012-345678901006",
        name: "SportGear Depot",
        contactName: "Amina Yusuf",
        email: "wholesale@sportgear.ng",
        phone: "+2348067890123",
        address: "7 Stadium Link Road",
        city: "Kano",
        state: "Kano",
        country: "Nigeria",
        website: "https://sportgear.ng",
        notes: "Sports and PE equipment",
        status: "Active",
        createdById: adminUserId,
      },
    ];

    let supplierLedgerCount = 0;
    for (const s of suppliers) {
      const supplier = await prisma.supplier.upsert({
        where: { name: s.name },
        update: {
          contactName: s.contactName,
          email: s.email,
          phone: s.phone,
          address: s.address,
          city: s.city,
          state: s.state,
          country: s.country,
          website: s.website,
          notes: s.notes,
          status: s.status,
          createdById: s.createdById,
        },
        create: s,
      });

      const ledgerId = await ensureSupplierLedgerAccount(supplier);
      if (ledgerId) {
        supplierLedgerCount += 1;
      }
    }
    console.log(
      `   ✓ ${suppliers.length} suppliers, ${supplierLedgerCount} supplier ledger accounts`
    );

    // Brands
    console.log("🏷️ Seeding brands...");
    const brands = [
      { id: "f2a3b4c5-d6e7-4890-f012-345678902001", name: "Generic", status: "Active" },
      { id: "f2a3b4c5-d6e7-4890-f012-345678902002", name: "BIC", status: "Active" },
      { id: "f2a3b4c5-d6e7-4890-f012-345678902003", name: "HP", status: "Active" },
      { id: "f2a3b4c5-d6e7-4890-f012-345678902004", name: "Dell", status: "Active" },
      { id: "f2a3b4c5-d6e7-4890-f012-345678902005", name: "Logitech", status: "Active" },
      { id: "f2a3b4c5-d6e7-4890-f012-345678902006", name: "Staedtler", status: "Active" },
      { id: "f2a3b4c5-d6e7-4890-f012-345678902007", name: "Dettol", status: "Active" },
      { id: "f2a3b4c5-d6e7-4890-f012-345678902008", name: "Nike", status: "Active" },
      { id: "f2a3b4c5-d6e7-4890-f012-345678902009", name: "Deli", status: "Active" },
      { id: "f2a3b4c5-d6e7-4890-f012-345678902010", name: "Canon", status: "Active" },
    ];

    for (const b of brands) {
      await prisma.brand.upsert({
        where: { name: b.name },
        update: { status: b.status },
        create: b,
      });
    }
    console.log(`   ✓ ${brands.length} brands`);

    // Departments

    // Salary components (earnings → expense accounts; deductions → payable; loan/advance → receivable)
    console.log("💰 Seeding salary components...");
    const SC = {
      BAS: "comp0001-0000-4000-8000-000000000001",
      HOU: "comp0001-0000-4000-8000-000000000002",
      TRN: "comp0001-0000-4000-8000-000000000003",
      MEA: "comp0001-0000-4000-8000-000000000004",
      OVT: "comp0001-0000-4000-8000-000000000005",
      BON: "comp0001-0000-4000-8000-000000000006",
      LEV: "comp0001-0000-4000-8000-000000000007",
      PAYE: "comp0001-0000-4000-8000-000000000008",
      PEN: "comp0001-0000-4000-8000-000000000009",
      NHF: "comp0001-0000-4000-8000-000000000010",
      NSITF: "comp0001-0000-4000-8000-000000000011",
      ITF: "comp0001-0000-4000-8000-000000000012",
      LOAN: "comp0001-0000-4000-8000-000000000013",
      COOP: "comp0001-0000-4000-8000-000000000014",
      UNI: "comp0001-0000-4000-8000-000000000015",
      ADV: "comp0001-0000-4000-8000-000000000016",
    };

    const salaryComponents = [
      {
        id: SC.BAS,
        name: "Basic Salary",
        shortName: "BAS",
        type: "EARNING",
        status: "Active",
        isTaxable: true,
        isPensionable: true,
        isStatutory: true,
        isFunction: false,
        accountId: 20,
        rank: 1,
        isPrimary: true,
      },
      {
        id: SC.HOU,
        name: "Housing",
        shortName: "HOU",
        type: "EARNING",
        status: "Active",
        isTaxable: true,
        isPensionable: true,
        isStatutory: false,
        isFunction: false,
        accountId: 21,
        rank: 2,
        isPrimary: false,
      },
      {
        id: SC.TRN,
        name: "Transport",
        shortName: "TRN",
        type: "EARNING",
        status: "Active",
        isTaxable: true,
        isPensionable: true,
        isStatutory: false,
        isFunction: false,
        accountId: 22,
        rank: 3,
        isPrimary: false,
      },
      {
        id: SC.MEA,
        name: "Meal Allowance",
        shortName: "MEA",
        type: "EARNING",
        status: "Active",
        isTaxable: true,
        isPensionable: true,
        isStatutory: false,
        isFunction: false,
        accountId: 36,
        rank: 4,
        isPrimary: false,
      },
      {
        id: SC.OVT,
        name: "Overtime",
        shortName: "OVT",
        type: "EARNING",
        status: "Active",
        isTaxable: true,
        isPensionable: false,
        isStatutory: false,
        isFunction: false,
        accountId: 37,
        rank: 5,
        isPrimary: false,
      },
      {
        id: SC.BON,
        name: "Bonus",
        shortName: "BON",
        type: "EARNING",
        status: "Active",
        isTaxable: true,
        isPensionable: false,
        isStatutory: false,
        isFunction: false,
        accountId: 38,
        rank: 6,
        isPrimary: false,
      },
      {
        id: SC.LEV,
        name: "Leave Allowance",
        shortName: "LEV",
        type: "EARNING",
        status: "Active",
        isTaxable: true,
        isPensionable: false,
        isStatutory: false,
        isFunction: false,
        accountId: 39,
        rank: 7,
        isPrimary: false,
      },
      {
        id: SC.PAYE,
        name: "PAYE",
        shortName: "PAYE",
        type: "DEDUCTION",
        status: "Active",
        isTaxable: false,
        isPensionable: false,
        isStatutory: true,
        isFunction: true,
        functionPercentage: 100,
        functionElements: [SC.BAS, SC.HOU, SC.TRN, SC.MEA],
        accountId: 24,
        rank: 1,
        isPrimary: true,
      },
      {
        id: SC.PEN,
        name: "Pension",
        shortName: "PEN",
        type: "DEDUCTION",
        status: "Active",
        isTaxable: false,
        isPensionable: false,
        isStatutory: true,
        isFunction: true,
        functionPercentage: 8,
        functionElements: [SC.BAS, SC.HOU, SC.TRN],
        accountId: 25,
        rank: 2,
        isPrimary: true,
      },
      {
        id: SC.NHF,
        name: "NHF",
        shortName: "NHF",
        type: "DEDUCTION",
        status: "Active",
        isTaxable: false,
        isPensionable: false,
        isStatutory: true,
        isFunction: true,
        functionPercentage: 2,
        functionElements: [SC.BAS, SC.MEA],
        accountId: 27,
        rank: 3,
        isPrimary: true,
      },
      {
        id: SC.NSITF,
        name: "NSITF",
        shortName: "NSITF",
        type: "DEDUCTION",
        status: "Active",
        isTaxable: false,
        isPensionable: false,
        isStatutory: true,
        isFunction: true,
        functionPercentage: 1,
        functionElements: [SC.BAS],
        accountId: 40,
        rank: 4,
        isPrimary: true,
      },
      {
        id: SC.ITF,
        name: "ITF",
        shortName: "ITF",
        type: "DEDUCTION",
        status: "Active",
        isTaxable: false,
        isPensionable: false,
        isStatutory: true,
        isFunction: true,
        functionPercentage: 1,
        functionElements: [SC.BAS],
        accountId: 41,
        rank: 5,
        isPrimary: true,
      },
      {
        id: SC.LOAN,
        name: "Loan Repayment",
        shortName: "LOAN",
        type: "DEDUCTION",
        status: "Active",
        isTaxable: false,
        isPensionable: false,
        isStatutory: false,
        isFunction: false,
        accountId: 28,
        rank: 6,
        isPrimary: true,
      },
      {
        id: SC.COOP,
        name: "Cooperative",
        shortName: "COOP",
        type: "DEDUCTION",
        status: "Active",
        isTaxable: false,
        isPensionable: false,
        isStatutory: false,
        isFunction: false,
        accountId: 42,
        rank: 7,
        isPrimary: false,
      },
      {
        id: SC.UNI,
        name: "Union Dues",
        shortName: "UNI",
        type: "DEDUCTION",
        status: "Active",
        isTaxable: false,
        isPensionable: false,
        isStatutory: false,
        isFunction: false,
        accountId: 43,
        rank: 8,
        isPrimary: false,
      },
      {
        id: SC.ADV,
        name: "Advance Salary",
        shortName: "ADV",
        type: "DEDUCTION",
        status: "Active",
        isTaxable: false,
        isPensionable: false,
        isStatutory: false,
        isFunction: false,
        accountId: 44,
        rank: 9,
        isPrimary: true,
      },
    ];

    for (const component of salaryComponents) {
      const functionPercentage =
        component.isFunction && component.functionPercentage != null
          ? component.functionPercentage
          : null;
      const functionElements =
        component.isFunction && Array.isArray(component.functionElements)
          ? component.functionElements
          : null;

      await prisma.salaryComponent.upsert({
        where: { id: component.id },
        update: {
          name: component.name,
          shortName: component.shortName,
          type: component.type,
          status: component.status,
          isTaxable: component.isTaxable,
          isPensionable: component.isPensionable,
          isStatutory: component.isStatutory,
          isFunction: component.isFunction,
          functionPercentage,
          functionElements,
          accountId: component.accountId,
          rank: component.rank,
          isPrimary: component.isPrimary,
        },
        create: {
          ...component,
          functionPercentage,
          functionElements,
        },
      });
    }
    console.log(`   ✓ ${salaryComponents.length} salary components`);

    console.log("🏬 Seeding departments...");
    const departments = [
      { id: "depa0001-0000-4000-8000-000000000001", name: "Administration", status: "Active" },
      { id: "depa0001-0000-4000-8000-000000000002", name: "Academics", status: "Active" },
      { id: "depa0001-0000-4000-8000-000000000003", name: "Accounts", status: "Active" },
      { id: "depa0001-0000-4000-8000-000000000004", name: "ICT", status: "Active" },
      { id: "depa0001-0000-4000-8000-000000000005", name: "Maintenance", status: "Active" },
      { id: "depa0001-0000-4000-8000-000000000006", name: "Security", status: "Active" },
      { id: "depa0001-0000-4000-8000-000000000007", name: "Boarding", status: "Active" },
      { id: "depa0001-0000-4000-8000-000000000008", name: "Library", status: "Active" },
    ];

    for (const dep of departments) {
      await prisma.department.upsert({
        where: { id: dep.id },
        update: { name: dep.name, status: dep.status },
        create: dep,
      });
    }
    console.log(`   ✓ ${departments.length} departments`);

    // Administrative expense components (category + expense ledger for postings)
    console.log("📋 Seeding administrative expense components...");
    const AEC = {
      UTIL: "admec001-0000-4000-8000-000000000001",
      MAINT: "admec001-0000-4000-8000-000000000002",
      OFFICE: "admec001-0000-4000-8000-000000000003",
      PRINT: "admec001-0000-4000-8000-000000000004",
      FUEL: "admec001-0000-4000-8000-000000000005",
      SEC: "admec001-0000-4000-8000-000000000006",
      COMM: "admec001-0000-4000-8000-000000000007",
      MISC: "admec001-0000-4000-8000-000000000008",
    };
    const administrativeExpenseComponents = [
      {
        id: AEC.UTIL,
        name: "Utilities",
        status: "Active",
        accountId: 14, // Utilities Expense (EXP-UTIL)
      },
      {
        id: AEC.MAINT,
        name: "Maintenance and Repairs",
        status: "Active",
        accountId: 15, // Maintenance Expense (EXP-MAINT)
      },
      {
        id: AEC.OFFICE,
        name: "Office Consumables",
        status: "Active",
        accountId: 13, // Consumable Expenses (EXP-CONS)
      },
      {
        id: AEC.PRINT,
        name: "Printing and Stationery",
        status: "Active",
        accountId: 13,
      },
      {
        id: AEC.FUEL,
        name: "Fuel and Vehicle Running",
        status: "Active",
        accountId: 15,
      },
      {
        id: AEC.SEC,
        name: "Security Services",
        status: "Active",
        accountId: 15,
      },
      {
        id: AEC.COMM,
        name: "Communications and Internet",
        status: "Active",
        accountId: 14,
      },
      {
        id: AEC.MISC,
        name: "Miscellaneous Administration",
        status: "Inactive",
        accountId: 13,
      },
    ];

    for (const component of administrativeExpenseComponents) {
      await prisma.administrativeExpenseComponent.upsert({
        where: { id: component.id },
        update: {
          name: component.name,
          status: component.status,
          accountId: component.accountId,
        },
        create: component,
      });
    }
    console.log(`   ✓ ${administrativeExpenseComponents.length} administrative expense components`);

    // Grade levels
    console.log("🏫 Seeding grade levels...");
    const gradeLevels = [
      { id: "grad0001-0000-4000-8000-000000000001", name: "GL1", status: "Active" },
      { id: "grad0001-0000-4000-8000-000000000002", name: "GL2", status: "Active" },
      { id: "grad0001-0000-4000-8000-000000000003", name: "GL3", status: "Active" },
      { id: "grad0001-0000-4000-8000-000000000004", name: "GL4", status: "Active" },
      { id: "grad0001-0000-4000-8000-000000000005", name: "GL5", status: "Active" },
      { id: "grad0001-0000-4000-8000-000000000006", name: "GL6", status: "Active" },
    ];

    for (const gl of gradeLevels) {
      await prisma.gradeLevel.upsert({
        where: { id: gl.id },
        update: { name: gl.name, status: gl.status },
        create: gl,
      });
    }
    console.log(`   ✓ ${gradeLevels.length} grade levels`);

    const DEPT = {
      ADMIN: "depa0001-0000-4000-8000-000000000001",
      ACADEMICS: "depa0001-0000-4000-8000-000000000002",
      ACCOUNTS: "depa0001-0000-4000-8000-000000000003",
      ICT: "depa0001-0000-4000-8000-000000000004",
      MAINTENANCE: "depa0001-0000-4000-8000-000000000005",
      SECURITY: "depa0001-0000-4000-8000-000000000006",
      BOARDING: "depa0001-0000-4000-8000-000000000007",
      LIBRARY: "depa0001-0000-4000-8000-000000000008",
    };

    const GL = {
      GL1: "grad0001-0000-4000-8000-000000000001",
      GL2: "grad0001-0000-4000-8000-000000000002",
      GL3: "grad0001-0000-4000-8000-000000000003",
      GL4: "grad0001-0000-4000-8000-000000000004",
      GL5: "grad0001-0000-4000-8000-000000000005",
      GL6: "grad0001-0000-4000-8000-000000000006",
    };

    // Salary charts — one row per (gradeLevel, step, employmentType, component); deductions only Union Dues
    console.log("📋 Seeding salary charts...");
    const salaryChartSlots = [
      {
        slot: "000001",
        gradeLevelId: GL.GL1,
        step: 1,
        employmentType: "Contractual",
        amounts: {
          [SC.BAS]: 185000,
          [SC.HOU]: 18500,
          [SC.TRN]: 12000,
          [SC.MEA]: 8000,
          [SC.UNI]: 500,
        },
      },
      {
        slot: "000002",
        gradeLevelId: GL.GL2,
        step: 2,
        employmentType: "Permanent",
        amounts: {
          [SC.BAS]: 295000,
          [SC.HOU]: 45000,
          [SC.TRN]: 25000,
          [SC.MEA]: 15000,
          [SC.UNI]: 1000,
        },
      },
      {
        slot: "000003",
        gradeLevelId: GL.GL3,
        step: 3,
        employmentType: "Permanent",
        amounts: {
          [SC.BAS]: 385000,
          [SC.HOU]: 55000,
          [SC.TRN]: 35000,
          [SC.MEA]: 20000,
          [SC.OVT]: 15000,
          [SC.UNI]: 1500,
        },
      },
      {
        slot: "000004",
        gradeLevelId: GL.GL4,
        step: 4,
        employmentType: "Permanent",
        amounts: {
          [SC.BAS]: 485000,
          [SC.HOU]: 70000,
          [SC.TRN]: 45000,
          [SC.MEA]: 25000,
          [SC.OVT]: 20000,
          [SC.BON]: 50000,
          [SC.UNI]: 2000,
        },
      },
      {
        slot: "000005",
        gradeLevelId: GL.GL5,
        step: 5,
        employmentType: "Permanent",
        amounts: {
          [SC.BAS]: 720000,
          [SC.HOU]: 120000,
          [SC.TRN]: 60000,
          [SC.MEA]: 35000,
          [SC.OVT]: 30000,
          [SC.BON]: 80000,
          [SC.LEV]: 40000,
          [SC.UNI]: 2500,
        },
      },
      {
        slot: "000006",
        gradeLevelId: GL.GL6,
        step: 6,
        employmentType: "Permanent",
        amounts: {
          [SC.BAS]: 850000,
          [SC.HOU]: 150000,
          [SC.TRN]: 75000,
          [SC.MEA]: 40000,
          [SC.OVT]: 40000,
          [SC.BON]: 100000,
          [SC.LEV]: 60000,
          [SC.UNI]: 3000,
        },
      },
    ];

    let salaryChartRowIndex = 0;
    for (const chartSlot of salaryChartSlots) {
      let componentIndex = 0;
      for (const [componentId, amount] of Object.entries(chartSlot.amounts)) {
        componentIndex += 1;
        salaryChartRowIndex += 1;
        const chartId = `chart0001-0000-4000-8000-${chartSlot.slot}${String(componentIndex).padStart(2, "0")}`;
        await prisma.salaryChart.upsert({
          where: {
            gradeLevelId_step_employmentType_componentId: {
              gradeLevelId: chartSlot.gradeLevelId,
              step: chartSlot.step,
              employmentType: chartSlot.employmentType,
              componentId,
            },
          },
          update: {
            amount,
            status: "Active",
            createdBy: adminUserId,
            updatedBy: adminUserId,
          },
          create: {
            id: chartId,
            gradeLevelId: chartSlot.gradeLevelId,
            step: chartSlot.step,
            employmentType: chartSlot.employmentType,
            componentId,
            amount,
            status: "Active",
            createdBy: adminUserId,
            updatedBy: adminUserId,
          },
        });
      }
    }
    console.log(
      `   ✓ ${salaryChartRowIndex} salary chart rows (${salaryChartSlots.length} staff payroll slots)`
    );

    // Staff (+ linked user accounts, same as StaffService.createStaffWithUser)
    console.log("👔 Seeding staff...");
    const staffMembers = [
      {
        id: "a8b9c0d1-e2f3-4234-a012-345678909001",
        userId: "a8b9c0d1-e2f3-4234-a012-34567890a001",
        StaffNumber: "SF-0001",
        email: "ngozi.okonkwo@staff.school.ng",
        name: "Dr. Ngozi Okonkwo",
        position: "principal",
        employmentType: "Permanent",
        departmentId: DEPT.ADMIN,
        gradeLevelId: GL.GL6,
        step: 6,
        salary: 850000,
        dateOfAppointment: new Date("2015-09-01"),
        status: "Active",
        createdById: adminUserId,
        appRoleId: SYSTEM_ADMIN_ROLE_ID,
      },
      {
        id: "a8b9c0d1-e2f3-4234-a012-345678909002",
        userId: "a8b9c0d1-e2f3-4234-a012-34567890a002",
        StaffNumber: "SF-0002",
        email: "tunde.bello@staff.school.ng",
        name: "Mr. Tunde Bello",
        position: "vice_principal",
        employmentType: "Permanent",
        departmentId: DEPT.ADMIN,
        gradeLevelId: GL.GL5,
        step: 5,
        salary: 720000,
        dateOfAppointment: new Date("2017-01-15"),
        status: "Active",
        createdById: adminUserId,
        appRoleId: SYSTEM_ADMIN_ROLE_ID,
      },
      {
        id: "a8b9c0d1-e2f3-4234-a012-345678909003",
        userId: "a8b9c0d1-e2f3-4234-a012-34567890a003",
        StaffNumber: "SF-0003",
        email: "ada.musa@staff.school.ng",
        name: "Mrs. Ada Musa",
        position: "class_teacher",
        employmentType: "Permanent",
        departmentId: DEPT.ACADEMICS,
        gradeLevelId: GL.GL4,
        step: 4,
        salary: 485000,
        dateOfAppointment: new Date("2019-09-01"),
        status: "Active",
        createdById: adminUserId,
        appRoleId: CLASS_TEACHER_ROLE_ID,
      },
      {
        id: "a8b9c0d1-e2f3-4234-a012-345678909004",
        userId: "a8b9c0d1-e2f3-4234-a012-34567890a004",
        StaffNumber: "SF-0004",
        email: "james.eze@staff.school.ng",
        name: "Mr. James Eze",
        position: "subject_teacher",
        employmentType: "Permanent",
        departmentId: DEPT.ACADEMICS,
        gradeLevelId: GL.GL3,
        step: 3,
        salary: 385000,
        dateOfAppointment: new Date("2020-09-01"),
        status: "Active",
        createdById: adminUserId,
        appRoleId: SUBJECT_TEACHER_ROLE_ID,
      },
      {
        id: "a8b9c0d1-e2f3-4234-a012-345678909005",
        userId: "a8b9c0d1-e2f3-4234-a012-34567890a005",
        StaffNumber: "SF-0005",
        email: "fatima.yusuf@staff.school.ng",
        name: "Mrs. Fatima Yusuf",
        position: "subject_teacher",
        employmentType: "Permanent",
        departmentId: DEPT.ACADEMICS,
        gradeLevelId: GL.GL3,
        step: 3,
        salary: 385000,
        dateOfAppointment: new Date("2021-01-10"),
        status: "Active",
        createdById: adminUserId,
        appRoleId: SUBJECT_TEACHER_ROLE_ID,
      },
      {
        id: "a8b9c0d1-e2f3-4234-a012-345678909006",
        userId: "a8b9c0d1-e2f3-4234-a012-34567890a006",
        StaffNumber: "SF-0006",
        email: "chidi.okafor@staff.school.ng",
        name: "Mr. Chidi Okafor",
        position: "subject_teacher",
        employmentType: "Permanent",
        departmentId: DEPT.ACADEMICS,
        gradeLevelId: GL.GL2,
        step: 2,
        salary: 295000,
        dateOfAppointment: new Date("2022-09-01"),
        status: "Active",
        createdById: adminUserId,
        appRoleId: SUBJECT_TEACHER_ROLE_ID,
      },
      {
        id: "a8b9c0d1-e2f3-4234-a012-345678909007",
        userId: "a8b9c0d1-e2f3-4234-a012-34567890a007",
        StaffNumber: "SF-0007",
        email: "bola.adeyemi@staff.school.ng",
        name: "Mrs. Bola Adeyemi",
        position: "admin",
        employmentType: "Permanent",
        departmentId: DEPT.ACCOUNTS,
        gradeLevelId: GL.GL4,
        step: 4,
        salary: 420000,
        dateOfAppointment: new Date("2018-03-01"),
        status: "Active",
        createdById: adminUserId,
        appRoleId: ACCOUNTANT_ROLE_ID,
      },
      {
        id: "a8b9c0d1-e2f3-4234-a012-345678909008",
        userId: "a8b9c0d1-e2f3-4234-a012-34567890a008",
        StaffNumber: "SF-0008",
        email: "emmanuel.nwosu@staff.school.ng",
        name: "Mr. Emmanuel Nwosu",
        position: "class_teacher",
        employmentType: "Contractual",
        departmentId: DEPT.ACADEMICS,
        gradeLevelId: GL.GL1,
        step: 1,
        salary: 185000,
        dateOfAppointment: new Date("2024-09-01"),
        status: "Active",
        createdById: adminUserId,
        appRoleId: CLASS_TEACHER_ROLE_ID,
      },
      {
        id: "a8b9c0d1-e2f3-4234-a012-345678909009",
        userId: "a8b9c0d1-e2f3-4234-a012-34567890a009",
        StaffNumber: "SF-0009",
        email: "ikechukwu.nwankwo@staff.school.ng",
        name: "Mr. Ikechukwu Nwankwo",
        position: "admin",
        employmentType: "Permanent",
        departmentId: DEPT.ADMIN,
        gradeLevelId: GL.GL4,
        step: 4,
        salary: 410000,
        dateOfAppointment: new Date("2019-01-08"),
        status: "Active",
        createdById: adminUserId,
        appRoleId: REGISTRAR_ROLE_ID,
      },
      {
        id: "a8b9c0d1-e2f3-4234-a012-34567890900a",
        userId: "a8b9c0d1-e2f3-4234-a012-34567890a00a",
        StaffNumber: "SF-0010",
        email: "halima.bello@staff.school.ng",
        name: "Mrs. Halima Bello",
        position: "admin",
        employmentType: "Permanent",
        departmentId: DEPT.ADMIN,
        gradeLevelId: GL.GL3,
        step: 3,
        salary: 360000,
        dateOfAppointment: new Date("2020-09-01"),
        status: "Active",
        createdById: adminUserId,
        appRoleId: REGISTRAR_ROLE_ID,
      },
      {
        id: "a8b9c0d1-e2f3-4234-a012-34567890900b",
        userId: "a8b9c0d1-e2f3-4234-a012-34567890a00b",
        StaffNumber: "SF-0011",
        email: "sani.ibrahim@staff.school.ng",
        name: "Mr. Sani Ibrahim",
        position: "admin",
        employmentType: "Permanent",
        departmentId: DEPT.MAINTENANCE,
        gradeLevelId: GL.GL2,
        step: 2,
        salary: 280000,
        dateOfAppointment: new Date("2021-03-15"),
        status: "Active",
        createdById: adminUserId,
        appRoleId: STORE_CLERK_ROLE_ID,
      },
      {
        id: "a8b9c0d1-e2f3-4234-a012-34567890900c",
        userId: "a8b9c0d1-e2f3-4234-a012-34567890a00c",
        StaffNumber: "SF-0012",
        email: "michael.ode@staff.school.ng",
        name: "Mr. Michael Ode",
        position: "admin",
        employmentType: "Permanent",
        departmentId: DEPT.MAINTENANCE,
        gradeLevelId: GL.GL2,
        step: 2,
        salary: 275000,
        dateOfAppointment: new Date("2022-01-10"),
        status: "Active",
        createdById: adminUserId,
        appRoleId: STORE_CLERK_ROLE_ID,
      },
      {
        id: "a8b9c0d1-e2f3-4234-a012-34567890900d",
        userId: "a8b9c0d1-e2f3-4234-a012-34567890a00d",
        StaffNumber: "SF-0013",
        email: "chinwe.okafor@staff.school.ng",
        name: "Mrs. Chinwe Okafor",
        position: "admin",
        employmentType: "Permanent",
        departmentId: DEPT.ACCOUNTS,
        gradeLevelId: GL.GL3,
        step: 3,
        salary: 350000,
        dateOfAppointment: new Date("2021-06-01"),
        status: "Active",
        createdById: adminUserId,
        appRoleId: ACCOUNTANT_ROLE_ID,
      },
      {
        id: "a8b9c0d1-e2f3-4234-a012-34567890900e",
        userId: "a8b9c0d1-e2f3-4234-a012-34567890a00e",
        StaffNumber: "SF-0014",
        email: "grace.okon@staff.school.ng",
        name: "Mrs. Grace Okon",
        position: "class_teacher",
        employmentType: "Permanent",
        departmentId: DEPT.ACADEMICS,
        gradeLevelId: GL.GL3,
        step: 3,
        salary: 370000,
        dateOfAppointment: new Date("2020-09-01"),
        status: "Active",
        createdById: adminUserId,
        appRoleId: CLASS_TEACHER_ROLE_ID,
      },
      {
        id: "a8b9c0d1-e2f3-4234-a012-34567890900f",
        userId: "a8b9c0d1-e2f3-4234-a012-34567890a00f",
        StaffNumber: "SF-0015",
        email: "david.ibrahim@staff.school.ng",
        name: "Mr. David Ibrahim",
        position: "subject_teacher",
        employmentType: "Permanent",
        departmentId: DEPT.ACADEMICS,
        gradeLevelId: GL.GL2,
        step: 2,
        salary: 310000,
        dateOfAppointment: new Date("2023-09-01"),
        status: "Active",
        createdById: adminUserId,
        appRoleId: SUBJECT_TEACHER_ROLE_ID,
      },
    ];

    for (const member of staffMembers) {
      await upsertStaffWithUser(hashedPassword, member);
    }
    const staffRoleCounts = staffMembers.reduce((acc, member) => {
      const key = member.appRoleId ?? "unassigned";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    console.log(
      `   ✓ ${staffMembers.length} staff (with user accounts, password: 12345) — roles: ${staffRoleCounts[SYSTEM_ADMIN_ROLE_ID] ?? 0} System Administrator, ${staffRoleCounts[REGISTRAR_ROLE_ID] ?? 0} Registrar, ${staffRoleCounts[STORE_CLERK_ROLE_ID] ?? 0} Store Clerk, ${staffRoleCounts[ACCOUNTANT_ROLE_ID] ?? 0} Accountant, ${staffRoleCounts[CLASS_TEACHER_ROLE_ID] ?? 0} Class Teacher, ${staffRoleCounts[SUBJECT_TEACHER_ROLE_ID] ?? 0} Subject Teacher`
    );

    // Cashiers (linked user or staff + cash ledger for sales posting)
    console.log("💵 Seeding cashiers...");
    const cashiers = [
      {
        id: "cash0001-0000-4000-8000-000000000001",
        name: "School Admin Cashier",
        userId: "77e7a005-b0a5-4a6e-897c-f827333924d4",
        staffId: null,
        accountChartId: 47,
        status: "Active",
      },
      {
        id: "cash0001-0000-4000-8000-000000000002",
        name: "Accounts Office Cashier",
        staffId: "a8b9c0d1-e2f3-4234-a012-345678909007",
        accountChartId: 48,
        status: "Active",
      },
      {
        id: "cash0001-0000-4000-8000-000000000003",
        name: "Store Sales Cashier",
        staffId: "a8b9c0d1-e2f3-4234-a012-345678909004",
        accountChartId: 49,
        userId: "77e7a005-b0a5-4a6e-897c-f827333924d4",
        status: "Active",
      },
      {
        id: "cash0001-0000-4000-8000-000000000004",
        name: "Reception Cashier",
        staffId: "a8b9c0d1-e2f3-4234-a012-345678909003",
        accountChartId: 50,
        status: "Active",
      },
    ];

    for (const cashier of cashiers) {
      let staffId = cashier.staffId ?? null;
      let userId = cashier.userId ?? null;
      if (staffId && !userId) {
        const staff = await prisma.staff.findUnique({
          where: { id: staffId },
          select: { userId: true },
        });
        userId = staff?.userId ?? null;
      }

      await prisma.cashier.upsert({
        where: { id: cashier.id },
        update: {
          name: cashier.name,
          staffId,
          userId,
          accountChartId: cashier.accountChartId,
          status: cashier.status,
        },
        create: {
          id: cashier.id,
          name: cashier.name,
          staffId,
          userId,
          accountChartId: cashier.accountChartId,
          status: cashier.status,
        },
      });
    }
    console.log(`   ✓ ${cashiers.length} cashiers`);

    // ActivePeriod remains in the schema, but no longer references academic sessions or terms.
    console.log("Seeding active period...");
    const activePeriodStart = new Date("2026-05-01T00:00:00.000Z");
    const activePeriodEnd = new Date("2026-07-31T00:00:00.000Z");
    await prisma.activePeriod.upsert({
      where: { id: "e3c4d5e6-f7a8-4901-c123-333333333301" },
      update: {
        startDate: activePeriodStart,
        endDate: activePeriodEnd,
        updatedAt: new Date(),
      },
      create: {
        id: "e3c4d5e6-f7a8-4901-c123-333333333301",
        startDate: activePeriodStart,
        endDate: activePeriodEnd,
      },
    });
    console.log("   1 active period");
    // Vehicles are retained in the current Prisma schema.
    console.log("Seeding vehicles...");
    const vehicles = [
      {
        id: "f7a8b9c0-d1e2-4345-f012-34567890e001",
        vehicleNumber: "BUS-001",
        vehicleType: "Bus",
        vehicleMake: "Toyota",
        capacity: 50,
        driverId: "a8b9c0d1-e2f3-4234-a012-345678909003",
        status: "Active",
        remarks: "Primary Lekki corridor bus",
        createdById: adminUserId,
      },
      {
        id: "f7a8b9c0-d1e2-4345-f012-34567890e002",
        vehicleNumber: "BUS-002",
        vehicleType: "Bus",
        vehicleMake: "Honda",
        capacity: 40,
        driverId: "a8b9c0d1-e2f3-4234-a012-345678909004",
        status: "Active",
        remarks: "Ikeja express spare",
        createdById: adminUserId,
      },
      {
        id: "f7a8b9c0-d1e2-4345-f012-34567890e003",
        vehicleNumber: "CAR-001",
        vehicleType: "Car",
        vehicleMake: "Hyundai",
        capacity: 5,
        driverId: null,
        status: "Active",
        remarks: "Admin / staff shuttle",
        createdById: adminUserId,
      },
    ];
    for (const vehicle of vehicles) {
      await prisma.vehicle.upsert({
        where: { id: vehicle.id },
        update: {
          vehicleNumber: vehicle.vehicleNumber,
          vehicleType: vehicle.vehicleType,
          vehicleMake: vehicle.vehicleMake,
          capacity: vehicle.capacity,
          driverId: vehicle.driverId,
          status: vehicle.status,
          remarks: vehicle.remarks,
          createdById: vehicle.createdById,
        },
        create: vehicle,
      });
    }
    console.log(`   ${vehicles.length} vehicles`);
    console.log("✅ Database seeding completed successfully");
  } catch (error) {
    console.error("❌ Error during seeding:", error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
