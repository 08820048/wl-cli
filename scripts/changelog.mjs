import fs from 'node:fs'
import path from 'node:path'

const CHANGELOG_PATH = path.resolve('CHANGELOG.md')

function readChangelog() {
  if (!fs.existsSync(CHANGELOG_PATH)) {
    throw new Error(`CHANGELOG.md was not found at ${CHANGELOG_PATH}`)
  }

  return fs.readFileSync(CHANGELOG_PATH, 'utf8').replaceAll('\r\n', '\n')
}

function extractSection(content, version) {
  const escapedVersion = version.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
  const sectionPattern = new RegExp(
    `^## \\[${escapedVersion}\\](?: - .+)?\\n([\\s\\S]*?)(?=^## \\[|\\Z)`,
    'm',
  )

  const match = content.match(sectionPattern)
  if (!match) {
    throw new Error(
      `Missing changelog section for version ${version}. Add a '## [${version}]' section to CHANGELOG.md before releasing.`,
    )
  }

  return match[1].trim()
}

function validateSection(section, version) {
  const hasListItem = /^(?:- |\* |\d+\. )/m.test(section)
  const isPlaceholder = /Update this section before the next release\./.test(section)

  if (!section || !hasListItem || isPlaceholder) {
    throw new Error(
      `The changelog section for version ${version} is empty or still using the placeholder text.`,
    )
  }
}

function buildReleaseNotes(version) {
  const content = readChangelog()
  const section = extractSection(content, version)
  validateSection(section, version)

  return [
    `## Welight CLI ${version}`,
    '',
    section,
    '',
    '## Install',
    '',
    '```bash',
    'npm i -g welight-cli',
    '```',
    '',
  ].join('\n')
}

function main() {
  const [command, version] = process.argv.slice(2)

  if (!command || !version) {
    throw new Error('Usage: node scripts/changelog.mjs <check|release-notes> <version>')
  }

  const content = readChangelog()
  const section = extractSection(content, version)
  validateSection(section, version)

  if (command === 'check') {
    console.log(`CHANGELOG.md entry for ${version} looks good.`)
    return
  }

  if (command === 'release-notes') {
    process.stdout.write(buildReleaseNotes(version))
    return
  }

  throw new Error(`Unknown command '${command}'. Use 'check' or 'release-notes'.`)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
