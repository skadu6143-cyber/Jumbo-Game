'use strict';

function normalizeWord(s) {
  return s.trim().toLowerCase();
}

function scrambleWord(word) {
  const chars = word.split('');

  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  let scrambled = chars.join('');

  let attempts = 0;
  while (scrambled === word && attempts < 10) {
    for (let i = chars.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    scrambled = chars.join('');
    attempts++;
  }

  return scrambled;
}

function buildFreqMap(str) {
  const map = {};
  for (const ch of str) {
    map[ch] = (map[ch] || 0) + 1;
  }
  return map;
}

function canFormFromLetters(letters, attempt) {
  const available = buildFreqMap(letters);
  for (const ch of attempt) {
    if (!available[ch] || available[ch] <= 0) return false;
    available[ch]--;
  }
  return true;
}

module.exports = { normalizeWord, scrambleWord, canFormFromLetters, buildFreqMap };