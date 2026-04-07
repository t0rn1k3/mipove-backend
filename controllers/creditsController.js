const Master = require("../models/Master");
const asyncHandler = require("express-async-handler");

// @desc    Current credit balance for logged-in master
// @route   GET /api/credits/balance
// @access  Private (master)
const getBalance = asyncHandler(async (req, res) => {
  const master = await Master.findById(req.user._id).select("credits").lean();
  if (!master) {
    const err = new Error("Master not found");
    err.statusCode = 404;
    throw err;
  }
  const balance =
    typeof master.credits === "number" && Number.isFinite(master.credits)
      ? master.credits
      : 0;
  res.json({ balance });
});

module.exports = {
  getBalance,
};
