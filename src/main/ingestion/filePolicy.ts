import { constants } from 'node:fs'
import type { Stats } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import { extname, relative, resolve, sep } from 'node:path'

export type SupportedDocumentType =
  'text' | 'markdown' | 'docx' | 'pptx' | 'xlsx' | 'odt' | 'odp' | 'ods' | 'pdf' | 'rtf' | 'epub'
export type FilePolicyReason =
  'unsupported' | 'oversized' | 'binary' | 'symlink' | 'ignored' | 'unreadable'

export interface FilePolicyResult {
  accepted: boolean
  type?: SupportedDocumentType
  mimeType?: string
  reason?: FilePolicyReason
  message?: string
}

export interface FileSnapshot {
  path: string
  watchedRoot: string
  bytes: Uint8Array
  details: Stats
  type: SupportedDocumentType
  mimeType: string
}

export interface FilePolicyOptions {
  maximumBytes?: number
  ignoredSegments?: string[]
  /** Test seam invoked after the file handle opens and before path identity is revalidated. */
  beforeIdentityCheck?: () => Promise<void>
}

export const DEFAULT_MAXIMUM_BYTES = 10 * 1024 * 1024
const DEFAULT_IGNORED_SEGMENTS = ['.git', '.hg', '.svn', 'node_modules']
const SUPPORTED_EXTENSIONS: Record<
  string,
  { type: SupportedDocumentType; mimeType: string; textBased: boolean }
> = {
  '.txt': { type: 'text', mimeType: 'text/plain', textBased: true },
  '.md': { type: 'markdown', mimeType: 'text/markdown', textBased: true },
  '.markdown': { type: 'markdown', mimeType: 'text/markdown', textBased: true },
  '.docx': {
    type: 'docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    textBased: false
  },
  '.pptx': {
    type: 'pptx',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    textBased: false
  },
  '.xlsx': {
    type: 'xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    textBased: false
  },
  '.odt': {
    type: 'odt',
    mimeType: 'application/vnd.oasis.opendocument.text',
    textBased: false
  },
  '.odp': {
    type: 'odp',
    mimeType: 'application/vnd.oasis.opendocument.presentation',
    textBased: false
  },
  '.ods': {
    type: 'ods',
    mimeType: 'application/vnd.oasis.opendocument.spreadsheet',
    textBased: false
  },
  '.pdf': { type: 'pdf', mimeType: 'application/pdf', textBased: false },
  '.rtf': { type: 'rtf', mimeType: 'application/rtf', textBased: false },
  '.epub': { type: 'epub', mimeType: 'application/epub+zip', textBased: false }
}

/** Classifies a file and rejects unsafe or unsupported inputs non-fatally. */
export async function inspectFile(
  path: string,
  watchedRoot: string,
  options: FilePolicyOptions = {}
): Promise<FilePolicyResult> {
  try {
    const relativePath = relative(watchedRoot, path)
    const ignored = options.ignoredSegments ?? DEFAULT_IGNORED_SEGMENTS
    if (relativePath.split(/[\\/]/).some((segment) => ignored.includes(segment))) {
      return { accepted: false, reason: 'ignored', message: 'Path matches an ignored directory.' }
    }

    const details = await lstat(path)
    if (details.isSymbolicLink()) {
      return { accepted: false, reason: 'symlink', message: 'Symbolic links are not indexed.' }
    }
    if (!details.isFile()) {
      return { accepted: false, reason: 'unsupported', message: 'Only regular files are indexed.' }
    }
    if (details.size > (options.maximumBytes ?? DEFAULT_MAXIMUM_BYTES)) {
      return {
        accepted: false,
        reason: 'oversized',
        message: 'File exceeds the indexing size limit.'
      }
    }

    const document = SUPPORTED_EXTENSIONS[extname(path).toLocaleLowerCase()]
    if (!document) {
      return { accepted: false, reason: 'unsupported', message: 'File type is not supported.' }
    }

    if (document.textBased) {
      const handle = await open(path, 'r')
      try {
        const sample = Buffer.alloc(Math.min(details.size, 8192))
        await handle.read(sample, 0, sample.length, 0)
        if (sample.includes(0)) {
          return { accepted: false, reason: 'binary', message: 'Binary content is not indexed.' }
        }
        new TextDecoder('utf-8', { fatal: true }).decode(sample)
      } finally {
        await handle.close()
      }
    }
    return { accepted: true, type: document.type, mimeType: document.mimeType }
  } catch {
    return { accepted: false, reason: 'unreadable', message: 'File could not be read.' }
  }
}

function isInside(root: string, target: string): boolean {
  const result = relative(root, target)
  return (
    result === '' || (!result.startsWith(`..${sep}`) && result !== '..' && !result.startsWith(sep))
  )
}

/** Opens one canonical regular-file snapshot and rejects symlinks and path swaps. */
export async function openFileSnapshot(
  path: string,
  watchedRoot: string,
  options: FilePolicyOptions = {}
): Promise<FileSnapshot | FilePolicyResult> {
  try {
    const relativePath = relative(watchedRoot, path)
    const ignored = options.ignoredSegments ?? DEFAULT_IGNORED_SEGMENTS
    if (relativePath.split(/[\\/]/).some((segment) => ignored.includes(segment))) {
      return { accepted: false, reason: 'ignored', message: 'Path matches an ignored directory.' }
    }
    const document = SUPPORTED_EXTENSIONS[extname(path).toLocaleLowerCase()]
    if (!document) {
      return { accepted: false, reason: 'unsupported', message: 'File type is not supported.' }
    }
    const canonicalRoot = await realpath(watchedRoot)
    const requestedPath = resolve(path)
    const canonicalPath = await realpath(requestedPath)
    if (canonicalPath !== requestedPath || !isInside(canonicalRoot, canonicalPath)) {
      return { accepted: false, reason: 'symlink', message: 'Symbolic links are not indexed.' }
    }

    const handle = await open(requestedPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    try {
      const before = await handle.stat()
      if (!before.isFile()) {
        return {
          accepted: false,
          reason: 'unsupported',
          message: 'Only regular files are indexed.'
        }
      }
      const maximumBytes = options.maximumBytes ?? DEFAULT_MAXIMUM_BYTES
      if (before.size > maximumBytes) {
        return {
          accepted: false,
          reason: 'oversized',
          message: 'File exceeds the indexing size limit.'
        }
      }

      await options.beforeIdentityCheck?.()
      const currentCanonicalPath = await realpath(requestedPath)
      const current = await lstat(requestedPath)
      if (
        currentCanonicalPath !== canonicalPath ||
        current.isSymbolicLink() ||
        current.dev !== before.dev ||
        current.ino !== before.ino
      ) {
        return { accepted: false, reason: 'symlink', message: 'File changed during validation.' }
      }

      const bytes = await handle.readFile()
      const after = await handle.stat()
      if (after.size > maximumBytes || bytes.byteLength > maximumBytes) {
        return {
          accepted: false,
          reason: 'oversized',
          message: 'File exceeds the indexing size limit.'
        }
      }
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
        return { accepted: false, reason: 'unreadable', message: 'File changed during validation.' }
      }
      if (document.textBased) {
        const sample = bytes.subarray(0, Math.min(bytes.byteLength, 8192))
        if (sample.includes(0)) {
          return { accepted: false, reason: 'binary', message: 'Binary content is not indexed.' }
        }
        new TextDecoder('utf-8', { fatal: true }).decode(sample)
      }
      return {
        path: canonicalPath,
        watchedRoot: canonicalRoot,
        bytes,
        details: after,
        type: document.type,
        mimeType: document.mimeType
      }
    } finally {
      await handle.close()
    }
  } catch {
    return { accepted: false, reason: 'unreadable', message: 'File could not be read.' }
  }
}
