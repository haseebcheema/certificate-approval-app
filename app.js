const express = require("express");
const path = require("path");
const session = require("express-session");
require("dotenv").config();

const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const requesterRoutes = require("./routes/requesterRoutes");
const approverRoutes = require("./routes/approverRoutes");
const certificateRoutes = require("./routes/certificateRoutes");

const app = express();
const PORT = process.env.PORT || 5000;

// Database
connectDB();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static files
app.use(express.static(path.join(__dirname, "public")));

// Sessions
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
}));

// Make session user available in all EJS views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// View engine
app.set("view engine", "ejs");

// Routes
app.use("/", authRoutes);
app.use("/", requesterRoutes);
app.use("/", approverRoutes);
app.use("/", certificateRoutes);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});