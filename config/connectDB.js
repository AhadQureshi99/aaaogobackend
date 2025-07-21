const mongoose = require("mongoose");
const colors = require("colors"); // Ensure colors package is installed for colored logs

// Function to establish connection to MongoDB database
const connectDB = async () => {
  try {
    // Connect to MongoDB using the URL from environment variables
    // useNewUrlParser and useUnifiedTopology ensure compatibility and performance
    await mongoose.connect(process.env.MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    // Log connection details using the connection name or host if available
    const connection = mongoose.connection;
    if (connection.host) {
      console.log(`Database connected on host:${connection.host.cyan}`);
    } else {
      console.log(`Database connected successfully`.cyan);
      console.log(`Connection details: ${JSON.stringify(connection.name)}`.gray);
    }
  } catch (error) {
    // Log error and exit process if connection fails
    console.error(`Error connecting to database: ${error.message}`.red);
    process.exit(1); // Exit with failure code
  }
};

module.exports = connectDB;