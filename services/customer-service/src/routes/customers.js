const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Customer = require("../models/Customer");
const Notification = require("../models/Notification");
const requireAuth = require("../middleware/auth");

const router = express.Router();

function createToken(customer) {
  return jwt.sign(
    {
      customerId: customer._id.toString(),
      email: customer.email
    },
    process.env.JWT_SECRET,
    { expiresIn: "2h" }
  );
}

router.post("/register", async (req, res, next) => {
  try {
    const { firstName, surname, email, password } = req.body;

    if (!firstName || !surname || !email || !password) {
      return res.status(400).json({
        error: "firstName, surname, email and password are required"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long" });
    }

    const existingCustomer = await Customer.findOne({ email });
    if (existingCustomer) {
      return res.status(409).json({ error: "A customer with this email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const customer = await Customer.create({
      firstName,
      surname,
      email,
      passwordHash
    });

    await Notification.create({
      customerId: customer._id,
      type: "system",
      title: "Welcome to the cab booking platform",
      message: "Your customer account has been created successfully."
    });

    return res.status(201).json({
      message: "Customer registered successfully",
      customer: customer.toSafeObject(),
      token: createToken(customer)
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const customer = await Customer.findOne({ email });
    if (!customer) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const passwordMatches = await bcrypt.compare(password, customer.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    return res.json({
      message: "Login successful",
      customer: customer.toSafeObject(),
      token: createToken(customer)
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.user.customerId);

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    return res.json({ customer: customer.toSafeObject() });
  } catch (error) {
    return next(error);
  }
});

router.get("/notifications", requireAuth, async (req, res, next) => {
  try {
    const notifications = await Notification.find({ customerId: req.user.customerId })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ notifications });
  } catch (error) {
    return next(error);
  }
});

router.patch("/notifications/:notificationId/read", requireAuth, async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      {
        _id: req.params.notificationId,
        customerId: req.user.customerId
      },
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    return res.json({ notification });
  } catch (error) {
    return next(error);
  }
});

// Internal endpoint for later event-driven tasks to publish notifications.
router.post("/:customerId/notifications", async (req, res, next) => {
  try {
    const { type = "system", title, message, metadata = {} } = req.body;

    if (!title || !message) {
      return res.status(400).json({ error: "title and message are required" });
    }

    const customer = await Customer.findById(req.params.customerId);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const notification = await Notification.create({
      customerId: customer._id,
      type,
      title,
      message,
      metadata
    });

    return res.status(201).json({ notification });
  } catch (error) {
    return next(error);
  }
});

// Internal endpoint for Task 5 discount event.
// The discount notification is created only once for each customer.
router.post("/:customerId/discount-notification", async (req, res, next) => {
  try {
    const customer = await Customer.findOneAndUpdate(
      {
        _id: req.params.customerId,
        discountNotificationSent: false
      },
      {
        discountNotificationSent: true
      },
      {
        new: true
      }
    );

    if (!customer) {
      const existingCustomer = await Customer.findById(req.params.customerId);

      if (!existingCustomer) {
        return res.status(404).json({ error: "Customer not found" });
      }

      return res.json({
        message: "Discount notification already created for this customer",
        alreadyCreated: true
      });
    }

    const notification = await Notification.create({
      customerId: customer._id,
      type: "discount_available",
      title: "Discount available",
      message: "You have completed three bookings. A discount is now available for your next ride.",
      metadata: {
        completedBookings: req.body.completedBookings || 3
      }
    });

    return res.status(201).json({
      message: "Discount notification created",
      notification
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
