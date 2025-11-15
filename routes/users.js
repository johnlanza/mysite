const express = require("express");
const router = express.Router();
const User = require("../models/users");
const catchAsync = require("../utils/catchAsync");
const passport = require("passport");

// ----------------------------
// Registration Routes
// ----------------------------
router.get("/register", (req, res) => {
  res.render("users/register");
});

router.post(
  "/register",
  catchAsync(async (req, res) => {
    try {
      const { email, username, password } = req.body;
      const user = new User({ email, username });

      const registeredUser = await User.register(user, password);
      console.log("Registered user:", registeredUser);

      req.flash("success", "Account created! You can now log in.");
      res.redirect("/login");
    } catch (e) {
      req.flash("error", e.message);
      res.redirect("/register");
    }
  })
);

// ----------------------------
// Login Routes
// ----------------------------
router.get("/login", (req, res) => {
  res.render("users/login");
});

router.post(
  "/login",
  passport.authenticate("local", {
    failureFlash: true,
    failureRedirect: "/login",
  }),
  (req, res) => {
    req.flash("success", `Welcome back, ${req.user.username}!`);

    // Support redirecting to the page the user originally wanted
    const redirectUrl = req.session.returnTo || "/";
    delete req.session.returnTo;

    res.redirect(redirectUrl);
  }
);

// ----------------------------
// Logout Route
// ----------------------------
router.get("/logout", (req, res, next) => {
  req.logout(function (err) {
    if (err) return next(err);
    req.flash("success", "You have been logged out.");
    res.redirect("/");
  });
});

module.exports = router;
