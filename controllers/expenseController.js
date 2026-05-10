const Expense = require("../models/Expense");
const {
  createError,
  normalizeExpenseQuery,
} = require("../middleware/validateRequest");

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildExpenseFilters = (userId, expenseQuery) => {
  const { category, startDate, endDate, minAmount, maxAmount } = expenseQuery;
  const filters = { user: userId };

  if (category) {
    filters.category = new RegExp(`^${escapeRegex(category)}$`, "i");
  }

  if (startDate || endDate) {
    filters.date = {};

    if (startDate) {
      filters.date.$gte = startDate;
    }

    if (endDate) {
      filters.date.$lte = endDate;
    }
  }

  if (minAmount !== undefined || maxAmount !== undefined) {
    filters.amount = {};

    if (minAmount !== undefined) {
      filters.amount.$gte = minAmount;
    }

    if (maxAmount !== undefined) {
      filters.amount.$lte = maxAmount;
    }
  }

  return filters;
};

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
  const expenseQuery = req.expenseQuery || normalizeExpenseQuery(req.query);
  const filters = buildExpenseFilters(req.user.id, expenseQuery);
  const skip = (expenseQuery.page - 1) * expenseQuery.limit;
  const sort = {
    [expenseQuery.sortBy]: expenseQuery.sortOrder === "asc" ? 1 : -1,
  };

  const [expenses, totalItems] = await Promise.all([
    Expense.find(filters).sort(sort).skip(skip).limit(expenseQuery.limit),
    Expense.countDocuments(filters),
  ]);

  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / expenseQuery.limit);

  return res.status(200).json({
    message: "Expenses fetched successfully",
    expenses,
    pagination: {
      page: expenseQuery.page,
      limit: expenseQuery.limit,
      totalItems,
      totalPages,
      hasNextPage: expenseQuery.page < totalPages,
      hasPreviousPage: expenseQuery.page > 1,
    },
    sort,
  });
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
