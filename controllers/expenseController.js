const Expense = require("../models/Expense");
const { createError } = require("../middleware/validateRequest");

const createExpense = async (req, res) => {
  const { title, amount, category, date } = req.body;

  const expense = await Expense.create({
    title: title.trim(),
    amount,
    category: category.trim(),
    date,
    user: req.user.id,
  });

  return res
    .status(201)
    .json({ message: "Expense created successfully", expense });
};

const getExpenses = async (req, res) => {
  const expenses = await Expense.find({ user: req.user.id }).sort({ date: -1 });
  return res
    .status(200)
    .json({ message: "Expenses fetched successfully", expenses });
};

const getExpenseById = async (req, res) => {
  const { id } = req.params;
  const expense = await Expense.findOne({ _id: id, user: req.user.id });

  if (!expense) {
    throw createError("Expense not found", 404);
  }

  return res
    .status(200)
    .json({ message: "Expense fetched successfully", expense });
};

const updateExpense = async (req, res) => {
  const { id } = req.params;
  const { title, amount, category, date } = req.body;
  const expense = await Expense.findOneAndUpdate(
    { _id: id, user: req.user.id },
    {
      title: title.trim(),
      amount,
      category: category.trim(),
      date,
    },
    { new: true, runValidators: true }
  );

  if (!expense) {
    throw createError("Expense not found", 404);
  }

  return res
    .status(200)
    .json({ message: "Expense updated successfully", expense });
};

const deleteExpense = async (req, res) => {
  const { id } = req.params;
  const expense = await Expense.findOneAndDelete({ _id: id, user: req.user.id });

  if (!expense) {
    throw createError("Expense not found", 404);
  }

  return res.status(200).json({ message: "Expense deleted successfully" });
};

module.exports = { createExpense, getExpenses, getExpenseById, updateExpense, deleteExpense };
