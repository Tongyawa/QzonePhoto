import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const STABLE_TAG_PATTERN = /^v\d+\.\d+\.\d+$/
const STABLE_POINTER_KEYS = new Set([
  'releases/latest/latest.yml',
  'releases/latest/latest-mac.yml',
  'releases/latest/latest-linux.yml',
  'manifests/latest.json'
])

/**
 * R2 维护策略：
 * - 版本目录保留不可变发布文件；不会自动删除历史版本。
 * - latest 目录只能保留三个 updater metadata 文件。
 * - 删除版本目录必须显式指定 tag，且不能是当前稳定版本。
 */
export function analyzeR2Layout({ objects, activeTag, pruneTag = '' }) {
  if (!STABLE_TAG_PATTERN.test(String(activeTag || ''))) {
    throw new Error(`Active R2 release must be a stable tag, received: ${activeTag || '(empty)'}`)
  }
  if (pruneTag && !STABLE_TAG_PATTERN.test(pruneTag)) {
    throw new Error(`Prune tag must be a stable tag, received: ${pruneTag}`)
  }
  if (pruneTag && pruneTag === activeTag) {
    throw new Error(`Refusing to prune current stable release: ${pruneTag}`)
  }

  const entries = Array.isArray(objects) ? objects : []
  const byKey = new Map()
  for (const entry of entries) {
    const key = String(entry?.Key || '')
    if (!key || byKey.has(key)) continue
    byKey.set(key, {
      key,
      size: Number.isFinite(Number(entry?.Size)) ? Number(entry.Size) : 0
    })
  }

  const missingPointers = [...STABLE_POINTER_KEYS].filter((key) => !byKey.has(key))
  if (missingPointers.length) {
    throw new Error(`R2 is missing stable pointer objects: ${missingPointers.join(', ')}`)
  }

  const legacyLatest = [...byKey.values()].filter(
    ({ key }) => key.startsWith('releases/latest/') && !STABLE_POINTER_KEYS.has(key)
  )
  const requestedVersionObjects = pruneTag
    ? [...byKey.values()].filter(
        ({ key }) => key.startsWith(`releases/${pruneTag}/`) || key === `manifests/${pruneTag}.json`
      )
    : []
  const deleteCandidates = [...legacyLatest, ...requestedVersionObjects].sort((a, b) =>
    a.key.localeCompare(b.key)
  )

  return {
    activeTag,
    pruneTag: pruneTag || null,
    totalObjects: byKey.size,
    legacyLatest,
    requestedVersionObjects,
    deleteCandidates,
    reclaimBytes: deleteCandidates.reduce((total, item) => total + item.size, 0)
  }
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((argument) => {
      const [key, ...rest] = argument.replace(/^--/, '').split('=')
      return [key, rest.join('=')]
    })
  )
  if (!args.objects) throw new Error('Missing --objects=<list-objects JSON file>')
  if (!args.activeTag) throw new Error('Missing --activeTag=<current stable tag>')

  const raw = JSON.parse(await readFile(args.objects, 'utf8'))
  const plan = analyzeR2Layout({
    objects: raw.Contents || raw,
    activeTag: args.activeTag,
    pruneTag: args.pruneTag || ''
  })
  const output = JSON.stringify(plan, null, 2)
  if (args.out) await writeFile(args.out, `${output}\n`, 'utf8')
  console.log(output)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
