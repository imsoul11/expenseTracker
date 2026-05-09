const cookieParser = require("cookie-parser");
const express = require("express");
const authMiddleware = require("./middleware/authMiddleware");
const errorHandler = require("./middleware/errorHandler");
const authRoute = require("./routes/authRoute");
const expenseRoute = require("./routes/expenseRoute");

const app = express();

app.get("/", (req, res) => {
  res.send("Expense Tracker API Running");
});

app.use(cookieParser());
app.use(express.json());
app.use("/api/auth", authRoute);
app.use("/api/expense", authMiddleware, expenseRoute);
app.use(errorHandler);

module.exports = app;
