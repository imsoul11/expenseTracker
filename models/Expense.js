const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    category: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 50,
    },

    date: {
      type: Date,
      required: true,
      default: Date.now,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

expenseSchema.index({ user: 1, date: -1 });
expenseSchema.index({ user: 1, category: 1, date: -1 });

module.exports = mongoose.model("Expense", expenseSchema);
