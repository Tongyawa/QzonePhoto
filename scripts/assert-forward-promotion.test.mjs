import assert from 'node:assert/strict'
import test from 'node:test'
import { assertNoReleaseRollback } from './assert-forward-promotion.mjs'

test('allows an unchanged retry and a forward stable promotion', () => {
  assert.doesNotThrow(() => assertNoReleaseRollback('2.6.0', '2.6.0'))
  assert.doesNotThrow(() => assertNoReleaseRollback('2.6.0', '2.7.0'))
})

test('rejects an automatic stable channel rollback', () => {
  assert.throws(() => assertNoReleaseRollback('2.7.0', '2.6.0'), /older than current stable/i)
})
