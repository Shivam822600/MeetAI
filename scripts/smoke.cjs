const { _electron: electron, expect } = require('@playwright/test')
const { mkdtemp, rm, writeFile, mkdir } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')

async function main() {
  const profile = await mkdtemp(join(tmpdir(), 'meetpilot-smoke-'))
  const artifacts = resolve('artifacts')
  await mkdir(artifacts, { recursive: true })
  const errors = []
  let app
  const launch = async () => {
    const instance = await electron.launch({
      args: [...(process.platform === 'linux' ? ['--no-sandbox', '--disable-gpu'] : []), resolve('.')],
      env: {
        ...process.env,
        MEETPILOT_TEST_DATA: profile,
        OPENAI_API_KEY: '',
        DEEPGRAM_API_KEY: '',
        ELECTRON_RENDERER_URL: '',
        ELECTRON_RUN_AS_NODE: ''
      },
      timeout: 30000
    })
    instance.on('window', (page) => page.on('pageerror', (error) => errors.push(error.message)))
    return instance
  }
  try {
    app = await launch()
    const page = await app.firstWindow()
    await expect(page.getByRole('heading', { name: 'A little clarity. A lot of confidence.' })).toBeVisible()
    await page.waitForFunction(() => !!window.meetpilot)
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByLabel('Explicit mock mode', { exact: false }).check()
    await page.getByRole('button', { name: 'Save settings', exact: true }).click()
    await expect(page.getByRole('status')).toHaveText('Settings saved securely.')
    await page.getByRole('button', { name: 'Project knowledge', exact: true }).click()
    await page.getByRole('button', { name: 'New project', exact: true }).click()
    await page.getByLabel('Name', { exact: true }).fill('Smoke project')
    await page.getByLabel('Description', { exact: true }).fill('Local end-to-end verification')
    await page.getByRole('button', { name: 'Save project', exact: true }).click()
    await expect(page.getByLabel('Project', { exact: true })).not.toHaveValue('')
    const document = join(profile, 'review.md')
    await writeFile(document, 'Reviewed local architecture. No upload during mock smoke testing.')
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })
    }, document)
    await page.getByRole('button', { name: 'Review a document', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Review before importing' })).toBeVisible()
    expect(await page.getByLabel('Text to index', { exact: false }).inputValue()).toContain(
      'Reviewed local architecture'
    )
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
    await page.getByRole('button', { name: 'Start a meeting', exact: false }).click()
    await page.getByLabel('Meeting topic', { exact: true }).fill('Smoke design review')
    await page.getByLabel('Project context', { exact: true }).selectOption({ label: 'Smoke project' })
    await page.getByLabel('I have informed the participants', { exact: false }).check()
    await page.getByRole('button', { name: 'Consent & start', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Smoke design review', exact: true })).toBeVisible()
    await expect(page.locator('.answer-text')).toContainText('[MOCK ANSWER]', { timeout: 20000 })
    await page.waitForFunction(async () =>
      (await window.meetpilot.bootstrap()).state.answers.some((a) => a.status === 'complete')
    )
    await expect(page.locator('.answer-meta')).toContainText('complete')
    await page.screenshot({ path: join(artifacts, 'live-meeting.png'), fullPage: true })
    const floating = app.waitForEvent('window')
    await page.getByRole('button', { name: 'Float', exact: true }).click()
    const overlay = await floating
    await expect(overlay.locator('.answer-text')).toContainText('[MOCK ANSWER]')
    await overlay.getByRole('button', { name: 'Pause', exact: true }).click()
    await expect(overlay.getByRole('button', { name: 'Resume', exact: true })).toBeVisible()
    await overlay.getByRole('button', { name: 'Resume', exact: true }).click()
    await expect(overlay.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
    await overlay.getByRole('button', { name: 'Stop meeting', exact: true }).click()
    await expect(overlay.getByText('Start a meeting from the main MeetPilot window.')).toBeVisible()
    await page.getByRole('button', { name: 'Meeting history', exact: true }).click()
    await page.getByRole('button', { name: /Smoke design review/ }).click()
    await expect(page.locator('.recap')).toContainText('LOCAL EXTRACTIVE RECAP')
    await expect(page.locator('.history-answer')).not.toHaveCount(0)
    expect(errors).toEqual([])
    await app.close()
    app = await launch()
    const reopened = await app.firstWindow()
    await reopened.waitForFunction(() => !!window.meetpilot)
    const state = await reopened.evaluate(() => window.meetpilot.bootstrap())
    expect(state.meetings.some((m) => m.topic === 'Smoke design review' && m.endedAt !== null)).toBe(true)
    expect(state.projects.some((p) => p.name === 'Smoke project')).toBe(true)
    console.log(
      'PASS: settings, project creation, local document preview, consent, mock transcription/answers, overlay pause/resume/stop, history and restart persistence.'
    )
  } catch (error) {
    if (app) {
      const pages = app.windows()
      if (pages[0]) await pages[0].screenshot({ path: join(artifacts, 'smoke-failure.png') }).catch(() => {})
    }
    throw error
  } finally {
    if (app) await app.close()
    await rm(profile, { recursive: true, force: true })
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
