const User = require("../models/User");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const registerUser = async (req,res) =>{
    try{
        const {name, email, password} = req.body;
        if(!name || !email || !password){
            return res.status(400).json({message: "All fields are required"});
        }
        const userExists = await User.findOne({email});
        if(userExists){
            return res.status(400).json({message: "User already exists"});
        }
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const user = await User.create({name, email, password: hashedPassword});
        const accessToken = jwt.sign({name: user.name, email: user.email}, process.env.JWT_ACCESS_SECRET, {expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN});
        const refreshToken = jwt.sign({name: user.name, email: user.email}, process.env.JWT_REFRESH_SECRET, {expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN});
        res.cookie("refreshToken", refreshToken, {httpOnly: true, secure: true, sameSite: "strict"});
        res.status(201).json({message: "User created successfully", user, accessToken});
    }catch(error){
        console.log(error);
        res.status(500).json({message: "Internal server error"});
    }
}

const loginUser = async (req,res) =>{
    try{
        const {email, password} = req.body;
        if(!email || !password){
            return res.status(400).json({message: "All fields are required"});
        }
        const user = await User.findOne({email});
        if(!user){
            return res.status(400).json({message: "User not found"});
        }
        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if(!isPasswordCorrect){
            return res.status(400).json({message: "Invalid password"});
        }
        const accessToken = jwt.sign({name: user.name, email: user.email}, process.env.JWT_ACCESS_SECRET, {expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN});
        const refreshToken = jwt.sign({name: user.name, email: user.email}, process.env.JWT_REFRESH_SECRET, {expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN});
        res.cookie("refreshToken", refreshToken, {httpOnly: true, secure: true, sameSite: "strict"});        
        res.status(200).json({message: "Login successful", accessToken});
    }catch(error){
        console.log(error);
        res.status(500).json({message: "Internal server error"});
    }
}

const logoutUser = async (req,res) =>{
    try{
        res.clearCookie("refreshToken");
        res.status(200).json({message: "Logout successful"});
    }catch(error){
        console.log(error);
        res.status(500).json({message: "Internal server error"});
    }
}


module.exports = { registerUser };