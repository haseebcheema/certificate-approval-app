const isAuthenticated = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect("/");
  }
  next();
};

const isRequester = (req, res, next) => {
  if (!req.session.user || req.session.user.role !== "requester") {
    return res.status(403).send("Access denied: Requester only");
  }
  next();
};

const isApprover = (req, res, next) => {
  if (!req.session.user || req.session.user.role !== "approver") {
    return res.status(403).send("Access denied: Approver only");
  }
  next();
};

module.exports = {
  isAuthenticated,
  isRequester,
  isApprover,
};