import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const METADATA_NAMES = ['latest.yml', 'latest-mac.yml', 'latest-linux.yml']

export async function rebaseUpdateMetadata({ assetsDir, outDir, releasePath, fileNames }) {
  if (!/^v\d+\.\d+\.\d+$/.test(String(releasePath || ''))) {
    throw new Error(`Release path must be a stable tag, received: ${releasePath || '(empty)'}`)
  }

  const sourceDirectory = path.resolve(assetsDir || 'artifacts')
  const outputDirectory = path.resolve(outDir || 'stable-update-metadata')
  const allowedAssets = new Set(
    (fileNames || []).filter(
      (name) => name && !METADATA_NAMES.includes(name) && !name.endsWith('.blockmap')
    )
  )
  if (!allowedAssets.size) throw new Error('No verified release assets were provided')

  await mkdir(outputDirectory, { recursive: true })
  for (const metadataName of METADATA_NAMES) {
    const source = await readFile(path.join(sourceDirectory, metadataName), 'utf8')
    const rebased = rebaseMetadataContent(source, allowedAssets, releasePath, metadataName)
    await writeFile(path.join(outputDirectory, metadataName), rebased, 'utf8')
  }
}

export function rebaseMetadataContent(
  content,
  allowedAssets,
  releasePath,
  metadataName = 'metadata'
) {
  let changed = 0
  const rebased = String(content).replace(
    /^(\s*(?:-\s+)?)(url|path):[ \t]*([^#\r\n]*?)[ \t]*(\r?)$/gm,
    (line, prefix, key, rawValue, lineEnding) => {
      const assetName = rawValue.trim()
      if (!allowedAssets.has(assetName)) return line
      changed += 1
      return `${prefix}${key}: ../${releasePath}/${assetName}${lineEnding}`
    }
  )
  if (!changed) {
    throw new Error(`Updater metadata ${metadataName} did not contain a verified release asset`)
  }
  return rebased
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, ...rest] = arg.replace(/^--/, '').split('=')
      return [key, rest.join('=') || '']
    })
  )
  const fileListPath = path.resolve(args.fileList || 'verified-release-files.txt')
  const fileNames = (await readFile(fileListPath, 'utf8'))
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean)
  await rebaseUpdateMetadata({
    assetsDir: args.assets,
    outDir: args.out,
    releasePath: args.releasePath,
    fileNames
  })
  console.log(`Prepared stable updater metadata for ${args.releasePath}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
