import { test, expect } from '@playwright/test';

// Declare process to satisfy typescript in case @types/node is missing
declare const process: any;

// Define the base URL. Using environment variable or default local dev server.
const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

test.describe('CMH Chatbot - Core Modules & Chat UI E2E Tests', () => {

  test.beforeEach(async ({ page }) => {
    // Start at the base URL before each test
    await page.goto(BASE_URL);
    // Wait for the app to initialize
    await page.waitForLoadState('networkidle');
  });

  // ==========================================
  // 1. Chat UI & Model Interaction Test
  // ==========================================
  test.describe('1. Chat UI Operations', () => {
    test('Should send a chat message and switch models successfully', async ({ page }) => {
      // 1. Navigate to Chat interface (Assuming dashboard or specific chat route)
      await page.goto(`${BASE_URL}/#/chat`); // adjust route if needed, e.g. /#/dashboard
      
      // 2. Locate the model selector dropdown and change the model
      const modelSelector = page.locator('.chat-model-selector, .sw-single-select').first();
      if (await modelSelector.isVisible()) {
        await modelSelector.click();
        
        // Select a model from the list (e.g., fallback-google-gemini-2.5-flash or local model)
        const dropdownItem = page.locator('.sw-select-result, .mt-select-option').nth(1);
        await dropdownItem.click();
      }

      // 3. Locate the chat input and type a prompt
      const chatInput = page.locator('textarea, input.chat-input');
      await expect(chatInput).toBeVisible();
      await chatInput.fill('Hello from Playwright E2E Test!');

      // 4. Send the message
      // Either press Enter or click the Send button
      const sendButton = page.locator('button.chat-send-btn, .sw-button--primary[aria-label="Send"], i.ph-paper-plane-right').locator('..');
      if (await sendButton.isVisible()) {
        await sendButton.click();
      } else {
        await chatInput.press('Enter');
      }

      // 5. Verify the user message appeared in the chat window
      const userMessage = page.locator('.chat-message--user, .message-bubble.user').last();
      await expect(userMessage).toContainText('Hello from Playwright E2E Test!');

      // 6. Wait for the AI bot response to arrive (timeout 30s to allow for API generation)
      const botMessage = page.locator('.chat-message--bot, .message-bubble.bot').last();
      await expect(botMessage).toBeVisible({ timeout: 30000 });
      // Ensure the bot response has content
      expect(await botMessage.textContent()).not.toBe('');
    });
  });

  // ==========================================
  // 2. Provider CRUD Test
  // ==========================================
  test.describe('2. Provider Management (CRUD)', () => {
    const testProviderName = `E2E Test Provider ${Date.now()}`;

    test('Should Create a new Provider', async ({ page }) => {
      await page.goto(`${BASE_URL}/#/cmh/provider/list`);
      
      // Click Add Provider button
      const addButton = page.locator('.sw-button--primary:has-text("Add"), button:has-text("추가"), button.add-provider-btn');
      await addButton.click();
      
      // Ensure we are on the create page
      await expect(page).toHaveURL(/.*\/cmh\/provider\/create/);

      // Fill in provider details
      await page.locator('input[name="name"]').fill(testProviderName);
      
      // Select provider type (Cloud API or Local)
      const typeSelect = page.locator('.sw-single-select[name="type"]');
      if (await typeSelect.isVisible()) {
        await typeSelect.click();
        await page.locator('.sw-select-result:has-text("Cloud API")').first().click();
      }

      // Fill API Key if visible
      const apiKeyInput = page.locator('input[name="apiKey"]');
      if (await apiKeyInput.isVisible()) {
        await apiKeyInput.fill('sk-test-fake-api-key-from-playwright');
      }

      // Click Save
      const saveButton = page.locator('.sw-button--primary:has-text("Save"), .sw-button--primary:has-text("저장")');
      await saveButton.click();

      // Wait for success notification
      const notification = page.locator('.sw-alert--success, .sw-notification--success');
      await expect(notification).toBeVisible();
    });

    test('Should Read and Update the existing Provider', async ({ page }) => {
      await page.goto(`${BASE_URL}/#/cmh/provider/list`);
      
      // Search for the provider created in the previous step
      const searchInput = page.locator('.sw-search-bar__input, input.search-bar');
      await searchInput.fill(testProviderName);
      await searchInput.press('Enter');

      // Wait for grid to update
      await page.waitForTimeout(1000); // give time for debounce/fetch

      // Click on the matching row's Name column to edit
      const targetRow = page.locator('.sw-data-grid__row:has-text("' + testProviderName + '")');
      await targetRow.locator('a.sw-data-grid__cell-content, a.cell-link').first().click();

      // Update the name
      const updatedName = `${testProviderName} (Updated)`;
      const nameInput = page.locator('input[name="name"]');
      await expect(nameInput).toBeVisible();
      await nameInput.fill(updatedName);

      // Save changes
      const saveButton = page.locator('.sw-button--primary:has-text("Save"), .sw-button--primary:has-text("저장")');
      await saveButton.click();

      // Verify success
      const notification = page.locator('.sw-alert--success, .sw-notification--success');
      await expect(notification).toBeVisible();
    });

    test('Should Delete the updated Provider', async ({ page }) => {
      await page.goto(`${BASE_URL}/#/cmh/provider/list`);
      
      // Search for the updated provider
      const searchInput = page.locator('.sw-search-bar__input, input.search-bar');
      await searchInput.fill('(Updated)');
      await searchInput.press('Enter');
      await page.waitForTimeout(1000);

      // Hover on the row to show the context menu (actions)
      const targetRow = page.locator('.sw-data-grid__row:has-text("(Updated)")').first();
      await targetRow.hover();

      // Click context menu button (three dots)
      const contextMenuBtn = targetRow.locator('.sw-context-button__button, .actions-menu-btn');
      await contextMenuBtn.click();

      // Click Delete action
      const deleteAction = page.locator('.sw-context-menu-item--danger, .action-delete');
      await deleteAction.click();

      // Confirm deletion in the modal
      const confirmDeleteBtn = page.locator('.sw-modal__footer .sw-button--danger, .sw-button--primary.confirm-delete');
      await expect(confirmDeleteBtn).toBeVisible();
      await confirmDeleteBtn.click();

      // Wait for success and disappearance of the row
      await expect(targetRow).toBeHidden();
    });
  });

  // ==========================================
  // 3. Trigger / Workflow CRUD Test
  // ==========================================
  test.describe('3. Trigger / Workflow Management (CRUD)', () => {
    const testTriggerName = `E2E Test Trigger ${Date.now()}`;

    test('Should Create a new Trigger', async ({ page }) => {
      // Navigate to trigger list (Assuming /#/cmh/trigger/list based on prompt)
      await page.goto(`${BASE_URL}/#/cmh/trigger/list`);
      
      const addButton = page.locator('.sw-button--primary:has-text("Add"), button:has-text("추가")');
      if (await addButton.isVisible()) {
        await addButton.click();
        
        // Fill base info
        await page.locator('input[name="name"], input.trigger-name-input').fill(testTriggerName);
        await page.locator('textarea[name="condition"], textarea.trigger-condition').fill('When user says hello');
        await page.locator('textarea[name="action"], textarea.trigger-action').fill('Respond with greeting workflow');
        
        // Save
        const saveButton = page.locator('.sw-button--primary:has-text("Save"), .sw-button--primary:has-text("저장")');
        await saveButton.click();
        
        await expect(page.locator('.sw-notification--success')).toBeVisible();
      }
    });

    test('Should Delete the Trigger', async ({ page }) => {
      await page.goto(`${BASE_URL}/#/cmh/trigger/list`);
      
      // Simple Search and Delete via Context menu
      const searchInput = page.locator('.sw-search-bar__input, input.search-bar');
      if (await searchInput.isVisible()) {
        await searchInput.fill(testTriggerName);
        await searchInput.press('Enter');
        await page.waitForTimeout(1000);

        const targetRow = page.locator('.sw-data-grid__row:has-text("' + testTriggerName + '")').first();
        if (await targetRow.isVisible()) {
          await targetRow.locator('.sw-context-button__button').click();
          await page.locator('.sw-context-menu-item--danger').click();
          await page.locator('.sw-modal__footer .sw-button--danger').click();
          await expect(targetRow).toBeHidden();
        }
      }
    });
  });

  // ==========================================
  // 4. Settings Test
  // ==========================================
  test.describe('4. Settings Configuration', () => {
    test('Should update App Settings (TTS/STT)', async ({ page }) => {
      await page.goto(`${BASE_URL}/#/cmh/settings/detail`);
      
      // Wait for Settings card to mount
      await expect(page.locator('.sw-card').first()).toBeVisible();

      // Change STT Configuration via Select
      const sttSelect = page.locator('.sw-single-select[name="sttModel"], .stt-select').first();
      if (await sttSelect.isVisible()) {
        await sttSelect.click();
        await page.locator('.sw-select-result').first().click();
      }

      // Change TTS Configuration via Select 
      const ttsSelect = page.locator('.sw-single-select[name="ttsModel"], .tts-select').first();
      if (await ttsSelect.isVisible()) {
        await ttsSelect.click();
        await page.locator('.sw-select-result').last().click();
      }

      // Click Save Settings button
      const saveButton = page.locator('.sw-button--primary:has-text("Save"), button.save-settings-btn');
      if (await saveButton.isVisible()) {
        await saveButton.click();
        // Verify 
        const notification = page.locator('.sw-alert--success, .sw-notification--success');
        await expect(notification).toBeVisible();
      }
    });
  });

});
