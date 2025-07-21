const User = require("../models/userModel");
const asyncHandler = require("express-async-handler");
const nodemailer = require("nodemailer");
const cloudinary = require("cloudinary").v2;

// Validate environment variables for email configuration
if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
  console.error(
    "Missing email credentials: MAIL_USER or MAIL_PASS is undefined"
  );
  throw new Error("Server configuration error: Email credentials missing");
}

// Configure Nodemailer transporter for sending emails
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

// Verify Nodemailer configuration
transporter.verify((error, success) => {
  if (error) {
    console.error("Nodemailer configuration error:", error.message);
  } else {
    console.log("Nodemailer is ready to send emails");
  }
});

// Generate a 6-digit OTP for verification or password reset
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Function to handle user signup and send OTP via email
const signupUser = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, phoneNumber, password, sponsorBy } =
    req.body;

  if (
    !firstName ||
    !lastName ||
    !email ||
    !phoneNumber ||
    !password ||
    !sponsorBy
  ) {
    res.status(400);
    throw new Error("All fields are required");
  }

  const userExists = await User.findOne({ $or: [{ email }, { phoneNumber }] });
  if (userExists) {
    res.status(400);
    throw new Error("User already exists with this email or phone number");
  }

  const otp = generateOTP();

  let user;
  try {
    user = await User.create({
      firstName,
      lastName,
      email,
      phoneNumber,
      password,
      sponsorBy,
      otp,
    });
  } catch (error) {
    console.error("User creation error:", error.message);
    res.status(500);
    throw new Error("Failed to create user. Please try again.");
  }

  const mailOptions = {
    from: `"Your App" <${process.env.MAIL_USER}>`,
    to: email,
    subject: "Your OTP for Account Verification",
    text: `Hello ${firstName} ${lastName},\n\nYour OTP for account verification is: ${otp}\n\nPlease enter this OTP to verify your account within 10 minutes.\n\nThank you,\nYour App Team`,
    html: `
      <h2>Hello ${firstName} ${lastName},</h2>
      <p>Your OTP for account verification is: <strong>${otp}</strong></p>
      <p>Please enter this OTP to verify your account within 10 minutes.</p>
      <p>Thank you,<br>Your App Team</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`OTP sent to ${email}: ${otp}`);
  } catch (error) {
    console.error("Email sending error:", error.message);
    await User.deleteOne({ _id: user._id });
    res.status(500);
    throw new Error(
      `Failed to send OTP: ${error.message}. Please check your email and try again.`
    );
  }

  res.status(201).json({
    message: "User registered. Please verify OTP sent to your email.",
    userId: user._id,
  });
});

// Function to verify OTP and mark user as verified
const verifyOTPUser = asyncHandler(async (req, res) => {
  const { userId, otp } = req.body;

  const user = await User.findOne({ _id: userId });
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  if (user.isVerified) {
    res.status(400);
    throw new Error("User already verified");
  }

  if (user.otp !== otp) {
    res.status(400);
    throw new Error("Invalid OTP");
  }

  user.isVerified = true;
  user.otp = null;
  await user.save();

  res.status(200).json({ message: "OTP verified successfully" });
});

// Function to handle user login
const loginUser = asyncHandler(async (req, res) => {
  const { email, phoneNumber, password } = req.body;

  if ((!email && !phoneNumber) || !password) {
    res.status(400);
    throw new Error("Email or phone number and password are required");
  }

  const user = await User.findOne({ $or: [{ email }, { phoneNumber }] });
  if (!user) {
    res.status(401);
    throw new Error("Invalid email or phone number");
  }

  if (!user.isVerified) {
    res.status(403);
    throw new Error("Please verify your email with OTP");
  }

  if (!(await user.comparePassword(password))) {
    res.status(401);
    throw new Error("Invalid password");
  }

  res.status(200).json({
    message: "Login successful",
    userId: user._id,
    user: {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      sponsorBy: user.sponsorBy,
      country: user.country,
      kycLevel: user.kycLevel,
    },
  });
});

// Function to handle forgot password request and send OTP
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    res.status(400);
    throw new Error("Email is required");
  }

  const user = await User.findOne({ email });
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  const resetOtp = generateOTP();

  let updatedUser;
  try {
    updatedUser = await User.findByIdAndUpdate(
      user._id,
      { resetOtp, resetOtpExpires: Date.now() + 10 * 60 * 1000 },
      { new: true, runValidators: true }
    );
  } catch (error) {
    console.error("User update error:", error.message);
    res.status(500);
    throw new Error("Failed to update user for reset. Please try again.");
  }

  const mailOptions = {
    from: `"Your App" <${process.env.MAIL_USER}>`,
    to: email,
    subject: "Your OTP for Password Reset",
    text: `Hello ${user.firstName} ${user.lastName},\n\nYour OTP for password reset is: ${resetOtp}\n\nPlease use this OTP to reset your password within 10 minutes.\n\nThank you,\nYour App Team`,
    html: `
      <h2>Hello ${user.firstName} ${user.lastName},</h2>
      <p>Your OTP for password reset is: <strong>${resetOtp}</strong></p>
      <p>Please use this OTP to reset your password within 10 minutes.</p>
      <p>Thank you,<br>Your App Team</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Reset OTP sent to ${email}: ${resetOtp}`);
  } catch (error) {
    console.error("Email sending error:", error.message);
    res.status(500);
    throw new Error(
      `Failed to send reset OTP: ${error.message}. Please try again.`
    );
  }

  res.status(200).json({ message: "Reset OTP sent to email" });
});

// Function to reset user password using OTP
const resetPassword = asyncHandler(async (req, res) => {
  const { userId, resetOtp, password } = req.body;

  if (!userId || !resetOtp || !password) {
    res.status(400);
    throw new Error("User ID, reset OTP, and password are required");
  }

  const user = await User.findById(userId);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  if (
    user.resetOtp !== resetOtp ||
    !user.resetOtpExpires ||
    user.resetOtpExpires < Date.now()
  ) {
    res.status(400);
    throw new Error("Invalid or expired reset OTP");
  }

  user.password = password;
  user.resetOtp = null;
  user.resetOtpExpires = null;
  await user.save();

  res.status(200).json({ message: "Password reset successful" });
});

// Function to handle KYC Level 1 submission with userId and fullName
cloudinary.config({
  cloud_name: process.env.Cloud_Name,
  api_key: process.env.API_Key,
  api_secret: process.env.API_Secret,
});

const submitKYC = asyncHandler(async (req, res) => {
  // Debug: Log the received body and files to verify data
  console.log("Request body:", req.body);
  console.log("Request files:", req.files);

  // Extract fields from req.body and files from req.files
  const { userId, fullName, country } = req.body;
  const frontImage = req.files?.frontImage;
  const backImage = req.files?.backImage;

  // Validate all required fields
  if (!userId || !fullName || !country || !frontImage || !backImage) {
    res.status(400);
    throw new Error(
      "All fields including userId, full name, CNIC images, and country are required"
    );
  }

  // Split fullName into firstName and lastName
  const [firstName, lastName] = fullName.split(" ").filter(Boolean);
  if (!firstName || !lastName) {
    res.status(400);
    throw new Error("Full name must contain both first and last names");
  }

  // Find user by userId
  const user = await User.findById(userId);
  if (!user) {
    res.status(404);
    throw new Error("User not found. Please provide a valid user ID.");
  }

  // Debug: Log file paths before upload
  console.log("Front image path:", frontImage[0].path);
  console.log("Back image path:", backImage[0].path);

  // Upload images to Cloudinary
  const frontUpload = await cloudinary.uploader.upload(frontImage[0].path, {
    folder: "kyc/front",
  });
  const backUpload = await cloudinary.uploader.upload(backImage[0].path, {
    folder: "kyc/back",
  });

  // Update user data
  user.firstName = firstName;
  user.lastName = lastName;
  user.country = country;
  user.cnicImages = {
    front: frontUpload.secure_url,
    back: backUpload.secure_url,
  };
  user.kycLevel = 1;
  user.isVerified = true;
  await user.save();

  res.status(200).json({ message: "KYC Level 1 completed successfully" });
});

// Export all controller functions for use in routes
module.exports = {
  signupUser,
  verifyOTPUser,
  loginUser,
  forgotPassword,
  resetPassword,
  submitKYC,
};
