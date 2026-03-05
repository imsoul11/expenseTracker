const Expense = require("../models/Expense");
const createExpense = async (req,res) => {
    try{
        const {title, amount, category, date} = req.body;
        if(!title || !amount || !category || !date){
            return res.status(400).json({message: "All fields are required"});
        }
        const expense = await Expense.create({ title, amount, category, date, user: req.user.id });
        res.status(201).json({message: "Expense created successfully", expense});
    }catch(error){
        console.log(error);
        res.status(500).json({message: "Internal server error"});
    }
}

module.exports = { createExpense };