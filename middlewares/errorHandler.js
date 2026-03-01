/**
 * Global error handler (like school-system globalErrorHandler)
 */
const globalErrorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const status = statusCode >= 500 ? "failed" : "failed";
  res.status(statusCode).json({
    status,
    message: err.message || "Internal Server Error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

const pageNotFound = (req, res, next) => {
  const err = new Error(`Page ${req.originalUrl} not found`);
  err.statusCode = 404;
  next(err);
};

module.exports = { globalErrorHandler, pageNotFound };
