const mongoose = require("mongoose");

const qrScanSchema = new mongoose.Schema(
  {
    // ── Relations ─────────────────────────────────────────
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
    },
    campaign: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Campaign",
      required: true,
    },

    // ── Session link ──────────────────────────────────────
    // If patient goes on to start quiz, we link the attempt
    quizAttempt: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "QuizAttempt",
      default: null,
    },
    sessionId: {
      type: String,
      trim: true,
      default: null,
    },

    // ── Location ──────────────────────────────────────────
    city: {
      type: String,
      trim: true,
      default: null,
    },
    state: {
      type: String,
      trim: true,
      default: null,
    },
    ipAddress: {
      type: String,
      trim: true,
      default: null,
    },

    // ── Device ────────────────────────────────────────────
    deviceType: {
      type: String,
      enum: ["mobile", "desktop", "tablet", "unknown"],
      default: "unknown",
    },
    userAgent: {
      type: String,
      default: null,
    },

    // ── Conversion ────────────────────────────────────────
    // Did this scan lead to a quiz attempt?
    converted: {
      type: Boolean,
      default: false,
    },

    scannedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// ── Indexes for map/location analytics ───────────────────
qrScanSchema.index({ doctor: 1, scannedAt: -1 });
qrScanSchema.index({ campaign: 1, scannedAt: -1 });
qrScanSchema.index({ state: 1, city: 1 });

module.exports = mongoose.model("QRScan", qrScanSchema);