// The run-over screen sums up the run in plain words, and never says "0 of 0".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSummary } from '../src/ink.js';

const stats = (readsBeaten, reads, guessesBeaten, guesses) => ({ readsBeaten, reads, guessesBeaten, guesses });

test('reads and guesses both happened', () => {
  assert.equal(runSummary(stats(2, 5, 3, 6)), 'This run you beat 2 of 5 reads and dodged 3 of 6 guesses.');
});

test('no reads: it says the rival never read you, not "0 of 0"', () => {
  assert.equal(runSummary(stats(0, 0, 3, 6)), 'It never read you this run. You dodged 3 of 6 guesses.');
});

test('no guesses: only the reads are mentioned', () => {
  assert.equal(runSummary(stats(1, 4, 0, 0)), 'This run you beat 1 of 4 reads.');
});

test('nothing happened: no numbers at all', () => {
  assert.equal(runSummary(stats(0, 0, 0, 0)), 'It never read you this run.');
});

test('one read and one guess use the singular', () => {
  assert.equal(runSummary(stats(1, 1, 0, 1)), 'This run you beat 1 of 1 read and dodged 0 of 1 guess.');
});
