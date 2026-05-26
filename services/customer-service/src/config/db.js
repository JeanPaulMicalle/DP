const mongoose = require("mongoose");

async function connectDb() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is required. Add it to .env or hosting environment variables.");
  }

  await mongoose.connect(uri);
  console.log("Customer service connected to MongoDB");
}

module.exports = connectDb;
