import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

export function compareReleaseManifest(candidate, existing) {
  const normalizedCandidate = normalizeManifest(candidate, 'candidate')
  const normalizedExisting = normalizeManifest(existing, 'existing')
  if (JSON.stringify(normalizedCandidate) !== JSON.stringify(normalizedExisting)) {
    throw new Error(
      'Existing versioned manifest does not describe the same release assets; create a new patch version instead.'
    )
  }
  return normalizedExisting
}

function normalizeManifest(value, label) {
  const tag = String(value?.tag || '')
  const version = String(value?.version || '')
  const githubReleaseUrl = String(value?.githubReleaseUrl || '')
  if (!/^v\d+\.\d+\.\d+$/.test(tag) || version !== tag.slice(1) || !githubReleaseUrl) {
    throw new Error(`${label} manifest has an invalid release identity`)
  }
  if (!Array.isArray(value?.assets) || !value.assets.length) {
    throw new Error(`${label} manifest has no release assets`)
  }

  const filenames = new Set()
  const assets = value.assets
    .map((asset) => {
      const filename = String(asset?.filename || '')
      if (!filename || filenames.has(filename)) {
        throw new Error(`${label} manifest has a missing or duplicate asset filename`)
      }
      filenames.add(filename)
      return {
        id: String(asset?.id || ''),
        os: String(asset?.os || ''),
        arch: String(asset?.arch || ''),
        type: String(asset?.type || ''),
        filename,
        size: Number(asset?.size || 0),
        sha256: String(asset?.sha256 || ''),
        r2Url: String(asset?.r2Url || ''),
        githubUrl: String(asset?.githubUrl || '')
      }
    })
    .sort((left, right) => left.filename.localeCompare(right.filename))

  if (assets.some((asset) => !Number.isSafeInteger(asset.size) || asset.size <= 0)) {
    throw new Error(`${label} manifest has an invalid asset size`)
  }

  // generatedAt represents the time a manifest was first promoted, rather than a package identity.
  // Ignoring it lets a legacy same-byte release be re-promoted safely without replacing an
  // immutable object solely because its timestamp format changed.
  return { tag, version, githubReleaseUrl, assets }
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((argument) => {
      const [key, ...rest] = argument.replace(/^--/, '').split('=')
      return [key, rest.join('=')]
    })
  )
  if (!args.candidate || !args.existing) {
    throw new Error('Usage: --candidate=<manifest.json> --existing=<manifest.json>')
  }
  const [candidate, existing] = await Promise.all(
    [args.candidate, args.existing].map(async (file) => JSON.parse(await readFile(file, 'utf8')))
  )
  compareReleaseManifest(candidate, existing)
  console.log('Existing versioned manifest matches the selected release assets.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
