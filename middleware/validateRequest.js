const { Types } = require("mongoose");

const DEFAULT_EXPENSE_PAGE = 1;
const DEFAULT_EXPENSE_LIMIT = 10;
const MAX_EXPENSE_LIMIT = 100;
const DEFAULT_REPORT_MONTHS = 6;
const MAX_REPORT_MONTHS = 24;
const ALLOWED_EXPENSE_SORT_FIELDS = ["date", "amount", "title", "category", "createdAt"];
const ALLOWED_EXPENSE_SORT_ORDERS = ["asc", "desc"];

const createError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const readSingleQueryValue = (value, fieldName) => {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    throw createError(`${fieldName} must be provided only once`);
  }

  return value;
};

const parsePositiveInteger = (value, fieldName, defaultValue, maxValue = Infinity) => {
  const rawValue = readSingleQueryValue(value, fieldName);

  if (rawValue === undefined || rawValue === "") {
    return defaultValue;
  }

  const parsedValue = Number.parseInt(rawValue, 10);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw createError(`${fieldName} must be a positive integer`);
  }

  if (parsedValue > maxValue) {
    throw createError(`${fieldName} must be less than or equal to ${maxValue}`);
  }

  return parsedValue;
};

const parseOptionalPositiveInteger = (value, fieldName, maxValue = Infinity) => {
  const rawValue = readSingleQueryValue(value, fieldName);

  if (rawValue === undefined || rawValue === "") {
    return undefined;
  }

  return parsePositiveInteger(rawValue, fieldName, undefined, maxValue);
};

const parseOptionalNumber = (value, fieldName) => {
  const rawValue = readSingleQueryValue(value, fieldName);

  if (rawValue === undefined || rawValue === "") {
    return undefined;
  }

  const parsedValue = Number(rawValue);

  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    throw createError(`${fieldName} must be a non-negative number`);
  }

  return parsedValue;
};

const parseOptionalDate = (value, fieldName) => {
  const rawValue = readSingleQueryValue(value, fieldName);

  if (rawValue === undefined || rawValue === "") {
    return undefined;
  }

  const parsedDate = new Date(rawValue);

  if (Number.isNaN(parsedDate.getTime())) {
    throw createError(`${fieldName} must be a valid date value`);
  }

  return parsedDate;
};

const normalizeExpenseFilters = (query = {}) => {
  const categoryValue = readSingleQueryValue(query.category, "Category");

  const category =
    categoryValue === undefined ? undefined : String(categoryValue).trim();

  if (category !== undefined && !category) {
    throw createError("Category must be a non-empty string");
  }

  const startDate = parseOptionalDate(query.startDate, "startDate");
  const endDate = parseOptionalDate(query.endDate, "endDate");
  if (startDate && endDate && startDate > endDate) {
    throw createError("startDate cannot be later than endDate");
  }

  const minAmount = parseOptionalNumber(query.minAmount, "minAmount");
  const maxAmount = parseOptionalNumber(query.maxAmount, "maxAmount");
  if (
    minAmount !== undefined &&
    maxAmount !== undefined &&
    minAmount > maxAmount
  ) {
    throw createError("minAmount cannot be greater than maxAmount");
  }

  return {
    category,
    startDate,
    endDate,
    minAmount,
    maxAmount,
  };
};

const normalizeExpenseQuery = (query = {}) => {
  const sortByValue = readSingleQueryValue(query.sortBy, "sortBy");
  const sortOrderValue = readSingleQueryValue(query.sortOrder, "sortOrder");
  const filters = normalizeExpenseFilters(query);

  const sortBy = sortByValue === undefined || sortByValue === "" ? "date" : sortByValue;
  if (!ALLOWED_EXPENSE_SORT_FIELDS.includes(sortBy)) {
    throw createError(
      `sortBy must be one of: ${ALLOWED_EXPENSE_SORT_FIELDS.join(", ")}`
    );
  }

  const sortOrder =
    sortOrderValue === undefined || sortOrderValue === "" ? "desc" : sortOrderValue;
  if (!ALLOWED_EXPENSE_SORT_ORDERS.includes(sortOrder)) {
    throw createError(
      `sortOrder must be one of: ${ALLOWED_EXPENSE_SORT_ORDERS.join(", ")}`
    );
  }

  const page = parsePositiveInteger(
    query.page,
    "page",
    DEFAULT_EXPENSE_PAGE
  );
  const limit = parsePositiveInteger(
    query.limit,
    "limit",
    DEFAULT_EXPENSE_LIMIT,
    MAX_EXPENSE_LIMIT
  );

  return {
    ...filters,
    page,
    limit,
    sortBy,
    sortOrder,
  };
};

const normalizeExpenseReportQuery = (query = {}) => {
  const filters = normalizeExpenseFilters(query);
  const months =
    parseOptionalPositiveInteger(query.months, "months", MAX_REPORT_MONTHS) ||
    DEFAULT_REPORT_MONTHS;

  return {
    ...filters,
    months,
  };
};

const validateRegister = (req, res, next) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return next(createError("Name, email, and password are required"));
  }

  if (typeof name !== "string" || !name.trim()) {
    return next(createError("Name must be a non-empty string"));
  }

  if (typeof email !== "string" || !email.includes("@")) {
    return next(createError("A valid email is required"));
  }

  if (typeof password !== "string" || password.length < 6) {
    return next(createError("Password must be at least 6 characters long"));
  }

  return next();
};

const validateLogin = (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(createError("Email and password are required"));
  }

  if (typeof email !== "string" || !email.includes("@")) {
    return next(createError("A valid email is required"));
  }

  if (typeof password !== "string" || !password.trim()) {
    return next(createError("Password is required"));
  }

  return next();
};

const validateExpense = (req, res, next) => {
  const { title, amount, category, date } = req.body;

  if (!title || amount === undefined || !category || !date) {
    return next(createError("Title, amount, category, and date are required"));
  }

  if (typeof title !== "string" || !title.trim()) {
    return next(createError("Title must be a non-empty string"));
  }

  if (typeof category !== "string" || !category.trim()) {
    return next(createError("Category must be a non-empty string"));
  }

  if (typeof amount !== "number" || Number.isNaN(amount) || amount < 0) {
    return next(createError("Amount must be a non-negative number"));
  }

  if (Number.isNaN(new Date(date).getTime())) {
    return next(createError("Date must be a valid date value"));
  }

  return next();
};

const validateExpenseId = (req, res, next) => {
  if (!Types.ObjectId.isValid(req.params.id)) {
    return next(createError("Invalid expense id"));
  }

  return next();
};

const validateExpenseQuery = (req, res, next) => {
  try {
    req.expenseQuery = normalizeExpenseQuery(req.query);
    return next();
  } catch (error) {
    return next(error);
  }
};

const validateExpenseReportQuery = (req, res, next) => {
  try {
    req.expenseReportQuery = normalizeExpenseReportQuery(req.query);
    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  ALLOWED_EXPENSE_SORT_FIELDS,
  DEFAULT_EXPENSE_LIMIT,
  DEFAULT_EXPENSE_PAGE,
  DEFAULT_REPORT_MONTHS,
  MAX_EXPENSE_LIMIT,
  MAX_REPORT_MONTHS,
  createError,
  normalizeExpenseFilters,
  normalizeExpenseQuery,
  normalizeExpenseReportQuery,
  validateRegister,
  validateLogin,
  validateExpense,
  validateExpenseId,
  validateExpenseQuery,
  validateExpenseReportQuery,
};
