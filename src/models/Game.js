'use strict';

const mongoose = require('mongoose');

const roundSchema = new mongoose.Schema(
  {
    baseWordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Word',
      required: true,
    },
    baseWordText: {
      type: String,
      required: true,
    },
    letters: {
      type: String,
      required: true,
    },
    endsAt: {
      type: Date,
      required: true,
    },
    submissions: {
      type: [String],
      default: [],
    },
    correctSubmissions: {
      type: [String],
      default: [],
    },
    targetCount: {
      type: Number,
      default: 4,
    },
    minWordLength: {
      type: Number,
      default: 3,
    },
  },
  { _id: true }
);

const gameSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['active', 'ended'],
      default: 'active',
    },
    hintsRemaining: {
      type: Number,
      default: 3,
    },
    score: {
      type: Number,
      default: 0,
    },
    currentRoundIndex: {
      type: Number,
      default: 0,
    },
    rounds: [roundSchema],
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

gameSchema.virtual('currentRound').get(function () {
  return this.rounds[this.currentRoundIndex];
});

module.exports = mongoose.model('Game', gameSchema);