require("dotenv").config();

const app = require("./app");
const connectDb = require("./config/db");

const PORT = process.env.PORT || 5001;

async function start() {
  try {
    await connectDb();
    app.listen(PORT, () => {
      console.log(`Customer service running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Customer service failed to start:", error.message);
    process.exit(1);
  }
}

start();
