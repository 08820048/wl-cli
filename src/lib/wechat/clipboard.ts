import {execFile} from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {promisify} from 'node:util'

const execFileAsync = promisify(execFile)

const JXA_CLIPBOARD_SCRIPT = `
ObjC.import('AppKit')
ObjC.import('Foundation')

function readFile(path) {
  const content = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null)
  return ObjC.unwrap(content)
}

function run(argv) {
  const html = readFile(argv[0])
  const plain = readFile(argv[1])
  const pasteboard = $.NSPasteboard.generalPasteboard
  pasteboard.clearContents
  pasteboard.setStringForType($(plain), $.NSPasteboardTypeString)
  pasteboard.setDataForType($(html).dataUsingEncoding($.NSUTF8StringEncoding), 'public.html')
}
`.trim()

export async function writeWechatHtmlToClipboard(input: {html: string; plainText: string}): Promise<void> {
  if (process.platform !== 'darwin') {
    throw new Error('当前版本的 wl copy wechat 仅支持 macOS')
  }

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wl-wechat-clipboard-'))
  const htmlPath = path.join(tmpRoot, 'content.html')
  const plainPath = path.join(tmpRoot, 'content.txt')

  try {
    await fs.writeFile(htmlPath, input.html, 'utf8')
    await fs.writeFile(plainPath, input.plainText, 'utf8')
    await execFileAsync('osascript', ['-l', 'JavaScript', '-e', JXA_CLIPBOARD_SCRIPT, htmlPath, plainPath])
  } finally {
    await fs.rm(tmpRoot, {force: true, recursive: true})
  }
}
