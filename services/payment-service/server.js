require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const axios = require("axios");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5003;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/cab_booking_payment_service";
const BOOKING_SERVICE_URL = process.env.BOOKING_SERVICE_URL || "http://localhost:5002";

mongoose.connect(MONGODB_URI)
  .then(() => console.log("Payment service connected to MongoDB"))
  .catch(err => console.log("MongoDB connection error:", err.message));

// Payment schema
const PaymentSchema = new mongoose.Schema({
  customerId: {
    type: String,
    required: true
  },
  bookingId: {
    type: String,
    required: true
  },
  cabFare: {
    type: Number,
    required: true
  },
  cabType: {
    type: String,
    enum: ["Economic", "Premium", "Executive"],
    required: true
  },
  cabMultiplier: {
    type: Number,
    required: true
  },
  daytimeMultiplier: {
    type: Number,
    required: true
  },
  passengers: {
    type: Number,
    required: true
  },
  passengersMultiplier: {
    type: Number,
    required: true
  },
  discount: {
    type: Number,
    default: 1
  },
  totalPrice: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ["paid", "failed"],
    default: "paid"
  },
  fareSource: {
    type: String,
    default: "external-api"
  }
}, {
  timestamps: true
});

const Payment = mongoose.model("Payment", PaymentSchema);

function getCabMultiplier(cabType) {
  if (cabType === "Economic") {
    return 1;
  }

  if (cabType === "Premium") {
    return 1.2;
  }

  if (cabType === "Executive") {
    return 1.4;
  }

  return null;
}

function getDaytimeMultiplier(bookingDateTime) {
  const dateValue = new Date(bookingDateTime);
  const hour = dateValue.getHours();

  if (hour >= 0 && hour < 8) {
    return 1.2;
  }

  return 1;
}

function getPassengersMultiplier(passengers) {
  if (passengers >= 1 && passengers <= 4) {
    return 1;
  }

  if (passengers >= 5 && passengers <= 8) {
    return 2;
  }

  return null;
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function readFareFromResponse(data) {
  if (typeof data === "number") {
    return data;
  }

  if (data.fare) {
    return Number(data.fare);
  }

  if (data.total_fare) {
    return Number(data.total_fare);
  }

  if (data.totalFare) {
    return Number(data.totalFare);
  }

  if (data.estimated_fare) {
    return Number(data.estimated_fare);
  }

  if (data.estimate) {
    return Number(data.estimate);
  }

  if (data.journey && data.journey.fares && data.journey.fares.length > 0) {
    const fare = data.journey.fares.find(item => item.price_in_cents && item.price_in_cents !== "n/a");

    if (fare) {
      return Number(fare.price_in_cents) / 100;
    }
  }

  return null;
}

async function getCabFare(fareRequest) {
  if (!process.env.TAXI_FARE_API_URL) {
    if (fareRequest && fareRequest.testCabFare) {
      return {
        cabFare: Number(fareRequest.testCabFare),
        fareSource: "testCabFare"
      };
    }

    throw new Error("TAXI_FARE_API_URL is not configured");
  }

  const headers = {};

  if (process.env.TAXI_FARE_API_KEY) {
    headers["X-RapidAPI-Key"] = process.env.TAXI_FARE_API_KEY;
  }

  if (process.env.TAXI_FARE_API_HOST) {
    headers["X-RapidAPI-Host"] = process.env.TAXI_FARE_API_HOST;
  }

  const response = await axios.get(process.env.TAXI_FARE_API_URL, {
    params: fareRequest,
    headers
  });

  const cabFare = readFareFromResponse(response.data);

  if (!cabFare || Number.isNaN(cabFare)) {
    throw new Error("Could not read cab fare from external API response");
  }

  return {
    cabFare,
    fareSource: "external-api"
  };
}

// Health check
app.get("/health", (req, res) => {
  res.json({
    service: "payment-service",
    status: "running",
    database: mongoose.connection.readyState === 1 ? "connected" : "not connected"
  });
});

// POST estimate cab fare using the external taxi fare API
app.post("/payments/estimate-fare", async (req, res) => {
  try {
    const fareResult = await getCabFare(req.body);

    res.json(fareResult);
  } catch (error) {
    res.status(400).json({
      error: error.message
    });
  }
});

// POST pay for a booking
app.post("/payments/pay", async (req, res) => {
  try {
    const {
      customerId,
      bookingId,
      discount,
      fareRequest
    } = req.body;

    if (!customerId || !bookingId) {
      return res.status(400).json({
        error: "customerId and bookingId are required"
      });
    }

    const bookingResponse = await axios.get(`${BOOKING_SERVICE_URL}/bookings/${bookingId}`);
    const booking = bookingResponse.data;

    if (booking.customerId !== customerId) {
      return res.status(400).json({
        error: "This booking does not belong to the selected customer"
      });
    }

    const cabMultiplier = getCabMultiplier(booking.cabType);
    const daytimeMultiplier = getDaytimeMultiplier(booking.bookingDateTime);
    const passengersMultiplier = getPassengersMultiplier(Number(booking.passengers));
    const discountMultiplier = discount ? Number(discount) : 1;

    if (!cabMultiplier) {
      return res.status(400).json({
        error: "Invalid cab type"
      });
    }

    if (!passengersMultiplier) {
      return res.status(400).json({
        error: "Passenger number is not allowed"
      });
    }

    if (discountMultiplier <= 0 || discountMultiplier > 1) {
      return res.status(400).json({
        error: "discount must be a multiplier between 0 and 1"
      });
    }

    const fareResult = await getCabFare(fareRequest);

    const totalPrice = roundMoney(
      fareResult.cabFare *
      cabMultiplier *
      daytimeMultiplier *
      passengersMultiplier *
      discountMultiplier
    );

    const payment = new Payment({
      customerId,
      bookingId,
      cabFare: fareResult.cabFare,
      cabType: booking.cabType,
      cabMultiplier,
      daytimeMultiplier,
      passengers: Number(booking.passengers),
      passengersMultiplier,
      discount: discountMultiplier,
      totalPrice,
      fareSource: fareResult.fareSource
    });

    await payment.save();

    res.status(201).json({
      message: "Payment successful",
      payment
    });
  } catch (error) {
    res.status(400).json({
      error: error.message
    });
  }
});

// GET all payments
app.get("/payments", async (req, res) => {
  const payments = await Payment.find().sort({ createdAt: -1 });

  res.json(payments);
});

// GET payments for one customer
app.get("/payments/customer/:customerId", async (req, res) => {
  const payments = await Payment.find({
    customerId: req.params.customerId
  }).sort({ createdAt: -1 });

  res.json(payments);
});

// GET payment details by id
app.get("/payments/:id", async (req, res) => {
  const payment = await Payment.findById(req.params.id);

  if (!payment) {
    return res.status(404).json({
      error: "Payment not found"
    });
  }

  res.json(payment);
});

// GET payment by booking id
app.get("/payments/booking/:bookingId/details", async (req, res) => {
  const payment = await Payment.findOne({
    bookingId: req.params.bookingId
  });

  if (!payment) {
    return res.status(404).json({
      error: "Payment not found"
    });
  }

  res.json(payment);
});

// JSON response for unknown payment service endpoints
app.use((req, res) => {
  res.status(404).json({
    error: "Endpoint not found"
  });
});

app.listen(PORT, () => {
  console.log(`Payment service running on http://localhost:${PORT}`);
});
