'use strict';

const mongoose = require('mongoose');

const wordSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    length: {
      type: Number,
      required: true,
    },
  },
  {
    versionKey: false,
  }
);

wordSchema.pre('save', function (next) {
  this.length = this.text.length;
  next();
});

module.exports = mongoose.model('Word', wordSchema);