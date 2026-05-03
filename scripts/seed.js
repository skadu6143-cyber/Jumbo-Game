'use strict';

// ─────────────────────────────────────────────────────────────
// SEED SCRIPT — Global Dictionary
// Uses the 'an-array-of-english-words' npm package which contains
// 274,000+ lowercase English words (based on SCOWL word list,
// same source as many spell-checkers and Scrabble dictionaries).
//
// Run:  npm install an-array-of-english-words
// Then: npm run seed
// ─────────────────────────────────────────────────────────────

require('dotenv').config();
const mongoose = require('mongoose');
const Word     = require('../src/models/Word');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jumbo_word_game';

async function seed() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅  Connected to MongoDB');

    // Load the full English word list
    const allWords = require('an-array-of-english-words');

    // Filter: only 3–12 letter lowercase words (no proper nouns, no symbols)
    const filtered = allWords.filter(w =>
      w.length >= 3 &&
      w.length <= 12 &&
      /^[a-z]+$/.test(w)
    );

    console.log(`📖  Total words to seed: ${filtered.length.toLocaleString()}`);
    console.log('⏳  Seeding in batches (this may take 30–60 seconds)...');

    // Bulk upsert in batches of 2000 to avoid hitting MongoDB limits
    const BATCH = 2000;
    let inserted = 0;
    let modified = 0;

    for (let i = 0; i < filtered.length; i += BATCH) {
      const batch = filtered.slice(i, i + BATCH);
      const ops   = batch.map(text => ({
        updateOne: {
          filter: { text },
          update: { $set: { text, length: text.length } },
          upsert: true,
        },
      }));
      const result = await Word.bulkWrite(ops, { ordered: false });
      inserted += result.upsertedCount;
      modified += result.modifiedCount;

      // Progress indicator every 10 batches
      if ((i / BATCH) % 10 === 0) {
        process.stdout.write(`\r   Progress: ${Math.min(i + BATCH, filtered.length).toLocaleString()} / ${filtered.length.toLocaleString()}`);
      }
    }

    console.log(`\n\n📚  Seed complete!`);
    console.log(`    Inserted : ${inserted.toLocaleString()}`);
    console.log(`    Modified : ${modified.toLocaleString()}`);
    console.log(`    Total in DB: ${(await Word.countDocuments()).toLocaleString()}`);

  } catch (err) {
    console.error('❌  Seed failed:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('👋  Disconnected from MongoDB');
  }
}

seed();