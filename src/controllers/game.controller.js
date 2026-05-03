'use strict';

const Game = require('../models/Game');
const Word = require('../models/Word');
const { normalizeWord, scrambleWord, canFormFromLetters } = require('../utils/wordUtils');

function httpError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function formatRound(round) {
  return {
    roundId: round._id,
    letters: round.letters,
    endsAt: round.endsAt,
    targetCount: round.targetCount,
    minWordLength: round.minWordLength,
    correctSubmissions: round.correctSubmissions,
  };
}

async function startGame(req, res, next) {
  try {
    const [baseWord] = await Word.aggregate([
      { $match: { length: { $gte: 5 } } },
      { $sample: { size: 1 } },
    ]);

    if (!baseWord) {
      return next(httpError('No words found in dictionary. Run npm run seed first.', 500));
    }

    const scrambled = scrambleWord(baseWord.text);

    const ROUND_DURATION_MS = 2 * 60 * 1000;
    const endsAt = new Date(Date.now() + ROUND_DURATION_MS);

    const game = new Game({
      status: 'active',
      hintsRemaining: 3,
      score: 0,
      currentRoundIndex: 0,
      rounds: [
        {
          baseWordId: baseWord._id,
          baseWordText: baseWord.text,
          letters: scrambled,
          endsAt,
          targetCount: 4,
          minWordLength: 3,
        },
      ],
    });

    await game.save();

    const round = game.rounds[0];

    res.status(201).json({
      gameId: game._id,
      score: game.score,
      hintsRemaining: game.hintsRemaining,
      round: formatRound(round),
    });
  } catch (err) {
    next(err);
  }
}

async function getGameState(req, res, next) {
  try {
    const game = await Game.findById(req.params.gameId);
    if (!game) return next(httpError('Game not found.', 404));

    const round = game.rounds[game.currentRoundIndex];

    res.json({
      gameId: game._id,
      status: game.status,
      score: game.score,
      hintsRemaining: game.hintsRemaining,
      round: formatRound(round),
    });
  } catch (err) {
    next(err);
  }
}

async function submitWord(req, res, next) {
  try {
    const { roundId, word } = req.body;
    if (!roundId || !word) return next(httpError('roundId and word are required.'));

    const game = await Game.findById(req.params.gameId);
    if (!game) return next(httpError('Game not found.', 404));
    if (game.status === 'ended') return next(httpError('Game has already ended.'));

    const round = game.rounds[game.currentRoundIndex];

    if (round._id.toString() !== roundId) {
      return next(httpError('Invalid roundId.'));
    }

    if (Date.now() > round.endsAt.getTime()) {
      return next(httpError('Time is up! Round has ended.', 403));
    }

    const normalized = normalizeWord(word);

    if (normalized.length < round.minWordLength) {
      return next(httpError(`Word must be at least ${round.minWordLength} characters.`));
    }

    if (round.submissions.includes(normalized)) {
      return next(httpError('Word already submitted.'));
    }

    round.submissions.push(normalized);

    if (!canFormFromLetters(round.letters, normalized)) {
      await game.save();
      return res.json({
        result: { accepted: false, reason: 'Cannot form word from available letters.' },
        score: game.score,
        round: formatRound(round),
      });
    }

    const dictWord = await Word.findOne({ text: normalized });
    if (!dictWord) {
      await game.save();
      return res.json({
        result: { accepted: false, reason: 'Word not in dictionary.' },
        score: game.score,
        round: formatRound(round),
      });
    }

    round.correctSubmissions.push(normalized);
    game.score += normalized.length;

    const cleared = round.correctSubmissions.length >= round.targetCount;

    await game.save();

    res.json({
      result: { accepted: true, cleared },
      score: game.score,
      round: formatRound(round),
    });
  } catch (err) {
    next(err);
  }
}

async function getHint(req, res, next) {
  try {
    const { roundId } = req.body;
    if (!roundId) return next(httpError('roundId is required.'));

    const game = await Game.findById(req.params.gameId);
    if (!game) return next(httpError('Game not found.', 404));
    if (game.status === 'ended') return next(httpError('Game has already ended.'));

    if (game.hintsRemaining <= 0) {
      return next(httpError('No hints remaining.', 403));
    }

    const round = game.rounds[game.currentRoundIndex];
    if (round._id.toString() !== roundId) return next(httpError('Invalid roundId.'));
    if (Date.now() > round.endsAt.getTime()) return next(httpError('Time is up!', 403));

    const candidates = await Word.find({
      length: { $gte: round.minWordLength, $lte: round.letters.length },
      text: { $nin: round.correctSubmissions },
    }).lean();

    const valid = candidates.filter((w) => canFormFromLetters(round.letters, w.text));

    if (valid.length === 0) {
      return next(httpError('No hints available — you may have found all possible words!'));
    }

    const hint = valid[Math.floor(Math.random() * valid.length)];

    game.hintsRemaining -= 1;
    await game.save();

    res.json({
      hint: { word: hint.text },
      hintsRemaining: game.hintsRemaining,
    });
  } catch (err) {
    next(err);
  }
}

async function endGame(req, res, next) {
  try {
    const game = await Game.findById(req.params.gameId);
    if (!game) return next(httpError('Game not found.', 404));
    if (game.status === 'ended') return next(httpError('Game is already ended.'));

    game.status = 'ended';
    await game.save();

    const round = game.rounds[game.currentRoundIndex];

    res.json({
      message: 'Game ended.',
      finalScore: game.score,
      correctSubmissions: round.correctSubmissions,
      totalSubmissions: round.submissions.length,
      baseWord: round.baseWordText,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { startGame, getGameState, submitWord, getHint, endGame };