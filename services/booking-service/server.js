require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const axios = require("axios");
const EventEmitter = require("events");

const app = express();
const bookingEvents = new EventEmitter();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5002;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/cab_booking_booking_service";
const CUSTOMER_SERVICE_URL = process.env.CUSTOMER_SERVICE_URL || "http://localhost:5001";
const CAB_READY_DELAY_MS = Number(process.env.CAB_READY_DELAY_MS) || 180000;

mongoose.connect(MONGODB_URI)
  .then(() => console.log("Booking service connected to MongoDB"))
  .catch(err => console.log("MongoDB connection error:", err.message));

// Booking schema
const BookingSchema = new mongoose.Schema({
  customerId: {
    type: String,
    required: true
  },
  startingLocation: {
    type: String,
    required: true
  },
  endingLocation: {
    type: String,
    required: true
  },
  bookingDateTime: {
    type: Date,
    required: true
  },
  passengers: {
    type: Number,
    required: true
  },
  cabType: {
    type: String,
    enum: ["Economic", "Premium", "Executive"],
    required: true
  },
  status: {
    type: String,
    enum: ["confirmed", "cancelled", "completed"],
    default: "confirmed"
  }
}, {
  timestamps: true
});

const Booking = mongoose.model("Booking", BookingSchema);

// Event listener for Task 6 cab ready notification
bookingEvents.on("bookingCreated", (booking) => {

  console.log("Cab ready event scheduled for booking " + booking._id);

  setTimeout(async () => {
    try {
      const latestBooking = await Booking.findById(booking._id);

      if (!latestBooking || latestBooking.status === "cancelled") {
        console.log("Cab ready event skipped for booking " + booking._id);
        return;
      }

      await axios.post(`${CUSTOMER_SERVICE_URL}/customers/${latestBooking.customerId}/notifications`, {
        type: "cab_ready",
        title: "Cab ready",
        message: "Your cab is ready for pickup from " + latestBooking.startingLocation + " to " + latestBooking.endingLocation + ".",
        metadata: {
          bookingId: latestBooking._id,
          startingLocation: latestBooking.startingLocation,
          endingLocation: latestBooking.endingLocation,
          bookingDateTime: latestBooking.bookingDateTime,
          passengers: latestBooking.passengers,
          cabType: latestBooking.cabType
        }
      });

      console.log("Cab ready notification created for booking " + latestBooking._id);
    } catch (error) {
      console.log("Cab ready event error:", error.message);
    }
  }, CAB_READY_DELAY_MS);

});

// Event listener for Task 5 discount notification
bookingEvents.on("bookingCompleted", async (booking) => {
  try {

    const completedBookings = await Booking.countDocuments({
      customerId: booking.customerId,
      status: "completed"
    });

    if (completedBookings >= 3) {
      await axios.post(`${CUSTOMER_SERVICE_URL}/customers/${booking.customerId}/discount-notification`, {
        completedBookings
      });

      console.log("Discount event checked for customer " + booking.customerId);
    }

  } catch (error) {
    console.log("Discount event error:", error.message);
  }

});

// Health check
app.get("/health", (req, res) => {
  res.json({
    service: "booking-service",
    status: "running",
    database: mongoose.connection.readyState === 1 ? "connected" : "not connected"
  });
});

// POST create a new booking
app.post("/bookings", async (req, res) => {

  const {
    customerId,
    startingLocation,
    endingLocation,
    bookingDateTime,
    passengers,
    cabType
  } = req.body;

  if (!customerId || !startingLocation || !endingLocation || !bookingDateTime || !passengers || !cabType) {
    return res.status(400).json({
      error: "customerId, startingLocation, endingLocation, bookingDateTime, passengers and cabType are required"
    });
  }

  if (!["Economic", "Premium", "Executive"].includes(cabType)) {
    return res.status(400).json({
      error: "cabType must be Economic, Premium or Executive"
    });
  }

  if (Number(passengers) < 1 || Number(passengers) > 8) {
    return res.status(400).json({
      error: "passengers must be between 1 and 8"
    });
  }

  const dateValue = new Date(bookingDateTime);

  if (Number.isNaN(dateValue.getTime())) {
    return res.status(400).json({
      error: "bookingDateTime must be a valid date"
    });
  }

  const booking = new Booking({
    customerId,
    startingLocation,
    endingLocation,
    bookingDateTime: dateValue,
    passengers: Number(passengers),
    cabType
  });

  await booking.save();

  bookingEvents.emit("bookingCreated", booking);

  res.status(201).json({
    message: "Booking created",
    booking
  });

});

// GET all bookings for one customer
app.get("/bookings/customer/:customerId", async (req, res) => {

  const bookings = await Booking.find({
    customerId: req.params.customerId
  }).sort({ bookingDateTime: -1 });

  res.json(bookings);

});

// GET current bookings for one customer
app.get("/bookings/customer/:customerId/current", async (req, res) => {

  const bookings = await Booking.find({
    customerId: req.params.customerId,
    bookingDateTime: { $gte: new Date() },
    status: "confirmed"
  }).sort({ bookingDateTime: 1 });

  res.json(bookings);

});

// GET past bookings for one customer
app.get("/bookings/customer/:customerId/past", async (req, res) => {

  const bookings = await Booking.find({
    customerId: req.params.customerId,
    $or: [
      { bookingDateTime: { $lt: new Date() } },
      { status: "completed" }
    ]
  }).sort({ bookingDateTime: -1 });

  res.json(bookings);

});

// GET one booking by id
app.get("/bookings/:id", async (req, res) => {

  const booking = await Booking.findById(req.params.id);

  if (!booking) {
    return res.status(404).json({
      error: "Booking not found"
    });
  }

  res.json(booking);

});

// PATCH update booking status
app.patch("/bookings/:id/status", async (req, res) => {

  const { status } = req.body;

  if (!["confirmed", "cancelled", "completed"].includes(status)) {
    return res.status(400).json({
      error: "status must be confirmed, cancelled or completed"
    });
  }

  const booking = await Booking.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true }
  );

  if (!booking) {
    return res.status(404).json({
      error: "Booking not found"
    });
  }

  if (status === "completed") {
    bookingEvents.emit("bookingCompleted", booking);
  }

  res.json({
    message: "Booking status updated",
    booking
  });

});

// JSON response for unknown booking service endpoints
app.use((req, res) => {
  res.status(404).json({
    error: "Endpoint not found"
  });
});

app.listen(PORT, () => {
  console.log(`Booking service running on http://localhost:${PORT}`);
});
