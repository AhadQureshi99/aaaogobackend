require("dotenv").config();
const express = require("express");
const errorHandler = require("./middlewares/errorMiddleware");
const connectDB = require("./config/connectDB");
const cors = require("cors");
const userRoutes = require("./routes/userRoutes");

// Initialize Express app
const app = express();

// Middleware setup for CORS, JSON parsing, and URL-encoded data
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Enable extended parsing for form data

// Apply user routes
app.use("/api/user", userRoutes);

// Connect to MongoDB database
connectDB();

// Apply global error handling middleware
app.use(errorHandler);

// Start the server on the specified port
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server started on port:${PORT}`));
