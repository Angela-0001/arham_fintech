/**
 * PullCheckpoint.js
 * Stores only tradeIds (not full trade objects) to stay well under
 * MongoDB's 16MB document limit. On resume, trades are regenerated
 * from the deterministic seed and matched by ID. (Fix #3)
 */
const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  _id:           { type: String, default: "singleton" },
  state:         { type: String, enum: ["running","completed","failed"], default: "running" },
  totalRecords:  Number,
  pulledRecords: Number,
  batchNumber:   Number,
  totalBatches:  Number,
  startedAt:     String,
  updatedAt:     String,
  stagedTradeIds: { type: [String], default: [] }, // compact: IDs only
}, { _id: false, versionKey: false, collection: "pull_checkpoint" });

module.exports = mongoose.model("PullCheckpoint", schema);
