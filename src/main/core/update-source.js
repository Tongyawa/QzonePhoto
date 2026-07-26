export const OFFICIAL_UPDATE_SOURCES = Object.freeze({
  r2FeedUrl: 'https://dl.qzonephoto.getgit.one/releases/latest',
  github: Object.freeze({
    owner: '11273',
    repo: 'QzonePhoto',
    releaseType: 'release'
  })
})

export function isStableReleaseVersion(value) {
  return /^\d+\.\d+\.\d+$/.test(String(value || '').trim())
}

/**
 * R2 是唯一的常规更新源。R2 已完整回答“有更新”或“已是最新版”后，
 * 不再额外访问 GitHub；GitHub 仅在 R2 不可用、元数据无效或缺少当前架构
 * 所需文件时接管，避免未同步到 R2 的验证版提前影响普通用户。
 */
/**
 * 更新检查必须只走一条确定路径：R2 是常规通道，GitHub 只在 R2 无法
 * 给出可用结果时才接管。不能把「R2 有新版本」和「R2 已是最新版」合并
 * 成同一个状态，否则调用方容易把空候选当作新版本处理。
 */
export const UPDATE_CHECK_ROUTE = Object.freeze({
  R2_UPDATE: 'r2-update',
  R2_CURRENT: 'r2-current',
  GITHUB_FALLBACK: 'github-fallback'
})

export function getUpdateCheckRoute(r2Result, r2Candidate) {
  if (r2Candidate) return UPDATE_CHECK_ROUTE.R2_UPDATE
  if (isStableReleaseVersion(r2Result?.updateInfo?.version) && !r2Result?.isUpdateAvailable) {
    return UPDATE_CHECK_ROUTE.R2_CURRENT
  }
  return UPDATE_CHECK_ROUTE.GITHUB_FALLBACK
}

const OFFICIAL_ASSET_FILENAME = /^qzonephoto-[a-z0-9][a-z0-9._-]*\.(?:exe|zip|dmg|appimage|deb)$/i
const VERSIONED_R2_ASSET_PATH =
  /^\.\.\/v(\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?)\/(qzonephoto-[a-z0-9][a-z0-9._-]*\.(?:exe|zip|dmg|appimage|deb))$/i

function getOfficialAssetFilename(value) {
  const url = String(value || '').trim()
  if (OFFICIAL_ASSET_FILENAME.test(url)) return url

  const matched = url.match(VERSIONED_R2_ASSET_PATH)
  return matched?.[2] || ''
}

/**
 * generic 更新源会将 `releases/latest/latest.yml` 中的版本化文件写成
 * `../vX.Y.Z/...`。只允许这一种严格的相对路径，既不允许任意跳转，
 * 也不因 R2 的正常目录结构而忽略可用更新。
 */
function isSafeAssetUrl(value, expectedVersion) {
  const url = String(value || '').trim()
  if (!url || /:\/\/|[?#]/.test(url)) return false
  if (OFFICIAL_ASSET_FILENAME.test(url)) return true

  const matched = url.match(VERSIONED_R2_ASSET_PATH)
  return Boolean(matched && (!expectedVersion || matched[1] === String(expectedVersion).trim()))
}

function isValidSha512(value) {
  return /^[A-Za-z0-9+/]{86}==$/.test(String(value || '').trim())
}

function isValidAsset(file, expectedVersion) {
  return (
    file &&
    isSafeAssetUrl(file.url, expectedVersion) &&
    OFFICIAL_ASSET_FILENAME.test(getOfficialAssetFilename(file.url)) &&
    Number.isSafeInteger(Number(file.size)) &&
    Number(file.size) > 0 &&
    isValidSha512(file.sha512)
  )
}

function matchesFilename(file, expressions) {
  const filename = getOfficialAssetFilename(file?.url).toLowerCase()
  return expressions.every((expression) => expression.test(filename))
}

/**
 * 只接受当前系统可自动安装的、明确标注架构的更新包。
 * 不接受无架构后缀的旧安装包，也不允许元数据将下载跳转到其他主机。
 */
export function selectCompatibleUpdateFile(files, architecture, expectedVersion) {
  if (!Array.isArray(files)) return null

  const platform = architecture?.platform
  const arch = architecture?.arch
  const matchers = {
    win32: {
      x64: [/win[-_]x64|x64[-_]setup/, /\.exe$/],
      x86: [/win[-_](?:ia32|x86)|(?:ia32|x86)[-_]setup/, /\.exe$/],
      arm64: [/win[-_]arm64|arm64[-_]setup/, /\.exe$/]
    },
    darwin: {
      x64: [/(?:mac|darwin)[-_]x64|x64\.(?:zip)$/i, /\.zip$/],
      arm64: [/(?:mac|darwin)[-_]arm64|arm64\.(?:zip)$/i, /\.zip$/]
    },
    linux: {
      x64: [/(?:linux[-_])?(?:x86_64|amd64|x64)/, /\.appimage$/]
    }
  }

  const expressions = matchers[platform]?.[arch]
  if (!expressions) return null

  return (
    files.find(
      (file) => isValidAsset(file, expectedVersion) && matchesFilename(file, expressions)
    ) || null
  )
}

/**
 * GitHub 兜底只能下载与已选 R2 更新完全相同的发布包，防止切源时意外切到另一版本。
 */
export function matchesPinnedUpdateCandidate(expectedInfo, fallbackInfo, architecture) {
  if (
    !isStableReleaseVersion(expectedInfo?.version) ||
    expectedInfo.version !== fallbackInfo?.version
  ) {
    return false
  }

  const expectedFile = selectCompatibleUpdateFile(
    expectedInfo.files,
    architecture,
    expectedInfo.version
  )
  const fallbackFile = selectCompatibleUpdateFile(
    fallbackInfo.files,
    architecture,
    fallbackInfo.version
  )
  return Boolean(
    expectedFile &&
    fallbackFile &&
    expectedFile.size === fallbackFile.size &&
    expectedFile.sha512 === fallbackFile.sha512
  )
}
