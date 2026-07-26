import assert from 'node:assert/strict'
import test from 'node:test'
import { compareReleaseManifest } from './reconcile-release-manifest.mjs'

function manifest({
  generatedAt,
  r2Url = 'https://dl.qzonephoto.getgit.one/releases/v2.7.1/app.exe'
} = {}) {
  return {
    tag: 'v2.7.1',
    version: '2.7.1',
    generatedAt: generatedAt || '2026-07-01T00:00:00.000Z',
    githubReleaseUrl: 'https://github.com/11273/QzonePhoto/releases/tag/v2.7.1',
    assets: [
      {
        id: 'windows-x64-setup',
        os: 'windows',
        arch: 'x64',
        type: 'setup',
        filename: 'app.exe',
        size: 123,
        sha256: 'abc',
        r2Url,
        githubUrl: 'https://github.com/11273/QzonePhoto/releases/download/v2.7.1/app.exe'
      }
    ]
  }
}

test('allows an existing immutable manifest that differs only by promotion timestamp', () => {
  assert.doesNotThrow(() =>
    compareReleaseManifest(
      manifest({ generatedAt: '2026-07-02T00:00:00.000Z' }),
      manifest({ generatedAt: '2026-07-01T00:00:00.000Z' })
    )
  )
})

test('rejects an existing same-tag manifest that points to different release data', () => {
  assert.throws(
    () =>
      compareReleaseManifest(
        manifest(),
        manifest({ r2Url: 'https://dl.qzonephoto.getgit.one/releases/latest/app.exe' })
      ),
    /does not describe the same release assets/i
  )
})
