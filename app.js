const expenseRoute = require("./routes/expenseRoute");
const authMiddleware = require("./middleware/authMiddleware");
require("dotenv").config();
const cookieParser = require("cookie-parser");
const express = require("express");
const connectDB = require("./config/db");
const authRoute = require("./routes/authRoute");
const app = express();
app.get("/", (req, res) => {
    res.send("Expense Tracker API Running");
});
app.use(cookieParser());
app.use(express.json());
connectDB();
const PORT = 3000;
app.use("/api/auth", authRoute);
app.use("/api/expense", authMiddleware, expenseRoute);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});