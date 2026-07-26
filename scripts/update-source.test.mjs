import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getUpdateCheckRoute,
  matchesPinnedUpdateCandidate,
  selectCompatibleUpdateFile,
  UPDATE_CHECK_ROUTE
} from '../src/main/core/update-source.js'

const sha512 = `${'A'.repeat(86)}==`

function windowsAsset(version = '2.7.1', overrides = {}) {
  return {
    url: `../v${version}/QzonePhoto-${version}-win-x64-setup.exe`,
    size: 123456,
    sha512,
    ...overrides
  }
}

test('routes every R2 result deterministically before considering GitHub', () => {
  const updateInfo = { version: '2.7.1', files: [windowsAsset()] }
  const candidate = { updateInfo }

  assert.equal(
    getUpdateCheckRoute({ isUpdateAvailable: true, updateInfo }, candidate),
    UPDATE_CHECK_ROUTE.R2_UPDATE
  )
  assert.equal(
    getUpdateCheckRoute({ isUpdateAvailable: false, updateInfo }, null),
    UPDATE_CHECK_ROUTE.R2_CURRENT
  )
  assert.equal(getUpdateCheckRoute(null, null), UPDATE_CHECK_ROUTE.GITHUB_FALLBACK)
  assert.equal(
    getUpdateCheckRoute({ isUpdateAvailable: true, updateInfo }, null),
    UPDATE_CHECK_ROUTE.GITHUB_FALLBACK
  )
})

test('only accepts the exact versioned R2 asset for the current platform', () => {
  const architecture = { platform: 'win32', arch: 'x64' }
  const expected = windowsAsset()

  assert.deepEqual(selectCompatibleUpdateFile([expected], architecture, '2.7.1'), expected)
  assert.equal(selectCompatibleUpdateFile([windowsAsset('2.7.0')], architecture, '2.7.1'), null)
  assert.equal(
    selectCompatibleUpdateFile(
      [windowsAsset('2.7.1', { url: 'https://example.invalid/update.exe' })],
      architecture,
      '2.7.1'
    ),
    null
  )
  assert.equal(
    selectCompatibleUpdateFile(
      [windowsAsset('2.7.1', { url: '../v2.7.1/../../unexpected.exe' })],
      architecture,
      '2.7.1'
    ),
    null
  )
})

test('GitHub download fallback must match the already selected R2 package exactly', () => {
  const architecture = { platform: 'win32', arch: 'x64' }
  const r2 = { version: '2.7.1', files: [windowsAsset()] }
  const github = {
    version: '2.7.1',
    files: [windowsAsset('2.7.1', { url: 'QzonePhoto-2.7.1-win-x64-setup.exe' })]
  }

  assert.equal(matchesPinnedUpdateCandidate(r2, github, architecture), true)
  assert.equal(
    matchesPinnedUpdateCandidate(r2, { ...github, version: '2.7.2' }, architecture),
    false
  )
  assert.equal(
    matchesPinnedUpdateCandidate(
      r2,
      { ...github, files: [windowsAsset('2.7.1', { size: 123457 })] },
      architecture
    ),
    false
  )
})
