import { Request, Response } from "express";
import { Status, StudentStatus } from "@prisma/client";
import { accountTransactionService } from "../services/accountTransactionService";
import { parseIntOrUndefined } from "../utils/request";
import { parseQueryDateEndInclusive, parseQueryDateStart } from "../utils/queryDate";

/**
 * @openapi
 * /api/v1/account-transactions/debit:
 *   post:
 *     summary: Post a debit entry
 *     description: Creates one debit transaction. groupId/headId/subheadId/accountCode are derived from accountId.
 *     tags: [AccountTransactions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [accountId, amount, ref, manualRef, transactionDate, postedBy]
 *             properties:
 *               accountId: { type: string }
 *               amount: { type: number, minimum: 0.01 }
 *               ref: { type: string }
 *               manualRef: { type: string }
 *               transactionDate: { type: string, format: date-time }
 *               postedBy: { type: string }
 *               projectId: { type: string, nullable: true }
 *               accountSub: { type: string, nullable: true }
 *     responses:
 *       201: { description: Debit posted }
 *       400: { description: Validation error }
 *       404: { description: accountId/projectId not found }
 *       500: { description: Server error }
 *
 * /api/v1/account-transactions/credit:
 *   post:
 *     summary: Post a credit entry
 *     description: Creates one credit transaction. groupId/headId/subheadId/accountCode are derived from accountId.
 *     tags: [AccountTransactions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [accountId, amount, ref, manualRef, transactionDate, postedBy]
 *             properties:
 *               accountId: { type: string }
 *               amount: { type: number, minimum: 0.01 }
 *               ref: { type: string }
 *               manualRef: { type: string }
 *               transactionDate: { type: string, format: date-time }
 *               postedBy: { type: string }
 *               projectId: { type: string, nullable: true }
 *               accountSub: { type: string, nullable: true }
 *     responses:
 *       201: { description: Credit posted }
 *       400: { description: Validation error }
 *       404: { description: accountId/projectId not found }
 *       500: { description: Server error }
 *
 * /api/v1/account-transactions/rollback/{ref}:
 *   delete:
 *     summary: Roll back transactions by reference
 *     description: Deletes all transaction rows where `ref` equals the path parameter.
 *     tags: [AccountTransactions]
 *     parameters:
 *       - in: path
 *         name: ref
 *         required: true
 *         schema: { type: string }
 *         description: Reference value used when posting entries
 *     responses:
 *       200:
 *         description: Rollback completed
 *       400:
 *         description: Invalid ref
 *       500:
 *         description: Server error
 *
 * /api/v1/account-transactions/transaction-log:
 *   get:
 *     summary: Account transaction log for one account
 *     description: |
 *       Lists `AccountTransaction` rows for one `accountId` between `transactionDateFrom` and `transactionDateTo` (inclusive).
 *       If both dates are omitted, the window is the current UTC calendar month from the 1st through end of today.
 *       If only `transactionDateFrom` is set, `transactionDateTo` defaults to end of today UTC.
 *       If only `transactionDateTo` is set, `transactionDateFrom` defaults to the first day of that date's UTC month.
 *       `balanceBeforeFromDate` is sum(debit) − sum(credit) for rows strictly before the window start.
 *     tags: [AccountTransactions]
 *     parameters:
 *       - in: query
 *         name: accountId
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: transactionDateFrom
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: transactionDateTo
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Account summary, date window, opening balance, and transactions
 *       400:
 *         description: Invalid parameters or date range
 *       404:
 *         description: Account not found
 *       500:
 *         description: Server error
 *
 * /api/v1/account-transactions/report-by-account:
 *   get:
 *     summary: Grouped account transaction report by accountId
 *     description: |
 *       Groups `AccountTransaction` by `accountId` and returns `sumCreditMinusDebit` = sum(credit) − sum(debit).
 *       Supports optional date window filters; if omitted, aggregation is all-time.
 *       Rows are ordered by headId, subhead rank, subheadId, account chart rank, then accountId.
 *     tags: [AccountTransactions]
 *     parameters:
 *       - in: query
 *         name: transactionDateFrom
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: transactionDateTo
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Grouped rows with account chart details and sum(credit - debit)
 *       400:
 *         description: Invalid date parameters or date range
 *       500:
 *         description: Server error
 *
 * /api/v1/account-transactions/report-by-head-subhead:
 *   get:
 *     summary: Grouped account report by head and subhead
 *     description: |
 *       Returns an object keyed as `headcode{head.code}` from `AccountHead`.
 *       Each key contains the head details and `subheads` from `AccountSubhead`, where
 *       each subhead `balance` is sum(credit) − sum(debit) from `AccountTransaction`
 *       grouped by `(headId, subheadId)` for the optional date window.
 *     tags: [AccountTransactions]
 *     parameters:
 *       - in: query
 *         name: transactionDateFrom
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: transactionDateTo
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Object of headcode buckets with nested subhead balances
 *       400:
 *         description: Invalid date parameters or date range
 *       500:
 *         description: Server error
 *
 * /api/v1/account-transactions/profit-and-loss:
 *   get:
 *     summary: Profit and loss statement
 *     description: |
 *       Returns a P&amp;L for the fixed chart sections seeded in the application:
 *       **Incomes** (account group 5 / head 51) and **Expenses** (group 4 / head 41).
 *       Line amounts use `AccountTransaction` in the optional date window:
 *       income = sum(credit) − sum(debit); expense = sum(debit) − sum(credit).
 *       Includes subhead subtotals and net profit (income − expenses).
 *     tags: [AccountTransactions]
 *     parameters:
 *       - in: query
 *         name: transactionDateFrom
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: transactionDateTo
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Full P&amp;L with income and expense sections
 *       400:
 *         description: Invalid date parameters or date range
 *       500:
 *         description: Server error
 *
 * /api/v1/account-transactions/profit-and-loss/summary:
 *   get:
 *     summary: Profit and loss totals only
 *     description: Same filters as profit-and-loss; returns total income, total expenses, and net profit only.
 *     tags: [AccountTransactions]
 *     parameters:
 *       - in: query
 *         name: transactionDateFrom
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: transactionDateTo
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: P&amp;L summary totals
 *       400:
 *         description: Invalid date parameters or date range
 *       500:
 *         description: Server error
 *
 * /api/v1/account-transactions/balance-sheet:
 *   get:
 *     summary: Balance sheet
 *     description: |
 *       Statement of financial position as at a date (inception through `asAtDate` inclusive).
 *       Uses the fixed seeded groups: **Assets** (1), **Liabilities** (2), **Equity** (3),
 *       with all account heads and subheads under each group.
 *       Asset balances = sum(debit) − sum(credit); liability and equity = sum(credit) − sum(debit).
 *       Returns `isBalanced` when total assets equals liabilities + equity (±0.01).
 *     tags: [AccountTransactions]
 *     parameters:
 *       - in: query
 *         name: asAtDate
 *         schema: { type: string, format: date }
 *         description: Defaults to end of today UTC if omitted.
 *     responses:
 *       200:
 *         description: Full balance sheet with nested heads and account lines
 *       400:
 *         description: Invalid asAtDate
 *       500:
 *         description: Server error
 *
 * /api/v1/account-transactions/balance-sheet/summary:
 *   get:
 *     summary: Balance sheet totals only
 *     description: Same as balance-sheet; returns section totals and balancing check only.
 *     tags: [AccountTransactions]
 *     parameters:
 *       - in: query
 *         name: asAtDate
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Balance sheet summary totals
 *       400:
 *         description: Invalid asAtDate
 *       500:
 *         description: Server error
 *
 * /api/v1/account-transactions/cash-flow:
 *   get:
 *     summary: Cash flow statement
 *     description: |
 *       Cash movements on ledger accounts under subheads with `accountType` Cash (seeded Cash and Bank).
 *       **Inflows** = cash debits; **outflows** = cash credits in the date window.
 *       Activities (operating / investing / financing) are inferred from the largest non-cash leg
 *       sharing the same journal `ref`. Includes per-cash-account opening/closing balances.
 *     tags: [AccountTransactions]
 *     parameters:
 *       - in: query
 *         name: transactionDateFrom
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: transactionDateTo
 *         schema: { type: string, format: date }
 *         description: Defaults to end of today UTC if omitted.
 *     responses:
 *       200:
 *         description: Cash flow report with activity sections and cash account detail
 *       400:
 *         description: Invalid date parameters or date range
 *       500:
 *         description: Server error
 *
 * /api/v1/account-transactions/cash-flow/summary:
 *   get:
 *     summary: Cash flow summary totals
 *     description: Activity section nets and opening/closing cash without per-account detail.
 *     tags: [AccountTransactions]
 *     parameters:
 *       - in: query
 *         name: transactionDateFrom
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: transactionDateTo
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Cash flow summary
 *       400:
 *         description: Invalid date parameters or date range
 *       500:
 *         description: Server error
 *
 * /api/v1/account-transactions/balance-as-at:
 *   get:
 *     summary: Account balance as at a selected date
 *     description: |
 *       Returns balance for one account from inception through the selected date (inclusive):
 *       `sum(credit) - sum(debit)` for rows where `transactionDate <= asAtDate`.
 *     tags: [AccountTransactions]
 *     parameters:
 *       - in: query
 *         name: accountId
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: asAtDate
 *         required: false
 *         schema: { type: string, format: date }
 *         description: Date or date-time. If omitted, defaults to end of today UTC. Date-only values are treated as end of that UTC day.
 *     responses:
 *       200:
 *         description: Account details and balance as at the selected date
 *       400:
 *         description: Invalid accountId or asAtDate
 *       404:
 *         description: Account not found
 *       500:
 *         description: Server error
 *
 * /api/v1/account-transactions/student-balance:
 *   get:
 *     summary: Student account balance as at a selected date
 *     description: |
 *       Returns student balance from inception through the selected date (inclusive):
 *       `sum(credit) - sum(debit)` for rows where `accountSub = studentId` and `transactionDate <= asAtDate`.
 *     tags: [AccountTransactions]
 *     parameters:
 *       - in: query
 *         name: studentId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: asAtDate
 *         required: false
 *         schema: { type: string, format: date }
 *         description: Date or date-time. If omitted, defaults to end of today UTC. Date-only values are treated as end of that UTC day.
 *     responses:
 *       200:
 *         description: Student balance as at the selected date
 *       400:
 *         description: Invalid studentId or asAtDate
 *       500:
 *         description: Server error
 *
 * /api/v1/account-transactions/staff-balance:
 *   get:
 *     summary: Staff account balance as at a selected date
 *     description: |
 *       Returns staff balance from inception through the selected date (inclusive):
 *       `sum(credit) - sum(debit)` for rows where `accountSub = staffId` and `transactionDate <= asAtDate`.
 *     tags: [AccountTransactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: staffId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: asAtDate
 *         required: false
 *         schema: { type: string, format: date }
 *         description: Date or date-time. If omitted, defaults to end of today UTC. Date-only values are treated as end of that UTC day.
 *     responses:
 *       200:
 *         description: Staff balance as at the selected date
 *       400:
 *         description: Invalid staffId or asAtDate
 *       500:
 *         description: Server error
 *
 * /api/v1/account-transactions/student-balances:
 *   get:
 *     summary: List student balances with filtering, sorting and pagination
 *     description: |
 *       Returns student balances up to `asAtDate` (inclusive), where balance = `sum(credit) - sum(debit)`
 *       from inception for transactions matched by `accountSub = studentId`.
 *       Supports optional student `status`, dynamic ordering, and pagination.
 *       Default order is `classId -> subclassId -> balance`.
 *     tags: [AccountTransactions]
 *     parameters:
 *       - in: query
 *         name: asAtDate
 *         required: false
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: status
 *         required: false
 *         schema: { type: string, enum: [Active, Inactive, Graduated, Transferred, Suspended, Archived] }
 *       - in: query
 *         name: classId
 *         required: false
 *         schema: { type: string }
 *       - in: query
 *         name: orderBy
 *         required: false
 *         schema: { type: string, enum: [classId, balance] }
 *       - in: query
 *         name: orderDirection
 *         required: false
 *         schema: { type: string, enum: [asc, desc], default: asc }
 *       - in: query
 *         name: page
 *         required: false
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         required: false
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200:
 *         description: Student balances retrieved successfully
 *       400:
 *         description: Invalid query parameters
 *       500:
 *         description: Server error
 *
 * /api/v1/account-transactions/staff-balances:
 *   get:
 *     summary: List staff balances with filtering, sorting and pagination
 *     description: |
 *       Returns staff balances up to `asAtDate` (inclusive), where balance = `sum(credit) - sum(debit)`
 *       from inception for transactions matched by `accountSub = staffId`.
 *       Supports optional staff `status`, `departmentId`, `gradeLevelId`, ordering, and pagination.
 *       Default order is by name, then staff number. No classId filter (staff have no class).
 *     tags: [AccountTransactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: asAtDate
 *         required: false
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: status
 *         required: false
 *         schema: { type: string, enum: [Active, Inactive, Archived] }
 *       - in: query
 *         name: departmentId
 *         required: false
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: gradeLevelId
 *         required: false
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: orderBy
 *         required: false
 *         schema: { type: string, enum: [name, StaffNumber, balance] }
 *       - in: query
 *         name: orderDirection
 *         required: false
 *         schema: { type: string, enum: [asc, desc], default: asc }
 *       - in: query
 *         name: page
 *         required: false
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         required: false
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200:
 *         description: Staff balances retrieved successfully
 *       400:
 *         description: Invalid query parameters
 *       500:
 *         description: Server error
 *
 * /api/v1/account-transactions/student-transaction-log:
 *   get:
 *     summary: Student account transaction log
 *     description: |
 *       Returns account transactions for a student (`accountSub = studentId`) within a date window,
 *       plus opening balance before `datefrom` computed as `sum(credit) - sum(debit)`.
 *       `studentId` is required.
 *       If no dates are provided, defaults to one year back from today through end of today UTC.
 *     tags: [AccountTransactions]
 *     parameters:
 *       - in: query
 *         name: studentId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: datefrom
 *         required: false
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: dateTo
 *         required: false
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Student opening balance and transactions in range
 *       400:
 *         description: Invalid query parameters
 *       404:
 *         description: Student not found
 *       500:
 *         description: Server error
 *
 * /api/v1/account-transactions/staff-transaction-log:
 *   get:
 *     summary: Staff account transaction log
 *     description: |
 *       Returns account transactions for a staff member (`accountSub = staffId`) within a date window,
 *       plus opening balance before `datefrom` computed as `sum(credit) - sum(debit)`.
 *       `staffId` is required.
 *       If no dates are provided, defaults to one year back from today through end of today UTC.
 *     tags: [AccountTransactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: staffId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: datefrom
 *         required: false
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: dateTo
 *         required: false
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: transactionDateFrom
 *         required: false
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: transactionDateTo
 *         required: false
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Staff opening balance and transactions in range
 *       400:
 *         description: Invalid query parameters
 *       404:
 *         description: Staff not found
 *       500:
 *         description: Server error
 *
 * /api/v1/account-transactions/student-journal-transfer:
 *   get:
 *     summary: Query student journal transfers
 *     description: |
 *       Returns grouped student journal transfer summaries.
 *       Optional filters: `studentId`, `dateFrom`, `dateTo`.
 *     tags: [AccountTransactions]
 *     parameters:
 *       - in: query
 *         name: studentId
 *         required: false
 *         schema: { type: string }
 *       - in: query
 *         name: dateFrom
 *         required: false
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: dateTo
 *         required: false
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Student journal transfers retrieved successfully
 *       400:
 *         description: Invalid query parameters
 *       500:
 *         description: Server error
 *   post:
 *     summary: Post student journal transfer (double entry)
 *     description: |
 *       Accepts global `studentId`, `transactionDate` and an `entries` array.
 *       `manualRef` is optional; when omitted it is auto-generated. Provided or generated
 *       values must be unique across existing journal and ledger rows.
 *       For each entry:
 *       1) First leg posts to the entry account using `transactionType` (`credit` or `debit`)
 *       2) Second leg posts opposite side to account from `STUDENT_ACCOUNT` setting,
 *          with `accountSub = studentId`.
 *     tags: [AccountTransactions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [studentId, transactionDate, entries]
 *             properties:
 *               studentId: { type: string }
 *               manualRef:
 *                 type: string
 *                 description: Optional; auto-generated when omitted. Must not already exist.
 *               transactionDate: { type: string, format: date-time }
 *               entries:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [amount, accountId, transactionType]
 *                   properties:
 *                     amount: { type: number, minimum: 0.01 }
 *                     accountId: { type: string }
 *                     transactionType: { type: string, enum: [credit, debit] }
 *                     remarks: { type: string, nullable: true }
 *     responses:
 *       201:
 *         description: Student journal transfer posted successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Student or configured STUDENT_ACCOUNT not found
 *       409:
 *         description: manualRef already exists
 *       500:
 *         description: Server error
 *
 * /api/v1/account-transactions/staff-journal-transfer:
 *   get:
 *     summary: Query staff journal transfers
 *     description: |
 *       Returns grouped staff journal transfer summaries.
 *       Optional filters: `staffId`, `dateFrom`, `dateTo`.
 *     tags: [AccountTransactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: staffId
 *         required: false
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: dateFrom
 *         required: false
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: dateTo
 *         required: false
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Staff journal transfers retrieved successfully
 *       400:
 *         description: Invalid query parameters
 *       500:
 *         description: Server error
 *   post:
 *     summary: Post staff journal transfer (double entry)
 *     description: |
 *       Accepts global `staffId`, `manualRef`, `transactionDate` and an `entries` array.
 *       For each entry:
 *       1) First leg posts to the entry account using `transactionType` (`credit` or `debit`)
 *       2) Second leg posts opposite side to account from `STAFF_ACCOUNT` setting,
 *          with `accountSub = staffId`.
 *     tags: [AccountTransactions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [staffId, manualRef, transactionDate, entries]
 *             properties:
 *               staffId: { type: string, format: uuid }
 *               manualRef: { type: string }
 *               transactionDate: { type: string, format: date-time }
 *               entries:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [amount, accountId, transactionType]
 *                   properties:
 *                     amount: { type: number, minimum: 0.01 }
 *                     accountId: { type: string }
 *                     transactionType: { type: string, enum: [credit, debit] }
 *                     remarks: { type: string, nullable: true }
 *     responses:
 *       201:
 *         description: Staff journal transfer posted successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Staff or configured STAFF_ACCOUNT not found
 *       500:
 *         description: Server error
 */
export const accountTransactionController = {
  listStudentJournalTransfer: async (req: Request, res: Response) => {
    try {
      const studentIdRaw = typeof req.query.studentId === "string" ? req.query.studentId.trim() : undefined;
      if (typeof req.query.studentId === "string" && !studentIdRaw) {
        return res.status(400).json({ success: false, message: "studentId cannot be empty" });
      }

      const fromSource =
        req.query.dateFrom !== undefined
          ? req.query.dateFrom
          : req.query.datefrom !== undefined
            ? req.query.datefrom
            : req.query.transactionDateFrom;
      const toSource =
        req.query.dateTo !== undefined ? req.query.dateTo : req.query.transactionDateTo;

      const fromRaw = parseQueryDateStart(fromSource);
      const toRaw = parseQueryDateEndInclusive(toSource);
      if (fromRaw === "invalid") {
        return res.status(400).json({ success: false, message: "dateFrom is invalid" });
      }
      if (toRaw === "invalid") {
        return res.status(400).json({ success: false, message: "dateTo is invalid" });
      }

      const data = await accountTransactionService.listStudentJournalTransfers({
        ...(studentIdRaw !== undefined ? { studentId: studentIdRaw } : {}),
        ...(fromRaw === "missing" ? {} : { dateFrom: fromRaw }),
        ...(toRaw === "missing" ? {} : { dateTo: toRaw }),
      });

      return res.json({
        success: true,
        message: "Student journal transfer retrived successfully",
        data,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to retrieve student journal transfer";
      const code = message.includes("empty") || message.includes("invalid") ? 400 : 500;
      return res.status(code).json({
        success: false,
        message,
        ...(code === 500 && error instanceof Error ? { error: error.message } : {}),
      });
    }
  },

  postStudentJournalTransfer: async (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      const studentId = typeof body.studentId === "string" ? body.studentId.trim() : "";
      const manualRef =
        body.manualRef === undefined || body.manualRef === null
          ? undefined
          : typeof body.manualRef === "string"
            ? body.manualRef.trim()
            : "";
      const transactionDate =
        typeof body.transactionDate === "string" || body.transactionDate instanceof Date
          ? new Date(body.transactionDate)
          : new Date(NaN);

      if (!studentId) {
        return res.status(400).json({ success: false, message: "studentId is required" });
      }
      if (body.manualRef !== undefined && body.manualRef !== null && typeof body.manualRef !== "string") {
        return res.status(400).json({ success: false, message: "manualRef must be a string when provided" });
      }
      if (manualRef === "") {
        return res.status(400).json({
          success: false,
          message: "manualRef cannot be empty when provided",
        });
      }
      if (Number.isNaN(transactionDate.getTime())) {
        return res.status(400).json({ success: false, message: "transactionDate must be a valid date" });
      }
      if (!Array.isArray(body.entries) || body.entries.length === 0) {
        return res.status(400).json({ success: false, message: "entries must be a non-empty array" });
      }

      const entries: Array<{
        amount: number;
        accountId: string;
        transactionType: unknown;
        remarks?: string;
      }> = body.entries.map((entry: any) => ({
        amount:
          typeof entry?.amount === "number"
            ? entry.amount
            : typeof entry?.amount === "string"
              ? Number.parseFloat(entry.amount)
              : Number.NaN,
        accountId:
          typeof entry?.accountId === "string"
            ? entry.accountId.trim()
            : typeof entry?.accountId === "number"
              ? String(entry.accountId)
              : "",
        transactionType: entry?.transactionType,
        remarks:
          entry?.remarks === undefined || entry?.remarks === null
            ? undefined
            : typeof entry.remarks === "string"
              ? entry.remarks
              : undefined,
      }));

      const hasInvalid = entries.some(
        (e) =>
          !Number.isFinite(e.amount) ||
          e.amount <= 0 ||
          !e.accountId ||
          (e.transactionType !== "credit" && e.transactionType !== "debit")
      );
      if (hasInvalid) {
        return res.status(400).json({
          success: false,
          message:
            "Each entry must include valid amount (>0), accountId, and transactionType (credit|debit)",
        });
      }

      const postedByRaw = (req as { user?: { id?: unknown } }).user?.id;
      const postedBy =
        typeof postedByRaw === "string" && postedByRaw.trim() ? postedByRaw.trim() : "SYSTEM";

      const data = await accountTransactionService.postStudentJournalTransfer({
        studentId,
        ...(manualRef !== undefined ? { manualRef } : {}),
        transactionDate,
        postedBy,
        entries: entries.map((e) => ({
          amount: e.amount,
          accountId: e.accountId,
          transactionType: e.transactionType as "credit" | "debit",
          ...(e.remarks !== undefined ? { remarks: e.remarks } : {}),
        })),
      });

      return res.status(201).json({
        success: true,
        message: "Student journal transfer posted successfully",
        data,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to post student journal transfer";
      const code =
        message.includes("already exists")
          ? 409
          : message.includes("required") ||
              message.includes("must be") ||
              message.includes("non-empty") ||
              message.includes("cannot be empty") ||
              message.includes("Could not generate")
            ? 400
            : message.includes("not found")
              ? 404
              : 500;

      return res.status(code).json({
        success: false,
        message,
        ...(code === 500 && error instanceof Error ? { error: error.message } : {}),
      });
    }
  },

  listStaffJournalTransfer: async (req: Request, res: Response) => {
    try {
      const staffIdRaw = typeof req.query.staffId === "string" ? req.query.staffId.trim() : undefined;
      if (typeof req.query.staffId === "string" && !staffIdRaw) {
        return res.status(400).json({ success: false, message: "staffId cannot be empty" });
      }

      const fromSource =
        req.query.dateFrom !== undefined
          ? req.query.dateFrom
          : req.query.datefrom !== undefined
            ? req.query.datefrom
            : req.query.transactionDateFrom;
      const toSource =
        req.query.dateTo !== undefined ? req.query.dateTo : req.query.transactionDateTo;

      const fromRaw = parseQueryDateStart(fromSource);
      const toRaw = parseQueryDateEndInclusive(toSource);
      if (fromRaw === "invalid") {
        return res.status(400).json({ success: false, message: "dateFrom is invalid" });
      }
      if (toRaw === "invalid") {
        return res.status(400).json({ success: false, message: "dateTo is invalid" });
      }

      const data = await accountTransactionService.listStaffJournalTransfers({
        ...(staffIdRaw !== undefined ? { staffId: staffIdRaw } : {}),
        ...(fromRaw === "missing" ? {} : { dateFrom: fromRaw }),
        ...(toRaw === "missing" ? {} : { dateTo: toRaw }),
      });

      return res.json({
        success: true,
        message: "Staff journal transfer retrieved successfully",
        data,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to retrieve staff journal transfer";
      const code = message.includes("empty") || message.includes("invalid") ? 400 : 500;
      return res.status(code).json({
        success: false,
        message,
        ...(code === 500 && error instanceof Error ? { error: error.message } : {}),
      });
    }
  },

  postStaffJournalTransfer: async (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      const staffId = typeof body.staffId === "string" ? body.staffId.trim() : "";
      const manualRef = typeof body.manualRef === "string" ? body.manualRef.trim() : "";
      const transactionDate =
        typeof body.transactionDate === "string" || body.transactionDate instanceof Date
          ? new Date(body.transactionDate)
          : new Date(NaN);

      if (!staffId) {
        return res.status(400).json({ success: false, message: "staffId is required" });
      }
      if (!manualRef) {
        return res.status(400).json({ success: false, message: "manualRef is required" });
      }
      if (Number.isNaN(transactionDate.getTime())) {
        return res.status(400).json({ success: false, message: "transactionDate must be a valid date" });
      }
      if (!Array.isArray(body.entries) || body.entries.length === 0) {
        return res.status(400).json({ success: false, message: "entries must be a non-empty array" });
      }

      const entries: Array<{
        amount: number;
        accountId: string;
        transactionType: unknown;
        remarks?: string;
      }> = body.entries.map((entry: Record<string, unknown>) => ({
        amount:
          typeof entry?.amount === "number"
            ? entry.amount
            : typeof entry?.amount === "string"
              ? Number.parseFloat(entry.amount)
              : Number.NaN,
        accountId:
          typeof entry?.accountId === "string"
            ? entry.accountId.trim()
            : typeof entry?.accountId === "number"
              ? String(entry.accountId)
              : "",
        transactionType: entry?.transactionType,
        remarks:
          entry?.remarks === undefined || entry?.remarks === null
            ? undefined
            : typeof entry.remarks === "string"
              ? entry.remarks
              : undefined,
      }));

      const hasInvalid = entries.some(
        (e) =>
          !Number.isFinite(e.amount) ||
          e.amount <= 0 ||
          !e.accountId ||
          (e.transactionType !== "credit" && e.transactionType !== "debit")
      );
      if (hasInvalid) {
        return res.status(400).json({
          success: false,
          message:
            "Each entry must include valid amount (>0), accountId, and transactionType (credit|debit)",
        });
      }

      const postedByRaw = (req as { user?: { id?: unknown } }).user?.id;
      const postedBy =
        typeof postedByRaw === "string" && postedByRaw.trim() ? postedByRaw.trim() : "SYSTEM";

      const data = await accountTransactionService.postStaffJournalTransfer({
        staffId,
        manualRef,
        transactionDate,
        postedBy,
        entries: entries.map((e) => ({
          amount: e.amount,
          accountId: e.accountId,
          transactionType: e.transactionType as "credit" | "debit",
          ...(e.remarks !== undefined ? { remarks: e.remarks } : {}),
        })),
      });

      return res.status(201).json({
        success: true,
        message: "Staff journal transfer posted successfully",
        data,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to post staff journal transfer";
      const code =
        message.includes("required") || message.includes("must be") || message.includes("non-empty")
          ? 400
          : message.includes("not found")
            ? 404
            : 500;

      return res.status(code).json({
        success: false,
        message,
        ...(code === 500 && error instanceof Error ? { error: error.message } : {}),
      });
    }
  },

  getStudentAccountTransactionLog: async (req: Request, res: Response) => {
    try {
      const studentIdRaw = typeof req.query.studentId === "string" ? req.query.studentId.trim() : "";
      if (!studentIdRaw) {
        return res.status(400).json({ success: false, message: "studentId is required" });
      }

      const fromSource =
        req.query.datefrom !== undefined ? req.query.datefrom : req.query.transactionDateFrom;
      const toSource = req.query.dateTo !== undefined ? req.query.dateTo : req.query.transactionDateTo;

      const fromRaw = parseQueryDateStart(fromSource);
      const toRaw = parseQueryDateEndInclusive(toSource);
      if (fromRaw === "invalid") {
        return res.status(400).json({ success: false, message: "datefrom is invalid" });
      }
      if (toRaw === "invalid") {
        return res.status(400).json({ success: false, message: "dateTo is invalid" });
      }

      const data = await accountTransactionService.getStudentAccountTransactionLog({
        studentId: studentIdRaw,
        ...(fromRaw === "missing" ? {} : { transactionDateFrom: fromRaw }),
        ...(toRaw === "missing" ? {} : { transactionDateTo: toRaw }),
      });

      return res.json({
        success: true,
        message: "Student account transaction log retrieved successfully",
        data,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to retrieve student account transaction log";
      const code =
        message === "Student not found for studentId"
          ? 404
          : message === "studentId is required" ||
              message === "transactionDateFrom must be before or equal to transactionDateTo"
            ? 400
            : 500;

      return res.status(code).json({
        success: false,
        message,
        ...(code === 500 && error instanceof Error ? { error: error.message } : {}),
      });
    }
  },

  getStaffAccountTransactionLog: async (req: Request, res: Response) => {
    try {
      const staffIdRaw = typeof req.query.staffId === "string" ? req.query.staffId.trim() : "";
      if (!staffIdRaw) {
        return res.status(400).json({ success: false, message: "staffId is required" });
      }

      const fromSource =
        req.query.datefrom !== undefined ? req.query.datefrom : req.query.transactionDateFrom;
      const toSource = req.query.dateTo !== undefined ? req.query.dateTo : req.query.transactionDateTo;

      const fromRaw = parseQueryDateStart(fromSource);
      const toRaw = parseQueryDateEndInclusive(toSource);
      if (fromRaw === "invalid") {
        return res.status(400).json({ success: false, message: "datefrom is invalid" });
      }
      if (toRaw === "invalid") {
        return res.status(400).json({ success: false, message: "dateTo is invalid" });
      }

      const data = await accountTransactionService.getStaffAccountTransactionLog({
        staffId: staffIdRaw,
        ...(fromRaw === "missing" ? {} : { transactionDateFrom: fromRaw }),
        ...(toRaw === "missing" ? {} : { transactionDateTo: toRaw }),
      });

      return res.json({
        success: true,
        message: "Staff account transaction log retrieved successfully",
        data,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to retrieve staff account transaction log";
      const code =
        message === "Staff not found for staffId"
          ? 404
          : message === "staffId is required" ||
              message === "transactionDateFrom must be before or equal to transactionDateTo"
            ? 400
            : 500;

      return res.status(code).json({
        success: false,
        message,
        ...(code === 500 && error instanceof Error ? { error: error.message } : {}),
      });
    }
  },

  getStudentBalances: async (req: Request, res: Response) => {
    try {
      const asAtDateRaw = parseQueryDateEndInclusive(req.query.asAtDate);
      if (asAtDateRaw === "invalid") {
        return res.status(400).json({ success: false, message: "asAtDate is invalid" });
      }

      const classIdRaw = typeof req.query.classId === "string" ? req.query.classId.trim() : undefined;
      if (typeof req.query.classId === "string" && !classIdRaw) {
        return res.status(400).json({ success: false, message: "classId cannot be empty" });
      }

      const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
      const status =
        statusRaw !== undefined && Object.values(StudentStatus).includes(statusRaw as StudentStatus)
          ? (statusRaw as StudentStatus)
          : undefined;
      if (statusRaw !== undefined && status === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be one of Active, Inactive, Graduated, Transferred, Suspended, Archived",
        });
      }

      const orderByRaw = typeof req.query.orderBy === "string" ? req.query.orderBy : undefined;
      const orderBy = orderByRaw === "classId" || orderByRaw === "balance" ? orderByRaw : undefined;
      if (orderByRaw !== undefined && orderBy === undefined) {
        return res.status(400).json({ success: false, message: "orderBy must be classId or balance" });
      }

      const orderDirectionRaw =
        typeof req.query.orderDirection === "string" ? req.query.orderDirection : undefined;
      const orderDirection =
        orderDirectionRaw === undefined
          ? undefined
          : orderDirectionRaw === "asc" || orderDirectionRaw === "desc"
            ? orderDirectionRaw
            : undefined;
      if (orderDirectionRaw !== undefined && orderDirection === undefined) {
        return res.status(400).json({ success: false, message: "orderDirection must be asc or desc" });
      }

      const page = parseIntOrUndefined(req.query.page);
      const limit = parseIntOrUndefined(req.query.limit);
      if (page !== undefined && page < 1) {
        return res.status(400).json({ success: false, message: "page must be >= 1" });
      }
      if (limit !== undefined && (limit < 1 || limit > 100)) {
        return res.status(400).json({ success: false, message: "limit must be between 1 and 100" });
      }

      const data = await accountTransactionService.listStudentBalances({
        ...(asAtDateRaw === "missing" ? {} : { asAtDate: asAtDateRaw }),
        ...(status !== undefined ? { status } : {}),
        ...(classIdRaw !== undefined ? { classId: classIdRaw } : {}),
        ...(orderBy !== undefined ? { orderBy } : {}),
        ...(orderDirection !== undefined ? { orderDirection } : {}),
        ...(page !== undefined ? { page } : {}),
        ...(limit !== undefined ? { limit } : {}),
      });

      return res.json({
        success: true,
        message: "Student balances retrieved successfully",
        data,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to retrieve student balances";
      return res.status(500).json({
        success: false,
        message,
        ...(error instanceof Error ? { error: error.message } : {}),
      });
    }
  },

  getStudentAccountBalanceAsAtDate: async (req: Request, res: Response) => {
    try {
      const studentIdRaw = typeof req.query.studentId === "string" ? req.query.studentId.trim() : "";
      if (!studentIdRaw) {
        return res.status(400).json({ success: false, message: "studentId is required" });
      }

      const asAtDateRaw = parseQueryDateEndInclusive(req.query.asAtDate);
      if (asAtDateRaw === "invalid") {
        return res.status(400).json({ success: false, message: "asAtDate is invalid" });
      }

      const data = await accountTransactionService.getStudentAccountBalanceAsAtDate({
        studentId: studentIdRaw,
        ...(asAtDateRaw === "missing" ? {} : { asAtDate: asAtDateRaw }),
      });

      return res.json({
        success: true,
        message: "Student account balance as at date retrieved successfully",
        data,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to retrieve student account balance as at date";
      const code = message === "studentId is required" ? 400 : 500;

      return res.status(code).json({
        success: false,
        message,
        ...(code === 500 && error instanceof Error ? { error: error.message } : {}),
      });
    }
  },

  getStaffBalances: async (req: Request, res: Response) => {
    try {
      const asAtDateRaw = parseQueryDateEndInclusive(req.query.asAtDate);
      if (asAtDateRaw === "invalid") {
        return res.status(400).json({ success: false, message: "asAtDate is invalid" });
      }

      const departmentIdRaw =
        typeof req.query.departmentId === "string" ? req.query.departmentId.trim() : undefined;
      if (typeof req.query.departmentId === "string" && !departmentIdRaw) {
        return res.status(400).json({ success: false, message: "departmentId cannot be empty" });
      }

      const gradeLevelIdRaw =
        typeof req.query.gradeLevelId === "string" ? req.query.gradeLevelId.trim() : undefined;
      if (typeof req.query.gradeLevelId === "string" && !gradeLevelIdRaw) {
        return res.status(400).json({ success: false, message: "gradeLevelId cannot be empty" });
      }

      const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
      const status =
        statusRaw === Status.Active || statusRaw === Status.Inactive || statusRaw === Status.Archived
          ? statusRaw
          : undefined;
      if (statusRaw !== undefined && status === undefined) {
        return res.status(400).json({
          success: false,
          message: "status must be one of Active, Inactive, or Archived",
        });
      }

      const orderByRaw = typeof req.query.orderBy === "string" ? req.query.orderBy : undefined;
      const orderBy =
        orderByRaw === "name" || orderByRaw === "StaffNumber" || orderByRaw === "balance"
          ? orderByRaw
          : undefined;
      if (orderByRaw !== undefined && orderBy === undefined) {
        return res.status(400).json({
          success: false,
          message: "orderBy must be name, StaffNumber, or balance",
        });
      }

      const orderDirectionRaw =
        typeof req.query.orderDirection === "string" ? req.query.orderDirection : undefined;
      const orderDirection =
        orderDirectionRaw === undefined
          ? undefined
          : orderDirectionRaw === "asc" || orderDirectionRaw === "desc"
            ? orderDirectionRaw
            : undefined;
      if (orderDirectionRaw !== undefined && orderDirection === undefined) {
        return res.status(400).json({ success: false, message: "orderDirection must be asc or desc" });
      }

      const page = parseIntOrUndefined(req.query.page);
      const limit = parseIntOrUndefined(req.query.limit);
      if (page !== undefined && page < 1) {
        return res.status(400).json({ success: false, message: "page must be >= 1" });
      }
      if (limit !== undefined && (limit < 1 || limit > 100)) {
        return res.status(400).json({ success: false, message: "limit must be between 1 and 100" });
      }

      const data = await accountTransactionService.listStaffBalances({
        ...(asAtDateRaw === "missing" ? {} : { asAtDate: asAtDateRaw }),
        ...(status !== undefined ? { status } : {}),
        ...(departmentIdRaw !== undefined ? { departmentId: departmentIdRaw } : {}),
        ...(gradeLevelIdRaw !== undefined ? { gradeLevelId: gradeLevelIdRaw } : {}),
        ...(orderBy !== undefined ? { orderBy } : {}),
        ...(orderDirection !== undefined ? { orderDirection } : {}),
        ...(page !== undefined ? { page } : {}),
        ...(limit !== undefined ? { limit } : {}),
      });

      return res.json({
        success: true,
        message: "Staff balances retrieved successfully",
        data,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to retrieve staff balances";
      return res.status(500).json({
        success: false,
        message,
        ...(error instanceof Error ? { error: error.message } : {}),
      });
    }
  },

  getStaffAccountBalanceAsAtDate: async (req: Request, res: Response) => {
    try {
      const staffIdRaw = typeof req.query.staffId === "string" ? req.query.staffId.trim() : "";
      if (!staffIdRaw) {
        return res.status(400).json({ success: false, message: "staffId is required" });
      }

      const asAtDateRaw = parseQueryDateEndInclusive(req.query.asAtDate);
      if (asAtDateRaw === "invalid") {
        return res.status(400).json({ success: false, message: "asAtDate is invalid" });
      }

      const data = await accountTransactionService.getStaffAccountBalanceAsAtDate({
        staffId: staffIdRaw,
        ...(asAtDateRaw === "missing" ? {} : { asAtDate: asAtDateRaw }),
      });

      return res.json({
        success: true,
        message: "Staff account balance as at date retrieved successfully",
        data,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to retrieve staff account balance as at date";
      const code = message === "staffId is required" ? 400 : 500;

      return res.status(code).json({
        success: false,
        message,
        ...(code === 500 && error instanceof Error ? { error: error.message } : {}),
      });
    }
  },

  getAccountBalanceAsAtDate: async (req: Request, res: Response) => {
    try {
      const accountIdRaw = typeof req.query.accountId === "string" ? req.query.accountId.trim() : "";
      if (!accountIdRaw) {
        return res.status(400).json({ success: false, message: "accountId is required" });
      }

      const asAtDateRaw = parseQueryDateEndInclusive(req.query.asAtDate);
      if (asAtDateRaw === "invalid") {
        return res.status(400).json({ success: false, message: "asAtDate is invalid" });
      }

      const data = await accountTransactionService.getAccountBalanceAsAtDate({
        accountId: accountIdRaw,
        ...(asAtDateRaw === "missing" ? {} : { asAtDate: asAtDateRaw }),
      });

      return res.json({
        success: true,
        message: "Account balance as at date retrieved successfully",
        data,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to retrieve account balance as at date";
      const code =
        message === "Account not found for accountId"
          ? 404
          : message === "accountId is required" || message === "accountId must be a positive integer"
            ? 400
            : 500;

      return res.status(code).json({
        success: false,
        message,
        ...(code === 500 && error instanceof Error ? { error: error.message } : {}),
      });
    }
  },

  getAccountTransactionByAccountReport: async (req: Request, res: Response) => {
    try {
      const fromRaw = parseQueryDateStart(req.query.transactionDateFrom);
      const toRaw = parseQueryDateEndInclusive(req.query.transactionDateTo);

      if (fromRaw === "invalid") {
        return res.status(400).json({ success: false, message: "transactionDateFrom is invalid" });
      }
      if (toRaw === "invalid") {
        return res.status(400).json({ success: false, message: "transactionDateTo is invalid" });
      }

      const transactionDateFrom = fromRaw === "missing" ? undefined : fromRaw;
      const transactionDateTo = toRaw === "missing" ? undefined : toRaw;

      const data = await accountTransactionService.getAccountTransactionByAccountReport({
        ...(transactionDateFrom !== undefined ? { transactionDateFrom } : {}),
        ...(transactionDateTo !== undefined ? { transactionDateTo } : {}),
      });

      return res.json({
        success: true,
        message: "Account report by account retrieved successfully",
        data,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to retrieve account report by account";
      const code =
        message === "transactionDateFrom must be before or equal to transactionDateTo" ? 400 : 500;

      return res.status(code).json({
        success: false,
        message,
        ...(code === 500 && error instanceof Error ? { error: error.message } : {}),
      });
    }
  },

  getProfitAndLossReport: async (req: Request, res: Response) => {
    try {
      const fromRaw = parseQueryDateStart(req.query.transactionDateFrom);
      const toRaw = parseQueryDateEndInclusive(req.query.transactionDateTo);

      if (fromRaw === "invalid") {
        return res.status(400).json({ success: false, message: "transactionDateFrom is invalid" });
      }
      if (toRaw === "invalid") {
        return res.status(400).json({ success: false, message: "transactionDateTo is invalid" });
      }

      const transactionDateFrom = fromRaw === "missing" ? undefined : fromRaw;
      const transactionDateTo = toRaw === "missing" ? undefined : toRaw;

      const data = await accountTransactionService.getProfitAndLossReport({
        ...(transactionDateFrom !== undefined ? { transactionDateFrom } : {}),
        ...(transactionDateTo !== undefined ? { transactionDateTo } : {}),
      });

      return res.json({
        success: true,
        message: "Profit and loss report retrieved successfully",
        data,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to retrieve profit and loss report";
      const code =
        message === "transactionDateFrom must be before or equal to transactionDateTo" ||
        message.includes("Profit and loss chart")
          ? 400
          : 500;

      return res.status(code).json({
        success: false,
        message,
        ...(code === 500 && error instanceof Error ? { error: error.message } : {}),
      });
    }
  },

  getProfitAndLossSummary: async (req: Request, res: Response) => {
    try {
      const fromRaw = parseQueryDateStart(req.query.transactionDateFrom);
      const toRaw = parseQueryDateEndInclusive(req.query.transactionDateTo);

      if (fromRaw === "invalid") {
        return res.status(400).json({ success: false, message: "transactionDateFrom is invalid" });
      }
      if (toRaw === "invalid") {
        return res.status(400).json({ success: false, message: "transactionDateTo is invalid" });
      }

      const transactionDateFrom = fromRaw === "missing" ? undefined : fromRaw;
      const transactionDateTo = toRaw === "missing" ? undefined : toRaw;

      const data = await accountTransactionService.getProfitAndLossSummary({
        ...(transactionDateFrom !== undefined ? { transactionDateFrom } : {}),
        ...(transactionDateTo !== undefined ? { transactionDateTo } : {}),
      });

      return res.json({
        success: true,
        message: "Profit and loss summary retrieved successfully",
        data,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to retrieve profit and loss summary";
      const code =
        message === "transactionDateFrom must be before or equal to transactionDateTo" ||
        message.includes("Profit and loss chart")
          ? 400
          : 500;

      return res.status(code).json({
        success: false,
        message,
        ...(code === 500 && error instanceof Error ? { error: error.message } : {}),
      });
    }
  },

  getBalanceSheetReport: async (req: Request, res: Response) => {
    try {
      const asAtDateRaw = parseQueryDateEndInclusive(req.query.asAtDate);
      if (asAtDateRaw === "invalid") {
        return res.status(400).json({ success: false, message: "asAtDate is invalid" });
      }

      const data = await accountTransactionService.getBalanceSheetReport({
        ...(asAtDateRaw === "missing" ? {} : { asAtDate: asAtDateRaw }),
      });

      return res.json({
        success: true,
        message: "Balance sheet retrieved successfully",
        data,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to retrieve balance sheet";
      const code = message.includes("Balance sheet chart") ? 400 : 500;

      return res.status(code).json({
        success: false,
        message,
        ...(code === 500 && error instanceof Error ? { error: error.message } : {}),
      });
    }
  },

  getBalanceSheetSummary: async (req: Request, res: Response) => {
    try {
      const asAtDateRaw = parseQueryDateEndInclusive(req.query.asAtDate);
      if (asAtDateRaw === "invalid") {
        return res.status(400).json({ success: false, message: "asAtDate is invalid" });
      }

      const data = await accountTransactionService.getBalanceSheetSummary({
        ...(asAtDateRaw === "missing" ? {} : { asAtDate: asAtDateRaw }),
      });

      return res.json({
        success: true,
        message: "Balance sheet summary retrieved successfully",
        data,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to retrieve balance sheet summary";
      const code = message.includes("Balance sheet chart") ? 400 : 500;

      return res.status(code).json({
        success: false,
        message,
        ...(code === 500 && error instanceof Error ? { error: error.message } : {}),
      });
    }
  },

  getCashFlowReport: async (req: Request, res: Response) => {
    try {
      const fromRaw = parseQueryDateStart(req.query.transactionDateFrom);
      const toRaw = parseQueryDateEndInclusive(req.query.transactionDateTo);

      if (fromRaw === "invalid") {
        return res.status(400).json({ success: false, message: "transactionDateFrom is invalid" });
      }
      if (toRaw === "invalid") {
        return res.status(400).json({ success: false, message: "transactionDateTo is invalid" });
      }

      const transactionDateFrom = fromRaw === "missing" ? undefined : fromRaw;
      const transactionDateTo = toRaw === "missing" ? undefined : toRaw;

      const data = await accountTransactionService.getCashFlowReport({
        ...(transactionDateFrom !== undefined ? { transactionDateFrom } : {}),
        ...(transactionDateTo !== undefined ? { transactionDateTo } : {}),
      });

      return res.json({
        success: true,
        message: "Cash flow report retrieved successfully",
        data,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to retrieve cash flow report";
      const code =
        message === "transactionDateFrom must be before or equal to transactionDateTo" ||
        message.includes("Cash flow chart")
          ? 400
          : 500;

      return res.status(code).json({
        success: false,
        message,
        ...(code === 500 && error instanceof Error ? { error: error.message } : {}),
      });
    }
  },

  getCashFlowSummary: async (req: Request, res: Response) => {
    try {
      const fromRaw = parseQueryDateStart(req.query.transactionDateFrom);
      const toRaw = parseQueryDateEndInclusive(req.query.transactionDateTo);

      if (fromRaw === "invalid") {
        return res.status(400).json({ success: false, message: "transactionDateFrom is invalid" });
      }
      if (toRaw === "invalid") {
        return res.status(400).json({ success: false, message: "transactionDateTo is invalid" });
      }

      const transactionDateFrom = fromRaw === "missing" ? undefined : fromRaw;
      const transactionDateTo = toRaw === "missing" ? undefined : toRaw;

      const data = await accountTransactionService.getCashFlowSummary({
        ...(transactionDateFrom !== undefined ? { transactionDateFrom } : {}),
        ...(transactionDateTo !== undefined ? { transactionDateTo } : {}),
      });

      return res.json({
        success: true,
        message: "Cash flow summary retrieved successfully",
        data,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to retrieve cash flow summary";
      const code =
        message === "transactionDateFrom must be before or equal to transactionDateTo" ||
        message.includes("Cash flow chart")
          ? 400
          : 500;

      return res.status(code).json({
        success: false,
        message,
        ...(code === 500 && error instanceof Error ? { error: error.message } : {}),
      });
    }
  },

  getAccountTransactionByHeadSubheadReport: async (req: Request, res: Response) => {
    try {
      const fromRaw = parseQueryDateStart(req.query.transactionDateFrom);
      const toRaw = parseQueryDateEndInclusive(req.query.transactionDateTo);

      if (fromRaw === "invalid") {
        return res.status(400).json({ success: false, message: "transactionDateFrom is invalid" });
      }
      if (toRaw === "invalid") {
        return res.status(400).json({ success: false, message: "transactionDateTo is invalid" });
      }

      const transactionDateFrom = fromRaw === "missing" ? undefined : fromRaw;
      const transactionDateTo = toRaw === "missing" ? undefined : toRaw;

      const data = await accountTransactionService.getAccountTransactionByHeadSubheadReport({
        ...(transactionDateFrom !== undefined ? { transactionDateFrom } : {}),
        ...(transactionDateTo !== undefined ? { transactionDateTo } : {}),
      });

      return res.json({
        success: true,
        message: "Account report by head/subhead retrieved successfully",
        data,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to retrieve account report by head/subhead";
      const code =
        message === "transactionDateFrom must be before or equal to transactionDateTo" ? 400 : 500;

      return res.status(code).json({
        success: false,
        message,
        ...(code === 500 && error instanceof Error ? { error: error.message } : {}),
      });
    }
  },

  getAccountTransactionLog: async (req: Request, res: Response) => {
    try {
      const accountIdRaw = typeof req.query.accountId === "string" ? req.query.accountId.trim() : "";
      if (!accountIdRaw) {
        return res.status(400).json({ success: false, message: "accountId is required" });
      }

      const fromRaw = parseQueryDateStart(req.query.transactionDateFrom);
      const toRaw = parseQueryDateEndInclusive(req.query.transactionDateTo);

      if (fromRaw === "invalid") {
        return res.status(400).json({ success: false, message: "transactionDateFrom is invalid" });
      }
      if (toRaw === "invalid") {
        return res.status(400).json({ success: false, message: "transactionDateTo is invalid" });
      }

      const transactionDateFrom = fromRaw === "missing" ? undefined : fromRaw;
      const transactionDateTo = toRaw === "missing" ? undefined : toRaw;

      const data = await accountTransactionService.getAccountTransactionLog({
        accountId: accountIdRaw,
        ...(transactionDateFrom !== undefined ? { transactionDateFrom } : {}),
        ...(transactionDateTo !== undefined ? { transactionDateTo } : {}),
      });

      return res.json({
        success: true,
        message: "Account transaction log retrieved successfully",
        data,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to retrieve account transaction log";
      const code =
        message === "Account not found for accountId"
          ? 404
          : message === "accountId is required" ||
              message === "accountId must be a positive integer" ||
              message === "transactionDateFrom must be before or equal to transactionDateTo"
            ? 400
            : 500;

      return res.status(code).json({
        success: false,
        message,
        ...(code === 500 && error instanceof Error ? { error: error.message } : {}),
      });
    }
  },

  debitAccount: async (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      const postedByRaw = body.postedBy ?? body.postedB;
      const amount =
        typeof body.amount === "number"
          ? body.amount
          : typeof body.amount === "string"
            ? Number.parseFloat(body.amount)
            : Number.NaN;

      const created = await accountTransactionService.debitAccount({
        accountId: String(body.accountId ?? ""),
        amount,
        ref: String(body.ref ?? ""),
        manualRef: String(body.manualRef ?? ""),
        transactionDate: String(body.transactionDate ?? ""),
        postedBy: String(postedByRaw ?? ""),
        remarks: String(body.remarks ?? ""),
        ...(body.projectId !== undefined ? { projectId: String(body.projectId) } : {}),
        ...(body.accountSub !== undefined ? { accountSub: String(body.accountSub) } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Debit posted successfully",
        data: created,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message.includes("not found") || message.includes("Account not found")) {
        return res.status(404).json({ success: false, message });
      }
      if (
        message.includes("required") ||
        message.includes("must be") ||
        message.includes("cannot be")
      ) {
        return res.status(400).json({ success: false, message });
      }
      console.error("Error posting debit:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to post debit",
        error: message,
      });
    }
  },

  creditAccount: async (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      const postedByRaw = body.postedBy ?? body.postedB;
      const amount =
        typeof body.amount === "number"
          ? body.amount
          : typeof body.amount === "string"
            ? Number.parseFloat(body.amount)
            : Number.NaN;

      const created = await accountTransactionService.creditAccount({
        accountId: String(body.accountId ?? ""),
        amount,
        ref: String(body.ref ?? ""),
        manualRef: String(body.manualRef ?? ""),
        transactionDate: String(body.transactionDate ?? ""),
        postedBy: String(postedByRaw ?? ""),
        remarks: String(body.remarks ?? ""),
        ...(body.projectId !== undefined ? { projectId: String(body.projectId) } : {}),
        ...(body.accountSub !== undefined ? { accountSub: String(body.accountSub) } : {}),
      });

      return res.status(201).json({
        success: true,
        message: "Credit posted successfully",
        data: created,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message.includes("not found") || message.includes("Account not found")) {
        return res.status(404).json({ success: false, message });
      }
      if (
        message.includes("required") ||
        message.includes("must be") ||
        message.includes("cannot be")
      ) {
        return res.status(400).json({ success: false, message });
      }
      console.error("Error posting credit:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to post credit",
        error: message,
      });
    }
  },

  rollBack: async (req: Request, res: Response) => {
    try {
      const ref = typeof req.params.ref === "string" ? req.params.ref : "";
      if (!ref.trim()) {
        return res.status(400).json({ success: false, message: "ref is required" });
      }

      const result = await accountTransactionService.rollBack(ref);
      return res.json({
        success: true,
        message: "Rollback completed successfully",
        data: {
          ref: ref.trim(),
          deletedCount: result.count,
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message.includes("required")) {
        return res.status(400).json({ success: false, message });
      }
      console.error("Error rolling back transactions:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to rollback transactions",
        error: message,
      });
    }
  },
};
