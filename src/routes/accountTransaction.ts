import { Router } from "express";
import { accountTransactionController } from "../controllers/accountTransactionController";

const router = Router();

router.get("/student-journal-transfer", accountTransactionController.listStudentJournalTransfer);
router.post("/student-journal-transfer", accountTransactionController.postStudentJournalTransfer);
router.get("/staff-journal-transfer", accountTransactionController.listStaffJournalTransfer);
router.post("/staff-journal-transfer", accountTransactionController.postStaffJournalTransfer);
router.get("/student-transaction-log", accountTransactionController.getStudentAccountTransactionLog);
router.get("/staff-transaction-log", accountTransactionController.getStaffAccountTransactionLog);
router.get("/student-balances", accountTransactionController.getStudentBalances);
router.get("/student-balance", accountTransactionController.getStudentAccountBalanceAsAtDate);
router.get("/staff-balance", accountTransactionController.getStaffAccountBalanceAsAtDate);
router.get("/staff-balances", accountTransactionController.getStaffBalances);
router.get("/balance-as-at", accountTransactionController.getAccountBalanceAsAtDate);
router.get("/report-by-account", accountTransactionController.getAccountTransactionByAccountReport);
router.get(
  "/report-by-head-subhead",
  accountTransactionController.getAccountTransactionByHeadSubheadReport
);
router.get("/profit-and-loss", accountTransactionController.getProfitAndLossReport);
router.get("/profit-and-loss/summary", accountTransactionController.getProfitAndLossSummary);
router.get("/balance-sheet", accountTransactionController.getBalanceSheetReport);
router.get("/balance-sheet/summary", accountTransactionController.getBalanceSheetSummary);
router.get("/cash-flow", accountTransactionController.getCashFlowReport);
router.get("/cash-flow/summary", accountTransactionController.getCashFlowSummary);
router.get("/transaction-log", accountTransactionController.getAccountTransactionLog);
router.post("/debit", accountTransactionController.debitAccount);
router.post("/credit", accountTransactionController.creditAccount);
router.delete("/rollback/:ref", accountTransactionController.rollBack);

export default router;
