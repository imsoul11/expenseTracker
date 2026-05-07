const { Types } = require("mongoose");

const createError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
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

module.exports = {
  createError,
  validateRegister,
  validateLogin,
  validateExpense,
  validateExpenseId,
};
