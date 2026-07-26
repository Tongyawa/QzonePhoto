import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeR2Layout } from './audit-r2-layout.mjs'

const requiredPointers = [
  'releases/latest/latest.yml',
  'releases/latest/latest-mac.yml',
  'releases/latest/latest-linux.yml',
  'manifests/latest.json'
]

function object(Key, Size = 1) {
  return { Key, Size }
}

test('only marks legacy latest copies and an explicit non-active version for deletion', () => {
  const plan = analyzeR2Layout({
    activeTag: 'v2.6.0',
    pruneTag: 'v2.7.0',
    objects: [
      ...requiredPointers.map((key) => object(key)),
      object('releases/latest/QzonePhoto-2.7.0-win-x64-setup.exe', 100),
      object('releases/v2.7.0/QzonePhoto-2.7.0-win-x64-setup.exe', 101),
      object('manifests/v2.7.0.json', 2),
      object('releases/v2.5.0/QzonePhoto-2.5.0-win-x64-setup.exe', 99)
    ]
  })

  assert.deepEqual(
    plan.deleteCandidates.map((item) => item.key),
    [
      'manifests/v2.7.0.json',
      'releases/latest/QzonePhoto-2.7.0-win-x64-setup.exe',
      'releases/v2.7.0/QzonePhoto-2.7.0-win-x64-setup.exe'
    ]
  )
  assert.equal(plan.reclaimBytes, 203)
})

test('refuses to delete the active release or operate with missing pointers', () => {
  assert.throws(
    () =>
      analyzeR2Layout({
        activeTag: 'v2.6.0',
        pruneTag: 'v2.6.0',
        objects: requiredPointers.map((key) => object(key))
      }),
    /current stable release/i
  )
  assert.throws(
    () => analyzeR2Layout({ activeTag: 'v2.6.0', objects: [] }),
    /missing stable pointer/i
  )
})
