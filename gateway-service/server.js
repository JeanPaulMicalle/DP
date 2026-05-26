require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

const CUSTOMER_SERVICE_URL = process.env.CUSTOMER_SERVICE_URL || "http://localhost:5001";
const BOOKING_SERVICE_URL = process.env.BOOKING_SERVICE_URL || "http://localhost:5002";
const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || "http://localhost:5003";
const LOCATION_SERVICE_URL = process.env.LOCATION_SERVICE_URL || "http://localhost:5004";

function getHeaders(req) {
  const headers = {};

  if (req.headers.authorization) {
    headers.authorization = req.headers.authorization;
  }

  return headers;
}

async function callService(req, res, method, url, body) {
  try {
    const response = await axios({
      method,
      url,
      data: body,
      headers: getHeaders(req)
    });

    res.status(response.status).json(response.data);
  } catch (error) {
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }

    res.status(500).json({
      error: "Gateway could not contact the requested microservice"
    });
  }
}

// Gateway health check
app.get("/health", (req, res) => {
  res.json({
    service: "api-gateway",
    status: "running"
  });
});

// Customer routes
app.post("/api/customers/register", (req, res) => {
  callService(req, res, "post", `${CUSTOMER_SERVICE_URL}/customers/register`, req.body);
});

app.post("/api/customers/login", (req, res) => {
  callService(req, res, "post", `${CUSTOMER_SERVICE_URL}/customers/login`, req.body);
});

app.get("/api/customers/me", (req, res) => {
  callService(req, res, "get", `${CUSTOMER_SERVICE_URL}/customers/me`);
});

app.get("/api/customers/notifications", (req, res) => {
  callService(req, res, "get", `${CUSTOMER_SERVICE_URL}/customers/notifications`);
});

app.patch("/api/customers/notifications/:notificationId/read", (req, res) => {
  callService(req, res, "patch", `${CUSTOMER_SERVICE_URL}/customers/notifications/${req.params.notificationId}/read`);
});

// Booking routes
app.post("/api/bookings", (req, res) => {
  callService(req, res, "post", `${BOOKING_SERVICE_URL}/bookings`, req.body);
});

app.get("/api/bookings/customer/:customerId", (req, res) => {
  callService(req, res, "get", `${BOOKING_SERVICE_URL}/bookings/customer/${req.params.customerId}`);
});

app.get("/api/bookings/customer/:customerId/current", (req, res) => {
  callService(req, res, "get", `${BOOKING_SERVICE_URL}/bookings/customer/${req.params.customerId}/current`);
});

app.get("/api/bookings/customer/:customerId/past", (req, res) => {
  callService(req, res, "get", `${BOOKING_SERVICE_URL}/bookings/customer/${req.params.customerId}/past`);
});

app.get("/api/bookings/:id", (req, res) => {
  callService(req, res, "get", `${BOOKING_SERVICE_URL}/bookings/${req.params.id}`);
});

app.patch("/api/bookings/:id/status", (req, res) => {
  callService(req, res, "patch", `${BOOKING_SERVICE_URL}/bookings/${req.params.id}/status`, req.body);
});

// Payment routes
app.post("/api/payments/estimate-fare", (req, res) => {
  callService(req, res, "post", `${PAYMENT_SERVICE_URL}/payments/estimate-fare`, req.body);
});

app.post("/api/payments/pay", (req, res) => {
  callService(req, res, "post", `${PAYMENT_SERVICE_URL}/payments/pay`, req.body);
});

app.get("/api/payments", (req, res) => {
  callService(req, res, "get", `${PAYMENT_SERVICE_URL}/payments`);
});

app.get("/api/payments/customer/:customerId", (req, res) => {
  callService(req, res, "get", `${PAYMENT_SERVICE_URL}/payments/customer/${req.params.customerId}`);
});

app.get("/api/payments/booking/:bookingId/details", (req, res) => {
  callService(req, res, "get", `${PAYMENT_SERVICE_URL}/payments/booking/${req.params.bookingId}/details`);
});

app.get("/api/payments/:id", (req, res) => {
  callService(req, res, "get", `${PAYMENT_SERVICE_URL}/payments/${req.params.id}`);
});

// Location routes
app.post("/api/locations", (req, res) => {
  callService(req, res, "post", `${LOCATION_SERVICE_URL}/locations`, req.body);
});

app.get("/api/locations/customer/:customerId", (req, res) => {
  callService(req, res, "get", `${LOCATION_SERVICE_URL}/locations/customer/${req.params.customerId}`);
});

app.get("/api/locations/:id/weather", (req, res) => {
  callService(req, res, "get", `${LOCATION_SERVICE_URL}/locations/${req.params.id}/weather`);
});

app.get("/api/locations/:id", (req, res) => {
  callService(req, res, "get", `${LOCATION_SERVICE_URL}/locations/${req.params.id}`);
});

app.put("/api/locations/:id", (req, res) => {
  callService(req, res, "put", `${LOCATION_SERVICE_URL}/locations/${req.params.id}`, req.body);
});

app.delete("/api/locations/:id", (req, res) => {
  callService(req, res, "delete", `${LOCATION_SERVICE_URL}/locations/${req.params.id}`);
});

app.get("/api/weather", (req, res) => {
  callService(req, res, "get", `${LOCATION_SERVICE_URL}/weather?q=${encodeURIComponent(req.query.q || "")}`);
});

// JSON response for unknown gateway endpoints
app.use((req, res) => {
  res.status(404).json({
    error: "Gateway endpoint not found"
  });
});

app.listen(PORT, () => {
  console.log(`API Gateway running on http://localhost:${PORT}`);
});
