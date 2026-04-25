import { test, expect } from '@playwright/test'

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5200'

test.describe('Refactoring F-items regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/#/chat`)
    await page.waitForLoadState('networkidle')
  })

  test('F-1 textarea auto-resize on newline', async ({ page }) => {
    const textarea = page.locator('.cmh-chat-input__textarea').first()
    await expect(textarea).toBeVisible()

    const before = await textarea.evaluate((el) => (el as HTMLTextAreaElement).clientHeight)
    await textarea.fill('line1\nline2\nline3\nline4')
    const after = await textarea.evaluate((el) => (el as HTMLTextAreaElement).clientHeight)

    expect(after).toBeGreaterThan(before)
  })

  test('F-1 cloud/no-key notice and disabled model option', async ({ page }) => {
    const modelSelect = page.locator('.cmh-chat-input__select-wrap').nth(1)
    await expect(modelSelect).toBeVisible()
    await modelSelect.click()

    const noKeyNotice = page.locator('.cmh-chat-input__no-key-notice').first()
    const disabledModel = page.locator('.cmh-chat-input__dropdown-option.is--disabled').first()

    const hasNoKeyUi = (await noKeyNotice.count()) > 0 || (await disabledModel.count()) > 0
    test.skip(!hasNoKeyUi, 'no-key provider/model 상태가 현재 데이터에 없음')

    if ((await noKeyNotice.count()) > 0) {
      await expect(noKeyNotice).toBeVisible()
    }
    if ((await disabledModel.count()) > 0) {
      await expect(disabledModel).toBeDisabled()
    }
  })

  test('F-2 selected model is restored after reload', async ({ page }) => {
    const modelSelect = page.locator('.cmh-chat-input__select-wrap').nth(1)
    await expect(modelSelect).toBeVisible()
    await modelSelect.click()

    const enabledOptions = page.locator('.cmh-chat-input__dropdown-option:not(.is--disabled)')
    const optionCount = await enabledOptions.count()
    test.skip(optionCount < 2, '모델 복원 검증을 위한 selectable model이 2개 미만')

    const target = enabledOptions.nth(1)
    const selectedName = (await target.locator('.cmh-chat-input__dropdown-name').innerText()).trim()
    await target.click()

    await page.reload()
    await page.waitForLoadState('networkidle')

    const selectedLabel = page.locator('.cmh-chat-input__select-wrap .cmh-chat-input__select-label').nth(1)
    await expect(selectedLabel).toContainText(selectedName)
  })
})
