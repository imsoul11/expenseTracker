const Expense = require("../models/Expense");
const createExpense = async (req,res) => {
    try{
        const {title, amount, category, date} = req?.body;
        if(!title || !amount || !category || !date){
            return res.status(400).json({message: "All fields are required"});
        }
        console.log("req.user", req.user);
        const expense = await Expense.create({ title, amount, category, date, user: req.user.id });
        res.status(201).json({message: "Expense created successfully", expense});
    }catch(error){
        console.log(error);
        res.status(500).json({message: "Internal server error"});
    }
}
const getExpenses = async (req,res) => {
    try{
        const expenses = await Expense.find({user: req.user.id});
        res.status(200).json({message: "Expenses fetched successfully", expenses});
    }catch(error){
        console.log(error);
        res.status(500).json({message: "Internal server error"});
    }
}

const getExpenseById = async (req,res) => {
    try{
        const {id} = req.params;
        const expense = await Expense.findOne({_id: id, user: req.user.id});
        if(!expense){
            return res.status(404).json({message: "Expense not found"});
        }
        res.status(200).json({message: "Expense fetched successfully", expense});
    }catch{
        console.log(error);
        res.status(500).json({message: "Internal server error"});
    }
}

const updateExpense = async (req,res) => {
    try{
        const {id} = req.params;
        const {title, amount, category, date} = req.body;
        const expense = await Expense.findOneAndUpdate({_id: id, user: req.user.id}, {title, amount, category, date}, {new: true});
        if(!expense){
            return res.status(404).json({message: "Expense not found"});
        }
        res.status(200).json({message: "Expense updated successfully", expense});
    }
    catch(error){
        console.log(error);
        res.status(500).json({message: "Internal server error"});
    }
}
const deleteExpense = async (req,res) => {
    try{
        const {id} = req.params;
        const expense = await Expense.findOneAndDelete({_id: id, user: req.user.id});
        if(!expense){
            return res.status(404).json({message: "Expense not found"});
        }
        res.status(200).json({message: "Expense deleted successfully"});
    }
    catch{
        console.log(error);
        res.status(500).json({message: "Internal server error"});
    }
}

module.exports = { createExpense, getExpenses, getExpenseById, updateExpense, deleteExpense };