const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
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
  validateExpenseQuery,
} = require("../middleware/validateRequest");
const {
  registerUser,
  loginUser,
  logoutUser,
  logoutAllSessions,
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
  findByIdAndUpdate: User.findByIdAndUpdate,
};

const originalExpenseMethods = {
  create: Expense.create,
  find: Expense.find,
  countDocuments: Expense.countDocuments,
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
  User.findByIdAndUpdate = originalUserMethods.findByIdAndUpdate;

  Expense.create = originalExpenseMethods.create;
  Expense.find = originalExpenseMethods.find;
  Expense.countDocuments = originalExpenseMethods.countDocuments;
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
      tokenId: overrides.tokenId || new mongoose.Types.ObjectId().toString(),
    },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN }
  );

const hashRefreshToken = (refreshToken) =>
  createHash("sha256").update(refreshToken).digest("hex");

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

test("validateExpenseQuery rejects invalid pagination values", () => {
  const req = {
    query: {
      page: "0",
      limit: "10",
    },
  };
  const next = createNext();

  validateExpenseQuery(req, {}, next);

  assert.equal(next.calls.length, 1);
  assert.equal(next.calls[0].message, "page must be a positive integer");
});

test("validateExpenseQuery normalizes valid filter and sort values", () => {
  const req = {
    query: {
      category: " Food ",
      startDate: "2026-05-01T00:00:00.000Z",
      endDate: "2026-05-31T23:59:59.999Z",
      minAmount: "10",
      maxAmount: "100",
      page: "2",
      limit: "5",
      sortBy: "amount",
      sortOrder: "asc",
    },
  };
  const next = createNext();

  validateExpenseQuery(req, {}, next);

  assert.deepEqual(next.calls, [null]);
  assert.equal(req.expenseQuery.category, "Food");
  assert.equal(req.expenseQuery.page, 2);
  assert.equal(req.expenseQuery.limit, 5);
  assert.equal(req.expenseQuery.sortBy, "amount");
  assert.equal(req.expenseQuery.sortOrder, "asc");
  assert.equal(req.expenseQuery.minAmount, 10);
  assert.equal(req.expenseQuery.maxAmount, 100);
  assert.equal(req.expenseQuery.startDate.toISOString(), "2026-05-01T00:00:00.000Z");
  assert.equal(req.expenseQuery.endDate.toISOString(), "2026-05-31T23:59:59.999Z");
});

test("user schema hardens name and email fields", () => {
  const namePath = User.schema.path("name");
  const emailPath = User.schema.path("email");
  const passwordPath = User.schema.path("password");
  const refreshTokensPath = User.schema.path("refreshTokens");

  assert.equal(namePath.options.trim, true);
  assert.equal(namePath.options.minlength, 2);
  assert.equal(emailPath.options.trim, true);
  assert.equal(emailPath.options.lowercase, true);
  assert.match("test@example.com", emailPath.options.match[0]);
  assert.equal(passwordPath.options.minlength, 6);
  assert.equal(refreshTokensPath.options.select, false);
});

test("expense schema hardens fields and includes compound indexes", () => {
  const titlePath = Expense.schema.path("title");
  const amountPath = Expense.schema.path("amount");
  const categoryPath = Expense.schema.path("category");
  const userPath = Expense.schema.path("user");
  const indexes = Expense.schema.indexes();

  assert.equal(titlePath.options.trim, true);
  assert.equal(amountPath.options.min, 0);
  assert.equal(categoryPath.options.maxlength, 50);
  assert.equal(userPath.options.required, true);
  assert.equal(
    indexes.some(([fields]) => fields.user === 1 && fields.date === -1),
    true
  );
  assert.equal(
    indexes.some(
      ([fields]) =>
        fields.user === 1 && fields.category === 1 && fields.date === -1
    ),
    true
  );
});

test("registerUser creates a sanitized user response and refresh cookie", async () => {
  const userId = new mongoose.Types.ObjectId();
  let createPayload;
  let refreshTokenUpdate;

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
  User.findByIdAndUpdate = async (id, update) => {
    refreshTokenUpdate = { id, update };
  };

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
  assert.equal(await bcrypt.compare("secret123", createPayload.password), true);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.user.name, "Jane Doe");
  assert.equal(res.body.user.email, "jane@example.com");
  assert.equal("password" in res.body.user, false);
  assert.equal(res.cookies[0].name, "refreshToken");
  assert.equal(String(refreshTokenUpdate.id), String(userId));
  assert.equal(
    refreshTokenUpdate.update.$push.refreshTokens,
    hashRefreshToken(res.cookies[0].value)
  );
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

test("loginUser stores a hashed refresh token and returns a sanitized user", async () => {
  const userId = new mongoose.Types.ObjectId();
  let refreshTokenUpdate;

  User.findOne = async () => ({
    _id: userId,
    name: "Jane Doe",
    email: "jane@example.com",
    password: await bcrypt.hash("secret123", 10),
    createdAt: new Date("2026-05-09T00:00:00.000Z"),
    updatedAt: new Date("2026-05-09T00:00:00.000Z"),
  });
  User.findByIdAndUpdate = async (id, update) => {
    refreshTokenUpdate = { id, update };
  };

  const res = createResponse();

  await loginUser(
    {
      body: {
        email: "  jane@example.com ",
        password: "secret123",
      },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.user.email, "jane@example.com");
  assert.equal("password" in res.body.user, false);
  assert.equal(res.cookies[0].name, "refreshToken");
  assert.equal(String(refreshTokenUpdate.id), String(userId));
  assert.equal(
    refreshTokenUpdate.update.$push.refreshTokens,
    hashRefreshToken(res.cookies[0].value)
  );
});

test("refresh rotates a stored refresh token and returns a new access token", async () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const currentRefreshToken = createRefreshToken({
    id: userId,
    name: "Jane Doe",
    email: "jane@example.com",
  });
  let savedTokens;

  User.findById = () => ({
    select: async () => ({
      _id: userId,
      name: "Jane Doe",
      email: "jane@example.com",
      refreshTokens: [hashRefreshToken(currentRefreshToken)],
      save: async function () {
        savedTokens = [...this.refreshTokens];
      },
    }),
  });

  const req = {
    cookies: {
      refreshToken: currentRefreshToken,
    },
  };
  const res = createResponse();

  await refresh(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, "Token refreshed");
  assert.ok(res.body.accessToken);
  assert.equal(res.cookies[0].name, "refreshToken");
  assert.notEqual(res.cookies[0].value, currentRefreshToken);
  assert.equal(savedTokens.length, 1);
  assert.equal(savedTokens[0], hashRefreshToken(res.cookies[0].value));
  assert.notEqual(savedTokens[0], hashRefreshToken(currentRefreshToken));
});

test("refresh clears sessions when a valid refresh token is not found in storage", async () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const storedRefreshToken = createRefreshToken({
    id: userId,
    name: "Jane Doe",
    email: "jane@example.com",
  });
  const reusedRefreshToken = createRefreshToken({
    id: userId,
    name: "Jane Doe",
    email: "jane@example.com",
  });
  let savedTokens;

  User.findById = () => ({
    select: async () => ({
      _id: userId,
      name: "Jane Doe",
      email: "jane@example.com",
      refreshTokens: [hashRefreshToken(storedRefreshToken)],
      save: async function () {
        savedTokens = [...this.refreshTokens];
      },
    }),
  });

  const res = createResponse();

  await assert.rejects(
    () =>
      refresh(
        {
          cookies: {
            refreshToken: reusedRefreshToken,
          },
        },
        res
      ),
    (error) => {
      assert.equal(error.message, "Unauthorized");
      assert.equal(error.statusCode, 401);
      return true;
    }
  );

  assert.deepEqual(savedTokens, []);
  assert.equal(res.clearedCookies[0].name, "refreshToken");
});

test("logoutUser revokes the current stored refresh token", async () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const currentRefreshToken = createRefreshToken({
    id: userId,
    name: "Jane Doe",
    email: "jane@example.com",
  });
  let savedTokens;

  User.findById = () => ({
    select: async () => ({
      _id: userId,
      refreshTokens: [hashRefreshToken(currentRefreshToken)],
      save: async function () {
        savedTokens = [...this.refreshTokens];
      },
    }),
  });

  const res = createResponse();

  await logoutUser(
    {
      cookies: {
        refreshToken: currentRefreshToken,
      },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(savedTokens, []);
  assert.equal(res.clearedCookies[0].name, "refreshToken");
});

test("logoutAllSessions clears every stored refresh token for the user", async () => {
  const userId = new mongoose.Types.ObjectId().toString();
  let savedTokens;

  User.findById = () => ({
    select: async () => ({
      _id: userId,
      refreshTokens: ["token-a", "token-b"],
      save: async function () {
        savedTokens = [...this.refreshTokens];
      },
    }),
  });

  const res = createResponse();

  await logoutAllSessions(
    {
      user: {
        id: userId,
      },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(savedTokens, []);
  assert.equal(res.body.message, "Logged out from all sessions successfully");
  assert.equal(res.clearedCookies[0].name, "refreshToken");
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

test("getExpenses fetches filtered expenses with pagination metadata", async () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const expenses = [
    { _id: new mongoose.Types.ObjectId(), title: "Rent" },
    { _id: new mongoose.Types.ObjectId(), title: "Coffee" },
  ];
  let queryArg;
  let sortArg;
  let skipArg;
  let limitArg;

  Expense.find = (query) => {
    queryArg = query;

    return {
      sort: (arg) => {
        sortArg = arg;

        return {
          skip: (skipValue) => {
            skipArg = skipValue;

            return {
              limit: async (limitValue) => {
                limitArg = limitValue;
                return expenses;
              },
            };
          },
        };
      },
    };
  };
  Expense.countDocuments = async () => 12;

  const req = {
    user: { id: userId },
    expenseQuery: {
      category: "Food",
      startDate: new Date("2026-05-01T00:00:00.000Z"),
      endDate: new Date("2026-05-31T23:59:59.999Z"),
      minAmount: 20,
      maxAmount: 500,
      page: 2,
      limit: 3,
      sortBy: "amount",
      sortOrder: "asc",
    },
  };
  const res = createResponse();

  await getExpenses(req, res);

  assert.equal(queryArg.user, userId);
  assert.equal(queryArg.category.toString(), "/^Food$/i");
  assert.equal(queryArg.date.$gte.toISOString(), "2026-05-01T00:00:00.000Z");
  assert.equal(queryArg.date.$lte.toISOString(), "2026-05-31T23:59:59.999Z");
  assert.equal(queryArg.amount.$gte, 20);
  assert.equal(queryArg.amount.$lte, 500);
  assert.deepEqual(sortArg, { amount: 1 });
  assert.equal(skipArg, 3);
  assert.equal(limitArg, 3);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.expenses.length, 2);
  assert.deepEqual(res.body.pagination, {
    page: 2,
    limit: 3,
    totalItems: 12,
    totalPages: 4,
    hasNextPage: true,
    hasPreviousPage: true,
  });
  assert.deepEqual(res.body.sort, { amount: 1 });
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
