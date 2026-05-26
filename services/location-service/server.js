require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const axios = require("axios");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5004;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/cab_booking_location_service";

mongoose.connect(MONGODB_URI)
  .then(() => console.log("Location service connected to MongoDB"))
  .catch(err => console.log("MongoDB connection error:", err.message));

// Favourite pickup location schema
const FavouriteLocationSchema = new mongoose.Schema({
  customerId: {
    type: String,
    required: true
  },
  label: {
    type: String,
    required: true
  },
  address: {
    type: String,
    required: true
  },
  latitude: {
    type: Number
  },
  longitude: {
    type: Number
  }
}, {
  timestamps: true
});

const FavouriteLocation = mongoose.model("FavouriteLocation", FavouriteLocationSchema);

function simplifyWeather(data) {
  if (data.current) {
    return {
      location: data.location ? data.location.name : undefined,
      country: data.location ? data.location.country : undefined,
      temperature: data.current.temp_c,
      condition: data.current.condition ? data.current.condition.text : undefined,
      wind: data.current.wind_kph,
      humidity: data.current.humidity,
      raw: data
    };
  }

  if (data.alerts) {
    const alerts = data.alerts.alert || [];

    return {
      alertCount: alerts.length,
      alerts,
      raw: data
    };
  }

  return {
    raw: data
  };
}

async function getWeather(locationText) {
  if (!process.env.WEATHER_API_URL) {
    return {
      location: locationText,
      temperature: 22,
      condition: "Test weather",
      wind: 10,
      humidity: 60,
      source: "test-weather"
    };
  }

  const headers = {};

  if (process.env.WEATHER_API_KEY) {
    headers["X-RapidAPI-Key"] = process.env.WEATHER_API_KEY;
  }

  if (process.env.WEATHER_API_HOST) {
    headers["X-RapidAPI-Host"] = process.env.WEATHER_API_HOST;
  }

  const response = await axios.get(process.env.WEATHER_API_URL, {
    params: {
      q: locationText
    },
    headers
  });

  const weather = simplifyWeather(response.data);
  weather.source = "external-api";

  return weather;
}

// Health check
app.get("/health", (req, res) => {
  res.json({
    service: "location-service",
    status: "running",
    database: mongoose.connection.readyState === 1 ? "connected" : "not connected"
  });
});

// POST add a favourite pickup location
app.post("/locations", async (req, res) => {

  const {
    customerId,
    label,
    address,
    latitude,
    longitude
  } = req.body;

  if (!customerId || !label || !address) {
    return res.status(400).json({
      error: "customerId, label and address are required"
    });
  }

  const location = new FavouriteLocation({
    customerId,
    label,
    address,
    latitude,
    longitude
  });

  await location.save();

  res.status(201).json({
    message: "Favourite pickup location added",
    location
  });

});

// GET favourite pickup locations for one customer
app.get("/locations/customer/:customerId", async (req, res) => {

  const locations = await FavouriteLocation.find({
    customerId: req.params.customerId
  }).sort({ createdAt: -1 });

  res.json(locations);

});

// GET one favourite pickup location
app.get("/locations/:id", async (req, res) => {

  const location = await FavouriteLocation.findById(req.params.id);

  if (!location) {
    return res.status(404).json({
      error: "Favourite pickup location not found"
    });
  }

  res.json(location);

});

// PUT update a favourite pickup location
app.put("/locations/:id", async (req, res) => {

  const {
    label,
    address,
    latitude,
    longitude
  } = req.body;

  if (!label || !address) {
    return res.status(400).json({
      error: "label and address are required"
    });
  }

  const location = await FavouriteLocation.findByIdAndUpdate(
    req.params.id,
    {
      label,
      address,
      latitude,
      longitude
    },
    { new: true }
  );

  if (!location) {
    return res.status(404).json({
      error: "Favourite pickup location not found"
    });
  }

  res.json({
    message: "Favourite pickup location updated",
    location
  });

});

// DELETE remove a favourite pickup location
app.delete("/locations/:id", async (req, res) => {

  const location = await FavouriteLocation.findByIdAndDelete(req.params.id);

  if (!location) {
    return res.status(404).json({
      error: "Favourite pickup location not found"
    });
  }

  res.json({
    message: "Favourite pickup location deleted"
  });

});

// GET weather forecast for one saved favourite location
app.get("/locations/:id/weather", async (req, res) => {
  try {
    const location = await FavouriteLocation.findById(req.params.id);

    if (!location) {
      return res.status(404).json({
        error: "Favourite pickup location not found"
      });
    }

    const weather = await getWeather(location.address);

    res.json({
      location,
      weather
    });
  } catch (error) {
    res.status(400).json({
      error: error.message
    });
  }
});

// GET weather forecast by location text
app.get("/weather", async (req, res) => {
  try {
    const locationText = req.query.q;

    if (!locationText) {
      return res.status(400).json({
        error: "q query parameter is required"
      });
    }

    const weather = await getWeather(locationText);

    res.json(weather);
  } catch (error) {
    res.status(400).json({
      error: error.message
    });
  }
});

// JSON response for unknown location service endpoints
app.use((req, res) => {
  res.status(404).json({
    error: "Endpoint not found"
  });
});

app.listen(PORT, () => {
  console.log(`Location service running on http://localhost:${PORT}`);
});
