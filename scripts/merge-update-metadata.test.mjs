import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeMetadataDocuments } from './merge-update-metadata.mjs'

const sha512 = `${'A'.repeat(86)}==`

function metadata(path, version, filenames, defaultFilename = filenames[0]) {
  return {
    path,
    content: [
      `version: ${version}`,
      'files:',
      ...filenames.flatMap((filename, index) => [
        `  - url: ${filename}`,
        `    sha512: ${sha512}`,
        `    size: ${100 + index}`
      ]),
      `path: ${defaultFilename}`,
      `sha512: ${sha512}`,
      'releaseNotes: |-',
      '  Test release notes'
    ].join('\n')
  }
}

test('merges Windows architecture metadata without replacing the preferred default installer', () => {
  const version = '2.7.1'
  const defaultInstaller = `QzonePhoto-${version}-win-setup.exe`
  const x64Installer = `QzonePhoto-${version}-win-x64-setup.exe`
  const ia32Installer = `QzonePhoto-${version}-win-ia32-setup.exe`
  const merged = mergeMetadataDocuments([
    metadata('windows-ia32/latest.yml', version, [ia32Installer], ia32Installer),
    metadata('windows-x64/latest.yml', version, [defaultInstaller, x64Installer], defaultInstaller)
  ])

  assert.match(merged, new RegExp(`path: ${defaultInstaller}`))
  for (const filename of [defaultInstaller, x64Installer, ia32Installer]) {
    assert.match(merged, new RegExp(`- url: ${filename}`))
  }
  assert.equal((merged.match(/^\s{2}- url:/gm) || []).length, 3)
})

test('refuses cross-version or duplicate update metadata before any release upload', () => {
  const first = metadata('windows-x64/latest.yml', '2.7.1', ['QzonePhoto-2.7.1-win-x64-setup.exe'])
  const differentVersion = metadata('windows-ia32/latest.yml', '2.7.2', [
    'QzonePhoto-2.7.2-win-ia32-setup.exe'
  ])
  const duplicate = metadata('windows-copy/latest.yml', '2.7.1', [
    'QzonePhoto-2.7.1-win-x64-setup.exe'
  ])

  assert.throws(() => mergeMetadataDocuments([first, differentVersion]), /different versions/i)
  assert.throws(() => mergeMetadataDocuments([first, duplicate]), /duplicate update file/i)
})
