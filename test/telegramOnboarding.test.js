const assert = require('node:assert/strict');
const test = require('node:test');
const { emptyOnboarding, onboardingView, applyOnboardingAction, onboardingSummary } = require('../src/telegramOnboarding');

test('Telegram onboarding presents ten short button steps', () => {
  let state = emptyOnboarding();
  assert.match(onboardingView(state).text, /Шаг 1 из 10/);
  let result = applyOnboardingAction(state, 'next');
  assert.match(result.error, /хотя бы одну тему/);
  state = applyOnboardingAction(state, 'topic:politika').state;
  state = applyOnboardingAction(state, 'topic:rabota').state;
  state = applyOnboardingAction(state, 'next').state;
  assert.equal(state.step, 1);
  assert.deepEqual(state.topics, ['politika', 'rabota']);
  assert.match(onboardingView({ ...state, step: 9 }).text, /Шаг 10 из 10/);
});

test('Telegram onboarding collects delivery, words and grocery preferences', () => {
  let state = { ...emptyOnboarding(), step: 2, topics: ['ekonomika'] };
  state = applyOnboardingAction(state, 'frequency:daily').state;
  state = applyOnboardingAction(state, 'max:3').state;
  state = applyOnboardingAction(state, 'time:18:00').state;
  state = applyOnboardingAction(state, 'importance:important').state;
  state = applyOnboardingAction(state, 'word:yes').state;
  state = applyOnboardingAction(state, 'level:B1-B2').state;
  state = applyOnboardingAction(state, 'next').state;
  state = applyOnboardingAction(state, 'offers:yes').state;
  state = applyOnboardingAction(state, 'chain:prisma').state;
  const completed = applyOnboardingAction(state, 'finish');
  assert.equal(completed.finished, true);
  assert.equal(completed.state.time, '18:00');
  assert.equal(completed.state.word, true);
  assert.equal(completed.state.offers, true);
  assert.ok(completed.state.levels.includes('B1-B2'));
  assert.deepEqual(completed.state.chains, ['prisma']);
  const summary = onboardingSummary(completed.state, 'https://finskienovosti.fi');
  assert.match(summary, /персональная лента готова/i);
  assert.match(summary, /конкретные источники новостей/);
  assert.match(summary, /тихие часы/);
  assert.match(summary, /https:\/\/finskienovosti\.fi\/account/);
});

test('Telegram onboarding finishes immediately when grocery offers are declined', () => {
  const state = { ...emptyOnboarding(), step: 8, topics: ['obshchestvo'], chains: ['lidl'] };
  const completed = applyOnboardingAction(state, 'offers:no');
  assert.equal(completed.finished, true);
  assert.equal(completed.state.offers, false);
  assert.deepEqual(completed.state.chains, []);
  assert.equal(completed.state.step, 8);
});
