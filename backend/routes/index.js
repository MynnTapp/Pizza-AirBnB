const express = require("express");
const router = express.Router();
const apiRouter = require("./api");
const csrf = require("csurf");
const csrfProtection = csrf({ cookie: true });

router.use(csrfProtection);

router.use("/api", apiRouter);

// backend/routes/index.js
// ... after `router.use('/api', apiRouter);`

// Static routes
// Serve React build files in production
if (process.env.NODE_ENV === "production") {
  const path = require("path");
  // Serve the frontend's index.html file at the root route
  router.get("/", (req, res) => {
    res.cookie("XSRF-TOKEN", req.csrfToken());
    return res.sendFile(path.resolve(__dirname, "../../frontend", "dist", "index.html"));
  });

  // Serve the static assets in the frontend's build folder
  router.use(express.static(path.resolve("../frontend/dist")));

  // Serve the frontend's index.html file at all other routes NOT starting with /api
  router.get(/^(?!\/?api).*/, (req, res) => {
    res.cookie("XSRF-TOKEN", req.csrfToken());
    return res.sendFile(path.resolve(__dirname, "../../frontend", "dist", "index.html"));
  });
}

// backend/routes/index.js
// ...

// Add a XSRF-TOKEN cookie in development
if (process.env.NODE_ENV !== "production") {
  router.get("/api/csrf/restore", (req, res) => {
    res.cookie("XSRF-TOKEN", req.csrfToken());
    return res.json({});
  });
}

router.get("/api/csrf/restore", (req, res) => {
  const csrfToken = req.csrfToken();
  res.cookie("XSRF-TOKEN", csrfToken);
  res.status(200).json({
    "XSRF-Token": csrfToken,
  });
});

router.post("/test", function (req, res) {
  res.json({ requestBody: req.body });
});

module.exports = router;