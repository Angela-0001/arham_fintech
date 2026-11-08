/**
 * db.js — MongoDB connection via Mongoose.
 *
 * Call connectDB() once at startup. The connection is shared across
 * all modules via Mongoose's singleton connection pool.
 */

const mongoose = require("mongoose");

let isConnected = false;

async function connectDB() {
  if (isConnected) return;

  const uri = process.env.MONGO_URI;
  if (!uri) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("FATAL: MONGO_URI must be set in production.");
    }
    console.warn("[DB] MONGO_URI not set — running without persistence.");
    return;
  }

  try {
    await mongoose.connect(uri, {
      dbName: "bse_trades",          // explicit db name
      serverSelectionTimeoutMS: 8000,
      socketTimeoutMS: 45000,
    });
    isConnected = true;
    console.log("[DB] Connected to MongoDB Atlas ✓");
  } catch (err) {
    console.error("[DB] Connection failed:", err.message);
    console.warn("[DB] Falling back to in-memory mode.");
  }
}

function isDbConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}

module.exports = { connectDB, isDbConnected };
