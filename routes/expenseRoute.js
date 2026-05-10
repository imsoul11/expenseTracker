const express = require("express");
const router = express.Router();
const asyncHandler = require("../middleware/asyncHandler");
const {
  validateExpense,
  validateExpenseId,
  validateExpenseQuery,
} = require("../middleware/validateRequest");
const { createExpense, getExpenses, getExpenseById, updateExpense, deleteExpense } = require("../controllers/expenseController");

router.post("/create", validateExpense, asyncHandler(createExpense));
router.get("/", validateExpenseQuery, asyncHandler(getExpenses));
router.get("/:id", validateExpenseId, asyncHandler(getExpenseById));
router.put("/:id", validateExpenseId, validateExpense, asyncHandler(updateExpense));
router.delete("/:id", validateExpenseId, asyncHandler(deleteExpense));

module.exports = router;
