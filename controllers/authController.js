const bcrypt = require("bcrypt");
const User = require("../models/User");

const getLoginPage = (req, res) => {
  if (req.session.user) {
    return res.redirect("/dashboard");
  }

  res.render("login", { error: null });
};

const loginUser = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.render("login", { error: "Please enter username and password" });
    }

    const user = await User.findOne({ username });

    if (!user) {
      return res.render("login", { error: "Invalid username or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.render("login", { error: "Invalid username or password" });
    }

    req.session.user = {
      id: user._id,
      username: user.username,
      role: user.role,
    };

    return res.redirect("/dashboard");
  } catch (error) {
    console.error("Login error:", error.message);
    return res.render("login", { error: "Something went wrong during login" });
  }
};

const logoutUser = (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error("Logout error:", error.message);
      return res.status(500).send("Error logging out");
    }

    res.redirect("/");
  });
};

const getDashboard = (req, res) => {
  if (!req.session.user) {
    return res.redirect("/");
  }

  res.render("dashboard", { user: req.session.user });
};

module.exports = {
  getLoginPage,
  loginUser,
  logoutUser,
  getDashboard,
};