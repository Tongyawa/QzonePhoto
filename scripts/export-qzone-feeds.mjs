#!/usr/bin/env node
import fs from 'node:fs/promises'
import fssync from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'

const DEFAULT_APP_DATA = path.join(os.homedir(), 'AppData', 'Roaming', 'qzone-photo')
const DEFAULT_APP_DATA_HELP = '%APPDATA%\\qzone-photo'
const DEFAULT_PAGE_SIZE = 10
const DEFAULT_CONFIG_CANDIDATES = [
  path.join(process.cwd(), 'qzone-feed-export.config.local.json'),
  path.join(process.cwd(), 'scripts', 'qzone-feed-export.config.local.json')
]

const HELP = `
导出 QQ 空间好友主页动态的正文、评论、图片和视频。

用法：
  node scripts/export-qzone-feeds.mjs --config scripts/qzone-feed-export.config.local.json
  node scripts/export-qzone-feeds.mjs --target 123456789 --out "D:\\\\QzonePhoto\\\\exports\\\\123456789"

登录态来源，按优先级：
  1. --uin/--p-skey 参数
  2. QZONE_UIN/QZONE_P_SKEY 环境变量
  3. QzonePhoto Local Storage 的 QZ-UIN/QZ-P-SKEY
  4. QzonePhoto Electron Cookie DB（可能需要先关闭正在运行的 QzonePhoto，避免 Cookie 文件被锁）

常用参数：
  --config <file>        读取本地 JSON 配置；默认查找 scripts/qzone-feed-export.config.local.json
  --target <qq>           要导出的好友 QQ 号，必填
  --out <dir>             输出目录，默认：Pictures/QzonePhoto/exports/<target>
  --uin <oQQ|QQ>          登录账号 cookie uin，可省略 o 前缀
  --p-skey <value>        登录账号 p_skey
  --app-data <dir>        QzonePhoto userData 目录，默认：${DEFAULT_APP_DATA_HELP}
  --source <mode>         home | friend | shuoshuo，默认 home；friend 使用好友动态接口并按目标 QQ 过滤
  --format <mode>         full | llm，默认 full；llm 会生成适合蒸馏的轻量 Markdown/JSON
  --limit <n>             最多导出 n 条，调试用
  --page-size <n>         每页数量，默认 ${DEFAULT_PAGE_SIZE}
  --comments <mode>       full | inline | none，默认 full
  --skip-media            只导出正文/评论，不下载图片视频
  --no-video              不解析/下载真实 mp4，仅保留图片和视频封面
  --overwrite             覆盖已存在媒体文件
  --include-urls          在 feeds.json 中保留签名媒体 URL（默认不保留）
  --help                  显示帮助

说明：
  - 可复制 scripts/qzone-feed-export.config.example.json 为 .local.json；本地配置已被 git 忽略。
  - 优先级：内置默认值 < 本地配置 < 环境变量登录态 < 命令行参数。
  - 输出目录里每条动态一个子目录，子目录内有 index.md 和媒体文件。
  - 默认会解析视频列表并尽力下载真实 mp4；如只想要封面，使用 --no-video。
  - 根目录 feeds.json 不默认写入 p_skey/cookie。
  - 如果 Cookie DB 被锁，请关闭 QzonePhoto 后重试，或显式传 QZONE_UIN/QZONE_P_SKEY。
`

function defaultArgs() {
  return {
    config: '',
    source: 'home',
    format: 'full',
    target: '',
    out: '',
    uin: '',
    pSkey: '',
    appData: DEFAULT_APP_DATA,
    limit: 0,
    pageSize: DEFAULT_PAGE_SIZE,
    comments: 'full',
    skipMedia: false,
    noVideo: false,
    overwrite: false,
    includeUrls: false,
    help: false
  }
}

function expandPathValue(value) {
  return String(value || '')
    .replace(/^~(?=$|[\\/])/, os.homedir())
    .replace(/%([^%]+)%/g, (_, name) => process.env[name] || `%${name}%`)
    .replace(/\$\{([^}]+)\}/g, (_, name) => process.env[name] || `\${${name}}`)
}

function resolveConfigPath(value) {
  return path.resolve(expandPathValue(value))
}

function findConfigPath(argv) {
  let explicit = ''
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--config') {
      if (i + 1 >= argv.length) throw new Error('--config 缺少参数值')
      explicit = argv[i + 1]
      break
    }
  }
  if (explicit) {
    const resolved = resolveConfigPath(explicit)
    if (!fssync.existsSync(resolved)) throw new Error(`配置文件不存在：${resolved}`)
    return resolved
  }
  return DEFAULT_CONFIG_CANDIDATES.find((candidate) => fssync.existsSync(candidate)) || ''
}

function readConfig(configPath) {
  if (!configPath) return {}
  try {
    return JSON.parse(fssync.readFileSync(configPath, 'utf8'))
  } catch (error) {
    throw new Error(`配置文件解析失败：${configPath}，${error.message}`)
  }
}

function coerceConfigBool(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return /^(1|true|yes|on)$/i.test(value.trim())
  return false
}

function applyConfig(args, config = {}) {
  const fields = {
    target: 'target',
    source: 'source',
    format: 'format',
    out: 'out',
    uin: 'uin',
    pSkey: 'pSkey',
    p_skey: 'pSkey',
    appData: 'appData',
    app_data: 'appData',
    limit: 'limit',
    pageSize: 'pageSize',
    page_size: 'pageSize',
    comments: 'comments',
    skipMedia: 'skipMedia',
    skip_media: 'skipMedia',
    noVideo: 'noVideo',
    no_video: 'noVideo',
    overwrite: 'overwrite',
    includeUrls: 'includeUrls',
    include_urls: 'includeUrls'
  }
  const booleanFields = new Set(['skipMedia', 'noVideo', 'overwrite', 'includeUrls'])
  for (const [key, value] of Object.entries(config)) {
    const targetKey = fields[key]
    if (!targetKey || value === undefined || value === null || value === '') continue
    if (booleanFields.has(targetKey)) args[targetKey] = coerceConfigBool(value)
    else if (targetKey === 'limit') args[targetKey] = Number(value) || 0
    else if (targetKey === 'pageSize') args[targetKey] = Math.max(1, Math.min(50, Number(value) || DEFAULT_PAGE_SIZE))
    else args[targetKey] = String(value)
  }
}

function applyEnvLogin(args) {
  if (process.env.QZONE_UIN) args.uin = process.env.QZONE_UIN
  if (process.env.QZONE_P_SKEY) args.pSkey = process.env.QZONE_P_SKEY
  if (process.env.QZONEPHOTO_APP_DATA) args.appData = process.env.QZONEPHOTO_APP_DATA
}

function normalizeConfiguredPaths(args) {
  if (args.out) args.out = path.resolve(expandPathValue(args.out))
  if (args.appData) args.appData = path.resolve(expandPathValue(args.appData))
}

function parseArgs(argv) {
  const args = defaultArgs()
  const wantsHelp = argv.some((key) => key === '--help' || key === '-h')
  const configPath = wantsHelp ? '' : findConfigPath(argv)
  args.config = configPath
  applyConfig(args, readConfig(configPath))
  applyEnvLogin(args)

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i]
    const next = () => {
      i += 1
      if (i >= argv.length) throw new Error(`${key} 缺少参数值`)
      return argv[i]
    }
    if (key === '--config') args.config = resolveConfigPath(next())
    else if (key === '--target') args.target = next()
    else if (key === '--source') args.source = next()
    else if (key === '--format') args.format = next()
    else if (key === '--out') args.out = next()
    else if (key === '--uin') args.uin = next()
    else if (key === '--p-skey') args.pSkey = next()
    else if (key === '--app-data') args.appData = next()
    else if (key === '--limit') args.limit = Number(next()) || 0
    else if (key === '--page-size') args.pageSize = Math.max(1, Math.min(50, Number(next()) || DEFAULT_PAGE_SIZE))
    else if (key === '--comments') args.comments = next()
    else if (key === '--skip-media') args.skipMedia = true
    else if (key === '--no-video') args.noVideo = true
    else if (key === '--overwrite') args.overwrite = true
    else if (key === '--include-urls') args.includeUrls = true
    else if (key === '--help' || key === '-h') args.help = true
    else throw new Error(`未知参数：${key}`)
  }

  if (!['full', 'inline', 'none'].includes(args.comments)) {
    throw new Error('--comments 只能是 full、inline 或 none')
  }
  if (!['home', 'friend', 'shuoshuo'].includes(args.source)) {
    throw new Error('--source 只能是 home、friend 或 shuoshuo')
  }
  if (!['full', 'llm'].includes(args.format)) {
    throw new Error('--format 只能是 full 或 llm')
  }
  normalizeConfiguredPaths(args)
  return args
}

const rawUin = (uin) => String(uin || '').replace(/^o/, '').trim()
const cookieUin = (uin) => {
  const raw = rawUin(uin)
  return raw ? `o${raw}` : ''
}

function getGTK(pSkey = '') {
  let n = 5381
  for (let i = 0; i < pSkey.length; i += 1) {
    n += (n << 5) + pSkey.charCodeAt(i)
  }
  return n & 2147483647
}

function sanitizeFilename(value, fallback = 'unnamed', maxLength = 120) {
  const normalized = String(value || fallback)
    .replace(/[<>:"/\\|?*]/g, '_')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x80-\x9f]/g, '')
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
  return (normalized || fallback).slice(0, maxLength)
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function formatTime(sec) {
  const n = Number(sec) || 0
  if (!n) return ''
  const d = new Date(n * 1000)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function dateTag(sec) {
  const n = Number(sec) || Math.floor(Date.now() / 1000)
  const d = new Date(n * 1000)
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
}

function decodeHtml(value = '') {
  const named = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' '
  }
  return String(value)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => named[name] ?? m)
}

function normalizePlainText(value = '') {
  return decodeHtml(value)
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t\f\v]+\n/g, '\n')
    .replace(/\n[ \t\f\v]+/g, '\n')
    .replace(/[ \t\f\v]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function stripHtmlToText(html = '') {
  return normalizePlainText(
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<img\b[^>]*src=["'][^"']*\/(e\d+)\.gif[^>]*>/gi, '[em]$1[/em]')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|li|tr|section|article|blockquote)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
}

function parseAttrs(tag = '') {
  const attrs = {}
  const attrRe = /([:@\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let match
  while ((match = attrRe.exec(tag))) {
    const [, name, dq, sq, bare] = match
    if (!name || name === tag.split(/\s+/)[0]?.replace(/^</, '')) continue
    attrs[name.toLowerCase()] = decodeHtml(dq ?? sq ?? bare ?? '')
  }
  return attrs
}

function extractElementsByClass(html = '', className = '', tagName = '[a-z0-9]+') {
  const source = String(html || '')
  const openRe = new RegExp(`<(${tagName})\\b[^>]*class=(["'])[^"']*\\b${className}\\b[^"']*\\2[^>]*>`, 'gi')
  const blocks = []
  let match
  while ((match = openRe.exec(source))) {
    const tag = match[1].toLowerCase()
    const start = match.index
    const afterOpen = openRe.lastIndex
    const tagRe = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi')
    tagRe.lastIndex = start
    let depth = 0
    let end = afterOpen
    let tm
    while ((tm = tagRe.exec(source))) {
      const isClose = /^<\//.test(tm[0])
      depth += isClose ? -1 : 1
      if (depth === 0) {
        end = tagRe.lastIndex
        break
      }
    }
    blocks.push(source.slice(start, end))
    openRe.lastIndex = Math.max(end, afterOpen)
  }
  return blocks
}

function extractFirstByClass(html, className, tagName = '[a-z0-9]+') {
  return extractElementsByClass(html, className, tagName)[0] || ''
}

function removeByClass(html = '', classNames = []) {
  let out = String(html || '')
  for (const className of classNames) {
    for (const block of extractElementsByClass(out, className)) {
      out = out.replace(block, '')
    }
  }
  return out
}

function toHttps(url) {
  if (typeof url !== 'string') return ''
  return url
    .trim()
    .replace(/&amp;/g, '&')
    .replace(/\^\|\|\^/g, '_')
    .replace(/^\/\//, 'https://')
    .replace(/^http:\/\//i, 'https://')
}

function isImageUrl(url) {
  const value = toHttps(url)
  if (!value || value.startsWith('data:') || value.startsWith('/') || value.startsWith('javascript:')) return false
  if (!/^https?:\/\//i.test(value)) return false
  if (/h5\.qzone\.qq\.com\/page\/photo/i.test(value) || /[?&]init=photo\./i.test(value)) return false
  if (/user\.qzone\.qq\.com/i.test(value)) return false
  if (/qzone_v6\/img\/feed\/loading/.test(value)) return false
  if (/\/ac\/b\.gif(?:[?#]|$)/i.test(value)) return false
  if (/qzonestyle\.gtimg\.cn\/qzone\/em\//.test(value)) return false
  if (/qlogo\d?\.store\.qq\.com/.test(value)) return false
  return /(?:qpic\.cn|photo\.store\.qq\.com|gtimg\.cn)/i.test(value) || /\.(?:jpe?g|png|webp|gif)(?:[?#]|$)/i.test(value)
}

function isVideoUrl(url) {
  const value = toHttps(url)
  if (!value || value.startsWith('data:') || value.startsWith('/') || value.startsWith('javascript:')) return false
  if (!/^https?:\/\//i.test(value)) return false
  if (isImageUrl(value)) return false
  return /(?:photovideo\.photo\.qq\.com|video\.qq\.com|ugc|qzonestyle\.gtimg\.cn\/qzone\/video|\/video\/)/i.test(value) ||
    /\.(?:mp4|mov|m4v|webm|m3u8)(?:[?#]|$)/i.test(value)
}

function uniqueImageUrls(urls = []) {
  return [...new Set(urls.map(toHttps).filter(isImageUrl))]
}

function uniqueVideoUrls(urls = []) {
  return [...new Set(urls.map(toHttps).filter(isVideoUrl))]
}

function isVideoMedia(media) {
  return media?.type === 'video' || media?.is_video
}

function toQzoneOriginalUrl(url) {
  const safe = toHttps(url)
  if (!safe) return ''
  if (!/\/psc\?\//i.test(safe)) return safe
  return safe.replace(/!\/(?:m|c|r)(?=&|$)/i, '!/b')
}

function uniqueUrls(urls = []) {
  return uniqueImageUrls(urls)
}

function originScore(url = '') {
  const text = String(url).toLowerCase()
  let score = 0
  if (/(?:raw|origin|original|large|big|orignal)/.test(text)) score += 8
  if (/\/0(?:[?#]|$)/.test(text)) score += 5
  if (/\/(?:b|2000|1600)(?:[/?#]|$)/.test(text)) score += 4
  if (/(?:small|thumb|s_|\/m(?:[/?#]|$)|\/100(?:[/?#]|$)|\/200(?:[/?#]|$))/.test(text)) score -= 5
  return score
}

function pickOrigin(urls = []) {
  return uniqueUrls(urls.flatMap((url) => [toQzoneOriginalUrl(url), url])).sort((a, b) => originScore(b) - originScore(a))[0] || ''
}

function mediaKey(url = '') {
  return String(url)
    .replace(/[?&](?:width|height|w|h|size|s)=\d+/g, '')
    .replace(/\/(?:\d{2,4}|m|b)(?=\/|\?|$)/g, '')
}

function mediaFromCandidates(items = []) {
  const map = new Map()
  for (const [index, item] of items.entries()) {
    const isVideo = item.is_video || item.type === 'video'
    const sourceUrls = [item.thumb, item.origin, item.url, item.raw, item.pre, ...(item.urls || [])]
    const videoUrls = uniqueVideoUrls(sourceUrls)
    const imageUrls = uniqueImageUrls(sourceUrls)
    const urls = isVideo ? [...videoUrls, ...imageUrls] : imageUrls
    const origin = isVideo && videoUrls.length ? videoUrls[0] : pickOrigin(imageUrls)
    const thumb = imageUrls[0] || origin
    if (!origin && !thumb) continue
    const key = mediaKey(origin || thumb) || `${index}`
    const current = map.get(key)
    const next = {
      id: item.id || key,
      name: item.name || `photo_${index + 1}`,
      type: isVideo ? 'video' : (item.type || 'image'),
      thumb,
      origin: origin || thumb,
      url: origin || thumb,
      raw: origin || thumb,
      pre: thumb,
      urls,
      is_video: isVideo,
      modifytime: item.modifytime || 0,
      size: Number(item.size || 0) || 0,
      duration: Number(item.duration || 0) || 0,
      downloadSource: isVideo && videoUrls.length ? (item.downloadSource || 'feed') : (item.downloadSource || 'fallback')
    }
    if (!current || originScore(next.origin) > originScore(current.origin)) map.set(key, next)
  }
  return [...map.values()]
}

function collectMediaCandidatesFromTag(tag = '') {
  const attrs = parseAttrs(tag)
  const urls = []
  for (const name of [
    'src',
    'href',
    'rel',
    'origin',
    'data-src',
    'data-original',
    'data-origin',
    'data-originurl',
    'data-url',
    'data-picurl',
    'data-pic',
    'data-pickey',
    'data-bigurl',
    'data-raw',
    'data-lazyload',
    'data-ks-lazyload'
  ]) {
    const value = attrs[name]
    if (!value) continue
    String(value)
      .split(/[\s,|]+/)
      .map(toHttps)
      .filter(isImageUrl)
      .forEach((url) => urls.push(url))
  }
  return urls
}

function collectHtmlMedia(html = '', abstime = 0) {
  const source = String(html || '')
  const items = []
  const anchorRe = /<a\b[^>]*class=(["'])[^"']*\bimg-item\b[^"']*\1[^>]*>[\s\S]*?<\/a>/gi
  let match
  let index = 0
  while ((match = anchorRe.exec(source))) {
    const block = match[0]
    const openTag = block.match(/^<a\b[^>]*>/i)?.[0] || ''
    const attrs = parseAttrs(openTag)
    const videoUrl =
      toHttps(attrs['data-v_vidioswfurl']) ||
      toHttps(attrs['data-v_vidiourl']) ||
      toHttps(attrs['data-v_videourl']) ||
      toHttps(attrs['data-v_video_url']) ||
      toHttps(attrs['data-video-url']) ||
      toHttps(attrs['data-v_url']) ||
      toHttps(attrs.url3) ||
      toHttps(block.match(/\burl3=(["']?)([^"'\s>]+)\1/i)?.[2] || '') ||
      toHttps(block.match(/<video\b[^>]*src=(["'])([^"']+)\1/i)?.[2] || '')
    const imgTag = block.match(/<img\b[^>]*>/i)?.[0] || ''
    const imgAttrs = parseAttrs(imgTag)
    const cover = toHttps(attrs['data-v_picinfo_url']) || toHttps(imgAttrs.src)

    if (videoUrl) {
      items.push({
        id: attrs['data-v_itemid'] || attrs['data-param'] || `video_${index + 1}`,
        name: `video_${index + 1}`,
        type: 'video',
        thumb: cover,
        origin: videoUrl,
        url: videoUrl,
        raw: videoUrl,
        is_video: true,
        modifytime: abstime
      })
      index += 1
      continue
    }

    const urls = [
      ...String(attrs['data-pickey'] || '').split(',').slice(1),
      ...String(attrs['data-originurl'] || '').split('|'),
      ...collectMediaCandidatesFromTag(openTag),
      ...collectMediaCandidatesFromTag(imgTag)
    ].map(toHttps).filter(isImageUrl)

    if (urls.length) {
      items.push({
        id: String(attrs['data-pickey'] || '').split(',')[0] || attrs['data-param'] || `photo_${index + 1}`,
        name: `photo_${index + 1}`,
        thumb: toHttps(imgAttrs.src) || urls[0],
        origin: pickOrigin(urls),
        urls,
        modifytime: abstime
      })
    }
    index += 1
  }

  if (!items.length) {
    const imgRe = /<img\b[^>]*>/gi
    while ((match = imgRe.exec(source))) {
      const tag = match[0]
      if (/user-avatar|feedemoji|load_img/.test(tag)) continue
      const urls = collectMediaCandidatesFromTag(tag)
      if (urls.length) items.push({ thumb: urls[0], urls, modifytime: abstime })
    }
  }
  return mediaFromCandidates(items)
}

function evalObjectLiteral(source) {
  if (!source || typeof source !== 'string') return null
  try {
    return Function('"use strict";return (' + source + ')')()
  } catch {
    return null
  }
}

function extractJSONFromCallback(input = '') {
  if (typeof input === 'object') return input
  if (typeof input !== 'string') return input
  const str = input.trim()
  if (str.includes('frameElement.callback')) {
    const match = str.match(/frameElement\.callback\s*\(\s*({[\s\S]*?})\s*\)\s*;?/i)
    if (match) return evalObjectLiteral(match[1]) || input
  }
  const objCb = str.match(/^\s*([a-zA-Z_$][\w$]*)\s*\(\s*({[\s\S]*?})\s*\)\s*;?\s*$/)
  if (objCb) return evalObjectLiteral(objCb[2]) || input
  return input
}

function extractHomeModuleData(html = '') {
  const match = String(html).match(/var\s+_feedsdata\s*=\s*({[\s\S]*?})\s*;\s*(?:for\s*\(|if\s*\()/)
  return evalObjectLiteral(match?.[1])
}

function extractHomeFeedBlocks(html = '') {
  const source = String(html || '')
  const blocks = []
  const startPattern = /<li\b[^>]*class=(["'])[^"']*\bf-single\b[^"']*\1[^>]*>/gi
  let match
  while ((match = startPattern.exec(source))) {
    const start = match.index
    const next = source.slice(startPattern.lastIndex).search(/<li\b[^>]*class=(["'])[^"']*\bf-single\b[^"']*\1[^>]*>/i)
    const end = next >= 0 ? startPattern.lastIndex + next : source.indexOf('</ul>', startPattern.lastIndex)
    if (end > start) blocks.push(source.slice(start, end))
  }
  return blocks
}

function attachHomeFeedHtml(feeds, html = '') {
  const blocks = extractHomeFeedBlocks(html)
  if (!blocks.length) return feeds
  const used = new Set()
  return feeds.map((feed, index) => {
    const key = String(feed?.key || '')
    const idPart = `${feed?.uin || ''}_${feed?.appid || ''}_${feed?.typeid || ''}_${feed?.abstime || ''}_${feed?.feedno || ''}`
    let blockIndex = blocks.findIndex((block, blockIdx) => {
      if (used.has(blockIdx)) return false
      return (key && block.includes(`data-key="${key}"`)) || (idPart && block.includes(idPart))
    })
    if (blockIndex < 0 && !used.has(index)) blockIndex = index
    if (blockIndex >= 0 && blocks[blockIndex]) {
      used.add(blockIndex)
      return { ...feed, html: feed.html || blocks[blockIndex] }
    }
    return feed
  })
}

function normalizeHomeFeedsPayload(payload, html = '', fallbackPager = {}) {
  const body = payload || {}
  const data = body.data || {}
  const main = data.main || {}
  const feeds = [
    ...(Array.isArray(data.host_data) ? data.host_data : []),
    ...(Array.isArray(data.firstpage_data) ? data.firstpage_data : []),
    ...(Array.isArray(data.friend_data) ? data.friend_data : []),
    ...(Array.isArray(data.about_data) ? data.about_data : []),
    ...(Array.isArray(data.data) ? data.data : [])
  ].filter(Boolean)
  const withHtml = attachHomeFeedHtml(feeds, html)
  const start = Number(fallbackPager.start || 0)
  const nextOffset = Number(main.offset)
  return {
    code: body.code === '' ? 0 : Number(body.code ?? 0),
    message: body.message || '',
    hasMore: !!(main.hasMoreFeeds || main.hasMoreFeeds_0) && withHtml.length > 0,
    pager: {
      start: Number.isFinite(nextOffset) && nextOffset > start ? nextOffset : start + withHtml.length,
      count: Number(fallbackPager.count || DEFAULT_PAGE_SIZE)
    },
    feeds: withHtml
  }
}

function htmlErrorMessage(html = '') {
  const text = stripHtmlToText(html).replace(/\s+/g, ' ')
  if (/主人设置了保密|没有权限|无权|访问受限|仅主人|权限/.test(text)) return '没有权限查看该主页'
  if (/登录|请先登录|未登录/.test(text)) return '登录态失效'
  return '主页响应解析失败'
}

async function fetchText(url, { method = 'GET', params, headers, body } = {}) {
  const target = new URL(url)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) target.searchParams.set(key, String(value))
    }
  }
  const response = await fetch(target, {
    method,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      ...headers
    },
    body
  })
  const text = await response.text()
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} ${response.statusText}`)
    error.responseText = text
    throw error
  }
  return text
}

class QzoneClient {
  constructor(auth) {
    this.uin = cookieUin(auth.uin)
    this.rawUin = rawUin(auth.uin)
    this.pSkey = auth.pSkey
    this.gTk = getGTK(this.pSkey)
  }

  cookie(extra = {}) {
    const parts = [
      ['uin', this.uin],
      ['p_uin', this.uin],
      ['skey', this.pSkey],
      ['p_skey', this.pSkey],
      ...Object.entries(extra)
    ].filter(([, value]) => value)
    return parts.map(([key, value]) => `${key}=${value}`).join('; ')
  }

  async getHomeFeeds(hostUin, pager = {}) {
    const start = Number(pager.start || 0)
    const count = Number(pager.count || DEFAULT_PAGE_SIZE)
    const targetUin = rawUin(hostUin || this.rawUin)
    if (start <= 0) {
      const html = await fetchText('https://user.qzone.qq.com/proxy/domain/ic2.qzone.qq.com/cgi-bin/feeds/feeds_html_module', {
        params: {
          g_iframeUser: 1,
          i_uin: targetUin,
          i_login_uin: this.rawUin,
          mode: 4,
          previewV8: 1,
          style: 35,
          version: 8,
          needDelOpr: true,
          transparence: true,
          hideExtend: false,
          showcount: count,
          MORE_FEEDS_CGI: 'http://ic2.s8.qzone.qq.com/cgi-bin/feeds/feeds_html_act_all',
          refer: 2,
          paramstring: 'os-mac|100'
        },
        headers: {
          Cookie: this.cookie(),
          Referer: `https://user.qzone.qq.com/${targetUin}/main`
        }
      })
      const payload = extractHomeModuleData(html)
      if (!payload) {
        return { code: -1, message: htmlErrorMessage(html), hasMore: false, pager: { start, count }, feeds: [] }
      }
      return normalizeHomeFeedsPayload(payload, html, { start, count })
    }

    const raw = await fetchText('https://user.qzone.qq.com/proxy/domain/ic2.qzone.qq.com/cgi-bin/feeds/feeds_html_act_all', {
      params: {
        uin: targetUin,
        hostuin: targetUin,
        scope: 0,
        filter: 'all',
        flag: 1,
        refresh: 0,
        firstGetGroup: 0,
        mixnocache: 0,
        scene: 0,
        begintime: 'undefined',
        icServerTime: '',
        start,
        count,
        sidomain: 'qzonestyle.gtimg.cn',
        useutf8: 1,
        outputhtmlfeed: 1,
        refer: 2,
        r: Math.random(),
        g_tk: this.gTk
      },
      headers: {
        Cookie: this.cookie(),
        Referer: `https://user.qzone.qq.com/${targetUin}/main`
      }
    })
    return normalizeHomeFeedsPayload(extractJSONFromCallback(raw) || {}, '', { start, count })
  }

  async getFriendFeedsForUin(targetUin, pager = {}) {
    const {
      pagenum = 1,
      begintime = 0,
      externparam = 'undefined',
      count = DEFAULT_PAGE_SIZE,
      dayspac = 0
    } = pager
    const raw = await fetchText('https://user.qzone.qq.com/proxy/domain/ic2.qzone.qq.com/cgi-bin/feeds/feeds3_html_more', {
      params: {
        uin: this.rawUin,
        scope: 0,
        view: 1,
        daylist: '',
        uinlist: rawUin(targetUin),
        gid: '',
        flag: 1,
        filter: 'all',
        applist: 'all',
        refresh: 0,
        aisortEndTime: 0,
        aisortOffset: 0,
        getAisort: 0,
        aisortBeginTime: 0,
        pagenum,
        externparam,
        firstGetGroup: 0,
        icServerTime: 0,
        mixnocache: 0,
        scene: 0,
        begintime: begintime || 'undefined',
        count,
        dayspac: dayspac || 'undefined',
        sidomain: 'qzonestyle.gtimg.cn',
        useutf8: 1,
        outputhtmlfeed: 1,
        rd: Math.random(),
        usertime: Date.now(),
        g_tk: this.gTk
      },
      headers: {
        Cookie: this.cookie(),
        Referer: `https://user.qzone.qq.com/${this.rawUin}/infocenter`
      }
    })
    const body = extractJSONFromCallback(raw) || {}
    const inner = body.data || {}
    const main = inner.main || {}
    const list = Array.isArray(inner.data) ? inner.data : []
    return {
      code: body.code ?? 0,
      message: body.message || body.msg || '',
      hasMore: !!main.hasMoreFeeds,
      pager: {
        pagenum: main.pagenum ? Number(main.pagenum) : pagenum + 1,
        begintime: main.begintime ? Number(main.begintime) : 0,
        externparam: main.externparam || '',
        dayspac: main.dayspac ? Number(main.dayspac) : 0,
        count
      },
      feeds: list
    }
  }

  async getFeedComments({ topicId, hostUin, feedsType = 8, start = 0, num = 50, sort = 1 }) {
    if (!topicId || !hostUin) return { code: -1, message: 'missing topicId/hostUin', feedsHtml: '' }
    const body = new URLSearchParams({
      topicId,
      hostUin: String(hostUin),
      uin: this.rawUin,
      feedsType: String(feedsType),
      start: String(start),
      num: String(num),
      sort: String(sort),
      source: 'ic',
      format: 'fs',
      plat: 'qzone',
      ref: 'feeds',
      inCharset: 'utf-8',
      outCharset: 'utf-8',
      paramstr: '1',
      isfakereq: '1',
      qzreferrer: `https://user.qzone.qq.com/${this.rawUin}/infocenter`
    })
    const raw = await fetchText('https://user.qzone.qq.com/proxy/domain/taotao.qzone.qq.com/cgi-bin/emotion_cgi_ic_getcomments', {
      method: 'POST',
      params: { g_tk: this.gTk },
      body,
      headers: {
        Cookie: this.cookie(),
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        Origin: 'https://user.qzone.qq.com',
        Referer: `https://user.qzone.qq.com/${this.rawUin}/infocenter`
      }
    })
    const parsed = extractJSONFromCallback(raw) || {}
    return {
      code: parsed.ret ?? parsed.code ?? 0,
      message: parsed.msg || parsed.message || '',
      feedsHtml: parsed.result?.feeds || parsed.data?.feeds || ''
    }
  }

  async getShuoshuo(targetUin, pos = 0, num = 20) {
    const hostUin = rawUin(targetUin || this.rawUin)
    const raw = await fetchText('https://user.qzone.qq.com/proxy/domain/taotao.qq.com/cgi-bin/emotion_cgi_msglist_v6', {
      params: {
        uin: hostUin,
        ftype: 0,
        sort: 0,
        pos,
        num,
        replynum: 100,
        g_tk: this.gTk,
        code_version: 1,
        format: 'jsonp',
        need_private_comment: 1
      },
      headers: {
        Cookie: this.cookie(),
        Referer: `https://user.qzone.qq.com/${hostUin}`,
        Origin: 'https://user.qzone.qq.com',
        Accept: '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      }
    })
    const parsed = extractJSONFromCallback(raw)
    return typeof parsed === 'object' ? parsed : { code: -1, message: '响应异常', raw: parsed }
  }

  async getVideoList(hostUin, { start = 0, count = 100, getMethod = 2, needOld = 0, getUserInfo = 0 } = {}) {
    const targetUin = rawUin(hostUin || this.rawUin)
    const raw = await fetchText('https://user.qzone.qq.com/proxy/domain/taotao.qq.com/cgi-bin/video_get_data', {
      params: {
        g_tk: this.gTk,
        uin: this.rawUin,
        hostUin: targetUin,
        appid: 4,
        getMethod,
        start,
        count,
        need_old: needOld,
        getUserInfo,
        inCharset: 'utf-8',
        outCharset: 'utf-8'
      },
      headers: {
        Cookie: this.cookie(),
        Referer: `https://user.qzone.qq.com/${targetUin}`,
        Origin: 'https://user.qzone.qq.com',
        Accept: '*/*'
      }
    })
    const parsed = extractJSONFromCallback(raw)
    return typeof parsed === 'object' ? parsed : { code: -1, message: '视频列表响应异常', raw: parsed }
  }
}

function parseCountFromHtml(html, marker) {
  const re = new RegExp(`${marker}[\\s\\S]{0,240}<em[^>]*>(\\d+)<\\/em>`, 'i')
  return Number(html.match(re)?.[1] || 0)
}

function openTagByClass(html, className) {
  const re = new RegExp(`<[^>]+class=(["'])[^"']*\\b${className}\\b[^"']*\\1[^>]*>`, 'i')
  return String(html || '').match(re)?.[0] || ''
}

function parseAttrsCount(html, className, attrNames = []) {
  const block = extractFirstByClass(html, className)
  const tag = block.match(/^<[^>]+>/)?.[0] || openTagByClass(html, className)
  const attrs = parseAttrs(tag)
  for (const name of attrNames) {
    const value = String(attrs[name.toLowerCase()] || '').replace(/[^\d]/g, '')
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return 0
}

function parseActionCount(html, className, attrNames = []) {
  return parseAttrsCount(html, className, attrNames) || parseCountFromHtml(html, className)
}

function parseLikeCountFromHtml(html) {
  return parseActionCount(html, 'qz_like_btn_v3', [
    'data-likecnt',
    'data-likecount',
    'data-likenum',
    'likecnt'
  ])
}

function parseForwardCountFromHtml(html) {
  return parseActionCount(html, 'qz_retweet_btn', [
    'data-forwardcnt',
    'data-forwardnum',
    'data-fwdcnt',
    'data-fwdnum',
    'data-relycnt',
    'data-relynum',
    'data-relaycnt',
    'data-relaynum',
    'data-retweetcnt',
    'data-retweetnum',
    'data-repostcnt',
    'data-repostnum',
    'forwardcnt',
    'forwardnum',
    'fwdcnt',
    'fwdnum',
    'relycnt',
    'relynum',
    'relaycnt',
    'relaynum',
    'retweetcnt',
    'retweetnum',
    'repostcnt',
    'repostnum'
  ])
}

function firstNumber(...values) {
  for (const value of values) {
    const n = Number(value)
    if (Number.isFinite(n) && n > 0) return n
  }
  return 0
}

function firstTimestamp(...values) {
  const n = firstNumber(...values)
  return n > 100000000000 ? Math.floor(n / 1000) : n
}

function firstText(...values) {
  return values.find((value) => typeof value === 'string' && value.trim())?.trim() || ''
}

function isDownloadableVideoUrl(url) {
  const value = toHttps(url).toLowerCase()
  if (!isVideoUrl(value)) return false
  if (/\.swf(?:[?#]|$)/i.test(value)) return false
  return /(?:photovideo\.photo\.qq\.com|\.mp4(?:[?#]|$)|\.mov(?:[?#]|$)|\.m4v(?:[?#]|$)|\.webm(?:[?#]|$))/i.test(value)
}

function videoDownloadUrlFromMedia(media) {
  return uniqueVideoUrls([media?.raw, media?.origin, media?.url, ...(media?.urls || [])])
    .find(isDownloadableVideoUrl) || ''
}

function urlTailToken(url) {
  try {
    const parsed = new URL(toHttps(url))
    return parsed.pathname.split('/').filter(Boolean).pop()?.toLowerCase() || ''
  } catch {
    return ''
  }
}

function extractVideoArray(payload = {}) {
  const data = payload.data || payload
  const candidates = [
    data.Videos,
    data.videos,
    data.video,
    data.list,
    data.items,
    data.data?.Videos,
    data.data?.videos
  ]
  return candidates.find(Array.isArray) || []
}

function videoPagingInfo(payload = {}, start = 0, count = 100, itemCount = 0) {
  const data = payload.data || payload
  return {
    nextStart: firstNumber(data.nextPageStart, data.next_start, data.nextStart) || start + itemCount,
    isLast: String(data.isLast ?? data.islast ?? '').toLowerCase() === 'true' ||
      data.hasMore === false ||
      (itemCount > 0 && itemCount < count),
    total: firstNumber(data.total, data.Total, data.count)
  }
}

function normalizeVideoListItem(item, index = 0) {
  const videoInfo = item?.video_info || item?.videoInfo || {}
  const url = toHttps(firstText(
    item?.url,
    item?.raw,
    item?.videoUrl,
    item?.video_url,
    item?.downloadUrl,
    item?.download_url,
    item?.video_download_url,
    item?.video_play_url,
    videoInfo.download_url,
    videoInfo.video_url,
    videoInfo.url
  ))
  const cover = toHttps(firstText(
    item?.pre,
    item?.cover,
    item?.cover_url,
    item?.coverUrl,
    item?.pic_url,
    item?.url1,
    item?.thumb,
    item?.thumbnail
  ))
  return {
    id: String(firstText(item?.vid, item?.id, item?.video_id, item?.lloc, item?.picKey, item?.pic_key, `video_${index + 1}`)),
    picKey: firstText(item?.picKey, item?.pic_key, item?.lloc),
    name: firstText(item?.title, item?.desc, item?.name, `video_${index + 1}`),
    type: 'video',
    thumb: cover,
    pre: cover,
    origin: url,
    url,
    raw: url,
    urls: [url, cover].filter(Boolean),
    is_video: true,
    modifytime: firstTimestamp(item?.uploadTime, item?.uploadtime, item?.upload_time, item?.create_time, item?.created_time, item?.modifytime, item?.time),
    size: firstNumber(item?.size, item?.video_size, videoInfo.size),
    duration: firstNumber(item?.duration, item?.video_time, item?.videotime, videoInfo.duration),
    downloadSource: 'video-list'
  }
}

async function fetchVideoIndex(client, targetUin) {
  const videos = []
  let start = 0
  const count = 100
  for (let page = 1; page <= 30; page += 1) {
    const res = await client.getVideoList(targetUin, { start, count, needOld: 0, getUserInfo: page === 1 ? 1 : 0 })
    const code = Number(res.code ?? res.ret ?? 0)
    if (code !== 0) {
      console.warn(`视频列表第 ${page} 页失败，保留已解析视频：${res.message || res.msg || `code=${code}`}`)
      break
    }
    const list = extractVideoArray(res)
    videos.push(...list.map((item, index) => normalizeVideoListItem(item, start + index)).filter((item) => item.raw || item.thumb))
    const paging = videoPagingInfo(res, start, count, list.length)
    if (!list.length || paging.isLast || (paging.total && videos.length >= paging.total)) break
    if (paging.nextStart <= start) break
    start = paging.nextStart
    await sleep(300)
  }
  return videos
}

function videoMatchScore(feed, media, candidate, mediaIndex) {
  let score = 0
  const mediaIds = [media.id, media.picKey, media.lloc].map((value) => String(value || '').toLowerCase()).filter(Boolean)
  const candidateIds = [candidate.id, candidate.picKey].map((value) => String(value || '').toLowerCase()).filter(Boolean)
  if (mediaIds.some((id) => candidateIds.includes(id))) score += 120

  const mediaTail = urlTailToken(media.thumb || media.pre || media.url || '')
  const candidateTail = urlTailToken(candidate.thumb || candidate.pre || '')
  if (mediaTail && candidateTail && mediaTail === candidateTail) score += 60

  const time = Number(media.modifytime || feed.abstime || 0)
  const candidateTime = Number(candidate.modifytime || 0)
  if (time && candidateTime) {
    const delta = Math.abs(time - candidateTime)
    if (delta <= 2) score += 100
    else if (delta <= 60) score += 85
    else if (delta <= 3600) score += 55
    else if (delta <= 86400) score += 20
  }

  if (isDownloadableVideoUrl(candidate.raw || candidate.url)) score += 20
  if (String(candidate.name || '').includes(String(mediaIndex + 1))) score += 2
  return score
}

function enrichFeedVideosWithIndex(feeds, videoIndex = []) {
  if (!videoIndex.length) {
    return feeds.map((feed) => ({
      ...feed,
      media: feed.media.map((media) => isVideoMedia(media) ? { ...media, downloadSource: videoDownloadUrlFromMedia(media) ? 'feed' : 'fallback' } : media)
    }))
  }

  const used = new Set()
  return feeds.map((feed) => ({
    ...feed,
    media: feed.media.map((media, mediaIndex) => {
      if (!isVideoMedia(media)) return media
      const feedVideoUrl = videoDownloadUrlFromMedia(media)
      if (feedVideoUrl) {
        return { ...media, raw: feedVideoUrl, origin: feedVideoUrl, url: feedVideoUrl, type: 'video', is_video: true, downloadSource: media.downloadSource || 'feed' }
      }

      const match = videoIndex
        .map((candidate, index) => ({ candidate, index, score: used.has(index) ? -1 : videoMatchScore(feed, media, candidate, mediaIndex) }))
        .sort((a, b) => b.score - a.score)[0]

      if (!match || match.score < 40 || !isDownloadableVideoUrl(match.candidate.raw || match.candidate.url)) {
        return { ...media, type: 'video', is_video: true, downloadSource: 'fallback' }
      }

      used.add(match.index)
      const url = match.candidate.raw || match.candidate.url
      return {
        ...media,
        id: media.id || match.candidate.id,
        name: media.name || match.candidate.name,
        type: 'video',
        thumb: media.thumb || match.candidate.thumb,
        pre: media.pre || media.thumb || match.candidate.thumb,
        origin: url,
        url,
        raw: url,
        urls: [...new Set([url, ...(media.urls || []), match.candidate.thumb].filter(Boolean))],
        is_video: true,
        size: match.candidate.size || media.size || 0,
        duration: match.candidate.duration || media.duration || 0,
        downloadSource: 'video-list',
        videoMatchScore: match.score
      }
    })
  }))
}

function parseCommentsHtml(html = '') {
  if (!html) return []
  const items = extractElementsByClass(html, 'comments-item', 'li')
  const flat = []
  for (const block of items) {
    const openTag = block.match(/^<li\b[^>]*>/i)?.[0] || ''
    const attrs = parseAttrs(openTag)
    let content = extractFirstByClass(block, 'comments-content') || block
    content = removeByClass(content, ['comments-op', 'comments-user'])
    content = content.replace(/<a\b[^>]*class=(["'])[^"']*\bnickname\b[^"']*\1[^>]*>[\s\S]*?<\/a>/gi, '')
    const text = stripHtmlToText(content).replace(/^[:：\s]+/, '')
    const state = stripHtmlToText(extractFirstByClass(block, 'state')).trim()
    const comment = {
      type: attrs['data-type'] || '',
      id: attrs['data-tid'] || '',
      uin: attrs['data-uin'] || '',
      author: attrs['data-nick'] || '',
      text,
      time: state,
      targetUin: attrs['data-targetuin'] || '',
      targetNick: attrs['data-targetnick'] || '',
      responses: []
    }
    if (comment.text || comment.author || comment.uin) flat.push(comment)
  }

  const roots = []
  const byId = new Map()
  const rootById = new Map()
  const findParent = (reply) => {
    if (!reply.id) return roots[roots.length - 1]
    const candidates = [...byId.entries()]
      .filter(([id]) => id && reply.id.startsWith(`${id}_`))
      .sort((a, b) => b[0].length - a[0].length)
    return candidates[0]?.[1] || roots[roots.length - 1]
  }

  for (const item of flat) {
    if (item.type === 'commentroot' || !roots.length) {
      if (!byId.has(item.id)) roots.push(item)
      byId.set(item.id, item)
      rootById.set(item.id, item)
    } else if (item.type === 'replyroot') {
      const parent = findParent(item)
      const root = rootById.get(parent?.id) || parent
      if (parent && parent !== root && !item.targetNick) {
        item.targetNick = parent.author
        item.targetUin = parent.uin
      }
      if (root) root.responses.push(item)
      else roots.push(item)
      byId.set(item.id, item)
      rootById.set(item.id, root || item)
    }
  }
  return roots
}

function countComments(comments = []) {
  return comments.reduce((sum, c) => sum + 1 + countComments(c.responses || []), 0)
}

function flattenCommentKeys(comments = [], keys = new Set()) {
  for (const c of comments) {
    keys.add(c.id || `${c.uin}|${c.time}|${c.text}`)
    flattenCommentKeys(c.responses || [], keys)
  }
  return keys
}

function mergeComments(base = [], incoming = []) {
  const roots = [...base]
  const map = new Map(roots.map((c) => [c.id || `${c.uin}|${c.time}|${c.text}`, c]))
  for (const c of incoming) {
    const key = c.id || `${c.uin}|${c.time}|${c.text}`
    const existing = map.get(key)
    if (!existing) {
      roots.push(c)
      map.set(key, c)
      continue
    }
    const replyKeys = flattenCommentKeys(existing.responses || [])
    for (const reply of c.responses || []) {
      const replyKey = reply.id || `${reply.uin}|${reply.time}|${reply.text}`
      if (!replyKeys.has(replyKey)) {
        existing.responses = existing.responses || []
        existing.responses.push(reply)
        replyKeys.add(replyKey)
      }
    }
  }
  return roots
}

const firstStringField = (item, fields) =>
  fields.map((field) => item?.[field]).find((value) => typeof value === 'string' && value.trim()) || ''

const objectImageStrings = (item) =>
  Object.values(item || {})
    .filter((value) => typeof value === 'string')
    .map(toHttps)
    .filter(isImageUrl)

const ORIGIN_IMAGE_FIELDS = [
  'picrawurl', 'rawurl', 'raw_url', 'originurl', 'origin_url', 'origin',
  'picoriginurl', 'picOriginUrl', 'url4', 'url3', 'picbigurl', 'bigurl',
  'big_url', 'largeurl', 'large_url', 'hdurl', 'hd_url', 'raw'
]

const THUMB_IMAGE_FIELDS = [
  'smallurl', 'small_url', 'thumb', 'thumburl', 'thumb_url', 'picsmall',
  'url1', 'url2', 'url', 'pre', 'preview'
]

function mediaFromUnknownList(list = [], time = 0) {
  const values = Array.isArray(list) ? list : Object.values(list || {})
  return mediaFromCandidates(
    values
      .map((item, index) => {
        if (typeof item === 'string') return { urls: [item], thumb: item, modifytime: time }
        if (!item || typeof item !== 'object') return null
        const origin = firstStringField(item, ORIGIN_IMAGE_FIELDS)
        const thumb = firstStringField(item, THUMB_IMAGE_FIELDS)
        const urls = [...new Set([origin, thumb, ...objectImageStrings(item)].map(toHttps).filter(isImageUrl))]
        return {
          id: item.pic_id || item.lloc || item.id || item.key || '',
          name: item.name || item.desc || `photo_${index + 1}`,
          thumb: thumb || urls[0] || '',
          origin: origin || pickOrigin(urls),
          urls,
          modifytime: time
        }
      })
      .filter(Boolean)
  )
}

function mediaFromShuoshuoVideos(list = [], time = 0) {
  const values = Array.isArray(list) ? list : Object.values(list || {})
  return values
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null
      const url = toHttps(item.url3 || item.video_url || item.videourl || item.url || '')
      if (!url) return null
      const cover = toHttps(item.url1 || item.pic_url || item.cover || item.cover_url || '')
      const id = item.video_id || item.vid || item.lloc || `video_${index + 1}`
      return {
        id,
        name: item.name || id || `video_${index + 1}`,
        type: 'video',
        thumb: cover,
        origin: url,
        url,
        pre: cover,
        raw: url,
        is_video: true,
        duration: Number(item.video_time || item.videotime || item.playtime || item.duration || 0) || 0,
        modifytime: time
      }
    })
    .filter(Boolean)
}

function toArray(value) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') return Object.values(value)
  return []
}

function getReplyItems(item) {
  return [
    ...toArray(item?.replylist),
    ...toArray(item?.reply_list),
    ...toArray(item?.list_3),
    ...toArray(item?.children),
    ...toArray(item?.subcomments),
    ...toArray(item?.sub_comment),
    ...toArray(item?.commentlist).filter((reply) => reply !== item)
  ].filter((reply) => reply && typeof reply === 'object')
}

function normalizeCommentAuthor(item) {
  return normalizePlainText(item?.name || item?.nick || item?.nickname || item?.user?.nickname || item?.userinfo?.nickname || '')
    .replace(/\[em\]e\d+\[\/em\]/g, '')
    .trim()
}

function takeLeadingMention(text) {
  const source = String(text || '').trim()
  const match = source.match(/^@\{uin:([\w-]+)(?:,nick:([^,}]*))?(?:,[^}]*)?\}/)
  if (!match) return { text: source, targetUin: '', targetNick: '' }
  return {
    text: source.slice(match[0].length).trim(),
    targetUin: match[1],
    targetNick: normalizePlainText(match[2] || match[1])
  }
}

function normalizeShuoshuoReply(item, parent) {
  const leading = takeLeadingMention(item.content || item.reply_content || item.text || '')
  return {
    id: item.tid || item.id || item.commentid || item.replyid || `${item.uin || ''}-${item.create_time || ''}-${item.content || ''}`,
    uin: String(item.uin || item.owner_uin || item.user?.uin || ''),
    author: normalizeCommentAuthor(item),
    text: normalizePlainText(leading.text),
    time: item.create_time ? formatTime(item.create_time) : '',
    deviceName: item.source_name || item.source || '',
    targetUin: String(item.touin || item.targetuin || item.target_uin || leading.targetUin || parent?.uin || ''),
    targetNick: item.toname || item.targetnick || item.target_nick || leading.targetNick || parent?.author || '',
    responses: []
  }
}

function flattenShuoshuoReplies(items, parent) {
  const replies = []
  for (const item of items) {
    const reply = normalizeShuoshuoReply(item, parent)
    replies.push(reply)
    replies.push(...flattenShuoshuoReplies(getReplyItems(item), reply))
  }
  return replies
}

function normalizeShuoshuo(raw, fallbackUin = '') {
  const uin = String(raw.uin || raw.owner_uin || fallbackUin || '')
  const time = Number(raw.created_time || raw.create_time || raw.abstime || 0)
  const media = [
    ...mediaFromUnknownList(raw.pic || raw.pics || raw.piclist || raw.photo || [], time),
    ...mediaFromShuoshuoVideos(raw.video || raw.videos || [], time)
  ]
  const comments = (raw.commentlist || []).map((item) => {
    const comment = {
      id: item.tid || item.id || item.commentid || `${item.uin}-${item.create_time}`,
      uin: String(item.uin || item.owner_uin || ''),
      author: normalizeCommentAuthor(item),
      text: normalizePlainText(item.content || item.text || ''),
      time: item.create_time ? formatTime(item.create_time) : '',
      deviceName: item.source_name || item.source || '',
      responses: []
    }
    comment.responses = flattenShuoshuoReplies(getReplyItems(item), comment)
    return comment
  })

  return {
    tid: raw.tid || raw.id || `${uin}-${time}`,
    topicId: raw.tid ? `${uin}_${raw.tid}__1` : '',
    uin,
    name: raw.name || raw.nick || raw.nickname || uin,
    abstime: time,
    feedstime: formatTime(time),
    appid: 311,
    typeid: Number(raw.typeid) || 0,
    appType: media.some((item) => item.type === 'video' || item.is_video) ? '视频' : '说说',
    contentText: normalizePlainText(raw.content || ''),
    media,
    likeCount: Number(raw.praise_num || raw.praisenum || 0),
    cmtCount: Number(raw.cmtnum || raw.commentnum || comments.length || 0),
    fwdCount: Number(raw.fwdnum || raw.forwardnum || 0),
    viewCount: Number(raw.visitorCount || raw['visitorCount '] || 0),
    deviceName: raw.source_name || raw.source || raw.deviceName || '',
    inlineComments: comments,
    comments
  }
}

function normalizeFeed(raw) {
  const html = raw.html || ''
  let contentBlock = extractFirstByClass(html, 'qz_info_cut') || extractFirstByClass(html, 'f-info')
  contentBlock = removeByClass(contentBlock, ['load_img'])
  contentBlock = contentBlock.replace(/<a\b[^>]*data-cmd=(["'])qz_toggle\1[^>]*>[\s\S]*?<\/a>/gi, '')
  const contentText = stripHtmlToText(contentBlock)
  const userLink = html.match(/<a\b[^>]*href=(["'])https?:\/\/user\.qzone\.qq\.com\/(\d+)[^"']*\1[^>]*>([\s\S]*?)<\/a>/i)
  const parsedUin = userLink?.[2] || ''
  const parsedName = stripHtmlToText(userLink?.[3] || '')
  const feedMeta = html.match(/<i\b[^>]*name=(["'])feed_data\1[^>]*>/i)?.[0] || ''
  const feedMetaAttrs = parseAttrs(feedMeta)
  const abstime = Number(raw.abstime) || 0
  const appid = Number(raw.appid) || 0
  const typeid = Number(raw.typeid) || 0
  const uin = String(raw.uin || parsedUin || '')
  const inlineComments = parseCommentsHtml(html)
  const media = collectHtmlMedia(html, abstime)
  const viewMatch = stripHtmlToText(html).match(/浏览\s*(\d+)\s*次/)

  return {
    tid: raw.key || `${uin}-${abstime}`,
    topicId: feedMetaAttrs['data-topicid'] || (appid === 311 && raw.key ? `${uin}_${raw.key}__1` : ''),
    uin,
    name: raw.nickname || parsedName || uin,
    abstime,
    feedstime: raw.feedstime || formatTime(abstime),
    appid,
    typeid,
    appType: media.some((item) => item.is_video) ? '视频' : ({ 311: '说说', 4: '相册', 2: '日志', 202: '分享', 334: '转发', 537: '视频' }[appid] || '动态'),
    contentText,
    media,
    likeCount: parseLikeCountFromHtml(html),
    cmtCount: parseCountFromHtml(html, 'qz_btn_reply') || Number(raw.commentcnt || 0) || countComments(inlineComments),
    fwdCount: parseForwardCountFromHtml(html) || Number(raw.relycnt || raw.fwdnum || raw.forwardnum || 0) || 0,
    viewCount: Number(viewMatch?.[1] || 0),
    deviceName: stripHtmlToText(extractFirstByClass(html, 'phone-style')),
    inlineComments,
    comments: inlineComments
  }
}

async function enrichFullComments(client, feed, mode) {
  if (mode === 'none') return { ...feed, comments: [] }
  if (mode === 'inline') return feed
  const shown = countComments(feed.inlineComments)
  if (!feed.topicId || !feed.uin || (feed.cmtCount && shown >= feed.cmtCount)) return feed

  const pageSize = Math.max(30, Math.min(100, feed.cmtCount || 50))
  const maxPages = Math.max(1, Math.min(8, Math.ceil((feed.cmtCount || pageSize) / pageSize) + 1))
  let comments = []
  let previousCount = 0

  for (let page = 0; page < maxPages; page += 1) {
    const res = await client.getFeedComments({
      topicId: feed.topicId,
      hostUin: feed.uin,
      feedsType: 8,
      start: page * pageSize,
      num: pageSize,
      sort: 1
    })
    if (res.code !== 0) break
    const parsed = parseCommentsHtml(res.feedsHtml)
    comments = mergeComments(comments, parsed)
    const nextCount = countComments(comments)
    if (!parsed.length || nextCount === previousCount || nextCount >= (feed.cmtCount || nextCount)) break
    previousCount = nextCount
  }
  return { ...feed, comments: comments.length ? comments : feed.inlineComments }
}

async function dpapiUnprotectBase64(base64) {
  const escaped = String(base64).replace(/'/g, "''")
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$bytes = [Convert]::FromBase64String('${escaped}')
$plain = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
[Convert]::ToBase64String($plain)
`
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true
  })
  if (result.status !== 0) {
    throw new Error(`DPAPI 解密失败：${(result.stderr || result.stdout || '').trim()}`)
  }
  return Buffer.from(result.stdout.trim(), 'base64')
}

async function getChromeMasterKey(appData) {
  const localStatePath = path.join(appData, 'Local State')
  const localState = JSON.parse(await fs.readFile(localStatePath, 'utf8'))
  const encryptedKey = Buffer.from(localState.os_crypt?.encrypted_key || '', 'base64')
  if (!encryptedKey.length) throw new Error(`Local State 缺少 os_crypt.encrypted_key：${localStatePath}`)
  const dpapiBlob = encryptedKey.subarray(0, 5).toString('utf8') === 'DPAPI'
    ? encryptedKey.subarray(5)
    : encryptedKey
  return dpapiUnprotectBase64(dpapiBlob.toString('base64'))
}

async function readCookiesViaPython(dbPath) {
  const py = `
import sqlite3, json, base64, sys
db=sys.argv[1]
try:
    con=sqlite3.connect(f'file:{db}?mode=ro', uri=True)
    cur=con.cursor()
    rows=cur.execute("select host_key,name,value,encrypted_value from cookies where host_key like '%qq.com%'").fetchall()
    out=[]
    for host,name,value,encrypted in rows:
        out.append({
            "host": host,
            "name": name,
            "value": value or "",
            "encrypted": base64.b64encode(encrypted or b'').decode('ascii')
        })
    print(json.dumps(out, ensure_ascii=False))
except Exception as e:
    print(str(e), file=sys.stderr)
    sys.exit(2)
`
  const result = spawnSync('python', ['-c', py, dbPath], { encoding: 'utf8', windowsHide: true })
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || '').trim() || `无法读取 Cookie DB：${dbPath}`)
  }
  return JSON.parse(result.stdout || '[]')
}

async function decryptCookieValue(row, masterKey) {
  if (row.value) return row.value
  const encrypted = Buffer.from(row.encrypted || '', 'base64')
  if (!encrypted.length) return ''
  if (encrypted.subarray(0, 3).toString('utf8') === 'v10' || encrypted.subarray(0, 3).toString('utf8') === 'v11') {
    const nonce = encrypted.subarray(3, 15)
    const ciphertext = encrypted.subarray(15, -16)
    const tag = encrypted.subarray(-16)
    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, nonce)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  }
  const plain = await dpapiUnprotectBase64(encrypted.toString('base64'))
  return plain.toString('utf8')
}

async function authFromCookieDb(appData) {
  const candidates = [
    path.join(appData, 'Partitions', 'qzone', 'Network', 'Cookies'),
    path.join(appData, 'Network', 'Cookies')
  ]
  const dbPath = candidates.find((candidate) => fssync.existsSync(candidate))
  if (!dbPath) throw new Error(`未找到 QzonePhoto Cookie DB：${candidates.join(' 或 ')}`)

  let rows
  try {
    rows = await readCookiesViaPython(dbPath)
  } catch (error) {
    if (/locked|in use|unable to open database file|database is locked/i.test(error.message)) {
      throw new Error(`Cookie DB 正被 QzonePhoto 锁定：${dbPath}\n请先关闭 QzonePhoto，或改用 QZONE_UIN/QZONE_P_SKEY 环境变量。`)
    }
    throw error
  }

  const cookies = {}
  for (const row of rows) {
    if (!['uin', 'p_uin', 'pt2gguin', 'p_skey', 'media_p_uin', 'media_p_skey'].includes(row.name)) continue
    let value = row.value || ''
    if (!value && row.encrypted) {
      const masterKey = await getChromeMasterKey(appData)
      value = await decryptCookieValue(row, masterKey).catch(() => '')
    }
    if (value) cookies[row.name] = value
  }
  const uin = cookies.uin || cookies.p_uin || cookies.pt2gguin || cookies.media_p_uin || ''
  const pSkey = cookies.p_skey || cookies.media_p_skey || ''
  if (!uin || !pSkey) {
    throw new Error(`Cookie DB 中没有可用的 uin/p_skey 或 media_p_uin/media_p_skey。可尝试打开 QzonePhoto 重新登录后关闭应用再运行。`)
  }
  return { uin, pSkey, source: dbPath }
}

function readLevelDbLocalStorageValue(levelDbDir, keyName) {
  if (!fssync.existsSync(levelDbDir)) return ''
  const files = fssync
    .readdirSync(levelDbDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:log|ldb)$/i.test(entry.name))
    .map((entry) => path.join(levelDbDir, entry.name))
    .sort((a, b) => fssync.statSync(a).mtimeMs - fssync.statSync(b).mtimeMs)
  const keyBytes = Buffer.from(keyName, 'utf8')
  let value = ''

  const readVarint = (buffer, start) => {
    let result = 0
    let shift = 0
    let offset = start
    while (offset < buffer.length && shift <= 28) {
      const byte = buffer[offset]
      result |= (byte & 0x7f) << shift
      offset += 1
      if ((byte & 0x80) === 0) return { value: result, offset }
      shift += 7
    }
    return null
  }

  for (const file of files) {
    const buffer = fssync.readFileSync(file)
    let index = -1
    while ((index = buffer.indexOf(keyBytes, index + 1)) >= 0) {
      const afterKey = index + keyBytes.length
      const size = readVarint(buffer, afterKey)
      if (!size || size.value < 2) continue
      if (buffer[size.offset] !== 0x01) continue
      const valueStart = size.offset + 1
      const valueEnd = valueStart + size.value - 1
      if (valueEnd > buffer.length) continue
      const candidate = buffer.subarray(valueStart, valueEnd).toString('utf8')
      if (candidate) value = candidate
    }
  }
  return value
}

function authFromLocalStorage(appData) {
  const candidates = [
    path.join(appData, 'Partitions', 'qzone', 'Local Storage', 'leveldb'),
    path.join(appData, 'Local Storage', 'leveldb')
  ]
  for (const levelDbDir of candidates) {
    const pSkey = readLevelDbLocalStorageValue(levelDbDir, 'QZ-P-SKEY')
    const uin = readLevelDbLocalStorageValue(levelDbDir, 'QZ-UIN')
    if (uin && pSkey) return { uin, pSkey, source: levelDbDir }

    const cookiesJson = readLevelDbLocalStorageValue(levelDbDir, 'QZ-COOKIES')
    if (cookiesJson) {
      try {
        const cookies = JSON.parse(cookiesJson)
        const cookieUinValue = cookies.uin || cookies.p_uin || cookies.pt2gguin || ''
        const cookiePSkey = cookies.p_skey || ''
        if (cookieUinValue && cookiePSkey) {
          return { uin: cookieUinValue, pSkey: cookiePSkey, source: levelDbDir }
        }
      } catch {
        // ignore malformed stale record
      }
    }
  }
  return null
}

async function resolveAuth(args) {
  if (args.uin && args.pSkey) return { uin: args.uin, pSkey: args.pSkey, source: 'args/env' }
  const localStorageAuth = authFromLocalStorage(args.appData)
  if (localStorageAuth) return localStorageAuth
  return authFromCookieDb(args.appData)
}

function extensionFromContentType(contentType = '', mediaType = '') {
  const text = contentType.toLowerCase()
  if (text.includes('png')) return '.png'
  if (text.includes('webp')) return '.webp'
  if (text.includes('gif')) return '.gif'
  if (text.includes('jpeg') || text.includes('jpg')) return '.jpg'
  if (text.includes('mp4')) return '.mp4'
  if (text.includes('quicktime')) return '.mov'
  return mediaType === 'video' ? '.mp4' : '.jpg'
}

function isImageContentType(contentType = '') {
  return /image\/|png|jpe?g|webp|gif/i.test(contentType)
}

function existingExtensions(mediaType = '') {
  return mediaType === 'video'
    ? ['.mp4', '.mov', '.m4v', '.webm', '.jpg', '.png', '.webp', '.gif']
    : ['.jpg', '.png', '.webp', '.gif', '.mp4', '.mov']
}

function isSavedVideoFile(file = '') {
  return /\.(?:mp4|mov|m4v|webm)$/i.test(file)
}

function mediaDownloadCandidates(media, { noVideo = false } = {}) {
  const source = [media.raw, media.origin, media.url, ...(media.urls || []), media.thumb, media.pre]
  if (isVideoMedia(media)) {
    const videos = noVideo ? [] : uniqueVideoUrls(source).filter(isDownloadableVideoUrl)
    const images = uniqueImageUrls([media.thumb, media.pre, ...(media.urls || []), media.origin, media.url, media.raw])
    return [
      ...videos.map((url) => ({ url, mediaType: 'video', expectVideo: true, source: media.downloadSource || 'feed' })),
      ...images.map((url) => ({ url, mediaType: 'image', expectVideo: false, source: 'fallback' }))
    ]
  }
  return uniqueImageUrls(source).map((url) => ({ url, mediaType: 'image', expectVideo: false, source: media.downloadSource || 'feed' }))
}

async function downloadMedia(url, fileBase, mediaType, headers, overwrite, { expectVideo = false } = {}) {
  const existing = (expectVideo ? ['.mp4', '.mov', '.m4v', '.webm'] : existingExtensions(mediaType)).map((ext) => `${fileBase}${ext}`)
  if (!overwrite) {
    for (const file of existing) {
      if (fssync.existsSync(file)) return file
    }
  }
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Referer: 'https://user.qzone.qq.com/',
      Origin: 'https://user.qzone.qq.com',
      ...headers
    }
  })
  if (!response.ok) throw new Error(`下载失败 HTTP ${response.status}`)
  const contentType = response.headers.get('content-type') || ''
  if (expectVideo && isImageContentType(contentType)) {
    return { skipped: true, reason: `候选视频返回图片 content-type=${contentType}` }
  }
  const ext = extensionFromContentType(contentType, mediaType)
  const target = `${fileBase}${ext}`
  const temp = `${target}.part`
  const buffer = Buffer.from(await response.arrayBuffer())
  await fs.writeFile(temp, buffer)
  await fs.rename(temp, target)
  return target
}

async function downloadBestMedia(media, fileBase, headers, overwrite, options = {}) {
  const candidates = mediaDownloadCandidates(media, options)
  const skipped = []
  for (const candidate of candidates) {
    try {
      const saved = await downloadMedia(candidate.url, fileBase, candidate.mediaType, headers, overwrite, { expectVideo: candidate.expectVideo })
      if (saved?.skipped) {
        skipped.push(saved.reason)
        continue
      }
      if (candidate.expectVideo && !isSavedVideoFile(saved)) {
        skipped.push(`候选视频保存为非视频文件：${path.basename(saved)}`)
        continue
      }
      return { file: saved, downloadSource: candidate.source, isVideo: isSavedVideoFile(saved), skipped }
    } catch (error) {
      skipped.push(error.message || String(error))
    }
  }
  throw new Error(skipped.join('；') || '没有可下载媒体 URL')
}

function commentToMarkdown(comment, depth = 0) {
  const indent = '  '.repeat(depth)
  const who = `${comment.author || comment.uin || '未知'}${comment.uin ? ` (${comment.uin})` : ''}`
  const target = comment.targetNick ? ` 回复 @${comment.targetNick}` : ''
  const time = comment.time ? ` ${comment.time}` : ''
  const line = `${indent}- ${who}${target}${time}: ${comment.text || ''}`.trimEnd()
  return [line, ...(comment.responses || []).flatMap((reply) => commentToMarkdown(reply, depth + 1))]
}

function compactDisplayName(value) {
  const cleaned = normalizePlainText(value || '')
    .replace(/\[em\]e\d+\[\/em\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const beforeParen = cleaned.match(/^[^（(]*/u)?.[0].trim() || cleaned
  const tail = beforeParen.match(/(?:^|[-\s])([^- \s]+)$/u)?.[1]
  return normalizePlainText(tail || beforeParen || cleaned || '未知')
}

function parseCommentTimeParts(value) {
  const text = normalizePlainText(value || '').replace(/\s+/g, ' ')
  if (!text) return { day: '', display: '', clock: '' }

  let match = text.match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?\s+(\d{1,2}:\d{2})(?::\d{2})?/)
  if (match) {
    const day = `${match[1]}-${pad(match[2])}-${pad(match[3])}`
    return { day, display: `${day} ${match[4]}`, clock: match[4] }
  }

  match = text.match(/^(\d{1,2})月(\d{1,2})日\s+(\d{1,2}:\d{2})(?::\d{2})?/)
  if (match) {
    return { day: `${pad(match[1])}-${pad(match[2])}`, display: text, clock: match[3] }
  }

  match = text.match(/^(.+?)\s+(\d{1,2}:\d{2})(?::\d{2})?$/)
  if (match) return { day: match[1], display: text, clock: match[2] }

  return { day: text, display: text, clock: '' }
}

function formatLlmCommentTime(value, state) {
  const parsed = parseCommentTimeParts(value)
  if (!parsed.display) return ''
  if (parsed.day && state.lastCommentDay === parsed.day && parsed.clock) return parsed.clock
  if (parsed.day) state.lastCommentDay = parsed.day
  return parsed.display
}

function commentToLlmMarkdown(comment, depth = 0, state = { lastCommentDay: '' }) {
  const indent = '  '.repeat(depth)
  const who = compactDisplayName(comment.author || comment.uin || '未知')
  const target = comment.targetNick ? ` -> ${compactDisplayName(comment.targetNick)}` : ''
  const time = formatLlmCommentTime(comment.time, state)
  const timePart = time ? ` ${time}` : ''
  const line = `${indent}- ${who}${target}${timePart}: ${comment.text || ''}`.trimEnd()
  return [line, ...(comment.responses || []).flatMap((reply) => commentToLlmMarkdown(reply, depth + 1, state))]
}

function compactStatsEntries(feed) {
  const comments = feed.cmtCount || countComments(feed.comments)
  const videoCount = (feed.media || []).filter(isVideoMedia).length
  return [
    ['赞', feed.likeCount || 0],
    ['评', comments || 0],
    ['转', feed.fwdCount || 0],
    ['浏览', feed.viewCount || 0],
    ['媒体', feed.media?.length || 0],
    ['视频', videoCount || 0]
  ].filter(([, value]) => value > 0)
}

function compactStatsPairs(feed) {
  return compactStatsEntries(feed).map(([label, value]) => `${label} ${value}`)
}

function feedMarkdown(feed, mediaFiles) {
  const lines = [
    `# ${feed.feedstime || formatTime(feed.abstime) || feed.tid}`,
    '',
    `- 作者：${feed.name || feed.uin}${feed.uin ? ` (${feed.uin})` : ''}`,
    `- 类型：${feed.appType || '动态'} / appid=${feed.appid || ''}`,
    `- 统计：点赞 ${feed.likeCount || 0}，评论 ${feed.cmtCount || countComments(feed.comments)}，转发 ${feed.fwdCount || 0}，浏览 ${feed.viewCount || 0}`,
    feed.deviceName ? `- 设备：${feed.deviceName}` : '',
    '',
    '## 正文',
    '',
    feed.contentText || '(无正文)',
    '',
    '## 评论',
    ''
  ].filter((line) => line !== '')

  const comments = feed.comments || []
  if (comments.length) lines.push(...comments.flatMap((comment) => commentToMarkdown(comment)))
  else lines.push('(无评论或未导出评论)')

  lines.push('', '## 媒体', '')
  const savedFiles = mediaFiles.filter(Boolean)
  if (savedFiles.length) {
    savedFiles.forEach((file, index) => lines.push(`- ${String(index + 1).padStart(2, '0')}. ${path.basename(file)}`))
  } else {
    lines.push('(无媒体或未下载媒体)')
  }
  lines.push('')
  return lines.join('\n')
}

function feedMarkdownLlm(feed) {
  const lines = [
    `# ${feed.feedstime || formatTime(feed.abstime) || feed.tid}`,
    ''
  ]
  const stats = compactStatsPairs(feed)
  if (stats.length) lines.push(stats.join(' / '), '')
  lines.push(feed.contentText || '(无正文)', '')

  const comments = feed.comments || []
  if (comments.length) {
    lines.push('评论:')
    const state = { lastCommentDay: '' }
    lines.push(...comments.flatMap((comment) => commentToLlmMarkdown(comment, 0, state)), '')
  }
  return lines.join('\n')
}

function compactCommentForJson(comment, state) {
  const result = {
    author: compactDisplayName(comment.author || comment.uin || '未知'),
    text: comment.text || ''
  }
  if (comment.time) result.time = formatLlmCommentTime(comment.time, state)
  if (comment.targetNick) result.replyTo = compactDisplayName(comment.targetNick)
  const replies = (comment.responses || []).map((reply) => compactCommentForJson(reply, state))
  if (replies.length) result.replies = replies
  return result
}

function compactStatsObject(feed) {
  const result = {}
  for (const [label, value] of compactStatsEntries(feed)) {
    const key = { 赞: 'likes', 评: 'comments', 转: 'forwards', 浏览: 'views', 媒体: 'media', 视频: 'videos' }[label]
    if (key) result[key] = value
  }
  return result
}

function feedSummaryForJson(feed, mediaFiles, feedDir, outDir, args, mediaDownloads = []) {
  if (args.format === 'llm') {
    const commentState = { lastCommentDay: '' }
    const comments = (feed.comments || []).map((comment) => compactCommentForJson(comment, commentState))
    const result = {
      time: feed.feedstime || formatTime(feed.abstime),
      text: feed.contentText,
      stats: compactStatsObject(feed),
      directory: path.relative(outDir, feedDir)
    }
    if (comments.length) result.comments = comments
    return result
  }

  return {
    tid: feed.tid,
    topicId: feed.topicId,
    uin: feed.uin,
    name: feed.name,
    time: feed.feedstime || formatTime(feed.abstime),
    appid: feed.appid,
    type: feed.appType,
    text: feed.contentText,
    stats: {
      likes: feed.likeCount || 0,
      comments: feed.cmtCount || countComments(feed.comments),
      forwards: feed.fwdCount || 0,
      views: feed.viewCount || 0
    },
    comments: feed.comments || [],
    media: feed.media.map((media, index) => ({
      id: media.id,
      name: media.name,
      type: media.type,
      localFile: mediaFiles[index] ? path.relative(outDir, mediaFiles[index]) : '',
      downloadSource: mediaDownloads[index]?.downloadSource || media.downloadSource || '',
      ...(args.includeUrls ? { url: media.raw || media.origin || media.url || media.thumb } : {})
    })),
    directory: path.relative(outDir, feedDir)
  }
}

async function exportFeeds(args) {
  if (!args.target) throw new Error('--target 必填')
  const outDir = args.out || path.join(os.homedir(), 'Pictures', 'QzonePhoto', 'exports', rawUin(args.target))

  const auth = await resolveAuth(args)
  const client = new QzoneClient(auth)
  await fs.mkdir(outDir, { recursive: true })
  console.log(`登录态来源：${auth.source}`)
  console.log(`输出目录：${outDir}`)

  const allFeeds = []
  if (args.source === 'shuoshuo') {
    let pos = 0
    let page = 0
    while (true) {
      page += 1
      const res = await client.getShuoshuo(args.target, pos, args.pageSize)
      const msgList = Array.isArray(res?.msglist) ? res.msglist : []
      const ok = msgList.length > 0 || Number(res?.code || 0) === 0
      if (!ok) {
        if (allFeeds.length) {
          console.warn(`说说接口第 ${page} 页失败，保留已收集内容：${res?.message || res?.msg || '响应异常'}`)
          break
        }
        throw new Error(res?.message || res?.msg || '说说接口响应异常')
      }
      const feeds = msgList.map((item) => normalizeShuoshuo(item, rawUin(args.target)))
      console.log(`第 ${page} 页：解析 ${feeds.length} 条说说`)
      allFeeds.push(...feeds)
      if (args.limit && allFeeds.length >= args.limit) {
        allFeeds.length = args.limit
        break
      }
      if (msgList.length < args.pageSize) break
      pos += msgList.length
    }
  } else if (args.source === 'friend') {
    let pager = { pagenum: 1, begintime: 0, externparam: 'undefined', dayspac: 0, count: args.pageSize }
    let page = 0
    while (true) {
      page += 1
      const res = await client.getFriendFeedsForUin(args.target, pager)
      if (res.code !== 0) {
        if (allFeeds.length) {
          console.warn(`好友动态接口第 ${page} 页失败，保留已收集内容：${res.message || `code=${res.code}`}`)
          break
        }
        throw new Error(res.message || `好友动态接口返回 code=${res.code}`)
      }
      const feeds = (res.feeds || [])
        .filter((raw) => raw && raw.html && raw.uin && String(raw.uin) !== '0')
        .map(normalizeFeed)
        .filter((feed) => feed.uin === rawUin(args.target))
      console.log(`第 ${page} 页：解析 ${feeds.length} 条好友动态`)
      allFeeds.push(...feeds)
      if (args.limit && allFeeds.length >= args.limit) {
        allFeeds.length = args.limit
        break
      }
      if (!res.hasMore || !res.feeds?.length) break
      pager = { ...pager, ...(res.pager || {}) }
    }
  } else {
    let pager = { start: 0, count: args.pageSize }
    let page = 0
    while (true) {
      page += 1
      let res = null
      for (let attempt = 1; attempt <= 4; attempt += 1) {
        res = await client.getHomeFeeds(args.target, pager)
        if (res.code === 0) break
        if (attempt < 4 && /Invalid right|network busy|频繁|busy/i.test(String(res.message || ''))) {
          const waitMs = attempt * 3000
          console.warn(`主页接口第 ${page} 页失败，${waitMs / 1000}s 后重试：${res.message || `code=${res.code}`}`)
          await sleep(waitMs)
          continue
        }
        break
      }
      if (res.code !== 0) {
        if (allFeeds.length) {
          console.warn(`主页接口第 ${page} 页失败，保留已收集内容：${res.message || `code=${res.code}`}`)
          break
        }
        throw new Error(res.message || `主页接口返回 code=${res.code}`)
      }
      const feeds = (res.feeds || [])
        .filter((raw) => raw && raw.html && raw.uin && String(raw.uin) !== '0')
        .map(normalizeFeed)
        .filter((feed) => feed.uin === rawUin(args.target))
      console.log(`第 ${page} 页：解析 ${feeds.length} 条`)
      allFeeds.push(...feeds)
      if (args.limit && allFeeds.length >= args.limit) {
        allFeeds.length = args.limit
        break
      }
      if (!res.hasMore || !res.feeds?.length) break
      pager = { ...pager, ...(res.pager || {}) }
      await sleep(800)
    }
  }

  let feedsForExport = allFeeds
  const feedVideoCount = allFeeds.reduce((sum, feed) => sum + (feed.media || []).filter(isVideoMedia).length, 0)
  if (!args.skipMedia && !args.noVideo && feedVideoCount > 0) {
    console.log(`检测到 ${feedVideoCount} 个视频媒体，正在解析真实 mp4 地址...`)
    try {
      const videoIndex = await fetchVideoIndex(client, args.target)
      console.log(`视频列表索引：${videoIndex.length} 条`)
      feedsForExport = enrichFeedVideosWithIndex(allFeeds, videoIndex)
    } catch (error) {
      console.warn(`视频列表解析失败，将回退到 feed 内媒体地址：${error.message || error}`)
      feedsForExport = enrichFeedVideosWithIndex(allFeeds, [])
    }
  } else if (args.noVideo && feedVideoCount > 0) {
    console.log(`已禁用真实视频解析，${feedVideoCount} 个视频将按封面/已有地址处理`)
    feedsForExport = enrichFeedVideosWithIndex(allFeeds, [])
  }

  const exported = []
  const llmDocuments = []
  const seenDirs = new Set()
  for (let i = 0; i < feedsForExport.length; i += 1) {
    const baseFeed = feedsForExport[i]
    const feed = await enrichFullComments(client, baseFeed, args.comments)
    const snippet = sanitizeFilename(feed.contentText || feed.tid || 'feed', 'feed', 64)
    const dirBase = args.format === 'llm'
      ? `${dateTag(feed.abstime)}_${snippet}`
      : `${dateTag(feed.abstime)}_${snippet}_${sanitizeFilename(feed.tid, 'feed', 32)}`
    let dirName = dirBase
    let collision = 2
    while (seenDirs.has(dirName)) {
      dirName = `${dirBase}_${collision}`
      collision += 1
    }
    seenDirs.add(dirName)
    const feedDir = path.join(outDir, dirName)
    await fs.mkdir(feedDir, { recursive: true })

    const mediaFiles = new Array(feed.media.length).fill('')
    const mediaDownloads = new Array(feed.media.length).fill(null)
    if (!args.skipMedia) {
      for (let m = 0; m < feed.media.length; m += 1) {
        const media = feed.media[m]
        const fileBase = path.join(feedDir, `${String(m + 1).padStart(2, '0')}_${sanitizeFilename(media.name || media.type || 'media', 'media', 50)}`)
        try {
          const saved = await downloadBestMedia(media, fileBase, { Cookie: client.cookie() }, args.overwrite, { noVideo: args.noVideo })
          mediaFiles[m] = saved.file
          mediaDownloads[m] = saved
          if (isVideoMedia(media) && !saved.isVideo && !args.noVideo) {
            console.warn(`视频未解析为 mp4，已保存封面：${feed.tid} #${m + 1}`)
          }
        } catch (error) {
          console.warn(`媒体下载失败：${feed.tid} #${m + 1} ${error.message}`)
        }
      }
    }

    const markdown = args.format === 'llm' ? feedMarkdownLlm(feed) : feedMarkdown(feed, mediaFiles)
    await fs.writeFile(path.join(feedDir, 'index.md'), markdown, 'utf8')
    if (args.format === 'llm') llmDocuments.push(markdown)
    exported.push(feedSummaryForJson(feed, mediaFiles, feedDir, outDir, args, mediaDownloads))
    console.log(`已导出 ${i + 1}/${feedsForExport.length}：${feed.feedstime || feed.tid}，媒体 ${mediaFiles.filter(Boolean).length}/${feed.media.length}，评论 ${countComments(feed.comments)}`)
  }

  const summary = {
    exportedAt: new Date().toISOString(),
    count: exported.length,
    options: {
      format: args.format,
      source: args.source,
      comments: args.comments,
      skipMedia: args.skipMedia,
      noVideo: args.noVideo,
      includeUrls: args.includeUrls
    },
    feeds: exported
  }
  if (args.format !== 'llm') {
    summary.loginUin = rawUin(auth.uin)
    summary.targetUin = rawUin(args.target)
  }
  await fs.writeFile(path.join(outDir, 'feeds.json'), JSON.stringify(summary, null, 2), 'utf8')
  if (args.format === 'llm') {
    await fs.writeFile(path.join(outDir, 'llm-corpus.md'), llmDocuments.join('\n---\n'), 'utf8')
    await fs.writeFile(
      path.join(outDir, 'index.md'),
      [
        '# Qzone LLM corpus',
        '',
        `- 导出时间：${summary.exportedAt}`,
        `- 动态数量：${summary.count}`,
        '- 汇总语料：[llm-corpus.md](llm-corpus.md)',
        '',
        ...exported.map((feed, index) => `${index + 1}. [${feed.time}](${feed.directory.replace(/\\/g, '/')}/index.md) ${feed.text.split('\n')[0] || ''}`)
      ].join('\n'),
      'utf8'
    )
    return { outDir, count: exported.length }
  }
  await fs.writeFile(
    path.join(outDir, 'index.md'),
    [
      `# Qzone feeds export ${rawUin(args.target)}`,
      '',
      `- 导出时间：${summary.exportedAt}`,
      `- 登录账号：${summary.loginUin}`,
      `- 目标账号：${summary.targetUin}`,
      `- 动态数量：${summary.count}`,
      '',
      ...exported.map((feed, index) => `${index + 1}. [${feed.time} ${feed.type}](${feed.directory.replace(/\\/g, '/')}/index.md) ${feed.text.split('\n')[0] || feed.tid}`)
    ].join('\n'),
    'utf8'
  )
  return { outDir, count: exported.length }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(HELP.trim())
    return
  }
  const result = await exportFeeds(args)
  console.log(`完成：${result.count} 条动态，位置：${result.outDir}`)
}

main().catch((error) => {
  console.error(error.message || error)
  process.exitCode = 1
})
