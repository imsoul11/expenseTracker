const User = require("../models/User");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { createError } = require("../middleware/validateRequest");

const getCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
});

const buildTokenPayload = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
});

const generateAccessToken = (user) =>
  jwt.sign(buildTokenPayload(user), process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN,
  });

const generateRefreshToken = (user) =>
  jwt.sign(buildTokenPayload(user), process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN,
  });

const sanitizeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const registerUser = async (req, res) => {
  const { name, email, password } = req.body;
  const normalizedEmail = email.trim().toLowerCase();
  const trimmedName = name.trim();

  const userExists = await User.findOne({ email: normalizedEmail });
  if (userExists) {
    throw createError("User already exists");
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);
  const user = await User.create({
    name: trimmedName,
    email: normalizedEmail,
    password: hashedPassword,
  });

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  res.cookie("refreshToken", refreshToken, getCookieOptions());
  return res.status(201).json({
    message: "User created successfully",
    user: sanitizeUser(user),
    accessToken,
  });
};

const loginUser = async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = email.trim().toLowerCase();

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    throw createError("Invalid email or password", 401);
  }

  const isPasswordCorrect = await bcrypt.compare(password, user.password);
  if (!isPasswordCorrect) {
    throw createError("Invalid email or password", 401);
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  res.cookie("refreshToken", refreshToken, getCookieOptions());
  return res.status(200).json({
    message: "Login successful",
    user: sanitizeUser(user),
    accessToken,
  });
};

const logoutUser = async (req, res) => {
  res.clearCookie("refreshToken", getCookieOptions());
  return res.status(200).json({ message: "Logout successful" });
};

const refresh = async (req, res) => {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    throw createError("Unauthorized", 401);
  }

  const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  const accessToken = jwt.sign(
    { id: decoded.id, name: decoded.name, email: decoded.email },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN }
  );

  return res.status(200).json({ message: "Token refreshed", accessToken });
};

const getCurrentUser = async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");

  if (!user) {
    throw createError("User not found", 404);
  }

  return res.status(200).json({
    message: "User fetched successfully",
    user: sanitizeUser(user),
  });
};

module.exports = { registerUser, loginUser, logoutUser, refresh, getCurrentUser };
