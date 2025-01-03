
const express = require("express");
require("express-async-errors");
const morgan = require("morgan");
const cors = require("cors");
const csurf = require("csurf");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const routes = require("./routes/api");
const { environment } = require("./config");
const { ValidationError } = require("sequelize");
const { restoreUser, refreshToken } = require("./utils/auth");

const app = express();
const isProduction = environment === "production";

// Logging and Parsing
app.use(morgan("dev"));
app.use(cookieParser());
app.use(express.json());

// Security Middleware
if (!isProduction) {
  app.use(cors());
}
app.use(
  helmet.crossOriginResourcePolicy({
    policy: "cross-origin",
  })
);

// CSRF Middleware (global, applied to all routes)
app.use(
  csurf({
    cookie: {
      secure: isProduction,
      sameSite: isProduction && "Lax",
      httpOnly: true,
    },
  })
);

// Define the `/api/csrf/restore` route AFTER the csurf middleware
app.use("/api/csrf/restore", (req, res) => {
  const csrfToken = req.csrfToken();
  res.cookie("XSRF-TOKEN", csrfToken);
  res.status(200).json({ "XSRF-Token": csrfToken });
});

// Custom Middleware
app.use(restoreUser);
app.use(refreshToken);

// Routes
app.use("/api", routes);

// Error Handling
app.use((_req, _res, next) => {
  const err = new Error("The requested resource couldn't be found.");
  err.title = "Resource Not Found";
  err.errors = { message: "The requested resource couldn't be found." };
  err.status = 404;
  next(err);
});

app.use((err, _req, _res, next) => {
  if (err instanceof ValidationError) {
    const errors = {};
    for (const error of err.errors) {
      errors[error.path] = error.message;
    }
    err.title = "Validation error";
    err.errors = errors;
  }
  next(err);
});

app.use((err, _req, res, _next) => {
  res.status(err.status || 500);
  console.error(err);
  res.json({
    message: err.message,
    errors: err.errors,
  });
});

module.exports = app;
