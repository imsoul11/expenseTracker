const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.ACCESS_TOKEN_EXPIRES_IN = "15m";
process.env.REFRESH_TOKEN_EXPIRES_IN = "7d";

const User = require("../models/User");
const Expense = require("../models/Expense");
const authMiddleware = require("../middleware/authMiddleware");
const {
  validateRegister,
  validateExpenseId,
} = require("../middleware/validateRequest");
const {
  registerUser,
  loginUser,
  refresh,
  getCurrentUser,
} = require("../controllers/authController");
const {
  createExpense,
  getExpenses,
  updateExpense,
  deleteExpense,
} = require("../controllers/expenseController");

const originalUserMethods = {
  findOne: User.findOne,
  create: User.create,
  findById: User.findById,
};

const originalExpenseMethods = {
  create: Expense.create,
  find: Expense.find,
  findOneAndUpdate: Expense.findOneAndUpdate,
  findOneAndDelete: Expense.findOneAndDelete,
};

const originalBcryptMethods = {
  genSalt: bcrypt.genSalt,
  hash: bcrypt.hash,
  compare: bcrypt.compare,
};

const restoreMocks = () => {
  User.findOne = originalUserMethods.findOne;
  User.create = originalUserMethods.create;
  User.findById = originalUserMethods.findById;

  Expense.create = originalExpenseMethods.create;
  Expense.find = originalExpenseMethods.find;
  Expense.findOneAndUpdate = originalExpenseMethods.findOneAndUpdate;
  Expense.findOneAndDelete = originalExpenseMethods.findOneAndDelete;

  bcrypt.genSalt = originalBcryptMethods.genSalt;
  bcrypt.hash = originalBcryptMethods.hash;
  bcrypt.compare = originalBcryptMethods.compare;
};

const createResponse = () => {
  const response = {
    statusCode: 200,
    body: null,
    cookies: [],
    clearedCookies: [],
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    cookie(name, value, options) {
      this.cookies.push({ name, value, options });
      return this;
    },
    clearCookie(name, options) {
      this.clearedCookies.push({ name, options });
      return this;
    },
  };

  return response;
};

const createNext = () => {
  const next = (error) => {
    next.calls.push(error || null);
  };

  next.calls = [];

  return next;
};

const createAccessToken = (overrides = {}) =>
  jwt.sign(
    {
      id: overrides.id || new mongoose.Types.ObjectId().toString(),
      name: overrides.name || "Test User",
      email: overrides.email || "test@example.com",
    },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN }
  );

const createRefreshToken = (overrides = {}) =>
  jwt.sign(
    {
      id: overrides.id || new mongoose.Types.ObjectId().toString(),
      name: overrides.name || "Test User",
      email: overrides.email || "test@example.com",
    },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN }
  );

test.beforeEach(() => {
  restoreMocks();
});

test.after(() => {
  restoreMocks();
});

test("validateRegister rejects missing required fields", () => {
  const req = { body: { email: "user@example.com" } };
  const next = createNext();

  validateRegister(req, {}, next);

  assert.equal(next.calls.length, 1);
  assert.equal(next.calls[0].message, "Name, email, and password are required");
});

test("validateExpenseId rejects malformed Mongo ids", () => {
  const req = { params: { id: "bad-id" } };
  const next = createNext();

  validateExpenseId(req, {}, next);

  assert.equal(next.calls.length, 1);
  assert.equal(next.calls[0].message, "Invalid expense id");
});

test("registerUser creates a sanitized user response and refresh cookie", async () => {
  const userId = new mongoose.Types.ObjectId();
  let createPayload;

  User.findOne = async () => null;
  User.create = async (payload) => {
    createPayload = payload;
    return {
      _id: userId,
      ...payload,
      createdAt: new Date("2026-05-09T00:00:00.000Z"),
      updatedAt: new Date("2026-05-09T00:00:00.000Z"),
    };
  };
  bcrypt.genSalt = async () => "salt";
  bcrypt.hash = async () => "hashed-password";

  const req = {
    body: {
      name: "  Jane Doe  ",
      email: "  JANE@example.com  ",
      password: "secret123",
    },
  };
  const res = createResponse();

  await registerUser(req, res);

  assert.equal(createPayload.name, "Jane Doe");
  assert.equal(createPayload.email, "jane@example.com");
  assert.equal(createPayload.password, "hashed-password");
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.user.name, "Jane Doe");
  assert.equal(res.body.user.email, "jane@example.com");
  assert.equal("password" in res.body.user, false);
  assert.equal(res.cookies[0].name, "refreshToken");
});

test("loginUser rejects invalid credentials", async () => {
  User.findOne = async () => ({
    _id: new mongoose.Types.ObjectId(),
    name: "Jane Doe",
    email: "jane@example.com",
    password: "stored-hash",
  });
  bcrypt.compare = async () => false;

  await assert.rejects(
    () =>
      loginUser(
        {
          body: {
            email: "jane@example.com",
            password: "wrong-password",
          },
        },
        createResponse()
      ),
    (error) => {
      assert.equal(error.message, "Invalid email or password");
      assert.equal(error.statusCode, 401);
      return true;
    }
  );
});

test("refresh returns a new access token from a refresh cookie", async () => {
  const req = {
    cookies: {
      refreshToken: createRefreshToken(),
    },
  };
  const res = createResponse();

  await refresh(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, "Token refreshed");
  assert.ok(res.body.accessToken);
});

test("authMiddleware returns unauthorized when the bearer token is missing", async () => {
  const req = { headers: {} };
  const res = createResponse();
  const next = createNext();

  await authMiddleware(req, res, next);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { message: "Unauthorized" });
  assert.equal(next.calls.length, 0);
});

test("authMiddleware decodes a valid access token and calls next", async () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const req = {
    headers: {
      authorization: `Bearer ${createAccessToken({ id: userId })}`,
    },
  };
  const res = createResponse();
  const next = createNext();

  await authMiddleware(req, res, next);

  assert.equal(req.user.id, userId);
  assert.deepEqual(next.calls, [null]);
});

test("getCurrentUser returns the sanitized authenticated user", async () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const user = {
    _id: userId,
    name: "Jane Doe",
    email: "jane@example.com",
    createdAt: new Date("2026-05-09T00:00:00.000Z"),
    updatedAt: new Date("2026-05-09T00:00:00.000Z"),
  };

  User.findById = () => ({
    select: async () => user,
  });

  const req = { user: { id: userId } };
  const res = createResponse();

  await getCurrentUser(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.user.email, "jane@example.com");
  assert.equal("password" in res.body.user, false);
});

test("createExpense trims fields and assigns the authenticated user", async () => {
  const userId = new mongoose.Types.ObjectId().toString();
  let createPayload;

  Expense.create = async (payload) => {
    createPayload = payload;
    return {
      _id: new mongoose.Types.ObjectId(),
      ...payload,
    };
  };

  const req = {
    user: { id: userId },
    body: {
      title: "  Groceries  ",
      amount: 99.5,
      category: "  Food  ",
      date: "2026-05-09T00:00:00.000Z",
    },
  };
  const res = createResponse();

  await createExpense(req, res);

  assert.equal(createPayload.title, "Groceries");
  assert.equal(createPayload.category, "Food");
  assert.equal(createPayload.user, userId);
  assert.equal(res.statusCode, 201);
});

test("getExpenses fetches expenses for the authenticated user in reverse date order", async () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const expenses = [
    { _id: new mongoose.Types.ObjectId(), title: "Rent" },
    { _id: new mongoose.Types.ObjectId(), title: "Coffee" },
  ];
  let queryArg;
  let sortArg;

  Expense.find = (query) => {
    queryArg = query;

    return {
      sort: async (arg) => {
        sortArg = arg;
        return expenses;
      },
    };
  };

  const req = { user: { id: userId } };
  const res = createResponse();

  await getExpenses(req, res);

  assert.deepEqual(queryArg, { user: userId });
  assert.deepEqual(sortArg, { date: -1 });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.expenses.length, 2);
});

test("updateExpense throws a 404 error when the expense does not exist", async () => {
  Expense.findOneAndUpdate = async () => null;

  await assert.rejects(
    () =>
      updateExpense(
        {
          params: { id: new mongoose.Types.ObjectId().toString() },
          user: { id: new mongoose.Types.ObjectId().toString() },
          body: {
            title: "Transport",
            amount: 15,
            category: "Travel",
            date: "2026-05-09T00:00:00.000Z",
          },
        },
        createResponse()
      ),
    (error) => {
      assert.equal(error.message, "Expense not found");
      assert.equal(error.statusCode, 404);
      return true;
    }
  );
});

test("deleteExpense returns success when an expense is removed", async () => {
  Expense.findOneAndDelete = async () => ({
    _id: new mongoose.Types.ObjectId(),
  });

  const req = {
    params: { id: new mongoose.Types.ObjectId().toString() },
    user: { id: new mongoose.Types.ObjectId().toString() },
  };
  const res = createResponse();

  await deleteExpense(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    message: "Expense deleted successfully",
  });
});
