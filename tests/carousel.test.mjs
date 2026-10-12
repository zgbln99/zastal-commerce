import test from 'node:test';
import assert from 'node:assert/strict';

import { nextSlide, autoplayAllowed, swipeDirection } from '../storefront/lib/carousel.mjs';
const ready = { count: 3, paused: false, reducedMotion: false, visible: true, hovered: false, focused: false, overlayOpen: false };

test('collection navigation wraps in both directions and stays on a single slide', () => {
  assert.equal(nextSlide(2, 1, 3), 0);
  assert.equal(nextSlide(0, -1, 3), 2);
  assert.equal(nextSlide(0, 1, 1), 0);
  assert.equal(nextSlide(0, -1, 0), 0);
});
test('automatic changes respect the visitor pause and reduced motion preferences', () => {
  assert.equal(autoplayAllowed(ready), true);
  assert.equal(autoplayAllowed({ ...ready, paused: true }), false);
  assert.equal(autoplayAllowed({ ...ready, reducedMotion: true }), false);
});
test('automatic changes stop while the visitor reads, focuses, or uses an overlay', () => {
  for (const flag of ['hovered', 'focused', 'overlayOpen']) assert.equal(autoplayAllowed({ ...ready, [flag]: true }), false, flag);
});
test('automatic changes stop in a hidden tab or without another collection', () => {
  assert.equal(autoplayAllowed({ ...ready, visible: false }), false);
  assert.equal(autoplayAllowed({ ...ready, count: 1 }), false);
  assert.equal(autoplayAllowed({ ...ready, count: 0 }), false);
});
test('horizontal swipes advance or return to the preceding collection', () => {
  assert.equal(swipeDirection(280, 200, 180, 210), 1);
  assert.equal(swipeDirection(100, 200, 210, 195), -1);
});
test('scrolling, small taps and diagonal gestures do not change collections', () => {
  assert.equal(swipeDirection(100, 100, 110, 210), 0);
  assert.equal(swipeDirection(100, 100, 125, 101), 0);
  assert.equal(swipeDirection(200, 100, 130, 185), 0);
});
test('owner autoplay preference disables timing without disabling manual navigation', () => {
  assert.equal(autoplayAllowed({ ...ready, autoplay: false }), false);
  assert.equal(autoplayAllowed({ ...ready, autoplay: true }), true);
  assert.equal(nextSlide(1, 1, 3), 2);
});
