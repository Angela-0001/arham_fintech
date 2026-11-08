/**
 * PullLock.js — single-document distributed lock for pull concurrency.
 *
 * One document (_id "pull-lock") holds a holder + an expiring lease. Used by
 * pullLock.js so multiple server replicas cannot run the same pull at once.
 * See pullLock.js for the acquire/renew/release logic.
 */
const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  _id:       { type: String, default: "pull-lock" },
  holder:    { type: String, default: null },
  expiresAt: { type: Date, default: null },
}, { _id: false, versionKey: false, collection: "pull_lock" });

module.exports = mongoose.model("PullLock", schema);
