const express = require("express");
const router = express.Router();
const asyncHandler = require("../middleware/asyncHandler");
const {
  validateExpense,
  validateExpenseId,
  validateExpenseQuery,
  validateExpenseReportQuery,
} = require("../middleware/validateRequest");
const {
  createExpense,
  getExpenses,
  getExpenseSummary,
  getExpenseCategoryBreakdown,
  getMonthlyExpenseTrend,
  getExpenseById,
  updateExpense,
  deleteExpense,
} = require("../controllers/expenseController");

router.post("/create", validateExpense, asyncHandler(createExpense));
router.get("/summary", validateExpenseReportQuery, asyncHandler(getExpenseSummary));
router.get(
  "/summary/categories",
  validateExpenseReportQuery,
  asyncHandler(getExpenseCategoryBreakdown)
);
router.get(
  "/summary/monthly",
  validateExpenseReportQuery,
  asyncHandler(getMonthlyExpenseTrend)
);
router.get("/", validateExpenseQuery, asyncHandler(getExpenses));
router.get("/:id", validateExpenseId, asyncHandler(getExpenseById));
router.put("/:id", validateExpenseId, validateExpense, asyncHandler(updateExpense));
router.delete("/:id", validateExpenseId, asyncHandler(deleteExpense));

module.exports = router;
