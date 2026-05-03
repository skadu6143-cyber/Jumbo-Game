'use strict';

const { Router } = require('express');
const ctrl = require('../controllers/game.controller');

const router = Router();

router.post('/start', ctrl.startGame);
router.get('/:gameId/state', ctrl.getGameState);
router.post('/:gameId/submit', ctrl.submitWord);
router.post('/:gameId/hint', ctrl.getHint);
router.post('/:gameId/end', ctrl.endGame);

module.exports = router;