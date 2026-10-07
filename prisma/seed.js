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

const STUDENT_SUBHEAD_SETTINGS_ID = "STUDENT_SUBHEAD";

/** Mirror StudentService.createStudent — ledger under STUDENT_SUBHEAD (Accounts Receivable). */
async function ensureStudentLedgerAccount(student) {
  const defaultSubhead = await prisma.defaulSubheadSettings.findUnique({
    where: { settingsId: STUDENT_SUBHEAD_SETTINGS_ID },
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

  const accountDescription =
    `${student.firstName} ${student.lastName} (${student.admissionNumber})`.trim();
  const chartStatus = student.status === "Active" ? "Active" : "Inactive";

  const byRef = await prisma.accountChart.findFirst({
    where: { subheadId: subhead.id, accountRef: student.id },
    select: { id: true },
  });

  let accountId;
  if (byRef) {
    await prisma.accountChart.update({
      where: { id: byRef.id },
      data: {
        accountDescription,
        status: chartStatus,
        groupId: subhead.groupId,
        headId: subhead.headId,
      },
    });
    accountId = byRef.id;
  } else {
    const byDescription = await prisma.accountChart.findFirst({
      where: { subheadId: subhead.id, accountDescription },
      select: { id: true },
    });

    if (byDescription) {
      await prisma.accountChart.update({
        where: { id: byDescription.id },
        data: {
          accountRef: student.id,
          status: chartStatus,
          groupId: subhead.groupId,
          headId: subhead.headId,
        },
      });
      accountId = byDescription.id;
    } else {
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
          accountRef: student.id,
          accountNo: null,
          rank: (maxRank._max.rank ?? 0) + 1,
          status: chartStatus,
        },
      });
      accountId = created.id;
    }
  }

  await prisma.student.update({
    where: { id: student.id },
    data: { accountId },
  });

  return accountId;
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

/** Mirror StudentService.ensureGuardianUser — Parent account; reuses existing user when email is taken. */
async function ensureGuardianUser(hashedPassword, input) {
  const guardianEmail = input.guardianEmail?.trim().toLowerCase();
  if (!guardianEmail) return null;

  const { firstName, lastName } = input.guardianName
    ? splitStaffName(input.guardianName)
    : { firstName: null, lastName: null };

  const user = await prisma.user.upsert({
    where: { email: guardianEmail },
    update: {},
    create: {
      ...(input.userId ? { id: input.userId } : {}),
      email: guardianEmail,
      password: hashedPassword,
      firstName,
      lastName,
      phoneNumber: input.guardianContact?.trim() || null,
      userType: "Parent",
      isActive: true,
      isVerified: true,
      isEmailVerified: true,
      isPhoneVerified: false,
      isDeleted: false,
      status: "active",
      createdById: input.createdById,
    },
  });

  await assignUserAppRole(user.id, PARENT_ROLE_ID);

  return user.id;
}

/** Mirror StudentService.createStudent — Student user (when email present), guardian Parent user, and student row. */
async function upsertStudentWithUsers(hashedPassword, st) {
  const studentEmail = st.studentEmail?.trim().toLowerCase() || null;
  const guardianEmail = st.guardianEmail?.trim().toLowerCase() || null;

  if (guardianEmail && guardianEmail !== studentEmail) {
    await ensureGuardianUser(hashedPassword, {
      guardianEmail,
      guardianName: st.guardianName,
      guardianContact: st.guardianContact,
      createdById: st.createdById,
      userId: st.guardianUserId,
    });
  }

  let userId = null;
  if (studentEmail) {
    const user = await prisma.user.upsert({
      where: { email: studentEmail },
      update: {
        firstName: st.firstName,
        lastName: st.lastName,
        userType: "Student",
        isActive: true,
      },
      create: {
        ...(st.userId ? { id: st.userId } : {}),
        email: studentEmail,
        password: hashedPassword,
        firstName: st.firstName,
        lastName: st.lastName,
        userType: "Student",
        isActive: true,
        isVerified: true,
        isEmailVerified: true,
        isPhoneVerified: false,
        isDeleted: false,
        status: "active",
        createdById: st.createdById,
      },
    });
    userId = user.id;
    await assignUserAppRole(userId, STUDENT_ROLE_ID);
  }

  return prisma.student.upsert({
    where: { admissionNumber: st.admissionNumber },
    update: {
      firstName: st.firstName,
      middleName: st.middleName,
      lastName: st.lastName,
      studentEmail,
      gender: st.gender,
      dateOfBirth: st.dateOfBirth,
      classId: st.classId,
      subClassId: st.subClassId,
      guardianName: st.guardianName,
      guardianEmail,
      guardianContact: st.guardianContact,
      address: st.address,
      imageUrl: st.imageUrl ?? null,
      status: st.status,
      createdById: st.createdById,
      userId,
    },
    create: {
      id: st.id,
      admissionNumber: st.admissionNumber,
      firstName: st.firstName,
      middleName: st.middleName,
      lastName: st.lastName,
      studentEmail,
      gender: st.gender,
      dateOfBirth: st.dateOfBirth,
      classId: st.classId,
      subClassId: st.subClassId,
      guardianName: st.guardianName,
      guardianEmail,
      guardianContact: st.guardianContact,
      address: st.address,
      imageUrl: st.imageUrl ?? null,
      status: st.status,
      createdById: st.createdById,
      userId,
    },
  });
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

    // Billing items (fee types for student / class billing)
    console.log("🧾 Seeding billing items...");
    const billingItems = [
      {
        id: 1,
        code: "TUIT",
        name: "Tuition Fee",
        category: "TUITION",
        optional: false,
        status: "Active",
        accountId: 17,
      },
      {
        id: 2,
        code: "REG",
        name: "Registration Fee",
        category: "SERVICES",
        optional: false,
        status: "Active",
        accountId: 17,
      },
      {
        id: 3,
        code: "DEV",
        name: "Development Levy",
        category: "CONSTRUCTION",
        optional: false,
        status: "Active",
        accountId: 18,
      },
      {
        id: 4,
        code: "ICT",
        name: "ICT / Technology Fee",
        category: "TECHNOLOGY",
        optional: false,
        status: "Active",
        accountId: 18,
      },
      {
        id: 5,
        code: "TRANS",
        name: "Transportation Fee",
        category: "TRANSPORTATION",
        optional: true,
        status: "Active",
        accountId: 18,
      },
      {
        id: 6,
        code: "FEED",
        name: "Feeding / Lunch Fee",
        category: "FEEDING",
        optional: true,
        status: "Active",
        accountId: 18,
      },
      {
        id: 7,
        code: "UNIF",
        name: "Uniform and Materials",
        category: "MATERIALS",
        optional: true,
        status: "Active",
        accountId: 18,
      },
      {
        id: 8,
        code: "EXAM",
        name: "Examination Fee",
        category: "SERVICES",
        optional: false,
        status: "Active",
        accountId: 18,
      },
      {
        id: 9,
        code: "PTA",
        name: "PTA Levy",
        category: "SERVICES",
        optional: false,
        status: "Active",
        accountId: 18,
      },
      {
        id: 10,
        code: "MED",
        name: "Medical / Health Fee",
        category: "MEDICAL",
        optional: true,
        status: "Active",
        accountId: 18,
      },
      {
        id: 11,
        code: "SPORT",
        name: "Sports Fee",
        category: "OTHER",
        optional: true,
        status: "Active",
        accountId: 18,
      },
      {
        id: 12,
        code: "LIB",
        name: "Library Fee",
        category: "SERVICES",
        optional: true,
        status: "Active",
        accountId: 18,
      },
      {
        id: 13,
        code: "BOARD",
        name: "Boarding Fee",
        category: "SERVICES",
        optional: true,
        status: "Active",
        accountId: 19,
      },
      {
        id: 14,
        code: "MISC",
        name: "Miscellaneous Fee",
        category: "OTHER",
        optional: true,
        status: "Active",
        accountId: 19,
      },
    ];

    for (const item of billingItems) {
      await prisma.billingItem.upsert({
        where: { code: item.code },
        update: {
          name: item.name,
          category: item.category,
          optional: item.optional,
          status: item.status,
          accountId: item.accountId,
        },
        create: item,
      });
    }
    console.log(`   ✓ ${billingItems.length} billing items`);

    // Concession / discount definitions (linked to billing items and discount ledger)
    console.log("🏷️ Seeding concession discounts...");
    const concessionDiscounts = [
      {
        id: 1,
        code: "SIBLING10",
        name: "Sibling Discount (10%)",
        type: "DISCOUNT",
        calculationType: "PERCENTAGE",
        value: 10,
        maxLimit: null,
        status: "Active",
        accountId: 16,
        appliesToIds: [1, 2],
      },
      {
        id: 2,
        code: "STAFFCHILD15",
        name: "Staff Child Concession (15%)",
        type: "CONCESSION",
        calculationType: "PERCENTAGE",
        value: 15,
        maxLimit: null,
        status: "Active",
        accountId: 16,
        appliesToIds: [1],
      },
      {
        id: 3,
        code: "EARLY5K",
        name: "Early Payment Discount (₦5,000)",
        type: "DISCOUNT",
        calculationType: "FIXED_AMOUNT",
        value: 5000,
        maxLimit: null,
        status: "Active",
        accountId: 16,
        appliesToIds: [1, 3],
      },
      {
        id: 4,
        code: "SCHOLAR25",
        name: "Scholarship (25%)",
        type: "CONCESSION",
        calculationType: "PERCENTAGE",
        value: 25,
        maxLimit: 50000,
        status: "Active",
        accountId: 16,
        appliesToIds: [1],
      },
      {
        id: 5,
        code: "NEEDY50",
        name: "Financial Need Concession (50%)",
        type: "CONCESSION",
        calculationType: "PERCENTAGE",
        value: 50,
        maxLimit: 100000,
        status: "Active",
        accountId: 16,
        appliesToIds: [1, 2, 8],
      },
      {
        id: 6,
        code: "TRANSFIX2K",
        name: "Transport Promo (₦2,000 off)",
        type: "DISCOUNT",
        calculationType: "FIXED_AMOUNT",
        value: 2000,
        maxLimit: null,
        status: "Active",
        accountId: 16,
        appliesToIds: [5],
      },
    ];

    for (const row of concessionDiscounts) {
      const { appliesToIds, ...data } = row;
      const upserted = await prisma.concessionDiscount.upsert({
        where: { code: row.code },
        update: {
          name: data.name,
          type: data.type,
          calculationType: data.calculationType,
          value: data.value,
          maxLimit: data.maxLimit,
          status: data.status,
          accountId: data.accountId,
        },
        create: {
          ...data,
        },
      });

      await prisma.billingItemToConcessionDiscount.deleteMany({
        where: { concessionDiscountId: upserted.id },
      });
      if (appliesToIds.length > 0) {
        await prisma.billingItemToConcessionDiscount.createMany({
          data: appliesToIds.map((billingItemId) => ({
            billingItemId,
            concessionDiscountId: upserted.id,
          })),
          skipDuplicates: true,
        });
      }
    }
    console.log(`   ✓ ${concessionDiscounts.length} concession discounts`);

    // UOMs
    console.log("📏 Seeding UOMs...");
    const uoms = [
      {
        id: "5b15389c-3d56-4ec1-b848-43c76d435f35",
        name: "Piece",
        symbol: "pcs",
        status: "Active",
      },
      {
        id: "f331e6b0-e5d3-4c3a-a6af-c46858c3396b",
        name: "Carton",
        symbol: "ctn",
        status: "Active",
      },
      {
        id: "1c152b2e-bd60-418f-b312-08c1b001134a",
        name: "Kilogram",
        symbol: "kg",
        status: "Active",
      },
      {
        id: "7e0ebb54-6fc7-46f0-8853-27e23b2693af",
        name: "Liter",
        symbol: "ltr",
        status: "Active",
      },
    ];

    for (const u of uoms) {
      await prisma.uom.upsert({
        where: { id: u.id },
        update: {
          symbol: u.symbol,
          status: u.status,
        },
        create: u,
      });
    }
    console.log(`   ✓ ${uoms.length} UOMs`);

    // Inventory categories
    console.log("📦 Seeding categories...");
    // Account chart IDs: 13 EXP-CONS, 15 EXP-MAINT, 5 FA-FURN, 6 FA-ICT,
    // 30–35 category inventory/asset ledgers (see accountCharts seed)
    const categories = [
      {
        id: "a1b2c3d4-e5f6-4789-a012-345678901001",
        name: "Office Supplies",
        description: "General office consumables (paper, pens, folders)",
        status: "Active",
        categoryType: "Consumable",
        consumableAccountId: 13, // 4102001 Consumable Expenses
        assetAccountId: 30, // 1103002 Inventory - Office Supplies
      },
      {
        id: "a1b2c3d4-e5f6-4789-a012-345678901002",
        name: "Stationery",
        description: "Student and staff stationery items",
        status: "Active",
        categoryType: "Consumable",
        consumableAccountId: 13,
        assetAccountId: 31, // 1103003 Inventory - Stationery
      },
      {
        id: "a1b2c3d4-e5f6-4789-a012-345678901003",
        name: "Cleaning Supplies",
        description: "Janitorial and hygiene consumables",
        status: "Active",
        categoryType: "Consumable",
        consumableAccountId: 13,
        assetAccountId: 32, // 1103004 Inventory - Cleaning Supplies
      },
      {
        id: "a1b2c3d4-e5f6-4789-a012-345678901004",
        name: "Laboratory Supplies",
        description: "Science lab consumables and chemicals",
        status: "Active",
        categoryType: "Consumable",
        consumableAccountId: 13,
        assetAccountId: 33, // 1103005 Inventory - Laboratory Supplies
      },
      {
        id: "a1b2c3d4-e5f6-4789-a012-345678901005",
        name: "ICT Equipment",
        description: "Computers, peripherals, and durable IT assets",
        status: "Active",
        categoryType: "NonConsumable",
        consumableAccountId: 13, // expense on issue / sale
        assetAccountId: 6, // 1202001 ICT Equipment
      },
      {
        id: "a1b2c3d4-e5f6-4789-a012-345678901006",
        name: "Furniture",
        description: "Desks, chairs, cabinets, and fixtures",
        status: "Active",
        categoryType: "NonConsumable",
        consumableAccountId: 13,
        assetAccountId: 5, // 1201001 Furniture and Fixtures
      },
      {
        id: "a1b2c3d4-e5f6-4789-a012-345678901007",
        name: "Sports & PE",
        description: "Sports equipment and physical education gear",
        status: "Active",
        categoryType: "NonConsumable",
        consumableAccountId: 13,
        assetAccountId: 34, // 1103006 Inventory - Sports and PE Equipment
      },
      {
        id: "a1b2c3d4-e5f6-4789-a012-345678901008",
        name: "Building & Maintenance",
        description: "Tools, hardware, and maintenance materials",
        status: "Active",
        categoryType: "NonConsumable",
        consumableAccountId: 15, // 4104001 Maintenance Expense
        assetAccountId: 35, // 1103007 Inventory - Building and Maintenance
      },
    ];

    for (const c of categories) {
      await prisma.category.upsert({
        where: { name: c.name },
        update: {
          description: c.description,
          status: c.status,
          categoryType: c.categoryType,
          consumableAccountId: c.consumableAccountId,
          assetAccountId: c.assetAccountId,
        },
        create: c,
      });
    }
    console.log(`   ✓ ${categories.length} categories`);

    // Sub-categories (linked to seeded categories)
    console.log("📂 Seeding sub-categories...");
    const categoryIds = {
      officeSupplies: "a1b2c3d4-e5f6-4789-a012-345678901001",
      stationery: "a1b2c3d4-e5f6-4789-a012-345678901002",
      cleaningSupplies: "a1b2c3d4-e5f6-4789-a012-345678901003",
      laboratorySupplies: "a1b2c3d4-e5f6-4789-a012-345678901004",
      ictEquipment: "a1b2c3d4-e5f6-4789-a012-345678901005",
      furniture: "a1b2c3d4-e5f6-4789-a012-345678901006",
      sportsPe: "a1b2c3d4-e5f6-4789-a012-345678901007",
      buildingMaintenance: "a1b2c3d4-e5f6-4789-a012-345678901008",
    };

    const subCategories = [
      {
        id: "b1c2d3e4-f5a6-4789-b012-345678901001",
        name: "Paper Products",
        description: "Printing paper, notebooks refills, envelopes",
        categoryId: categoryIds.officeSupplies,
        status: "Active",
      },
      {
        id: "b1c2d3e4-f5a6-4789-b012-345678901002",
        name: "Writing Instruments",
        description: "Pens, markers, highlighters for office use",
        categoryId: categoryIds.officeSupplies,
        status: "Active",
      },
      {
        id: "b1c2d3e4-f5a6-4789-b012-345678901003",
        name: "Filing and Storage",
        description: "Folders, binders, archive boxes",
        categoryId: categoryIds.officeSupplies,
        status: "Active",
      },
      {
        id: "b1c2d3e4-f5a6-4789-b012-345678901004",
        name: "Notebooks",
        description: "Exercise books and writing pads",
        categoryId: categoryIds.stationery,
        status: "Active",
      },
      {
        id: "b1c2d3e4-f5a6-4789-b012-345678901005",
        name: "Pens and Pencils",
        description: "Student and staff writing supplies",
        categoryId: categoryIds.stationery,
        status: "Active",
      },
      {
        id: "b1c2d3e4-f5a6-4789-b012-345678901006",
        name: "Art Supplies",
        description: "Crayons, paints, craft materials",
        categoryId: categoryIds.stationery,
        status: "Active",
      },
      {
        id: "b1c2d3e4-f5a6-4789-b012-345678901007",
        name: "Detergents",
        description: "Cleaning liquids and disinfectants",
        categoryId: categoryIds.cleaningSupplies,
        status: "Active",
      },
      {
        id: "b1c2d3e4-f5a6-4789-b012-345678901008",
        name: "Cleaning Tools",
        description: "Brushes, mops, buckets, cloths",
        categoryId: categoryIds.cleaningSupplies,
        status: "Active",
      },
      {
        id: "b1c2d3e4-f5a6-4789-b012-345678901009",
        name: "Sanitary Supplies",
        description: "Tissue, soap, hygiene consumables",
        categoryId: categoryIds.cleaningSupplies,
        status: "Active",
      },
      {
        id: "b1c2d3e4-f5a6-4789-b012-345678901010",
        name: "Chemicals",
        description: "Lab chemicals and reagents",
        categoryId: categoryIds.laboratorySupplies,
        status: "Active",
      },
      {
        id: "b1c2d3e4-f5a6-4789-b012-345678901011",
        name: "Glassware",
        description: "Beakers, test tubes, lab glass",
        categoryId: categoryIds.laboratorySupplies,
        status: "Active",
      },
      {
        id: "b1c2d3e4-f5a6-4789-b012-345678901012",
        name: "Lab Safety",
        description: "Gloves, goggles, safety equipment",
        categoryId: categoryIds.laboratorySupplies,
        status: "Active",
      },
      {
        id: "b1c2d3e4-f5a6-4789-b012-345678901013",
        name: "Computers",
        description: "Desktops, laptops, tablets",
        categoryId: categoryIds.ictEquipment,
        status: "Active",
      },
      {
        id: "b1c2d3e4-f5a6-4789-b012-345678901014",
        name: "Peripherals",
        description: "Keyboards, mice, monitors, printers",
        categoryId: categoryIds.ictEquipment,
        status: "Active",
      },
      {
        id: "b1c2d3e4-f5a6-4789-b012-345678901015",
        name: "Networking",
        description: "Routers, cables, network accessories",
        categoryId: categoryIds.ictEquipment,
        status: "Active",
      },
      {
        id: "b1c2d3e4-f5a6-4789-b012-345678901016",
        name: "Desks",
        description: "Student and staff desks",
        categoryId: categoryIds.furniture,
        status: "Active",
      },
      {
        id: "b1c2d3e4-f5a6-4789-b012-345678901017",
        name: "Chairs",
        description: "Classroom and office seating",
        categoryId: categoryIds.furniture,
        status: "Active",
      },
      {
        id: "b1c2d3e4-f5a6-4789-b012-345678901018",
        name: "Storage Cabinets",
        description: "Cabinets, shelves, lockers",
        categoryId: categoryIds.furniture,
        status: "Active",
      },
      {
        id: "b1c2d3e4-f5a6-4789-b012-345678901019",
        name: "Team Sports",
        description: "Football, basketball, volleyball gear",
        categoryId: categoryIds.sportsPe,
        status: "Active",
      },
      {
        id: "b1c2d3e4-f5a6-4789-b012-345678901020",
        name: "Athletics",
        description: "Track and field equipment",
        categoryId: categoryIds.sportsPe,
        status: "Active",
      },
      {
        id: "b1c2d3e4-f5a6-4789-b012-345678901021",
        name: "Gym Equipment",
        description: "Indoor PE and fitness equipment",
        categoryId: categoryIds.sportsPe,
        status: "Active",
      },
      {
        id: "b1c2d3e4-f5a6-4789-b012-345678901022",
        name: "Hand Tools",
        description: "Hammers, screwdrivers, wrenches",
        categoryId: categoryIds.buildingMaintenance,
        status: "Active",
      },
      {
        id: "b1c2d3e4-f5a6-4789-b012-345678901023",
        name: "Electrical",
        description: "Bulbs, switches, wiring supplies",
        categoryId: categoryIds.buildingMaintenance,
        status: "Active",
      },
      {
        id: "b1c2d3e4-f5a6-4789-b012-345678901024",
        name: "Plumbing",
        description: "Pipes, fittings, plumbing consumables",
        categoryId: categoryIds.buildingMaintenance,
        status: "Active",
      },
    ];

    for (const sc of subCategories) {
      await prisma.subCategory.upsert({
        where: {
          name_categoryId: {
            name: sc.name,
            categoryId: sc.categoryId,
          },
        },
        update: {
          description: sc.description,
          status: sc.status,
        },
        create: sc,
      });
    }
    console.log(`   ✓ ${subCategories.length} sub-categories`);

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

    // Inventory items (linked to categories, sub-categories, brands, UOMs)
    console.log("📋 Seeding inventory items...");
    const uomIds = {
      piece: "5b15389c-3d56-4ec1-b848-43c76d435f35",
      carton: "f331e6b0-e5d3-4c3a-a6af-c46858c3396b",
      kilogram: "1c152b2e-bd60-418f-b312-08c1b001134a",
      liter: "7e0ebb54-6fc7-46f0-8853-27e23b2693af",
    };
    const brandIds = {
      generic: "f2a3b4c5-d6e7-4890-f012-345678902001",
      bic: "f2a3b4c5-d6e7-4890-f012-345678902002",
      hp: "f2a3b4c5-d6e7-4890-f012-345678902003",
      dell: "f2a3b4c5-d6e7-4890-f012-345678902004",
      logitech: "f2a3b4c5-d6e7-4890-f012-345678902005",
      staedtler: "f2a3b4c5-d6e7-4890-f012-345678902006",
      dettol: "f2a3b4c5-d6e7-4890-f012-345678902007",
      nike: "f2a3b4c5-d6e7-4890-f012-345678902008",
      deli: "f2a3b4c5-d6e7-4890-f012-345678902009",
      canon: "f2a3b4c5-d6e7-4890-f012-345678902010",
    };
    const subCategoryIds = {
      paperProducts: "b1c2d3e4-f5a6-4789-b012-345678901001",
      writingInstruments: "b1c2d3e4-f5a6-4789-b012-345678901002",
      filingStorage: "b1c2d3e4-f5a6-4789-b012-345678901003",
      notebooks: "b1c2d3e4-f5a6-4789-b012-345678901004",
      pensPencils: "b1c2d3e4-f5a6-4789-b012-345678901005",
      detergents: "b1c2d3e4-f5a6-4789-b012-345678901007",
      cleaningTools: "b1c2d3e4-f5a6-4789-b012-345678901008",
      glassware: "b1c2d3e4-f5a6-4789-b012-345678901011",
      computers: "b1c2d3e4-f5a6-4789-b012-345678901013",
      peripherals: "b1c2d3e4-f5a6-4789-b012-345678901014",
      desks: "b1c2d3e4-f5a6-4789-b012-345678901016",
      chairs: "b1c2d3e4-f5a6-4789-b012-345678901017",
      teamSports: "b1c2d3e4-f5a6-4789-b012-345678901019",
      electrical: "b1c2d3e4-f5a6-4789-b012-345678901023",
    };

    const inventoryItems = [
      {
        id: "f2a3b4c5-d6e7-4890-a012-345678903001",
        sku: "OFF-PAP-001",
        name: "A4 Copy Paper (500 Sheets)",
        categoryId: categoryIds.officeSupplies,
        subCategoryId: subCategoryIds.paperProducts,
        brandId: brandIds.deli,
        uomId: uomIds.carton,
        barcode: "8901234567001",
        costPrice: "4500.00",
        sellingPrice: "5500.00",
        lowStockThreshold: 10,
        status: "Active",
        createdById: adminUserId,
      },
      {
        id: "f2a3b4c5-d6e7-4890-a012-345678903002",
        sku: "OFF-PEN-001",
        name: "Ballpoint Pen Blue (Box of 50)",
        categoryId: categoryIds.officeSupplies,
        subCategoryId: subCategoryIds.writingInstruments,
        brandId: brandIds.bic,
        uomId: uomIds.carton,
        barcode: "8901234567002",
        costPrice: "3200.00",
        sellingPrice: "4000.00",
        lowStockThreshold: 5,
        status: "Active",
        createdById: adminUserId,
      },
      {
        id: "f2a3b4c5-d6e7-4890-a012-345678903003",
        sku: "OFF-FIL-001",
        name: "Lever Arch File A4",
        categoryId: categoryIds.officeSupplies,
        subCategoryId: subCategoryIds.filingStorage,
        brandId: brandIds.generic,
        uomId: uomIds.piece,
        barcode: "8901234567003",
        costPrice: "850.00",
        sellingPrice: "1200.00",
        lowStockThreshold: 20,
        status: "Active",
        createdById: adminUserId,
      },
      {
        id: "f2a3b4c5-d6e7-4890-a012-345678903004",
        sku: "STA-NBK-001",
        name: "Exercise Book 80 Leaves",
        categoryId: categoryIds.stationery,
        subCategoryId: subCategoryIds.notebooks,
        brandId: brandIds.generic,
        uomId: uomIds.piece,
        barcode: "8901234567004",
        costPrice: "350.00",
        sellingPrice: "500.00",
        lowStockThreshold: 100,
        status: "Active",
        createdById: adminUserId,
      },
      {
        id: "f2a3b4c5-d6e7-4890-a012-345678903005",
        sku: "STA-PNC-001",
        name: "HB Pencil Pack (12)",
        categoryId: categoryIds.stationery,
        subCategoryId: subCategoryIds.pensPencils,
        brandId: brandIds.staedtler,
        uomId: uomIds.piece,
        barcode: "8901234567005",
        costPrice: "600.00",
        sellingPrice: "900.00",
        lowStockThreshold: 30,
        status: "Active",
        createdById: adminUserId,
      },
      {
        id: "f2a3b4c5-d6e7-4890-a012-345678903006",
        sku: "CLN-SOP-001",
        name: "Liquid Hand Soap 5L",
        categoryId: categoryIds.cleaningSupplies,
        subCategoryId: subCategoryIds.detergents,
        brandId: brandIds.dettol,
        uomId: uomIds.liter,
        barcode: "8901234567006",
        costPrice: "2800.00",
        sellingPrice: "3500.00",
        lowStockThreshold: 8,
        status: "Active",
        createdById: adminUserId,
      },
      {
        id: "f2a3b4c5-d6e7-4890-a012-345678903007",
        sku: "CLN-MOP-001",
        name: "Mop Head Replacement",
        categoryId: categoryIds.cleaningSupplies,
        subCategoryId: subCategoryIds.cleaningTools,
        brandId: brandIds.generic,
        uomId: uomIds.piece,
        barcode: "8901234567007",
        costPrice: "1200.00",
        sellingPrice: "1800.00",
        lowStockThreshold: 15,
        status: "Active",
        createdById: adminUserId,
      },
      {
        id: "f2a3b4c5-d6e7-4890-a012-345678903008",
        sku: "LAB-BEK-001",
        name: "Beaker 250ml Borosilicate",
        categoryId: categoryIds.laboratorySupplies,
        subCategoryId: subCategoryIds.glassware,
        brandId: brandIds.generic,
        uomId: uomIds.piece,
        barcode: "8901234567008",
        costPrice: "1500.00",
        sellingPrice: "2200.00",
        lowStockThreshold: 12,
        status: "Active",
        createdById: adminUserId,
      },
      {
        id: "f2a3b4c5-d6e7-4890-a012-345678903009",
        sku: "ICT-DTP-001",
        name: "Desktop Computer Core i5 16GB",
        categoryId: categoryIds.ictEquipment,
        subCategoryId: subCategoryIds.computers,
        brandId: brandIds.hp,
        uomId: uomIds.piece,
        barcode: "8901234567009",
        costPrice: "485000.00",
        sellingPrice: "520000.00",
        lowStockThreshold: 2,
        status: "Active",
        createdById: adminUserId,
      },
      {
        id: "f2a3b4c5-d6e7-4890-a012-345678903010",
        sku: "ICT-MSE-001",
        name: "Wireless Optical Mouse",
        categoryId: categoryIds.ictEquipment,
        subCategoryId: subCategoryIds.peripherals,
        brandId: brandIds.logitech,
        uomId: uomIds.piece,
        barcode: "8901234567010",
        costPrice: "4500.00",
        sellingPrice: "6500.00",
        lowStockThreshold: 10,
        status: "Active",
        createdById: adminUserId,
      },
      {
        id: "f2a3b4c5-d6e7-4890-a012-345678903011",
        sku: "FUR-DSK-001",
        name: "Single Student Desk",
        categoryId: categoryIds.furniture,
        subCategoryId: subCategoryIds.desks,
        brandId: brandIds.generic,
        uomId: uomIds.piece,
        barcode: "8901234567011",
        costPrice: "28000.00",
        sellingPrice: "35000.00",
        lowStockThreshold: 5,
        status: "Active",
        createdById: adminUserId,
      },
      {
        id: "f2a3b4c5-d6e7-4890-a012-345678903012",
        sku: "FUR-CHR-001",
        name: "Plastic Classroom Chair",
        categoryId: categoryIds.furniture,
        subCategoryId: subCategoryIds.chairs,
        brandId: brandIds.generic,
        uomId: uomIds.piece,
        barcode: "8901234567012",
        costPrice: "8500.00",
        sellingPrice: "11000.00",
        lowStockThreshold: 10,
        status: "Active",
        createdById: adminUserId,
      },
      {
        id: "f2a3b4c5-d6e7-4890-a012-345678903013",
        sku: "SPT-FBL-001",
        name: "Football Size 5 Match",
        categoryId: categoryIds.sportsPe,
        subCategoryId: subCategoryIds.teamSports,
        brandId: brandIds.nike,
        uomId: uomIds.piece,
        barcode: "8901234567013",
        costPrice: "12000.00",
        sellingPrice: "15000.00",
        lowStockThreshold: 6,
        status: "Active",
        createdById: adminUserId,
      },
      {
        id: "f2a3b4c5-d6e7-4890-a012-345678903014",
        sku: "BLD-ELC-001",
        name: "LED Bulb 12W E27",
        categoryId: categoryIds.buildingMaintenance,
        subCategoryId: subCategoryIds.electrical,
        brandId: brandIds.generic,
        uomId: uomIds.piece,
        barcode: "8901234567014",
        costPrice: "950.00",
        sellingPrice: "1400.00",
        lowStockThreshold: 25,
        status: "Active",
        createdById: adminUserId,
      },
    ];

    for (const item of inventoryItems) {
      await prisma.inventoryItem.upsert({
        where: { name: item.name },
        update: {
          sku: item.sku,
          categoryId: item.categoryId,
          subCategoryId: item.subCategoryId,
          brandId: item.brandId,
          uomId: item.uomId,
          barcode: item.barcode,
          costPrice: item.costPrice,
          sellingPrice: item.sellingPrice,
          lowStockThreshold: item.lowStockThreshold,
          status: item.status,
          createdById: item.createdById,
        },
        create: item,
      });
    }
    console.log(`   ✓ ${inventoryItems.length} inventory items`);

    // Stores (+ UserStore access for managers, same as StoreService.createStore)
    console.log("🏬 Seeding stores...");
    const secondaryAdminUserId = "39fc583a-a071-49f3-980f-8932fa6cb6c9";
    const stores = [
      {
        id: "a3a4b5c6-d7e8-4890-a012-345678904001",
        name: "Main Central Store",
        description: "Primary inventory store for general school supplies",
        status: "Active",
        managerId: adminUserId,
      },
      {
        id: "a3a4b5c6-d7e8-4890-a012-345678904002",
        name: "Annex Campus Store",
        description: "Secondary campus storage and distribution point",
        status: "Active",
        managerId: secondaryAdminUserId,
      },
      {
        id: "a3a4b5c6-d7e8-4890-a012-345678904003",
        name: "Science Lab Store",
        description: "Laboratory chemicals, glassware, and safety stock",
        status: "Active",
        managerId: adminUserId,
      },
      {
        id: "a3a4b5c6-d7e8-4890-a012-345678904004",
        name: "Sports Equipment Store",
        description: "PE and sports gear storage",
        status: "Active",
        managerId: secondaryAdminUserId,
      },
    ];

    for (const st of stores) {
      const store = await prisma.store.upsert({
        where: { name: st.name },
        update: {
          description: st.description,
          status: st.status,
          managerId: st.managerId,
        },
        create: st,
      });

      if (store.managerId) {
        await prisma.userStore.upsert({
          where: {
            userId_storeId: {
              userId: store.managerId,
              storeId: store.id,
            },
          },
          create: {
            userId: store.managerId,
            storeId: store.id,
          },
          update: {},
        });
      }
    }
    console.log(`   ✓ ${stores.length} stores`);

    // Facilities
    console.log("🏢 Seeding facilities...");
    const facilities = [
      {
        id: "f7a8b9c0-d1e2-4234-f012-345678908001",
        name: "Main Auditorium",
        description: "Assembly hall and large school events",
        status: "Active",
        createdById: adminUserId,
      },
      {
        id: "f7a8b9c0-d1e2-4234-f012-345678908002",
        name: "Science Laboratory Block",
        description: "Physics, chemistry, and biology labs",
        status: "Active",
        createdById: adminUserId,
      },
      {
        id: "f7a8b9c0-d1e2-4234-f012-345678908003",
        name: "Sports Complex",
        description: "Football field, courts, and PE facilities",
        status: "Active",
        createdById: adminUserId,
      },
      {
        id: "f7a8b9c0-d1e2-4234-f012-345678908004",
        name: "School Library",
        description: "Reading rooms and learning resource centre",
        status: "Active",
        createdById: adminUserId,
      },
      {
        id: "f7a8b9c0-d1e2-4234-f012-345678908005",
        name: "ICT Laboratory",
        description: "Computer labs and digital learning spaces",
        status: "Active",
        createdById: adminUserId,
      },
      {
        id: "f7a8b9c0-d1e2-4234-f012-345678908006",
        name: "Administrative Block",
        description: "Offices, records, and staff workspaces",
        status: "Active",
        createdById: adminUserId,
      },
      {
        id: "f7a8b9c0-d1e2-4234-f012-345678908007",
        name: "Dining Hall",
        description: "Cafeteria and meal service area",
        status: "Active",
        createdById: adminUserId,
      },
    ];

    for (const facility of facilities) {
      await prisma.facility.upsert({
        where: { id: facility.id },
        update: {
          name: facility.name,
          description: facility.description,
          status: facility.status,
          createdById: facility.createdById,
        },
        create: facility,
      });
    }
    console.log(`   ✓ ${facilities.length} facilities`);

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

    // School classes and sub-classes (required for student class assignment)
    console.log("🎓 Seeding school classes and sub-classes...");
    const schoolClasses = [
      {
        id: "c4d5e6f7-a8b9-4012-c012-345678905001",
        name: "JSS 1",
        status: "Active",
        createdById: adminUserId,
      },
      {
        id: "c4d5e6f7-a8b9-4012-c012-345678905002",
        name: "JSS 2",
        status: "Active",
        createdById: adminUserId,
      },
      {
        id: "c4d5e6f7-a8b9-4012-c012-345678905003",
        name: "JSS 3",
        status: "Active",
        createdById: adminUserId,
      },
      {
        id: "c4d5e6f7-a8b9-4012-c012-345678905004",
        name: "SS 1",
        status: "Active",
        createdById: adminUserId,
      },
      {
        id: "c4d5e6f7-a8b9-4012-c012-345678905005",
        name: "SS 2",
        status: "Active",
        createdById: adminUserId,
      },
    ];

    for (const cls of schoolClasses) {
      await prisma.schoolClass.upsert({
        where: { name: cls.name },
        update: { status: cls.status },
        create: cls,
      });
    }

    const classIds = {
      jss1: "c4d5e6f7-a8b9-4012-c012-345678905001",
      jss2: "c4d5e6f7-a8b9-4012-c012-345678905002",
      jss3: "c4d5e6f7-a8b9-4012-c012-345678905003",
      ss1: "c4d5e6f7-a8b9-4012-c012-345678905004",
      ss2: "c4d5e6f7-a8b9-4012-c012-345678905005",
    };

    const subClasses = [
      {
        id: "d5e6f7a8-b9c0-4123-d012-345678906001",
        name: "A",
        classId: classIds.jss1,
        status: "Active",
      },
      {
        id: "d5e6f7a8-b9c0-4123-d012-345678906002",
        name: "B",
        classId: classIds.jss1,
        status: "Active",
      },
      {
        id: "d5e6f7a8-b9c0-4123-d012-345678906003",
        name: "A",
        classId: classIds.jss2,
        status: "Active",
      },
      {
        id: "d5e6f7a8-b9c0-4123-d012-345678906004",
        name: "B",
        classId: classIds.jss2,
        status: "Active",
      },
      {
        id: "d5e6f7a8-b9c0-4123-d012-345678906005",
        name: "A",
        classId: classIds.ss1,
        status: "Active",
      },
      {
        id: "d5e6f7a8-b9c0-4123-d012-345678906006",
        name: "A",
        classId: classIds.jss3,
        status: "Active",
      },
      {
        id: "d5e6f7a8-b9c0-4123-d012-345678906007",
        name: "A",
        classId: classIds.ss2,
        status: "Active",
      },
    ];

    for (const sub of subClasses) {
      await prisma.subClass.upsert({
        where: {
          name_classId: {
            name: sub.name,
            classId: sub.classId,
          },
        },
        update: { status: sub.status },
        create: sub,
      });
    }
    console.log(`   ✓ ${schoolClasses.length} classes, ${subClasses.length} sub-classes`);

    // Students (+ AR ledger accounts under STUDENT_SUBHEAD)
    console.log("👨‍🎓 Seeding students...");
    const subClassIds = {
      jss1A: "d5e6f7a8-b9c0-4123-d012-345678906001",
      jss1B: "d5e6f7a8-b9c0-4123-d012-345678906002",
      jss2A: "d5e6f7a8-b9c0-4123-d012-345678906003",
      jss2B: "d5e6f7a8-b9c0-4123-d012-345678906004",
      ss1A: "d5e6f7a8-b9c0-4123-d012-345678906005",
      jss3A: "d5e6f7a8-b9c0-4123-d012-345678906006",
      ss2A: "d5e6f7a8-b9c0-4123-d012-345678906007",
    };

    const students = [
      {
        id: "e6f7a8b9-c0d1-4234-e012-345678907001",
        userId: "f1a2b3c4-d5e6-4789-a001-222222222201",
        guardianUserId: "f1a2b3c4-d5e6-4789-a001-222222222301",
        admissionNumber: "ADM2025001",
        firstName: "Chioma",
        middleName: "Ada",
        lastName: "Adebayo",
        studentEmail: "chioma.adebayo@student.school.ng",
        gender: "female",
        dateOfBirth: new Date("2013-04-12"),
        classId: classIds.jss1,
        subClassId: subClassIds.jss1A,
        guardianName: "Mr. Tunde Adebayo",
        guardianEmail: "tunde.adebayo@email.com",
        guardianContact: "+2348011111001",
        address: "12 Admiralty Way, Lekki, Lagos",
        imageUrl: "https://randomuser.me/api/portraits/women/12.jpg",
        status: "Active",
        createdById: adminUserId,
      },
      {
        id: "e6f7a8b9-c0d1-4234-e012-345678907002",
        userId: "f1a2b3c4-d5e6-4789-a001-222222222202",
        guardianUserId: "f1a2b3c4-d5e6-4789-a001-222222222302",
        admissionNumber: "ADM2025002",
        firstName: "Ibrahim",
        middleName: null,
        lastName: "Musa",
        studentEmail: "ibrahim.musa@student.school.ng",
        gender: "male",
        dateOfBirth: new Date("2013-08-25"),
        classId: classIds.jss1,
        subClassId: subClassIds.jss1B,
        guardianName: "Mrs. Halima Musa",
        guardianEmail: "halima.musa@email.com",
        guardianContact: "+2348011111002",
        address: "5 Zaria Road, Kaduna",
        imageUrl: "https://randomuser.me/api/portraits/men/22.jpg",
        status: "Active",
        createdById: adminUserId,
      },
      {
        id: "e6f7a8b9-c0d1-4234-e012-345678907003",
        guardianUserId: "f1a2b3c4-d5e6-4789-a001-222222222303",
        admissionNumber: "ADM2025003",
        firstName: "Grace",
        middleName: "Chinelo",
        lastName: "Okoro",
        studentEmail: null,
        gender: "female",
        dateOfBirth: new Date("2012-11-03"),
        classId: classIds.jss2,
        subClassId: subClassIds.jss2A,
        guardianName: "Mr. Peter Okoro",
        guardianEmail: "peter.okoro@email.com",
        guardianContact: "+2348011111003",
        address: "22 Ogui Road, Enugu",
        imageUrl: "https://randomuser.me/api/portraits/women/33.jpg",
        status: "Active",
        createdById: adminUserId,
      },
      {
        id: "e6f7a8b9-c0d1-4234-e012-345678907004",
        userId: "f1a2b3c4-d5e6-4789-a001-222222222204",
        guardianUserId: "f1a2b3c4-d5e6-4789-a001-222222222304",
        admissionNumber: "ADM2025004",
        firstName: "David",
        middleName: "Oluwaseun",
        lastName: "Balogun",
        studentEmail: "david.balogun@student.school.ng",
        gender: "male",
        dateOfBirth: new Date("2012-01-19"),
        classId: classIds.jss2,
        subClassId: subClassIds.jss2B,
        guardianName: "Mrs. Funke Balogun",
        guardianEmail: "funke.balogun@email.com",
        guardianContact: "+2348011111004",
        address: "9 Ring Road, Ibadan",
        imageUrl: "https://randomuser.me/api/portraits/men/44.jpg",
        status: "Active",
        createdById: adminUserId,
      },
      {
        id: "e6f7a8b9-c0d1-4234-e012-345678907005",
        userId: "f1a2b3c4-d5e6-4789-a001-222222222205",
        guardianUserId: "f1a2b3c4-d5e6-4789-a001-222222222305",
        admissionNumber: "ADM2025005",
        firstName: "Amina",
        middleName: null,
        lastName: "Yusuf",
        studentEmail: "amina.yusuf@student.school.ng",
        gender: "female",
        dateOfBirth: new Date("2011-06-30"),
        classId: classIds.jss3,
        subClassId: subClassIds.jss3A,
        guardianName: "Alhaji Yusuf Ibrahim",
        guardianEmail: "yusuf.ibrahim@email.com",
        guardianContact: "+2348011111005",
        address: "3 Kano Road, Kano",
        imageUrl: "https://randomuser.me/api/portraits/women/55.jpg",
        status: "Active",
        createdById: adminUserId,
      },
      {
        id: "e6f7a8b9-c0d1-4234-e012-345678907006",
        userId: "f1a2b3c4-d5e6-4789-a001-222222222206",
        guardianUserId: "f1a2b3c4-d5e6-4789-a001-222222222306",
        admissionNumber: "ADM2025006",
        firstName: "Emmanuel",
        middleName: "Chukwu",
        lastName: "Eze",
        studentEmail: "emmanuel.eze@student.school.ng",
        gender: "male",
        dateOfBirth: new Date("2010-09-14"),
        classId: classIds.ss1,
        subClassId: subClassIds.ss1A,
        guardianName: "Mr. Chinedu Eze",
        guardianEmail: "chinedu.eze@email.com",
        guardianContact: "+2348011111006",
        address: "14 Aba Road, Port Harcourt",
        imageUrl: "https://randomuser.me/api/portraits/men/66.jpg",
        status: "Active",
        createdById: adminUserId,
      },
      {
        id: "e6f7a8b9-c0d1-4234-e012-345678907007",
        guardianUserId: "f1a2b3c4-d5e6-4789-a001-222222222307",
        admissionNumber: "ADM2025007",
        firstName: "Fatima",
        middleName: "Zainab",
        lastName: "Bello",
        studentEmail: null,
        gender: "female",
        dateOfBirth: new Date("2010-12-08"),
        classId: classIds.ss1,
        subClassId: subClassIds.ss1A,
        guardianName: "Dr. Aisha Bello",
        guardianEmail: "aisha.bello@email.com",
        guardianContact: "+2348011111007",
        address: "7 Garki Area 11, Abuja",
        imageUrl: "https://randomuser.me/api/portraits/women/68.jpg",
        status: "Active",
        createdById: adminUserId,
      },
      {
        id: "e6f7a8b9-c0d1-4234-e012-345678907008",
        userId: "f1a2b3c4-d5e6-4789-a001-222222222208",
        guardianUserId: "f1a2b3c4-d5e6-4789-a001-222222222308",
        admissionNumber: "ADM2025008",
        firstName: "Samuel",
        middleName: null,
        lastName: "Ojo",
        studentEmail: "samuel.ojo@student.school.ng",
        gender: "male",
        dateOfBirth: new Date("2009-05-22"),
        classId: classIds.ss2,
        subClassId: subClassIds.ss2A,
        guardianName: "Mrs. Bola Ojo",
        guardianEmail: "bola.ojo@email.com",
        guardianContact: "+2348011111008",
        address: "18 Allen Avenue, Ikeja, Lagos",
        imageUrl: "https://randomuser.me/api/portraits/men/75.jpg",
        status: "Active",
        createdById: adminUserId,
      },
    ];

    const MIN_STUDENTS_PER_SUBCLASS = 10;
    const subclassStudentTargets = [
      { subClassId: subClassIds.jss1A, classId: classIds.jss1, slug: "jss1a", birthYear: 2013 },
      { subClassId: subClassIds.jss1B, classId: classIds.jss1, slug: "jss1b", birthYear: 2013 },
      { subClassId: subClassIds.jss2A, classId: classIds.jss2, slug: "jss2a", birthYear: 2012 },
      { subClassId: subClassIds.jss2B, classId: classIds.jss2, slug: "jss2b", birthYear: 2012 },
      { subClassId: subClassIds.jss3A, classId: classIds.jss3, slug: "jss3a", birthYear: 2011 },
      { subClassId: subClassIds.ss1A, classId: classIds.ss1, slug: "ss1a", birthYear: 2010 },
      { subClassId: subClassIds.ss2A, classId: classIds.ss2, slug: "ss2a", birthYear: 2009 },
    ];
    const maleFirstNames = [
      "Tunde",
      "Chidi",
      "Emeka",
      "Yusuf",
      "Segun",
      "Kelechi",
      "Hassan",
      "Victor",
      "Daniel",
      "Michael",
    ];
    const femaleFirstNames = [
      "Ada",
      "Ngozi",
      "Halima",
      "Blessing",
      "Zainab",
      "Chiamaka",
      "Aisha",
      "Precious",
      "Mary",
      "Joy",
    ];
    const lastNames = [
      "Okafor",
      "Adeyemi",
      "Mohammed",
      "Abubakar",
      "Nwankwo",
      "Suleiman",
      "Ekanem",
      "Garba",
      "Obi",
      "Lawal",
    ];
    const cities = [
      "Lagos",
      "Abuja",
      "Kano",
      "Port Harcourt",
      "Ibadan",
      "Enugu",
      "Kaduna",
      "Benin City",
    ];

    let generatedStudentSeq = students.length + 1;
    for (const target of subclassStudentTargets) {
      const currentCount = students.filter((row) => row.subClassId === target.subClassId).length;
      const needed = MIN_STUDENTS_PER_SUBCLASS - currentCount;
      if (needed <= 0) continue;

      for (let i = 0; i < needed; i += 1) {
        const seq = generatedStudentSeq;
        const gender = seq % 2 === 0 ? "female" : "male";
        const firstNamePool = gender === "female" ? femaleFirstNames : maleFirstNames;
        const firstName = firstNamePool[i % firstNamePool.length];
        const lastName = lastNames[(seq + i) % lastNames.length];
        const admissionNumber = `ADM2025${String(seq).padStart(4, "0")}`;
        const month = String(((seq + i) % 12) + 1).padStart(2, "0");
        const day = String(((seq * 3 + i) % 28) + 1).padStart(2, "0");
        const withPortalAccount = seq % 3 !== 0;
        const studentEmail = withPortalAccount
          ? `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${target.slug}${String(i + 1).padStart(2, "0")}@student.school.ng`
          : null;

        students.push({
          id: `e6f7a8b9-c0d1-4234-e012-345678907${String(seq).padStart(3, "0")}`,
          ...(withPortalAccount
            ? { userId: `f1a2b3c4-d5e6-4789-a001-22222222${String(2000 + seq).slice(-4)}` }
            : {}),
          guardianUserId: `f1a2b3c4-d5e6-4789-a001-22222222${String(3000 + seq).slice(-4)}`,
          admissionNumber,
          firstName,
          middleName: seq % 4 === 0 ? "Seed" : null,
          lastName,
          studentEmail,
          gender,
          dateOfBirth: new Date(`${target.birthYear}-${month}-${day}`),
          classId: target.classId,
          subClassId: target.subClassId,
          guardianName: `${gender === "female" ? "Mrs." : "Mr."} ${lastName} Parent`,
          guardianEmail: `guardian.${target.slug}.${String(i + 1).padStart(2, "0")}@email.com`,
          guardianContact: `+2348012${String(100000 + seq).slice(-6)}`,
          address: `${((seq + i) % 40) + 1} ${cities[(seq + i) % cities.length]} Street`,
          imageUrl: `https://randomuser.me/api/portraits/${gender === "female" ? "women" : "men"}/${(seq % 70) + 1}.jpg`,
          status: "Active",
          createdById: adminUserId,
        });
        generatedStudentSeq += 1;
      }
    }

    let studentLedgerCount = 0;
    let studentUserCount = 0;
    let guardianUserCount = 0;
    const guardianEmailsSeeded = new Set();

    for (const st of students) {
      const guardianEmail = st.guardianEmail?.trim().toLowerCase();
      const studentEmail = st.studentEmail?.trim().toLowerCase();
      const guardianWasNew =
        guardianEmail && guardianEmail !== studentEmail && !guardianEmailsSeeded.has(guardianEmail);

      await upsertStudentWithUsers(hashedPassword, st);

      if (studentEmail) studentUserCount += 1;
      if (guardianWasNew) {
        guardianEmailsSeeded.add(guardianEmail);
        guardianUserCount += 1;
      }
      // No need of creating ledger accounts for students
      // const ledgerId = await ensureStudentLedgerAccount(student);
      // if (ledgerId) {
      //   studentLedgerCount += 1;
      // }
    }
    console.log(
      `   ✓ ${students.length} students (${studentUserCount} student users, ${guardianUserCount} guardian users), ${studentLedgerCount} student ledger accounts`
    );

    const portalStudentUsers = await prisma.user.findMany({
      where: { userType: "Student" },
      select: { id: true },
    });
    for (const { id } of portalStudentUsers) {
      await assignUserAppRole(id, STUDENT_ROLE_ID);
    }

    const portalParentUsers = await prisma.user.findMany({
      where: { userType: "Parent" },
      select: { id: true },
    });
    for (const { id } of portalParentUsers) {
      await assignUserAppRole(id, PARENT_ROLE_ID);
    }
    console.log(
      `   ✓ ${portalStudentUsers.length} student users and ${portalParentUsers.length} parent users linked to portal roles`
    );

    // Academic sessions and terms
    console.log("📅 Seeding sessions and terms...");
    const sessions = [
      {
        id: "c1a2b3c4-d5e6-4789-a001-111111111101",
        name: "2024/2025",
        status: "Active",
      },
      {
        id: "c1a2b3c4-d5e6-4789-a001-111111111102",
        name: "2025/2026",
        status: "Active",
      },
      {
        id: "c1a2b3c4-d5e6-4789-a001-111111111103",
        name: "2026/2027",
        status: "Active",
      },
    ];

    const terms = [
      {
        id: "d2b3c4d5-e6f7-4890-b012-222222222201",
        name: "First Term",
        status: "Active",
      },
      {
        id: "d2b3c4d5-e6f7-4890-b012-222222222202",
        name: "Second Term",
        status: "Active",
      },
      {
        id: "d2b3c4d5-e6f7-4890-b012-222222222203",
        name: "Third Term",
        status: "Active",
      },
    ];

    for (const s of sessions) {
      await prisma.session.upsert({
        where: { name: s.name },
        update: { status: s.status },
        create: s,
      });
    }

    for (const t of terms) {
      await prisma.term.upsert({
        where: { name: t.name },
        update: { status: t.status },
        create: t,
      });
    }

    const seededSession = await prisma.session.findUnique({
      where: { name: "2025/2026" },
      select: { id: true },
    });
    const seededTerm = await prisma.term.findUnique({
      where: { name: "Third Term" },
      select: { id: true },
    });

    if (!seededSession || !seededTerm) {
      throw new Error("Failed to resolve seeded session or term for period records");
    }

    const activePeriodStart = new Date("2026-05-01T00:00:00.000Z");
    const activePeriodEnd = new Date("2026-07-31T00:00:00.000Z");

    console.log("🗓️ Seeding active period and default billing period...");
    await prisma.activePeriod.upsert({
      where: { id: "e3c4d5e6-f7a8-4901-c123-333333333301" },
      update: {
        startDate: activePeriodStart,
        endDate: activePeriodEnd,
        sessionId: seededSession.id,
        termId: seededTerm.id,
        updatedAt: new Date(),
      },
      create: {
        id: "e3c4d5e6-f7a8-4901-c123-333333333301",
        startDate: activePeriodStart,
        endDate: activePeriodEnd,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
    });

    await prisma.defaultBillingPeriod.upsert({
      where: { id: "f4d5e6f7-a8b9-4012-d234-444444444401" },
      update: {
        startDate: activePeriodStart,
        endDate: activePeriodEnd,
        sessionId: seededSession.id,
        termId: seededTerm.id,
        updatedAt: new Date(),
      },
      create: {
        id: "f4d5e6f7-a8b9-4012-d234-444444444401",
        startDate: activePeriodStart,
        endDate: activePeriodEnd,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
    });

    console.log(
      `   ✓ ${sessions.length} sessions, ${terms.length} terms, 1 active period, 1 default billing period`
    );
    console.log(
      `   ✓ Current period: ${seededSession.id} (2025/2026) + ${seededTerm.id} (Third Term)`
    );

    // ─── Assessment & grading (templates, subjects, registrations, scores) ───
    console.log("📝 Seeding assessment and grading data...");

    // Reset assessment/grading tables for idempotent reseed (dev seed data only)
    await prisma.studentAssessmentScore.deleteMany({});
    await prisma.studentBehaviouralAssessmentScore.deleteMany({});
    await prisma.assessmentRemarks.deleteMany({});
    await prisma.defaultClassRemarkSetup.deleteMany({});
    await prisma.studentSubjectRegistration.deleteMany({});
    await prisma.teacherSubjects.deleteMany({});
    await prisma.classSubject.deleteMany({});
    await prisma.classAssessmentTemplate.deleteMany({});
    await prisma.assessmentComponent.deleteMany({});
    await prisma.behaviouralAssessmentComponent.deleteMany({});
    await prisma.gradingTemplateItem.deleteMany({});
    await prisma.behaviouralGradingItem.deleteMany({});
    await prisma.subject.deleteMany({});
    await prisma.assessmentTemplate.deleteMany({});
    await prisma.behaviouralAssessmentTemplate.deleteMany({});
    await prisma.gradingTemplate.deleteMany({});
    await prisma.behaviouralGradingTemplate.deleteMany({});

    const ASMT_VER_JSS = "b2c3d4e5-f6a7-4a90-8123-456789ab0001";
    const ASMT_VER_SS = "c3d4e5f6-a7b8-4b01-9234-567890ab0002";

    const AT = {
      JSS: "d4e5f6a7-b8c9-4c12-a345-678901ab0003",
      SS: "e5f6a7b8-c9d0-4d23-b456-789012ab0004",
    };

    const assessmentTemplates = [
      {
        id: AT.JSS,
        name: "Junior Secondary Continuous Assessment",
        description: "CA1, CA2, mid-term test, and end-of-term exam for JSS classes",
        versionId: ASMT_VER_JSS,
        parentTemplateId: null,
        status: "Active",
      },
      {
        id: AT.SS,
        name: "Senior Secondary Examination",
        description: "Continuous assessment and final examination for SS classes",
        versionId: ASMT_VER_SS,
        parentTemplateId: null,
        status: "Active",
      },
    ];

    for (const tpl of assessmentTemplates) {
      await prisma.assessmentTemplate.upsert({
        where: { id: tpl.id },
        update: {
          name: tpl.name,
          description: tpl.description,
          versionId: tpl.versionId,
          parentTemplateId: tpl.parentTemplateId,
          status: tpl.status,
        },
        create: tpl,
      });
    }

    const AC = {
      JSS_CA1: "f6a7b8c9-d0e1-4e34-a567-890123ab0005",
      JSS_CA2: "a7b8c9d0-e1f2-4f45-b678-901234ab0006",
      JSS_MID: "b8c9d0e1-f2a3-4056-c789-012345ab0007",
      JSS_EXAM: "c9d0e1f2-a3b4-4167-d890-123456ab0008",
      SS_CA: "d0e1f2a3-b4c5-4278-e901-234567ab0009",
      SS_EXAM: "e1f2a3b4-c5d6-4389-f012-345678ab0010",
    };

    const assessmentComponents = [
      {
        id: AC.JSS_CA1,
        templateId: AT.JSS,
        name: "First Continuous Assessment",
        shortName: "CA1",
        maxScore: 10,
        weight: 10,
        orderNo: 1,
        status: "Active",
        isLocked: false,
      },
      {
        id: AC.JSS_CA2,
        templateId: AT.JSS,
        name: "Second Continuous Assessment",
        shortName: "CA2",
        maxScore: 10,
        weight: 10,
        orderNo: 2,
        status: "Active",
        isLocked: false,
      },
      {
        id: AC.JSS_MID,
        templateId: AT.JSS,
        name: "Mid-Term Test",
        shortName: "MID",
        maxScore: 20,
        weight: 20,
        orderNo: 3,
        status: "Active",
        isLocked: false,
      },
      {
        id: AC.JSS_EXAM,
        templateId: AT.JSS,
        name: "End of Term Examination",
        shortName: "EXAM",
        maxScore: 60,
        weight: 60,
        orderNo: 4,
        status: "Active",
        isLocked: true,
      },
      {
        id: AC.SS_CA,
        templateId: AT.SS,
        name: "Continuous Assessment",
        shortName: "CA",
        maxScore: 40,
        weight: 40,
        orderNo: 1,
        status: "Active",
        isLocked: false,
      },
      {
        id: AC.SS_EXAM,
        templateId: AT.SS,
        name: "Final Examination",
        shortName: "EXAM",
        maxScore: 60,
        weight: 60,
        orderNo: 2,
        status: "Active",
        isLocked: false,
      },
    ];

    for (const comp of assessmentComponents) {
      await prisma.assessmentComponent.upsert({
        where: { id: comp.id },
        update: {
          templateId: comp.templateId,
          name: comp.name,
          shortName: comp.shortName,
          maxScore: comp.maxScore,
          weight: comp.weight,
          orderNo: comp.orderNo,
          status: comp.status,
          isLocked: comp.isLocked,
        },
        create: comp,
      });
    }

    const classAssessmentTemplates = [
      {
        id: "f2a3b4c5-d6e7-4890-a123-456789ab0011",
        classId: classIds.jss1,
        templateId: AT.JSS,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: "a3b4c5d6-e7f8-4901-b234-567890ab0012",
        classId: classIds.jss2,
        templateId: AT.JSS,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: "b4c5d6e7-f8a9-4012-c345-678901ab0013",
        classId: classIds.ss1,
        templateId: AT.SS,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: "c5d6e7f8-a9b0-4123-d456-789012ab0110",
        classId: classIds.jss3,
        templateId: AT.JSS,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: "d6e7f8a9-b0c1-4234-e567-890123ab0111",
        classId: classIds.ss2,
        templateId: AT.SS,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
    ];

    for (const row of classAssessmentTemplates) {
      await prisma.classAssessmentTemplate.upsert({
        where: { id: row.id },
        update: {
          classId: row.classId,
          templateId: row.templateId,
          sessionId: row.sessionId,
          termId: row.termId,
        },
        create: row,
      });
    }

    const SUB = {
      MTH: "c5d6e7f8-a9b0-4123-d456-789012ab0014",
      ENG: "d6e7f8a9-b0c1-4234-e567-890123ab0015",
      BST: "e7f8a9b0-c1d2-4345-f678-901234ab0016",
      CIV: "f8a9b0c1-d2e3-4456-a789-012345ab0017",
      CRS: "a9b0c1d2-e3f4-4567-b890-123456ab0018",
    };

    const subjects = [
      { id: SUB.MTH, code: "MTH", name: "Mathematics" },
      { id: SUB.ENG, code: "ENG", name: "English Language" },
      { id: SUB.BST, code: "BST", name: "Basic Science and Technology" },
      { id: SUB.CIV, code: "CIV", name: "Civic Education" },
      { id: SUB.CRS, code: "CRS", name: "Christian Religious Studies" },
    ];

    for (const sub of subjects) {
      await prisma.subject.upsert({
        where: { id: sub.id },
        update: { code: sub.code, name: sub.name, status: "Active" },
        create: { ...sub, status: "Active" },
      });
    }

    const classSubjects = [
      {
        id: "b0c1d2e3-f4a5-4623-c789-012345ab0019",
        classId: classIds.jss1,
        subclassId: null,
        subjectId: SUB.MTH,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: "c1d2e3f4-a5b6-4734-d890-123456ab0020",
        classId: classIds.jss1,
        subclassId: null,
        subjectId: SUB.ENG,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: "d2e3f4a5-b6c7-4845-e901-234567ab0021",
        classId: classIds.jss1,
        subclassId: subClassIds.jss1A,
        subjectId: SUB.BST,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: "e3f4a5b6-c7d8-4956-f012-345678ab0022",
        classId: classIds.jss2,
        subclassId: null,
        subjectId: SUB.MTH,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: "f4a5b6c7-d8e9-4067-a123-456789ab0023",
        classId: classIds.jss2,
        subclassId: null,
        subjectId: SUB.CIV,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: "a5b6c7d8-e9f0-4178-b234-567890ab0100",
        classId: classIds.jss3,
        subclassId: null,
        subjectId: SUB.MTH,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: "b6c7d8e9-f0a1-4289-c345-678901ab0101",
        classId: classIds.jss3,
        subclassId: null,
        subjectId: SUB.ENG,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: "c7d8e9f0-a1b2-4390-d456-789012ab0102",
        classId: classIds.ss1,
        subclassId: null,
        subjectId: SUB.MTH,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: "d8e9f0a1-b2c3-4401-e567-890123ab0103",
        classId: classIds.ss1,
        subclassId: null,
        subjectId: SUB.ENG,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: "e9f0a1b2-c3d4-4512-f678-901234ab0104",
        classId: classIds.ss1,
        subclassId: null,
        subjectId: SUB.CRS,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: "f0a1b2c3-d4e5-4623-a789-012345ab0105",
        classId: classIds.ss2,
        subclassId: null,
        subjectId: SUB.ENG,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: "a1b2c3d4-e5f6-4734-b890-123456ab0106",
        classId: classIds.ss2,
        subclassId: null,
        subjectId: SUB.CRS,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
    ];

    for (const row of classSubjects) {
      await prisma.classSubject.upsert({
        where: { id: row.id },
        update: {
          classId: row.classId,
          subclassId: row.subclassId,
          subjectId: row.subjectId,
          sessionId: row.sessionId,
          termId: row.termId,
        },
        create: row,
      });
    }

    const STAFF = {
      ADA: "a8b9c0d1-e2f3-4234-a012-345678909003",
      JAMES: "a8b9c0d1-e2f3-4234-a012-345678909004",
      FATIMA: "a8b9c0d1-e2f3-4234-a012-345678909005",
      CHIDI: "a8b9c0d1-e2f3-4234-a012-345678909006",
    };

    const STAFF_USER = {
      ADA: "a8b9c0d1-e2f3-4234-a012-34567890a003",
      JAMES: "a8b9c0d1-e2f3-4234-a012-34567890a004",
      FATIMA: "a8b9c0d1-e2f3-4234-a012-34567890a005",
      CHIDI: "a8b9c0d1-e2f3-4234-a012-34567890a006",
    };

    const teacherSubjects = [
      {
        id: "f9a0b1c2-d3e4-4567-a890-123456ab0060",
        staffId: STAFF.ADA,
        userId: STAFF_USER.ADA,
        subjectId: SUB.MTH,
        classId: classIds.jss1,
        subclassId: subClassIds.jss1A,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: "a0b1c2d3-e4f5-4678-b901-234567ab0061",
        staffId: STAFF.ADA,
        userId: STAFF_USER.ADA,
        subjectId: SUB.ENG,
        classId: classIds.jss1,
        subclassId: subClassIds.jss1A,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: "b1c2d3e4-f5a6-4789-c012-345678ab0062",
        staffId: STAFF.FATIMA,
        userId: STAFF_USER.FATIMA,
        subjectId: SUB.ENG,
        classId: classIds.jss1,
        subclassId: subClassIds.jss1B,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: "c2d3e4f5-a6b7-4890-d123-456789ab0063",
        staffId: STAFF.JAMES,
        userId: STAFF_USER.JAMES,
        subjectId: SUB.MTH,
        classId: classIds.jss1,
        subclassId: subClassIds.jss1B,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: "d3e4f5a6-b7c8-4901-e234-567890ab0064",
        staffId: STAFF.JAMES,
        userId: STAFF_USER.JAMES,
        subjectId: SUB.BST,
        classId: classIds.jss1,
        subclassId: subClassIds.jss1A,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: "e4f5a6b7-c8d9-4012-f345-678901ab0065",
        staffId: STAFF.JAMES,
        userId: STAFF_USER.JAMES,
        subjectId: SUB.MTH,
        classId: classIds.jss2,
        subclassId: subClassIds.jss2A,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: "f5a6b7c8-d9e0-4123-a456-789012ab0066",
        staffId: STAFF.CHIDI,
        userId: STAFF_USER.CHIDI,
        subjectId: SUB.CIV,
        classId: classIds.jss2,
        subclassId: subClassIds.jss2A,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
    ];

    for (const row of teacherSubjects) {
      await prisma.teacherSubjects.upsert({
        where: { id: row.id },
        update: {
          staffId: row.staffId,
          userId: row.userId,
          subjectId: row.subjectId,
          classId: row.classId,
          subclassId: row.subclassId,
          sessionId: row.sessionId,
          termId: row.termId,
        },
        create: row,
      });
    }

    const STU = {
      CHIOMA: "e6f7a8b9-c0d1-4234-e012-345678907001",
      IBRAHIM: "e6f7a8b9-c0d1-4234-e012-345678907002",
      GRACE: "e6f7a8b9-c0d1-4234-e012-345678907003",
      DAVID: "e6f7a8b9-c0d1-4234-e012-345678907004",
      AMINA: "e6f7a8b9-c0d1-4234-e012-345678907005",
      EMMANUEL: "e6f7a8b9-c0d1-4234-e012-345678907006",
      FATIMA: "e6f7a8b9-c0d1-4234-e012-345678907007",
      SAMUEL: "e6f7a8b9-c0d1-4234-e012-345678907008",
    };

    const SSR = {
      CHIOMA_MTH: "a5b6c7d8-e9f0-4178-b234-567890ab0024",
      CHIOMA_ENG: "b6c7d8e9-f0a1-4289-c345-678901ab0025",
      CHIOMA_BST: "c7d8e9f0-a1b2-4390-d456-789012ab0120",
      IBRAHIM_MTH: "c7d8e9f0-a1b2-4390-d456-789012ab0026",
      IBRAHIM_ENG: "d8e9f0a1-b2c3-4401-e567-890123ab0121",
      GRACE_MTH: "d8e9f0a1-b2c3-4401-e567-890123ab0027",
      GRACE_CIV: "e9f0a1b2-c3d4-4512-f678-901234ab0122",
      DAVID_MTH: "f0a1b2c3-d4e5-4623-a789-012345ab0123",
      DAVID_CIV: "a1b2c3d4-e5f6-4734-b890-123456ab0124",
      AMINA_MTH: "b2c3d4e5-f6a7-4845-c901-234567ab0125",
      AMINA_ENG: "c3d4e5f6-a7b8-4956-d012-345678ab0126",
      EMMANUEL_MTH: "d4e5f6a7-b8c9-4067-e123-456789ab0127",
      EMMANUEL_ENG: "e5f6a7b8-c9d0-4178-f234-567890ab0128",
      EMMANUEL_CRS: "f6a7b8c9-d0e1-4289-a345-678901ab0129",
      FATIMA_ENG: "a7b8c9d0-e1f2-4390-b456-789012ab0130",
      FATIMA_CRS: "b8c9d0e1-f2a3-4401-c567-890123ab0131",
      SAMUEL_ENG: "c9d0e1f2-a3b4-4512-d678-901234ab0132",
      SAMUEL_CRS: "d0e1f2a3-b4c5-4623-e789-012345ab0133",
    };

    const studentSubjectRegistrations = [
      {
        id: SSR.CHIOMA_MTH,
        studentId: STU.CHIOMA,
        classId: classIds.jss1,
        subclassId: subClassIds.jss1A,
        subjectId: SUB.MTH,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: SSR.CHIOMA_ENG,
        studentId: STU.CHIOMA,
        classId: classIds.jss1,
        subclassId: subClassIds.jss1A,
        subjectId: SUB.ENG,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: SSR.CHIOMA_BST,
        studentId: STU.CHIOMA,
        classId: classIds.jss1,
        subclassId: subClassIds.jss1A,
        subjectId: SUB.BST,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: SSR.IBRAHIM_MTH,
        studentId: STU.IBRAHIM,
        classId: classIds.jss1,
        subclassId: subClassIds.jss1B,
        subjectId: SUB.MTH,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: SSR.IBRAHIM_ENG,
        studentId: STU.IBRAHIM,
        classId: classIds.jss1,
        subclassId: subClassIds.jss1B,
        subjectId: SUB.ENG,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: SSR.GRACE_MTH,
        studentId: STU.GRACE,
        classId: classIds.jss2,
        subclassId: subClassIds.jss2A,
        subjectId: SUB.MTH,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: SSR.GRACE_CIV,
        studentId: STU.GRACE,
        classId: classIds.jss2,
        subclassId: subClassIds.jss2A,
        subjectId: SUB.CIV,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: SSR.DAVID_MTH,
        studentId: STU.DAVID,
        classId: classIds.jss2,
        subclassId: subClassIds.jss2B,
        subjectId: SUB.MTH,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: SSR.DAVID_CIV,
        studentId: STU.DAVID,
        classId: classIds.jss2,
        subclassId: subClassIds.jss2B,
        subjectId: SUB.CIV,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: SSR.AMINA_MTH,
        studentId: STU.AMINA,
        classId: classIds.jss3,
        subclassId: subClassIds.jss3A,
        subjectId: SUB.MTH,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: SSR.AMINA_ENG,
        studentId: STU.AMINA,
        classId: classIds.jss3,
        subclassId: subClassIds.jss3A,
        subjectId: SUB.ENG,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: SSR.EMMANUEL_MTH,
        studentId: STU.EMMANUEL,
        classId: classIds.ss1,
        subclassId: subClassIds.ss1A,
        subjectId: SUB.MTH,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: SSR.EMMANUEL_ENG,
        studentId: STU.EMMANUEL,
        classId: classIds.ss1,
        subclassId: subClassIds.ss1A,
        subjectId: SUB.ENG,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: SSR.EMMANUEL_CRS,
        studentId: STU.EMMANUEL,
        classId: classIds.ss1,
        subclassId: subClassIds.ss1A,
        subjectId: SUB.CRS,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: SSR.FATIMA_ENG,
        studentId: STU.FATIMA,
        classId: classIds.ss1,
        subclassId: subClassIds.ss1A,
        subjectId: SUB.ENG,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: SSR.FATIMA_CRS,
        studentId: STU.FATIMA,
        classId: classIds.ss1,
        subclassId: subClassIds.ss1A,
        subjectId: SUB.CRS,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: SSR.SAMUEL_ENG,
        studentId: STU.SAMUEL,
        classId: classIds.ss2,
        subclassId: subClassIds.ss2A,
        subjectId: SUB.ENG,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
      {
        id: SSR.SAMUEL_CRS,
        studentId: STU.SAMUEL,
        classId: classIds.ss2,
        subclassId: subClassIds.ss2A,
        subjectId: SUB.CRS,
        sessionId: seededSession.id,
        termId: seededTerm.id,
      },
    ];

    for (const row of studentSubjectRegistrations) {
      await prisma.studentSubjectRegistration.upsert({
        where: { id: row.id },
        update: {
          studentId: row.studentId,
          classId: row.classId,
          subclassId: row.subclassId,
          subjectId: row.subjectId,
          sessionId: row.sessionId,
          termId: row.termId,
        },
        create: row,
      });
    }

    const jssClassIds = new Set([classIds.jss1, classIds.jss2, classIds.jss3]);
    const jssComponents = [
      { componentId: AC.JSS_CA1, maxScore: 10 },
      { componentId: AC.JSS_CA2, maxScore: 10 },
      { componentId: AC.JSS_MID, maxScore: 20 },
      { componentId: AC.JSS_EXAM, maxScore: 60 },
    ];
    const ssComponents = [
      { componentId: AC.SS_CA, maxScore: 40 },
      { componentId: AC.SS_EXAM, maxScore: 60 },
    ];

    const studentPerformanceTier = {
      [STU.CHIOMA]: 0.88,
      [STU.IBRAHIM]: 0.72,
      [STU.GRACE]: 0.84,
      [STU.DAVID]: 0.63,
      [STU.AMINA]: 0.9,
      [STU.EMMANUEL]: 0.78,
      [STU.FATIMA]: 0.7,
      [STU.SAMUEL]: 0.58,
    };

    const subjectScoreOffsets = {
      [SUB.MTH]: 0,
      [SUB.ENG]: -0.03,
      [SUB.BST]: 0.02,
      [SUB.CIV]: -0.01,
      [SUB.CRS]: 0.01,
    };

    let assessmentScoreSeq = 28;
    const studentAssessmentScores = [];

    for (const registration of studentSubjectRegistrations) {
      const tier =
        (studentPerformanceTier[registration.studentId] ?? 0.7) +
        (subjectScoreOffsets[registration.subjectId] ?? 0);
      const components = jssClassIds.has(registration.classId) ? jssComponents : ssComponents;

      components.forEach((component, componentIndex) => {
        const variance = ((componentIndex % 3) - 1) * 0.04;
        const rawScore = component.maxScore * Math.min(0.98, Math.max(0.45, tier + variance));
        const score = Math.round(rawScore * 10) / 10;

        studentAssessmentScores.push({
          id: `e9f0a1b2-c3d4-4${String(assessmentScoreSeq).padStart(3, "0")}-f678-901234ab0000`,
          studentSubjectRegistrationId: registration.id,
          studentId: registration.studentId,
          classId: registration.classId,
          subclassId: registration.subclassId,
          subjectId: registration.subjectId,
          componentId: component.componentId,
          termId: seededTerm.id,
          sessionId: seededSession.id,
          score,
        });
        assessmentScoreSeq += 1;
      });
    }

    for (const row of studentAssessmentScores) {
      await prisma.studentAssessmentScore.upsert({
        where: { id: row.id },
        update: {
          studentSubjectRegistrationId: row.studentSubjectRegistrationId,
          studentId: row.studentId,
          classId: row.classId,
          subclassId: row.subclassId,
          subjectId: row.subjectId,
          componentId: row.componentId,
          termId: row.termId,
          sessionId: row.sessionId,
          score: row.score,
        },
        create: row,
      });
    }

    const GT = {
      JSS: "d4e5f6a7-b8c9-4067-e123-456789ab0033",
    };

    const gradingTemplates = [
      {
        id: GT.JSS,
        name: "Junior Secondary Grading Scale",
        description: "Standard A–F letter grades for JSS report cards",
        version: 1,
        isLocked: false,
        parentId: null,
      },
    ];

    for (const tpl of gradingTemplates) {
      await prisma.gradingTemplate.upsert({
        where: { id: tpl.id },
        update: {
          name: tpl.name,
          description: tpl.description,
          version: tpl.version,
          isLocked: tpl.isLocked,
          parentId: tpl.parentId,
        },
        create: tpl,
      });
    }

    const gradingTemplateItems = [
      {
        id: "e5f6a7b8-c9d0-4178-f234-567890ab0034",
        gradingTemplateId: GT.JSS,
        grade: "A",
        minScore: 70,
        maxScore: 100,
        remark: "Excellent",
        gradePoint: 5,
      },
      {
        id: "f6a7b8c9-d0e1-4289-a345-678901ab0035",
        gradingTemplateId: GT.JSS,
        grade: "B",
        minScore: 60,
        maxScore: 69.99,
        remark: "Very Good",
        gradePoint: 4,
      },
      {
        id: "a7b8c9d0-e1f2-4390-b456-789012ab0036",
        gradingTemplateId: GT.JSS,
        grade: "C",
        minScore: 50,
        maxScore: 59.99,
        remark: "Good",
        gradePoint: 3,
      },
      {
        id: "b8c9d0e1-f2a3-4401-c567-890123ab0037",
        gradingTemplateId: GT.JSS,
        grade: "D",
        minScore: 45,
        maxScore: 49.99,
        remark: "Pass",
        gradePoint: 2,
      },
      {
        id: "c9d0e1f2-a3b4-4512-d678-901234ab0038",
        gradingTemplateId: GT.JSS,
        grade: "E",
        minScore: 40,
        maxScore: 44.99,
        remark: "Fair",
        gradePoint: 1,
      },
      {
        id: "d0e1f2a3-b4c5-4623-e789-012345ab0039",
        gradingTemplateId: GT.JSS,
        grade: "F",
        minScore: 0,
        maxScore: 39.99,
        remark: "Fail",
        gradePoint: 0,
      },
    ];

    for (const item of gradingTemplateItems) {
      await prisma.gradingTemplateItem.upsert({
        where: { id: item.id },
        update: {
          gradingTemplateId: item.gradingTemplateId,
          grade: item.grade,
          minScore: item.minScore,
          maxScore: item.maxScore,
          remark: item.remark,
          gradePoint: item.gradePoint,
        },
        create: item,
      });
    }

    const BAT = {
      JSS: "e1f2a3b4-c5d6-4001-a123-456789ab0040",
    };

    const behaviouralAssessmentTemplates = [
      {
        id: BAT.JSS,
        name: "Junior Secondary Behavioural Assessment",
        description: "Conduct and character ratings for JSS report cards (1–5 scale per trait)",
        version: 1,
        isLocked: false,
        parentId: null,
        status: "Active",
      },
    ];

    for (const tpl of behaviouralAssessmentTemplates) {
      await prisma.behaviouralAssessmentTemplate.upsert({
        where: { id: tpl.id },
        update: {
          name: tpl.name,
          description: tpl.description,
          version: tpl.version,
          isLocked: tpl.isLocked,
          parentId: tpl.parentId,
          status: tpl.status,
        },
        create: tpl,
      });
    }

    const BAC = {
      PUNCTUALITY: "f2a3b4c5-d6e7-4012-b234-567890ab0041",
      NEATNESS: "a3b4c5d6-e7f8-4023-c345-678901ab0042",
      POLITENESS: "b4c5d6e7-f8a9-4034-d456-789012ab0043",
      PARTICIPATION: "c5d6e7f8-a9b0-4045-e567-890123ab0044",
      HONESTY: "d6e7f8a9-b0c1-4056-f678-901234ab0045",
    };

    const behaviouralAssessmentComponents = [
      {
        id: BAC.PUNCTUALITY,
        behaviourTemplateId: BAT.JSS,
        name: "Punctuality",
        maxScore: 5,
        orderNo: 1,
        status: "Active",
      },
      {
        id: BAC.NEATNESS,
        behaviourTemplateId: BAT.JSS,
        name: "Neatness and Appearance",
        maxScore: 5,
        orderNo: 2,
        status: "Active",
      },
      {
        id: BAC.POLITENESS,
        behaviourTemplateId: BAT.JSS,
        name: "Politeness and Courtesy",
        maxScore: 5,
        orderNo: 3,
        status: "Active",
      },
      {
        id: BAC.PARTICIPATION,
        behaviourTemplateId: BAT.JSS,
        name: "Class Participation",
        maxScore: 5,
        orderNo: 4,
        status: "Active",
      },
      {
        id: BAC.HONESTY,
        behaviourTemplateId: BAT.JSS,
        name: "Honesty and Integrity",
        maxScore: 5,
        orderNo: 5,
        status: "Active",
      },
    ];

    for (const comp of behaviouralAssessmentComponents) {
      await prisma.behaviouralAssessmentComponent.upsert({
        where: { id: comp.id },
        update: {
          behaviourTemplateId: comp.behaviourTemplateId,
          name: comp.name,
          maxScore: comp.maxScore,
          orderNo: comp.orderNo,
          status: comp.status,
        },
        create: comp,
      });
    }

    const BGT = {
      JSS: "e7f8a9b0-c1d2-4067-a789-012345ab0046",
    };

    const behaviouralGradingTemplates = [
      {
        id: BGT.JSS,
        name: "Junior Secondary Behavioural Grading Scale",
        description: "Letter grades for average behavioural scores on a 1–5 scale",
        version: 1,
        isLocked: false,
        parentId: null,
        status: "Active",
      },
    ];

    for (const tpl of behaviouralGradingTemplates) {
      await prisma.behaviouralGradingTemplate.upsert({
        where: { id: tpl.id },
        update: {
          name: tpl.name,
          description: tpl.description,
          version: tpl.version,
          isLocked: tpl.isLocked,
          parentId: tpl.parentId,
          status: tpl.status,
        },
        create: tpl,
      });
    }

    const behaviouralGradingItems = [
      {
        id: "f8a9b0c1-d2e3-4078-b890-123456ab0047",
        behaviouralGradingTemplateId: BGT.JSS,
        grade: "A",
        lowBoundary: 4.5,
        highBoundary: 5,
        remark: "Excellent conduct",
        gradePoint: 5,
      },
      {
        id: "a9b0c1d2-e3f4-4089-c901-234567ab0048",
        behaviouralGradingTemplateId: BGT.JSS,
        grade: "B",
        lowBoundary: 3.5,
        highBoundary: 4.49,
        remark: "Very good conduct",
        gradePoint: 4,
      },
      {
        id: "b0c1d2e3-f4a5-4090-d012-345678ab0049",
        behaviouralGradingTemplateId: BGT.JSS,
        grade: "C",
        lowBoundary: 2.5,
        highBoundary: 3.49,
        remark: "Good conduct",
        gradePoint: 3,
      },
      {
        id: "c1d2e3f4-a5b6-4101-e123-456789ab0050",
        behaviouralGradingTemplateId: BGT.JSS,
        grade: "D",
        lowBoundary: 1.5,
        highBoundary: 2.49,
        remark: "Fair conduct",
        gradePoint: 2,
      },
      {
        id: "d2e3f4a5-b6c7-4112-f234-567890ab0051",
        behaviouralGradingTemplateId: BGT.JSS,
        grade: "E",
        lowBoundary: 0,
        highBoundary: 1.49,
        remark: "Needs improvement",
        gradePoint: 1,
      },
    ];

    for (const item of behaviouralGradingItems) {
      await prisma.behaviouralGradingItem.upsert({
        where: { id: item.id },
        update: {
          behaviouralGradingTemplateId: item.behaviouralGradingTemplateId,
          grade: item.grade,
          lowBoundary: item.lowBoundary,
          highBoundary: item.highBoundary,
          remark: item.remark,
          gradePoint: item.gradePoint,
        },
        create: item,
      });
    }

    const behaviouralComponents = [
      BAC.PUNCTUALITY,
      BAC.NEATNESS,
      BAC.POLITENESS,
      BAC.PARTICIPATION,
      BAC.HONESTY,
    ];

    const studentPlacement = [
      {
        studentId: STU.CHIOMA,
        classId: classIds.jss1,
        subclassId: subClassIds.jss1A,
        conductTier: 0.95,
      },
      {
        studentId: STU.IBRAHIM,
        classId: classIds.jss1,
        subclassId: subClassIds.jss1B,
        conductTier: 0.72,
      },
      {
        studentId: STU.GRACE,
        classId: classIds.jss2,
        subclassId: subClassIds.jss2A,
        conductTier: 0.88,
      },
      {
        studentId: STU.DAVID,
        classId: classIds.jss2,
        subclassId: subClassIds.jss2B,
        conductTier: 0.68,
      },
      {
        studentId: STU.AMINA,
        classId: classIds.jss3,
        subclassId: subClassIds.jss3A,
        conductTier: 0.92,
      },
      {
        studentId: STU.EMMANUEL,
        classId: classIds.ss1,
        subclassId: subClassIds.ss1A,
        conductTier: 0.8,
      },
      {
        studentId: STU.FATIMA,
        classId: classIds.ss1,
        subclassId: subClassIds.ss1A,
        conductTier: 0.76,
      },
      {
        studentId: STU.SAMUEL,
        classId: classIds.ss2,
        subclassId: subClassIds.ss2A,
        conductTier: 0.62,
      },
    ];

    let behaviouralScoreSeq = 52;
    const studentBehaviouralAssessmentScores = [];

    for (const placement of studentPlacement) {
      behaviouralComponents.forEach((componentId, componentIndex) => {
        const variance = ((componentIndex % 2) - 0.5) * 0.6;
        const rawScore = 5 * Math.min(1, Math.max(0.4, placement.conductTier + variance / 5));
        const score = Math.round(rawScore * 10) / 10;

        studentBehaviouralAssessmentScores.push({
          id: `e3f4a5b6-c7d8-4${String(behaviouralScoreSeq).padStart(3, "0")}-a345-678901ab0000`,
          studentId: placement.studentId,
          behaviouralAssessmentComponentId: componentId,
          classId: placement.classId,
          subclassId: placement.subclassId,
          sessionId: seededSession.id,
          termId: seededTerm.id,
          score,
        });
        behaviouralScoreSeq += 1;
      });
    }

    for (const row of studentBehaviouralAssessmentScores) {
      await prisma.studentBehaviouralAssessmentScore.upsert({
        where: { id: row.id },
        update: {
          studentId: row.studentId,
          behaviouralAssessmentComponentId: row.behaviouralAssessmentComponentId,
          classId: row.classId,
          subclassId: row.subclassId,
          sessionId: row.sessionId,
          termId: row.termId,
          score: row.score,
        },
        create: row,
      });
    }

    await prisma.classAssessmentTemplate.updateMany({
      where: {
        classId: {
          in: [classIds.jss1, classIds.jss2, classIds.jss3, classIds.ss1, classIds.ss2],
        },
      },
      data: {
        gradeTemplateId: GT.JSS,
        behaviouralTemplateId: BAT.JSS,
        behaviouralGradingTemplateId: BGT.JSS,
      },
    });

    console.log(
      `   ✓ ${assessmentTemplates.length} assessment templates, ${assessmentComponents.length} components`
    );
    console.log(
      `   ✓ ${classAssessmentTemplates.length} class assessment assignments, ${subjects.length} subjects, ${classSubjects.length} class subjects, ${teacherSubjects.length} teacher subjects`
    );
    console.log(
      `   ✓ ${studentSubjectRegistrations.length} student subject registrations, ${studentAssessmentScores.length} assessment scores`
    );
    console.log(
      `   ✓ ${gradingTemplates.length} grading template, ${gradingTemplateItems.length} grade bands`
    );
    console.log(
      `   ✓ ${behaviouralAssessmentTemplates.length} behavioural assessment template, ${behaviouralAssessmentComponents.length} behavioural components`
    );
    console.log(
      `   ✓ ${behaviouralGradingTemplates.length} behavioural grading template, ${behaviouralGradingItems.length} behavioural grade bands`
    );
    console.log(
      `   ✓ ${studentBehaviouralAssessmentScores.length} student behavioural assessment scores`
    );

    const defaultClassRemarkSetups = [
      {
        id: "f3a4b5c6-d7e8-4901-a234-567890ab0063",
        classId: classIds.jss1,
        teacherRemark: "An excellent term. Maintain your outstanding work ethic and leadership.",
        parentRemark: "We are proud of your consistent high performance.",
        principalRemark: "Exemplary student. Keep setting the standard for others.",
        headTeacherRemark: null,
        classTeacherRemark: "Top performer in class. A role model to peers.",
        otherRemark: null,
        lowerBoundary: 75,
        upperBoundary: 100,
      },
      {
        id: "a4b5c6d7-e8f9-4012-b345-678901ab0064",
        classId: classIds.jss1,
        teacherRemark: "Very good performance. With more focus you can reach the top band.",
        parentRemark: "Good progress this term. Encourage steady revision habits.",
        principalRemark: null,
        headTeacherRemark: null,
        classTeacherRemark: "Reliable and attentive in class.",
        otherRemark: null,
        lowerBoundary: 65,
        upperBoundary: 74.99,
      },
      {
        id: "b5c6d7e8-f9a0-4123-c456-789012ab0065",
        classId: classIds.jss1,
        teacherRemark: "Good effort overall. Improve consistency in assignments and tests.",
        parentRemark: "Please support daily study at home.",
        principalRemark: null,
        headTeacherRemark: null,
        classTeacherRemark: null,
        otherRemark: null,
        lowerBoundary: 50,
        upperBoundary: 64.99,
      },
      {
        id: "c6d7e8f9-a0b1-4234-d567-890123ab0066",
        classId: classIds.jss1,
        teacherRemark: "Fair performance. More effort is required in core subjects.",
        parentRemark: "Monitor homework completion and class attendance.",
        principalRemark: null,
        headTeacherRemark: null,
        classTeacherRemark: null,
        otherRemark: null,
        lowerBoundary: 40,
        upperBoundary: 49.99,
      },
      {
        id: "d7e8f9a0-b1c2-4345-e678-901234ab0067",
        classId: classIds.jss1,
        teacherRemark: "Needs significant improvement. Extra coaching and practice are advised.",
        parentRemark: "Urgent attention needed. Please meet with the class teacher.",
        principalRemark: "Parent conference recommended.",
        headTeacherRemark: null,
        classTeacherRemark: null,
        otherRemark: null,
        lowerBoundary: 0,
        upperBoundary: 39.99,
      },
      {
        id: "e8f9a0b1-c2d3-4456-f789-012345ab0068",
        classId: classIds.jss2,
        teacherRemark: "Excellent overall average. Continue your disciplined approach to learning.",
        parentRemark: null,
        principalRemark: "Commendable performance across subjects.",
        headTeacherRemark: null,
        classTeacherRemark: "Shows maturity and initiative.",
        otherRemark: null,
        lowerBoundary: 70,
        upperBoundary: 100,
      },
      {
        id: "f9a0b1c2-d3e4-4567-a890-123456ab0069",
        classId: classIds.jss2,
        teacherRemark: "Good average score. Strengthen weak subjects to move higher.",
        parentRemark: "Encourage regular revision, especially in mathematics and English.",
        principalRemark: null,
        headTeacherRemark: null,
        classTeacherRemark: null,
        otherRemark: null,
        lowerBoundary: 50,
        upperBoundary: 69.99,
      },
      {
        id: "a0b1c2d3-e4f5-4678-b901-234567ab0070",
        classId: classIds.jss2,
        teacherRemark: "Below expected average. Immediate improvement plan required.",
        parentRemark: "Please schedule a meeting with the school.",
        principalRemark: null,
        headTeacherRemark: null,
        classTeacherRemark: null,
        otherRemark: null,
        lowerBoundary: 0,
        upperBoundary: 49.99,
      },
    ];

    for (const row of defaultClassRemarkSetups) {
      await prisma.defaultClassRemarkSetup.upsert({
        where: { id: row.id },
        update: {
          classId: row.classId,
          teacherRemark: row.teacherRemark,
          parentRemark: row.parentRemark,
          principalRemark: row.principalRemark,
          headTeacherRemark: row.headTeacherRemark,
          classTeacherRemark: row.classTeacherRemark,
          otherRemark: row.otherRemark,
          lowerBoundary: row.lowerBoundary,
          upperBoundary: row.upperBoundary,
        },
        create: row,
      });
    }

    console.log(`   ✓ ${defaultClassRemarkSetups.length} default class remark setups`);

    // ─── Assignments & student submissions ───
    console.log("📚 Seeding assignments and student submissions...");

    await prisma.studentAssignmentAttachment.deleteMany({});
    await prisma.studentAssignment.deleteMany({});
    await prisma.assignmentAttachment.deleteMany({});
    await prisma.assignment.deleteMany({});

    const ASG = {
      JSS1_MTH: "f1a2b3c4-d5e6-4789-a123-456789ab0200",
      JSS1_ENG: "f1a2b3c4-d5e6-4789-a123-456789ab0201",
      JSS2_MTH: "f1a2b3c4-d5e6-4789-a123-456789ab0202",
      SS1_CRS: "f1a2b3c4-d5e6-4789-a123-456789ab0203",
    };

    const assignmentDeadline = new Date("2026-07-15T23:59:59.000Z");
    const submittedAt = new Date("2026-07-10T14:30:00.000Z");
    const gradedAt = new Date("2026-07-12T09:15:00.000Z");

    const assignments = [
      {
        id: ASG.JSS1_MTH,
        topic: "Fractions and Decimals",
        question:
          "Solve the following: (a) Convert 3/8 to a decimal. (b) Add 2¾ and 1⅖. Show all working.",
        classId: classIds.jss1,
        subjectId: SUB.MTH,
        sessionId: seededSession.id,
        termId: seededTerm.id,
        assignmentComponentId: AC.JSS_CA1,
        deadline: assignmentDeadline,
        status: "Pending",
        createdById: STAFF_USER.ADA,
      },
      {
        id: ASG.JSS1_ENG,
        topic: "Descriptive Essay — My Community",
        question:
          "Write a descriptive essay of 250–300 words about your community. Include sensory details and a clear introduction and conclusion.",
        classId: classIds.jss1,
        subjectId: SUB.ENG,
        sessionId: seededSession.id,
        termId: seededTerm.id,
        assignmentComponentId: AC.JSS_CA2,
        deadline: assignmentDeadline,
        status: "Pending",
        createdById: STAFF_USER.ADA,
      },
      {
        id: ASG.JSS2_MTH,
        topic: "Linear Equations",
        question:
          "Solve for x: (a) 3x + 7 = 22 (b) 2(x - 4) = 10 (c) 5x - 3 = 2x + 9. Show each step clearly.",
        classId: classIds.jss2,
        subjectId: SUB.MTH,
        sessionId: seededSession.id,
        termId: seededTerm.id,
        assignmentComponentId: AC.JSS_CA1,
        deadline: assignmentDeadline,
        status: "Pending",
        createdById: STAFF_USER.JAMES,
      },
      {
        id: ASG.SS1_CRS,
        topic: "The Good Samaritan",
        question:
          "Read Luke 10:25–37. In 200–250 words, explain the moral lesson of the parable and how it applies to school life today.",
        classId: classIds.ss1,
        subjectId: SUB.CRS,
        sessionId: seededSession.id,
        termId: seededTerm.id,
        assignmentComponentId: AC.SS_CA,
        deadline: assignmentDeadline,
        status: "Pending",
        createdById: adminUserId,
      },
    ];

    for (const row of assignments) {
      await prisma.assignment.upsert({
        where: { id: row.id },
        update: {
          topic: row.topic,
          question: row.question,
          classId: row.classId,
          subjectId: row.subjectId,
          sessionId: row.sessionId,
          termId: row.termId,
          assignmentComponentId: row.assignmentComponentId,
          deadline: row.deadline,
          status: row.status,
          createdById: row.createdById,
        },
        create: row,
      });
    }

    const assignmentAttachments = [
      {
        id: "a2b3c4d5-e6f7-4890-a234-567890ab0210",
        assignmentId: ASG.JSS1_MTH,
        url: "https://cdn.school.ng/assignments/jss1-maths-fractions-worksheet.pdf",
      },
      {
        id: "b3c4d5e6-f7a8-4901-b345-678901ab0211",
        assignmentId: ASG.JSS1_ENG,
        url: "https://cdn.school.ng/assignments/jss1-english-essay-rubric.pdf",
      },
      {
        id: "c4d5e6f7-a8b9-4012-c456-789012ab0212",
        assignmentId: ASG.SS1_CRS,
        url: "https://cdn.school.ng/assignments/ss1-crs-good-samaritan-passage.pdf",
      },
    ];

    for (const row of assignmentAttachments) {
      await prisma.assignmentAttachment.upsert({
        where: { id: row.id },
        update: { assignmentId: row.assignmentId, url: row.url },
        create: row,
      });
    }

    const studentAssignments = [
      {
        id: "d5e6f7a8-b9c0-4123-d012-345678ab0220",
        assignmentId: ASG.JSS1_MTH,
        studentId: STU.CHIOMA,
        classId: classIds.jss1,
        subclassId: subClassIds.jss1A,
        sessionId: seededSession.id,
        termId: seededTerm.id,
        answer:
          "(a) 3/8 = 0.375\n(b) 2¾ + 1⅖ = 11/4 + 7/5 = 55/20 + 28/20 = 83/20 = 4 3/20",
        score: 8.5,
        status: "Graded",
        submittedAt,
        gradedAt,
        gradedBy: STAFF_USER.ADA,
      },
      {
        id: "e6f7a8b9-c0d1-4234-e012-345678ab0221",
        assignmentId: ASG.JSS1_MTH,
        studentId: STU.IBRAHIM,
        classId: classIds.jss1,
        subclassId: subClassIds.jss1B,
        sessionId: seededSession.id,
        termId: seededTerm.id,
        answer: "(a) 0.375\n(b) I converted to improper fractions and got 4 1/5.",
        score: null,
        status: "Submitted",
        submittedAt,
        gradedAt: null,
        gradedBy: null,
      },
      {
        id: "f7a8b9c0-d1e2-4345-f123-456789ab0222",
        assignmentId: ASG.JSS1_ENG,
        studentId: STU.CHIOMA,
        classId: classIds.jss1,
        subclassId: subClassIds.jss1A,
        sessionId: seededSession.id,
        termId: seededTerm.id,
        answer:
          "My community is a lively neighbourhood in Lekki where neighbours greet one another every morning...",
        score: 9,
        status: "Graded",
        submittedAt,
        gradedAt,
        gradedBy: STAFF_USER.ADA,
      },
      {
        id: "a8b9c0d1-e2f3-4456-a234-567890ab0223",
        assignmentId: ASG.JSS1_ENG,
        studentId: STU.IBRAHIM,
        classId: classIds.jss1,
        subclassId: subClassIds.jss1B,
        sessionId: seededSession.id,
        termId: seededTerm.id,
        answer: null,
        score: null,
        status: "Pending",
        submittedAt: null,
        gradedAt: null,
        gradedBy: null,
      },
      {
        id: "b9c0d1e2-f3a4-4567-b345-678901ab0224",
        assignmentId: ASG.JSS2_MTH,
        studentId: STU.GRACE,
        classId: classIds.jss2,
        subclassId: subClassIds.jss2A,
        sessionId: seededSession.id,
        termId: seededTerm.id,
        answer: "(a) x = 5 (b) x = 9 (c) x = 4",
        score: 9.5,
        status: "Graded",
        submittedAt,
        gradedAt,
        gradedBy: STAFF_USER.JAMES,
      },
      {
        id: "c0d1e2f3-a4b5-4678-c456-789012ab0225",
        assignmentId: ASG.JSS2_MTH,
        studentId: STU.DAVID,
        classId: classIds.jss2,
        subclassId: subClassIds.jss2B,
        sessionId: seededSession.id,
        termId: seededTerm.id,
        answer: "(a) x = 5 (b) x = 9 (c) x = 3 — please check part (c).",
        score: null,
        status: "Submitted",
        submittedAt,
        gradedAt: null,
        gradedBy: null,
      },
      {
        id: "d1e2f3a4-b5c6-4789-d567-890123ab0226",
        assignmentId: ASG.SS1_CRS,
        studentId: STU.EMMANUEL,
        classId: classIds.ss1,
        subclassId: subClassIds.ss1A,
        sessionId: seededSession.id,
        termId: seededTerm.id,
        answer:
          "The Good Samaritan teaches us to help others regardless of background. At school, this means standing up for classmates and offering help without prejudice.",
        score: 35,
        status: "Graded",
        submittedAt,
        gradedAt,
        gradedBy: adminUserId,
      },
      {
        id: "e2f3a4b5-c6d7-4890-e678-901234ab0227",
        assignmentId: ASG.SS1_CRS,
        studentId: STU.FATIMA,
        classId: classIds.ss1,
        subclassId: subClassIds.ss1A,
        sessionId: seededSession.id,
        termId: seededTerm.id,
        answer: null,
        score: null,
        status: "Pending",
        submittedAt: null,
        gradedAt: null,
        gradedBy: null,
      },
    ];

    for (const row of studentAssignments) {
      await prisma.studentAssignment.upsert({
        where: { id: row.id },
        update: {
          assignmentId: row.assignmentId,
          studentId: row.studentId,
          classId: row.classId,
          subclassId: row.subclassId,
          sessionId: row.sessionId,
          termId: row.termId,
          answer: row.answer,
          score: row.score,
          status: row.status,
          submittedAt: row.submittedAt,
          gradedAt: row.gradedAt,
          gradedBy: row.gradedBy,
        },
        create: row,
      });
    }

    const studentAssignmentAttachments = [
      {
        id: "f3a4b5c6-d7e8-4901-a789-012345ab0230",
        studentAssignmentId: "d5e6f7a8-b9c0-4123-d012-345678ab0220",
        url: "https://cdn.school.ng/submissions/chioma-fractions-working-scan.jpg",
      },
      {
        id: "a4b5c6d7-e8f9-4012-b890-123456ab0231",
        studentAssignmentId: "f7a8b9c0-d1e2-4345-f123-456789ab0222",
        url: "https://cdn.school.ng/submissions/chioma-essay-draft.docx",
      },
      {
        id: "b5c6d7e8-f9a0-4123-c901-234567ab0232",
        studentAssignmentId: "b9c0d1e2-f3a4-4567-b345-678901ab0224",
        url: "https://cdn.school.ng/submissions/grace-linear-equations.pdf",
      },
    ];

    for (const row of studentAssignmentAttachments) {
      await prisma.studentAssignmentAttachment.upsert({
        where: { id: row.id },
        update: { studentAssignmentId: row.studentAssignmentId, url: row.url },
        create: row,
      });
    }

    console.log(
      `   ✓ ${assignments.length} assignments, ${assignmentAttachments.length} assignment attachments`
    );
    console.log(
      `   ✓ ${studentAssignments.length} student assignments, ${studentAssignmentAttachments.length} submission attachments`
    );

    // Class default billings (amounts per class for current session / term)
    console.log("📋 Seeding class default billings...");
    const CLASS_JSS1 = "c4d5e6f7-a8b9-4012-c012-345678905001";
    const CLASS_JSS2 = "c4d5e6f7-a8b9-4012-c012-345678905002";
    const CLASS_JSS3 = "c4d5e6f7-a8b9-4012-c012-345678905003";
    const CLASS_SS1 = "c4d5e6f7-a8b9-4012-c012-345678905004";
    const CLASS_SS2 = "c4d5e6f7-a8b9-4012-c012-345678905005";
    const SUBCLASS_JSS1A = "d5e6f7a8-b9c0-4123-d012-345678906001";

    const classDefaultBillings = [
      // JSS 1 — class-wide (Third Term 2025/2026)
      { id: 1, classId: CLASS_JSS1, subclassId: null, billingId: 1, amount: 120000 },
      { id: 2, classId: CLASS_JSS1, subclassId: null, billingId: 2, amount: 5000 },
      { id: 3, classId: CLASS_JSS1, subclassId: null, billingId: 3, amount: 10000 },
      { id: 4, classId: CLASS_JSS1, subclassId: null, billingId: 4, amount: 8000 },
      { id: 5, classId: CLASS_JSS1, subclassId: null, billingId: 8, amount: 3000 },
      { id: 6, classId: CLASS_JSS1, subclassId: null, billingId: 9, amount: 2000 },
      // JSS 1A — optional transport override
      { id: 7, classId: CLASS_JSS1, subclassId: SUBCLASS_JSS1A, billingId: 5, amount: 25000 },
      // JSS 2
      { id: 8, classId: CLASS_JSS2, subclassId: null, billingId: 1, amount: 135000 },
      { id: 9, classId: CLASS_JSS2, subclassId: null, billingId: 2, amount: 5000 },
      { id: 10, classId: CLASS_JSS2, subclassId: null, billingId: 3, amount: 10000 },
      { id: 11, classId: CLASS_JSS2, subclassId: null, billingId: 4, amount: 8000 },
      { id: 12, classId: CLASS_JSS2, subclassId: null, billingId: 8, amount: 3500 },
      { id: 13, classId: CLASS_JSS2, subclassId: null, billingId: 9, amount: 2000 },
      // JSS 3
      { id: 14, classId: CLASS_JSS3, subclassId: null, billingId: 1, amount: 150000 },
      { id: 15, classId: CLASS_JSS3, subclassId: null, billingId: 2, amount: 5000 },
      { id: 16, classId: CLASS_JSS3, subclassId: null, billingId: 3, amount: 12000 },
      { id: 17, classId: CLASS_JSS3, subclassId: null, billingId: 8, amount: 4000 },
      // SS 1
      { id: 18, classId: CLASS_SS1, subclassId: null, billingId: 1, amount: 180000 },
      { id: 19, classId: CLASS_SS1, subclassId: null, billingId: 2, amount: 7500 },
      { id: 20, classId: CLASS_SS1, subclassId: null, billingId: 3, amount: 15000 },
      { id: 21, classId: CLASS_SS1, subclassId: null, billingId: 4, amount: 10000 },
      { id: 22, classId: CLASS_SS1, subclassId: null, billingId: 8, amount: 5000 },
      // SS 2
      { id: 23, classId: CLASS_SS2, subclassId: null, billingId: 1, amount: 200000 },
      { id: 24, classId: CLASS_SS2, subclassId: null, billingId: 2, amount: 7500 },
      { id: 25, classId: CLASS_SS2, subclassId: null, billingId: 3, amount: 15000 },
      { id: 26, classId: CLASS_SS2, subclassId: null, billingId: 8, amount: 5000 },
    ].map((row) => ({
      ...row,
      session: seededSession.id,
      term: seededTerm.id,
    }));

    for (const row of classDefaultBillings) {
      await prisma.classDefaultBilling.upsert({
        where: { id: row.id },
        update: {
          classId: row.classId,
          subclassId: row.subclassId,
          session: row.session,
          term: row.term,
          billingId: row.billingId,
          amount: row.amount,
        },
        create: row,
      });
    }
    console.log(
      `   ✓ ${classDefaultBillings.length} class default billings (2025/2026, Third Term)`
    );

    const session2026_27 = await prisma.session.findUnique({
      where: { name: "2026/2027" },
      select: { id: true },
    });
    const termFirst = await prisma.term.findUnique({
      where: { name: "First Term" },
      select: { id: true },
    });
    if (!session2026_27 || !termFirst) {
      throw new Error("Failed to resolve 2026/2027 session or First Term for class default billings");
    }

    const SUBCLASS_JSS1B = "d5e6f7a8-b9c0-4123-d012-345678906002";
    const SUBCLASS_JSS2A = "d5e6f7a8-b9c0-4123-d012-345678906003";
    const SUBCLASS_JSS2B = "d5e6f7a8-b9c0-4123-d012-345678906004";
    const SUBCLASS_SS1A = "d5e6f7a8-b9c0-4123-d012-345678906005";
    const SUBCLASS_JSS3A = "d5e6f7a8-b9c0-4123-d012-345678906006";
    const SUBCLASS_SS2A = "d5e6f7a8-b9c0-4123-d012-345678906007";

    const classDefaultBillings2026FirstTerm = [
      // JSS 1A
      { id: 27, classId: CLASS_JSS1, subclassId: SUBCLASS_JSS1A, billingId: 1, amount: 125000 },
      { id: 28, classId: CLASS_JSS1, subclassId: SUBCLASS_JSS1A, billingId: 2, amount: 5000 },
      { id: 29, classId: CLASS_JSS1, subclassId: SUBCLASS_JSS1A, billingId: 3, amount: 10000 },
      { id: 30, classId: CLASS_JSS1, subclassId: SUBCLASS_JSS1A, billingId: 4, amount: 8000 },
      { id: 31, classId: CLASS_JSS1, subclassId: SUBCLASS_JSS1A, billingId: 5, amount: 25000 },
      { id: 32, classId: CLASS_JSS1, subclassId: SUBCLASS_JSS1A, billingId: 8, amount: 3000 },
      { id: 33, classId: CLASS_JSS1, subclassId: SUBCLASS_JSS1A, billingId: 9, amount: 2000 },
      // JSS 1B
      { id: 34, classId: CLASS_JSS1, subclassId: SUBCLASS_JSS1B, billingId: 1, amount: 125000 },
      { id: 35, classId: CLASS_JSS1, subclassId: SUBCLASS_JSS1B, billingId: 2, amount: 5000 },
      { id: 36, classId: CLASS_JSS1, subclassId: SUBCLASS_JSS1B, billingId: 3, amount: 10000 },
      { id: 37, classId: CLASS_JSS1, subclassId: SUBCLASS_JSS1B, billingId: 4, amount: 8000 },
      { id: 38, classId: CLASS_JSS1, subclassId: SUBCLASS_JSS1B, billingId: 8, amount: 3000 },
      { id: 39, classId: CLASS_JSS1, subclassId: SUBCLASS_JSS1B, billingId: 9, amount: 2000 },
      // JSS 2A
      { id: 40, classId: CLASS_JSS2, subclassId: SUBCLASS_JSS2A, billingId: 1, amount: 140000 },
      { id: 41, classId: CLASS_JSS2, subclassId: SUBCLASS_JSS2A, billingId: 2, amount: 5000 },
      { id: 42, classId: CLASS_JSS2, subclassId: SUBCLASS_JSS2A, billingId: 3, amount: 10000 },
      { id: 43, classId: CLASS_JSS2, subclassId: SUBCLASS_JSS2A, billingId: 4, amount: 8000 },
      { id: 44, classId: CLASS_JSS2, subclassId: SUBCLASS_JSS2A, billingId: 8, amount: 3500 },
      { id: 45, classId: CLASS_JSS2, subclassId: SUBCLASS_JSS2A, billingId: 9, amount: 2000 },
      // JSS 2B
      { id: 46, classId: CLASS_JSS2, subclassId: SUBCLASS_JSS2B, billingId: 1, amount: 140000 },
      { id: 47, classId: CLASS_JSS2, subclassId: SUBCLASS_JSS2B, billingId: 2, amount: 5000 },
      { id: 48, classId: CLASS_JSS2, subclassId: SUBCLASS_JSS2B, billingId: 3, amount: 10000 },
      { id: 49, classId: CLASS_JSS2, subclassId: SUBCLASS_JSS2B, billingId: 4, amount: 8000 },
      { id: 50, classId: CLASS_JSS2, subclassId: SUBCLASS_JSS2B, billingId: 8, amount: 3500 },
      { id: 51, classId: CLASS_JSS2, subclassId: SUBCLASS_JSS2B, billingId: 9, amount: 2000 },
      // JSS 3A
      { id: 52, classId: CLASS_JSS3, subclassId: SUBCLASS_JSS3A, billingId: 1, amount: 155000 },
      { id: 53, classId: CLASS_JSS3, subclassId: SUBCLASS_JSS3A, billingId: 2, amount: 5000 },
      { id: 54, classId: CLASS_JSS3, subclassId: SUBCLASS_JSS3A, billingId: 3, amount: 12000 },
      { id: 55, classId: CLASS_JSS3, subclassId: SUBCLASS_JSS3A, billingId: 8, amount: 4000 },
      { id: 56, classId: CLASS_JSS3, subclassId: SUBCLASS_JSS3A, billingId: 4, amount: 8000 },
      // SS 1A
      { id: 57, classId: CLASS_SS1, subclassId: SUBCLASS_SS1A, billingId: 1, amount: 190000 },
      { id: 58, classId: CLASS_SS1, subclassId: SUBCLASS_SS1A, billingId: 2, amount: 7500 },
      { id: 59, classId: CLASS_SS1, subclassId: SUBCLASS_SS1A, billingId: 3, amount: 15000 },
      { id: 60, classId: CLASS_SS1, subclassId: SUBCLASS_SS1A, billingId: 4, amount: 10000 },
      { id: 61, classId: CLASS_SS1, subclassId: SUBCLASS_SS1A, billingId: 8, amount: 5000 },
      { id: 62, classId: CLASS_SS1, subclassId: SUBCLASS_SS1A, billingId: 6, amount: 45000 },
      // SS 2A
      { id: 63, classId: CLASS_SS2, subclassId: SUBCLASS_SS2A, billingId: 1, amount: 210000 },
      { id: 64, classId: CLASS_SS2, subclassId: SUBCLASS_SS2A, billingId: 2, amount: 7500 },
      { id: 65, classId: CLASS_SS2, subclassId: SUBCLASS_SS2A, billingId: 3, amount: 15000 },
      { id: 66, classId: CLASS_SS2, subclassId: SUBCLASS_SS2A, billingId: 8, amount: 5000 },
      { id: 67, classId: CLASS_SS2, subclassId: SUBCLASS_SS2A, billingId: 4, amount: 10000 },
      { id: 68, classId: CLASS_SS2, subclassId: SUBCLASS_SS2A, billingId: 6, amount: 45000 },
    ].map((row) => ({
      ...row,
      session: session2026_27.id,
      term: termFirst.id,
    }));

    for (const row of classDefaultBillings2026FirstTerm) {
      await prisma.classDefaultBilling.upsert({
        where: { id: row.id },
        update: {
          classId: row.classId,
          subclassId: row.subclassId,
          session: row.session,
          term: row.term,
          billingId: row.billingId,
          amount: row.amount,
        },
        create: row,
      });
    }
    console.log(
      `   ✓ ${classDefaultBillings2026FirstTerm.length} class default billings for all subclasses (2026/2027, First Term)`
    );

    // Student billings — apply class defaults to each seeded student for current session/term
    console.log("💳 Seeding student billings...");
    let studentBillingCount = 0;
    const billingApprovedAt = new Date("2026-04-01T09:00:00.000Z");

    for (const student of students) {
      const applicableDefaults = classDefaultBillings.filter(
        (row) =>
          row.classId === student.classId &&
          (row.subclassId === null || row.subclassId === student.subClassId)
      );

      const referentId = `STB-SEED-${student.admissionNumber}`;

      for (const row of applicableDefaults) {
        const existing = await prisma.studentBilling.findFirst({
          where: {
            studentId: student.id,
            session: row.session,
            term: row.term,
            billingId: row.billingId,
          },
          select: { id: true },
        });

        const data = {
          studentId: student.id,
          classId: student.classId,
          subclassId: student.subClassId ?? null,
          session: row.session,
          term: row.term,
          billingId: row.billingId,
          amount: row.amount,
          referentId,
          status: "APPROVED",
          createdBy: adminUserId,
          approvedBy: adminUserId,
          approvedAt: billingApprovedAt,
          isPosted: false,
          postedBy: null,
          postedAt: null,
        };

        if (existing) {
          await prisma.studentBilling.update({
            where: { id: existing.id },
            data,
          });
        } else {
          await prisma.studentBilling.create({ data });
        }
        studentBillingCount += 1;
      }
    }
    console.log(
      `   ✓ ${studentBillingCount} student billing lines for ${students.length} students (APPROVED, unposted)`
    );

    // Donated inventory (stock-in via donation transactions)
    console.log("🎁 Seeding donated inventory transactions...");
    const STORE_MAIN = "a3a4b5c6-d7e8-4890-a012-345678904001";
    const STORE_ANNEX = "a3a4b5c6-d7e8-4890-a012-345678904002";
    const ITEM_EXERCISE_BOOK = "f2a3b4c5-d6e7-4890-a012-345678903004";
    const ITEM_PENCIL_PACK = "f2a3b4c5-d6e7-4890-a012-345678903005";
    const ITEM_A4_PAPER = "f2a3b4c5-d6e7-4890-a012-345678903001";
    const ITEM_DESKTOP = "f2a3b4c5-d6e7-4890-a012-345678903009";
    const ITEM_MOUSE = "f2a3b4c5-d6e7-4890-a012-345678903010";
    const ITEM_FOOTBALL = "f2a3b4c5-d6e7-4890-a012-345678903013";
    const ITEM_CHAIR = "f2a3b4c5-d6e7-4890-a012-345678903012";
    const ITEM_HAND_SOAP = "f2a3b4c5-d6e7-4890-a012-345678903006";
    const ITEM_LED_BULB = "f2a3b4c5-d6e7-4890-a012-345678903014";
    const ITEM_BALLPOINT = "f2a3b4c5-d6e7-4890-a012-345678903002";

    const donationTransactions = [
      {
        id: "a1b2c3d4-e5f6-4890-d012-345678909001",
        itemId: ITEM_EXERCISE_BOOK,
        storeId: STORE_MAIN,
        qtyIn: 500,
        referenceNo: "DON-20260315-PTA001",
        notes: "PTA book drive for junior secondary students",
        supplierReceiver: "School PTA",
        transactionDate: new Date("2026-03-15T10:00:00.000Z"),
        isAcknowledged: true,
      },
      {
        id: "a1b2c3d4-e5f6-4890-d012-345678909002",
        itemId: ITEM_PENCIL_PACK,
        storeId: STORE_MAIN,
        qtyIn: 40,
        referenceNo: "DON-20260315-PTA001",
        notes: "PTA stationery donation (HB pencil packs)",
        supplierReceiver: "School PTA",
        transactionDate: new Date("2026-03-15T10:05:00.000Z"),
        isAcknowledged: true,
      },
      {
        id: "a1b2c3d4-e5f6-4890-d012-345678909003",
        itemId: ITEM_BALLPOINT,
        storeId: STORE_MAIN,
        qtyIn: 25,
        referenceNo: "DON-20260315-PTA001",
        notes: "PTA ballpoint pen cartons for exam term",
        supplierReceiver: "School PTA",
        transactionDate: new Date("2026-03-15T10:10:00.000Z"),
        isAcknowledged: true,
      },
      {
        id: "a1b2c3d4-e5f6-4890-d012-345678909004",
        itemId: ITEM_A4_PAPER,
        storeId: STORE_MAIN,
        qtyIn: 30,
        referenceNo: "DON-20260401-ALUMNI01",
        notes: "Alumni association office paper donation",
        supplierReceiver: "Old Students Association",
        transactionDate: new Date("2026-04-01T09:00:00.000Z"),
        isAcknowledged: true,
      },
      {
        id: "a1b2c3d4-e5f6-4890-d012-345678909005",
        itemId: ITEM_DESKTOP,
        storeId: STORE_ANNEX,
        qtyIn: 5,
        referenceNo: "DON-20260401-ALUMNI01",
        notes: "Refurbished desktops for ICT laboratory",
        supplierReceiver: "Old Students Association",
        transactionDate: new Date("2026-04-01T09:30:00.000Z"),
        isAcknowledged: false,
      },
      {
        id: "a1b2c3d4-e5f6-4890-d012-345678909006",
        itemId: ITEM_MOUSE,
        storeId: STORE_ANNEX,
        qtyIn: 20,
        referenceNo: "DON-20260401-ALUMNI01",
        notes: "Wireless mice donated with alumni computer batch",
        supplierReceiver: "Old Students Association",
        transactionDate: new Date("2026-04-01T09:35:00.000Z"),
        isAcknowledged: false,
      },
      {
        id: "a1b2c3d4-e5f6-4890-d012-345678909007",
        itemId: ITEM_FOOTBALL,
        storeId: STORE_MAIN,
        qtyIn: 30,
        referenceNo: "DON-20260510-ROTARY01",
        notes: "Inter-house sports equipment donation",
        supplierReceiver: "Rotary Club Lagos",
        customerMame: "Rotary Club Lagos",
        transactionDate: new Date("2026-05-10T14:00:00.000Z"),
        isAcknowledged: true,
      },
      {
        id: "a1b2c3d4-e5f6-4890-d012-345678909008",
        itemId: ITEM_CHAIR,
        storeId: STORE_MAIN,
        qtyIn: 50,
        referenceNo: "DON-20260510-ROTARY01",
        notes: "Classroom chairs for expanded JSS block",
        supplierReceiver: "Rotary Club Lagos",
        customerMame: "Rotary Club Lagos",
        transactionDate: new Date("2026-05-10T14:15:00.000Z"),
        isAcknowledged: true,
      },
      {
        id: "a1b2c3d4-e5f6-4890-d012-345678909009",
        itemId: ITEM_HAND_SOAP,
        storeId: STORE_MAIN,
        qtyIn: 12,
        referenceNo: "DON-20260601-HYGIENE",
        notes: "Hygiene supplies for dormitories and washrooms",
        supplierReceiver: "Wellness Foundation NGO",
        transactionDate: new Date("2026-06-01T11:00:00.000Z"),
        isAcknowledged: true,
      },
      {
        id: "a1b2c3d4-e5f6-4890-d012-345678909010",
        itemId: ITEM_LED_BULB,
        storeId: STORE_ANNEX,
        qtyIn: 100,
        referenceNo: "DON-20260601-HYGIENE",
        notes: "LED bulbs for maintenance energy-saving upgrade",
        supplierReceiver: "Wellness Foundation NGO",
        transactionDate: new Date("2026-06-01T11:20:00.000Z"),
        isAcknowledged: false,
      },
    ];

    for (const row of donationTransactions) {
      await prisma.inventoryTransaction.upsert({
        where: { id: row.id },
        update: {
          itemId: row.itemId,
          storeId: row.storeId,
          transactionType: "donation",
          qtyIn: row.qtyIn,
          qtyOut: 0,
          inCost: 0,
          outCost: 0,
          amountPaid: 0,
          status: "completed",
          referenceNo: row.referenceNo,
          notes: row.notes,
          supplierReceiver: row.supplierReceiver,
          ...(row.customerMame !== undefined ? { customerMame: row.customerMame } : {}),
          sessionId: seededSession.id,
          termId: seededTerm.id,
          transactionDate: row.transactionDate,
          createdById: adminUserId,
          isAcknowledged: row.isAcknowledged,
          ...(row.isAcknowledged
            ? {
                acknowledgedAt: row.transactionDate,
                acknowledgedBy: adminUserId,
              }
            : { acknowledgedAt: null, acknowledgedBy: null }),
        },
        create: {
          id: row.id,
          itemId: row.itemId,
          storeId: row.storeId,
          transactionType: "donation",
          qtyIn: row.qtyIn,
          qtyOut: 0,
          inCost: 0,
          outCost: 0,
          amountPaid: 0,
          status: "completed",
          referenceNo: row.referenceNo,
          notes: row.notes,
          supplierReceiver: row.supplierReceiver,
          ...(row.customerMame !== undefined ? { customerMame: row.customerMame } : {}),
          sessionId: seededSession.id,
          termId: seededTerm.id,
          transactionDate: row.transactionDate,
          createdById: adminUserId,
          isAcknowledged: row.isAcknowledged,
          ...(row.isAcknowledged
            ? {
                acknowledgedAt: row.transactionDate,
                acknowledgedBy: adminUserId,
              }
            : {}),
        },
      });
    }
    console.log(`   ✓ ${donationTransactions.length} donation transactions (4 reference batches)`);

    // -------------------------------------------------------------------------
    // Transport: routes, bustops, vehicles, assignments, student transports
    // -------------------------------------------------------------------------
    console.log("🚌 Seeding transport data...");

    const TRANSPORT = {
      routes: {
        lekki: "f7a8b9c0-d1e2-4345-f012-34567890b001",
        ikeja: "f7a8b9c0-d1e2-4345-f012-34567890b002",
      },
      bustops: {
        admiralty: "f7a8b9c0-d1e2-4345-f012-34567890c001",
        jakande: "f7a8b9c0-d1e2-4345-f012-34567890c002",
        schoolGate: "f7a8b9c0-d1e2-4345-f012-34567890c003",
        alausa: "f7a8b9c0-d1e2-4345-f012-34567890c004",
        ikejaMall: "f7a8b9c0-d1e2-4345-f012-34567890c005",
      },
      vehicles: {
        bus001: "f7a8b9c0-d1e2-4345-f012-34567890e001",
        bus002: "f7a8b9c0-d1e2-4345-f012-34567890e002",
        car001: "f7a8b9c0-d1e2-4345-f012-34567890e003",
      },
      drivers: {
        primary: "a8b9c0d1-e2f3-4234-a012-345678909003",
        secondary: "a8b9c0d1-e2f3-4234-a012-345678909004",
      },
      students: {
        chioma: "e6f7a8b9-c0d1-4234-e012-345678907001",
        ibrahim: "e6f7a8b9-c0d1-4234-e012-345678907002",
        david: "e6f7a8b9-c0d1-4234-e012-345678907004",
      },
    };

    const transportRoutes = [
      {
        id: TRANSPORT.routes.lekki,
        name: "Lekki Corridor",
        description: "Admiralty Way through Jakande to school gate",
        homeToSchoolCost: 2500,
        schoolToHomeCost: 2500,
        roundTripCost: 4500,
        status: "Active",
      },
      {
        id: TRANSPORT.routes.ikeja,
        name: "Ikeja Express",
        description: "Alausa and Ikeja City Mall to school gate",
        homeToSchoolCost: 2000,
        schoolToHomeCost: 2000,
        roundTripCost: 3500,
        status: "Active",
      },
    ];

    for (const route of transportRoutes) {
      await prisma.route.upsert({
        where: { id: route.id },
        update: {
          name: route.name,
          description: route.description,
          homeToSchoolCost: route.homeToSchoolCost,
          schoolToHomeCost: route.schoolToHomeCost,
          roundTripCost: route.roundTripCost,
          status: route.status,
        },
        create: route,
      });
    }

    const transportBustops = [
      {
        id: TRANSPORT.bustops.admiralty,
        name: "Admiralty Way",
        description: "Lekki Phase 1 pickup",
        latitude: 6.4478,
        longitude: 3.4721,
        status: "Active",
      },
      {
        id: TRANSPORT.bustops.jakande,
        name: "Jakande Roundabout",
        description: "Lekki-Epe expressway stop",
        latitude: 6.4582,
        longitude: 3.5086,
        status: "Active",
      },
      {
        id: TRANSPORT.bustops.schoolGate,
        name: "School Gate",
        description: "Main campus drop-off / pick-up",
        latitude: 6.5244,
        longitude: 3.3792,
        status: "Active",
      },
      {
        id: TRANSPORT.bustops.alausa,
        name: "Alausa Secretariat",
        description: "Ikeja local government area stop",
        latitude: 6.6141,
        longitude: 3.3569,
        status: "Active",
      },
      {
        id: TRANSPORT.bustops.ikejaMall,
        name: "Ikeja City Mall",
        description: "Mall frontage pickup",
        latitude: 6.6195,
        longitude: 3.3498,
        status: "Active",
      },
    ];

    for (const bustop of transportBustops) {
      await prisma.bustop.upsert({
        where: { id: bustop.id },
        update: {
          name: bustop.name,
          description: bustop.description,
          latitude: bustop.latitude,
          longitude: bustop.longitude,
          status: bustop.status,
        },
        create: bustop,
      });
    }

    const transportRouteBustops = [
      {
        id: "f7a8b9c0-d1e2-4345-f012-34567890d001",
        routeId: TRANSPORT.routes.lekki,
        bustopId: TRANSPORT.bustops.admiralty,
        stopOrder: 1,
      },
      {
        id: "f7a8b9c0-d1e2-4345-f012-34567890d002",
        routeId: TRANSPORT.routes.lekki,
        bustopId: TRANSPORT.bustops.jakande,
        stopOrder: 2,
      },
      {
        id: "f7a8b9c0-d1e2-4345-f012-34567890d003",
        routeId: TRANSPORT.routes.lekki,
        bustopId: TRANSPORT.bustops.schoolGate,
        stopOrder: 3,
      },
      {
        id: "f7a8b9c0-d1e2-4345-f012-34567890d004",
        routeId: TRANSPORT.routes.ikeja,
        bustopId: TRANSPORT.bustops.alausa,
        stopOrder: 1,
      },
      {
        id: "f7a8b9c0-d1e2-4345-f012-34567890d005",
        routeId: TRANSPORT.routes.ikeja,
        bustopId: TRANSPORT.bustops.ikejaMall,
        stopOrder: 2,
      },
      {
        id: "f7a8b9c0-d1e2-4345-f012-34567890d006",
        routeId: TRANSPORT.routes.ikeja,
        bustopId: TRANSPORT.bustops.schoolGate,
        stopOrder: 3,
      },
    ];

    for (const row of transportRouteBustops) {
      await prisma.routeBustop.upsert({
        where: { id: row.id },
        update: {
          routeId: row.routeId,
          bustopId: row.bustopId,
          stopOrder: row.stopOrder,
        },
        create: row,
      });
    }

    const transportVehicles = [
      {
        id: TRANSPORT.vehicles.bus001,
        vehicleNumber: "BUS-001",
        vehicleType: "Bus",
        vehicleMake: "Toyota",
        capacity: 50,
        driverId: TRANSPORT.drivers.primary,
        status: "Active",
        remarks: "Primary Lekki corridor bus",
        createdById: adminUserId,
      },
      {
        id: TRANSPORT.vehicles.bus002,
        vehicleNumber: "BUS-002",
        vehicleType: "Bus",
        vehicleMake: "Honda",
        capacity: 40,
        driverId: TRANSPORT.drivers.secondary,
        status: "Active",
        remarks: "Ikeja express spare",
        createdById: adminUserId,
      },
      {
        id: TRANSPORT.vehicles.car001,
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

    for (const vehicle of transportVehicles) {
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

    const transportVehicleRoutes = [
      {
        id: "f7a8b9c0-d1e2-4345-f012-34567890f001",
        vehicleId: TRANSPORT.vehicles.bus001,
        routeId: TRANSPORT.routes.lekki,
      },
      {
        id: "f7a8b9c0-d1e2-4345-f012-34567890f002",
        vehicleId: TRANSPORT.vehicles.bus001,
        routeId: TRANSPORT.routes.ikeja,
      },
      {
        id: "f7a8b9c0-d1e2-4345-f012-34567890f003",
        vehicleId: TRANSPORT.vehicles.bus002,
        routeId: TRANSPORT.routes.ikeja,
      },
    ];

    for (const row of transportVehicleRoutes) {
      await prisma.vehicleRoute.upsert({
        where: { id: row.id },
        update: {
          vehicleId: row.vehicleId,
          routeId: row.routeId,
        },
        create: row,
      });
    }

    const studentTransports = [
      {
        id: "f7a8b9c0-d1e2-4345-f012-34567890a001",
        studentId: TRANSPORT.students.chioma,
        routeId: TRANSPORT.routes.lekki,
        bustopId: TRANSPORT.bustops.admiralty,
        status: "Active",
        subscriptionType: "RoundTrip",
        sessionId: seededSession.id,
        termId: seededTerm.id,
        classId: classIds.jss1,
      },
      {
        id: "f7a8b9c0-d1e2-4345-f012-34567890a002",
        studentId: TRANSPORT.students.ibrahim,
        routeId: TRANSPORT.routes.ikeja,
        bustopId: TRANSPORT.bustops.alausa,
        status: "Active",
        subscriptionType: "OneWaySchool",
        sessionId: seededSession.id,
        termId: seededTerm.id,
        classId: classIds.jss1,
      },
      {
        id: "f7a8b9c0-d1e2-4345-f012-34567890a003",
        studentId: TRANSPORT.students.david,
        routeId: TRANSPORT.routes.lekki,
        bustopId: TRANSPORT.bustops.jakande,
        status: "Active",
        subscriptionType: "OneWayHome",
        sessionId: seededSession.id,
        termId: seededTerm.id,
        classId: classIds.jss2,
      },
    ];

    for (const row of studentTransports) {
      await prisma.studentTransport.upsert({
        where: { id: row.id },
        update: {
          studentId: row.studentId,
          routeId: row.routeId,
          bustopId: row.bustopId,
          status: row.status,
          subscriptionType: row.subscriptionType,
          sessionId: row.sessionId,
          termId: row.termId,
          classId: row.classId,
        },
        create: row,
      });
    }

    console.log(
      `   ✓ ${transportRoutes.length} routes, ${transportBustops.length} bustops, ${transportRouteBustops.length} route-bustops`
    );
    console.log(
      `   ✓ ${transportVehicles.length} vehicles, ${transportVehicleRoutes.length} vehicle-routes, ${studentTransports.length} student transports`
    );

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
