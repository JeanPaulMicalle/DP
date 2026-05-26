const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const customerRoutes = require("./routes/customers");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({
    service: "customer-service",
    status: "running",
    database: mongoose.connection.readyState === 1 ? "connected" : "not connected"
  });
});

app.use("/customers", customerRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
