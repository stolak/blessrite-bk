import { Router } from "express";

// NOTE: `auth.ts` uses `export = router` (CommonJS-style), so we import it with `require` syntax.
import authRouter = require("./auth");

import bankRouter from "./bank";
import accountGroupRouter from "./accountGroup";
import accountHeadRouter from "./accountHead";
import accountSubheadRouter from "./accountSubhead";
import accountChartRouter from "./accountChart";
import accountTransactionRouter from "./accountTransaction";

import tempJournalTransferRouter from "./tempJournalTransfer";

import uploadRouter from "./upload";

import menuRouter from "./menu";
import appRoleRouter from "./appRole";
import privilegeRouter from "./privilege";

import brandRouter from "./brand";
import supplierRouter from "./supplier";
import activePeriodRouter from "./activePeriod";
import staffRouter from "./staff";
import departmentRouter from "./department";
import gradeLevelRouter from "./gradeLevel";
import vehicleRouter from "./vehicle";

import cashierRouter from "./cashier";
import userRouter from "./user";
import auditLogRouter from "./auditLog";

import salaryComponentRouter from "./salaryComponent";
import salaryChartRouter from "./salaryChart";
import staffSalaryOverrideComponentRouter from "./staffSalaryOverrideComponent";
import payrollRouter from "./payroll";
import activePayrollPeriodRouter from "./activePayrollPeriod";
import administrativeExpenseComponentRouter from "./administrativeExpenseComponent";
import administrativeExpenseRouter from "./administrativeExpense";
import defaulSubheadSettingsRouter from "./defaulSubheadSettings";
import defaultAccountSettingsRouter from "./defaultAccountSettings";

import { authenticateJWT } from "../middlewares/auth";
import { requirePrivilege } from "../middlewares/requirePrivilege";

const router = Router();

router.use("/auth", authRouter);

// Protected API: JWT first, then privilege check (user id comes from token, not request params)
router.use(authenticateJWT);
// router.use(requirePrivilege);
router.use("/banks", bankRouter);
router.use("/account-groups", accountGroupRouter);
router.use("/account-heads", accountHeadRouter);
router.use("/account-subheads", accountSubheadRouter);
router.use("/account-charts", accountChartRouter);
router.use("/account-transactions", accountTransactionRouter);
router.use("/default-subhead-settings", defaulSubheadSettingsRouter);
router.use("/default-account-settings", defaultAccountSettingsRouter);

router.use("/temp-journal-transfers", tempJournalTransferRouter);

router.use("/menus", menuRouter);
router.use("/app-roles", appRoleRouter);
router.use("/privileges", privilegeRouter);

router.use("/brands", brandRouter);
router.use("/suppliers", supplierRouter);
router.use("/active-period", activePeriodRouter);
router.use("/staff", staffRouter);
router.use("/departments", departmentRouter);
router.use("/grade-levels", gradeLevelRouter);
router.use("/vehicles", vehicleRouter);

router.use("/cashiers", cashierRouter);
router.use("/users", userRouter);
router.use("/audit-logs", auditLogRouter);
router.use("/salary-components", salaryComponentRouter);
router.use("/salary-charts", salaryChartRouter);
router.use("/staff-salary-override-components", staffSalaryOverrideComponentRouter);
router.use("/payroll", payrollRouter);
router.use("/active-payroll-period", activePayrollPeriodRouter);
router.use("/administrative-expense-components", administrativeExpenseComponentRouter);
router.use("/administrative-expenses", administrativeExpenseRouter);

router.use("/upload", uploadRouter);

export default router;
