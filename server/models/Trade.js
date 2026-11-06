/**
 * Trade.js — Mongoose model for a BSE trade record.
 *
 * Uses tradeId as the natural unique key (_id override) so upserts
 * are idempotent — running the same pull twice won't create duplicates.
 */

const mongoose = require("mongoose");

const tradeSchema = new mongoose.Schema(
  {
    _id:       { type: String },          // tradeId used as _id (e.g. "BSE000001")
    tradeId:   { type: String, required: true },
    client:    { type: String, required: true },
    symbol:    { type: String, required: true, index: true },
    series:    { type: String },
    tradeType: { type: String, enum: ["BUY", "SELL"], index: true },
    exchange:  { type: String },
    quantity:  { type: Number, required: true },
    price:     { type: Number, required: true },
    value:     { type: Number, required: true },
    tradeDate: { type: String },
    timestamp: { type: String, index: true },
  },
  {
    _id: false,       // we manage _id ourselves (= tradeId)
    versionKey: false,
    collection: "trades",
  }
);

// Compound index for common dashboard queries
tradeSchema.index({ symbol: 1, timestamp: -1 });
tradeSchema.index({ tradeType: 1, timestamp: -1 });

module.exports = mongoose.model("Trade", tradeSchema);
