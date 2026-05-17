const Expense = require("../models/Expense");
const {
  createError,
  normalizeExpenseReportQuery,
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

const roundToTwo = (value) => Number(value.toFixed(2));

const normalizeSummaryMetrics = (summary = {}) => ({
  totalSpent: roundToTwo(summary.totalSpent || 0),
  totalExpenses: summary.totalExpenses || 0,
  averageExpense:
    summary.averageExpense === undefined ? 0 : roundToTwo(summary.averageExpense),
  highestExpense:
    summary.highestExpense === undefined ? 0 : roundToTwo(summary.highestExpense),
  lowestExpense:
    summary.lowestExpense === undefined ? 0 : roundToTwo(summary.lowestExpense),
});

const getUtcMonthStart = (date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

const getUtcMonthEnd = (date) =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999)
  );

const addUtcMonths = (date, months) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));

const formatMonthKey = (year, month) =>
  `${year}-${String(month).padStart(2, "0")}`;

const buildReportFilters = (req) =>
  buildExpenseFilters(
    req.user.id,
    req.expenseReportQuery || normalizeExpenseReportQuery(req.query)
  );

const buildMonthlyTrendWindow = (expenseReportQuery) => {
  if (expenseReportQuery.startDate || expenseReportQuery.endDate) {
    const endDate = expenseReportQuery.endDate || new Date();
    const startDate = expenseReportQuery.startDate || getUtcMonthStart(endDate);

    return {
      startDate: getUtcMonthStart(startDate),
      endDate: getUtcMonthEnd(endDate),
    };
  }

  const endDate = getUtcMonthEnd(new Date());
  const currentMonthStart = getUtcMonthStart(endDate);
  const startDate = addUtcMonths(
    currentMonthStart,
    -(expenseReportQuery.months - 1)
  );

  return {
    startDate,
    endDate,
  };
};

const buildMonthlyTrend = (monthlyRows, startDate, endDate) => {
  const monthlyMap = new Map(
    monthlyRows.map((row) => [formatMonthKey(row._id.year, row._id.month), row])
  );
  const trend = [];

  for (
    let cursor = getUtcMonthStart(startDate);
    cursor <= getUtcMonthStart(endDate);
    cursor = addUtcMonths(cursor, 1)
  ) {
    const monthKey = formatMonthKey(
      cursor.getUTCFullYear(),
      cursor.getUTCMonth() + 1
    );
    const row = monthlyMap.get(monthKey);
    const totalSpent = row ? roundToTwo(row.totalSpent) : 0;
    const expenseCount = row ? row.expenseCount : 0;

    trend.push({
      month: monthKey,
      totalSpent,
      expenseCount,
      averageExpense:
        expenseCount === 0 ? 0 : roundToTwo(totalSpent / expenseCount),
    });
  }

  return trend;
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

const getExpenseSummary = async (req, res) => {
  const filters = buildReportFilters(req);
  const [summaryRow] = await Expense.aggregate([
    { $match: filters },
    {
      $group: {
        _id: null,
        totalSpent: { $sum: "$amount" },
        totalExpenses: { $sum: 1 },
        averageExpense: { $avg: "$amount" },
        highestExpense: { $max: "$amount" },
        lowestExpense: { $min: "$amount" },
      },
    },
  ]);

  return res.status(200).json({
    message: "Expense summary fetched successfully",
    summary: normalizeSummaryMetrics(summaryRow),
  });
};

const getExpenseCategoryBreakdown = async (req, res) => {
  const filters = buildReportFilters(req);
  const breakdownRows = await Expense.aggregate([
    { $match: filters },
    {
      $group: {
        _id: "$category",
        totalSpent: { $sum: "$amount" },
        expenseCount: { $sum: 1 },
        averageExpense: { $avg: "$amount" },
      },
    },
    { $sort: { totalSpent: -1, _id: 1 } },
  ]);

  const totalSpent = breakdownRows.reduce(
    (sum, row) => sum + (row.totalSpent || 0),
    0
  );
  const normalizedBreakdown = breakdownRows.map((row) => ({
    category: row._id,
    totalSpent: roundToTwo(row.totalSpent || 0),
    expenseCount: row.expenseCount || 0,
    averageExpense:
      row.averageExpense === undefined ? 0 : roundToTwo(row.averageExpense),
    percentageOfTotal:
      totalSpent === 0 ? 0 : roundToTwo(((row.totalSpent || 0) / totalSpent) * 100),
  }));

  return res.status(200).json({
    message: "Expense category breakdown fetched successfully",
    totalSpent: roundToTwo(totalSpent),
    breakdown: normalizedBreakdown,
  });
};

const getMonthlyExpenseTrend = async (req, res) => {
  const expenseReportQuery =
    req.expenseReportQuery || normalizeExpenseReportQuery(req.query);
  const filters = buildExpenseFilters(req.user.id, expenseReportQuery);
  const { startDate, endDate } = buildMonthlyTrendWindow(expenseReportQuery);

  filters.date = {
    ...(filters.date || {}),
    $gte: startDate,
    $lte: endDate,
  };

  const monthlyRows = await Expense.aggregate([
    { $match: filters },
    {
      $group: {
        _id: {
          year: { $year: "$date" },
          month: { $month: "$date" },
        },
        totalSpent: { $sum: "$amount" },
        expenseCount: { $sum: 1 },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } },
  ]);

  const trend = buildMonthlyTrend(monthlyRows, startDate, endDate);
  const totalSpent = trend.reduce((sum, item) => sum + item.totalSpent, 0);
  const averageMonthlySpend =
    trend.length === 0 ? 0 : roundToTwo(totalSpent / trend.length);
  const highestMonth =
    trend.length === 0
      ? null
      : trend.reduce((highest, item) =>
          item.totalSpent > highest.totalSpent ? item : highest
        );
  const lowestMonth =
    trend.length === 0
      ? null
      : trend.reduce((lowest, item) =>
          item.totalSpent < lowest.totalSpent ? item : lowest
        );

  return res.status(200).json({
    message: "Monthly expense trend fetched successfully",
    trend,
    summary: {
      totalSpent: roundToTwo(totalSpent),
      averageMonthlySpend,
      highestMonth,
      lowestMonth,
    },
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

module.exports = {
  createExpense,
  getExpenses,
  getExpenseSummary,
  getExpenseCategoryBreakdown,
  getMonthlyExpenseTrend,
  getExpenseById,
  updateExpense,
  deleteExpense,
};
