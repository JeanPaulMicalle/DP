const API_BASE = window.API_BASE || "http://localhost:5000/api";
const GATEWAY_BASE = API_BASE.replace(/\/api$/, "");

let currentCustomer = JSON.parse(localStorage.getItem("customer") || "null");
let currentToken = localStorage.getItem("token") || "";

function showMessage(text, isError) {
  const message = document.getElementById("message");
  message.textContent = text;
  message.style.color = isError ? "#b42318" : "#0f766e";
}

function setConnectionStatus(text, status) {
  const connectionStatus = document.getElementById("connectionStatus");
  connectionStatus.textContent = text;
  connectionStatus.classList.remove("online", "offline");

  if (status) {
    connectionStatus.classList.add(status);
  }
}

function authHeaders() {
  const headers = {
    "Content-Type": "application/json"
  };

  if (currentToken) {
    headers.Authorization = "Bearer " + currentToken;
  }

  return headers;
}

async function apiRequest(path, options) {
  let response;

  try {
    response = await fetch(API_BASE + path, options);
  } catch (error) {
    setConnectionStatus("Gateway offline", "offline");
    throw new Error("Could not contact the API Gateway. Check the hosted gateway URL and CORS settings.");
  }

  const contentType = response.headers.get("content-type") || "";
  let data = {};

  if (contentType.includes("application/json")) {
    data = await response.json();
  } else {
    const text = await response.text();
    data = {
      error: text || "The server did not return JSON"
    };
  }

  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

async function checkGatewayConnection() {
  try {
    const response = await fetch(GATEWAY_BASE + "/health");
    const data = await response.json();

    if (response.ok && data.status === "running") {
      setConnectionStatus("Gateway online", "online");
      return;
    }

    setConnectionStatus("Gateway problem", "offline");
  } catch (error) {
    setConnectionStatus("Gateway offline", "offline");
  }
}

function requireCustomer() {
  if (!currentCustomer) {
    showMessage("Login or register first.", true);
    return false;
  }

  return true;
}

function updateSession() {
  const sessionText = document.getElementById("sessionText");
  const logoutButton = document.getElementById("logoutButton");

  if (currentCustomer) {
    sessionText.textContent = "Logged in as " + currentCustomer.firstName + " " + currentCustomer.surname;
    logoutButton.hidden = false;
    loadBookings();
    loadLocations();
    loadPayments();
    loadNotifications();
  } else {
    sessionText.textContent = "Use the forms below to manage rides through the API Gateway.";
    logoutButton.hidden = true;
  }
}

function showAuthTab(tab) {
  document.getElementById("loginForm").hidden = tab !== "login";
  document.getElementById("registerForm").hidden = tab !== "register";
  document.getElementById("loginTab").classList.toggle("active", tab === "login");
  document.getElementById("registerTab").classList.toggle("active", tab === "register");
}

function showSection(section) {
  const sections = ["bookings", "locations", "payments", "inbox"];

  sections.forEach(name => {
    document.getElementById(name + "Section").hidden = name !== section;
  });

  document.querySelectorAll(".section-tab").forEach(button => {
    button.classList.toggle("active", button.dataset.section === section);
  });
}

async function register(event) {
  event.preventDefault();

  try {
    const data = await apiRequest("/customers/register", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        firstName: document.getElementById("registerFirstName").value,
        surname: document.getElementById("registerSurname").value,
        email: document.getElementById("registerEmail").value,
        password: document.getElementById("registerPassword").value
      })
    });

    currentCustomer = data.customer;
    currentToken = data.token;
    localStorage.setItem("customer", JSON.stringify(currentCustomer));
    localStorage.setItem("token", currentToken);
    showMessage("Account created successfully.", false);
    updateSession();
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function login(event) {
  event.preventDefault();

  try {
    const data = await apiRequest("/customers/login", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        email: document.getElementById("loginEmail").value,
        password: document.getElementById("loginPassword").value
      })
    });

    currentCustomer = data.customer;
    currentToken = data.token;
    localStorage.setItem("customer", JSON.stringify(currentCustomer));
    localStorage.setItem("token", currentToken);
    showMessage("Login successful.", false);
    updateSession();
  } catch (error) {
    showMessage(error.message, true);
  }
}

function logout() {
  currentCustomer = null;
  currentToken = "";
  localStorage.removeItem("customer");
  localStorage.removeItem("token");
  showMessage("Logged out.", false);
  updateSession();
}

async function createBooking(event) {
  event.preventDefault();

  if (!requireCustomer()) {
    return;
  }

  try {
    await apiRequest("/bookings", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        customerId: currentCustomer.id,
        startingLocation: document.getElementById("bookingStart").value,
        endingLocation: document.getElementById("bookingEnd").value,
        bookingDateTime: document.getElementById("bookingDateTime").value,
        passengers: Number(document.getElementById("bookingPassengers").value),
        cabType: document.getElementById("bookingCabType").value
      })
    });

    showMessage("Booking created.", false);
    loadBookings();
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function loadBookings(type) {
  if (!currentCustomer) {
    return;
  }

  try {
    let path = "/bookings/customer/" + currentCustomer.id;

    if (type === "current") {
      path += "/current";
    }

    if (type === "past") {
      path += "/past";
    }

    const bookings = await apiRequest(path, {
      headers: authHeaders()
    });

    const list = document.getElementById("bookingList");
    list.innerHTML = "";

    bookings.forEach(booking => {
      const item = document.createElement("div");
      item.className = "item";
      item.innerHTML = `
        <div class="item-title">
          <span>${booking.startingLocation} to ${booking.endingLocation}</span>
          <span>${booking.status}</span>
        </div>
        <p class="muted">${new Date(booking.bookingDateTime).toLocaleString()} | ${booking.passengers} passenger(s) | ${booking.cabType}</p>
        <p class="muted">ID: ${booking._id}</p>
        <div class="item-actions">
          <button class="secondary" onclick="copyPaymentBooking('${booking._id}')">Use for Payment</button>
          <button class="accent" onclick="completeBooking('${booking._id}')">Complete</button>
        </div>
      `;
      list.appendChild(item);
    });

    if (bookings.length === 0) {
      list.innerHTML = `<p class="muted">No bookings found.</p>`;
    }
  } catch (error) {
    showMessage(error.message, true);
  }
}

function copyPaymentBooking(bookingId) {
  document.getElementById("paymentBookingId").value = bookingId;
  showSectionByName("payments");
}

function showSectionByName(section) {
  showSection(section);
}

async function completeBooking(bookingId) {
  try {
    await apiRequest("/bookings/" + bookingId + "/status", {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({
        status: "completed"
      })
    });

    showMessage("Booking completed.", false);
    loadBookings();
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function saveLocation(event) {
  event.preventDefault();

  if (!requireCustomer()) {
    return;
  }

  const locationId = document.getElementById("locationId").value;
  const body = {
    customerId: currentCustomer.id,
    label: document.getElementById("locationLabel").value,
    address: document.getElementById("locationAddress").value,
    latitude: Number(document.getElementById("locationLatitude").value),
    longitude: Number(document.getElementById("locationLongitude").value)
  };

  try {
    if (locationId) {
      await apiRequest("/locations/" + locationId, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(body)
      });
      showMessage("Location updated.", false);
    } else {
      await apiRequest("/locations", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body)
      });
      showMessage("Location added.", false);
    }

    clearLocationForm();
    loadLocations();
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function loadLocations() {
  if (!currentCustomer) {
    return;
  }

  try {
    const locations = await apiRequest("/locations/customer/" + currentCustomer.id, {
      headers: authHeaders()
    });

    const list = document.getElementById("locationList");
    list.innerHTML = "";

    locations.forEach(location => {
      const item = document.createElement("div");
      item.className = "item";
      item.innerHTML = `
        <div class="item-title">
          <span>${location.label}</span>
          <span>${location.address}</span>
        </div>
        <p class="muted">ID: ${location._id}</p>
        <div class="item-actions">
          <button class="secondary" onclick="editLocation('${location._id}', '${location.label}', '${location.address}', '${location.latitude || ""}', '${location.longitude || ""}')">Edit</button>
          <button class="secondary" onclick="loadWeather('${location._id}')">Weather</button>
          <button class="danger" onclick="deleteLocation('${location._id}')">Delete</button>
        </div>
        <div id="weather-${location._id}" class="muted"></div>
      `;
      list.appendChild(item);
    });

    if (locations.length === 0) {
      list.innerHTML = `<p class="muted">No favourite locations found.</p>`;
    }
  } catch (error) {
    showMessage(error.message, true);
  }
}

function editLocation(id, label, address, latitude, longitude) {
  document.getElementById("locationId").value = id;
  document.getElementById("locationLabel").value = label;
  document.getElementById("locationAddress").value = address;
  document.getElementById("locationLatitude").value = latitude;
  document.getElementById("locationLongitude").value = longitude;
}

function clearLocationForm() {
  document.getElementById("locationId").value = "";
  document.getElementById("locationLabel").value = "";
  document.getElementById("locationAddress").value = "";
  document.getElementById("locationLatitude").value = "";
  document.getElementById("locationLongitude").value = "";
}

async function deleteLocation(id) {
  try {
    await apiRequest("/locations/" + id, {
      method: "DELETE",
      headers: authHeaders()
    });

    showMessage("Location deleted.", false);
    loadLocations();
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function loadWeather(id) {
  try {
    const data = await apiRequest("/locations/" + id + "/weather", {
      headers: authHeaders()
    });

    const weather = data.weather;
    const weatherBox = document.getElementById("weather-" + id);

    if (weather.temperature !== undefined) {
      weatherBox.textContent =
        "Weather: " + weather.temperature + "C, " + weather.condition + ", humidity " + weather.humidity + "%";
    } else if (weather.alertCount !== undefined) {
      weatherBox.textContent =
        "Weather alerts: " + weather.alertCount + " alert(s) found for this location.";
    } else {
      weatherBox.textContent = "Weather data received from external API.";
    }
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function payForBooking(event) {
  event.preventDefault();

  if (!requireCustomer()) {
    return;
  }

  try {
    await apiRequest("/payments/pay", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        customerId: currentCustomer.id,
        bookingId: document.getElementById("paymentBookingId").value,
        discount: Number(document.getElementById("paymentDiscount").value),
        fareRequest: {
          testCabFare: Number(document.getElementById("paymentFare").value),
          dep_lat: Number(document.getElementById("paymentDepLat").value),
          dep_lng: Number(document.getElementById("paymentDepLng").value),
          arr_lat: Number(document.getElementById("paymentArrLat").value),
          arr_lng: Number(document.getElementById("paymentArrLng").value)
        }
      })
    });

    showMessage("Payment successful.", false);
    loadPayments();
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function loadPayments() {
  if (!currentCustomer) {
    return;
  }

  try {
    const payments = await apiRequest("/payments/customer/" + currentCustomer.id, {
      headers: authHeaders()
    });

    const list = document.getElementById("paymentList");
    list.innerHTML = "";

    payments.forEach(payment => {
      const item = document.createElement("div");
      item.className = "item";
      item.innerHTML = `
        <div class="item-title">
          <span>${payment.cabType} booking</span>
          <span>EUR ${payment.totalPrice}</span>
        </div>
        <p class="muted">Booking: ${payment.bookingId}</p>
        <p class="muted">Fare ${payment.cabFare} x cab ${payment.cabMultiplier} x daytime ${payment.daytimeMultiplier} x passengers ${payment.passengersMultiplier} x discount ${payment.discount}</p>
      `;
      list.appendChild(item);
    });

    if (payments.length === 0) {
      list.innerHTML = `<p class="muted">No payments found.</p>`;
    }
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function loadNotifications() {
  if (!currentCustomer) {
    return;
  }

  try {
    const data = await apiRequest("/customers/notifications", {
      headers: authHeaders()
    });

    const list = document.getElementById("notificationList");
    list.innerHTML = "";

    data.notifications.forEach(notification => {
      const item = document.createElement("div");
      item.className = "item";
      item.innerHTML = `
        <div class="item-title">
          <span>${notification.title}</span>
          <span>${notification.read ? "Read" : "New"}</span>
        </div>
        <p>${notification.message}</p>
        <p class="muted">${new Date(notification.createdAt).toLocaleString()}</p>
        <div class="item-actions">
          <button class="secondary" onclick="markNotificationRead('${notification._id}')">Mark Read</button>
        </div>
      `;
      list.appendChild(item);
    });

    if (data.notifications.length === 0) {
      list.innerHTML = `<p class="muted">No notifications found.</p>`;
    }
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function markNotificationRead(id) {
  try {
    await apiRequest("/customers/notifications/" + id + "/read", {
      method: "PATCH",
      headers: authHeaders()
    });

    loadNotifications();
  } catch (error) {
    showMessage(error.message, true);
  }
}

checkGatewayConnection();
updateSession();
