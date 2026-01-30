const { chromium } = require("playwright");
const { TOTP } = require("totp-generator");
const path = require("path");

class WorkerProcess {
  constructor() {
    this.browser = null;
    this.config = null;
    this.isRunning = false;
  }

  // Generate 2FA code
  async get2FACode(secret) {
    return (await TOTP.generate(secret.replace(/\s+/g, ""))).otp;
  }

  // Delay function
  delay(ms) {
    return new Promise((res) => setTimeout(res, ms));
  }

  // Send message to main process
  sendMessage(type, message, data = null, progress = null) {
    process.send({
      type,
      message,
      data,
      progress,
      timestamp: new Date().toISOString(),
    });
  }

  // Generate default fillDataFuncString with account-specific or global data
  getDefaultFillDataFunction(account, globalData) {
    // Use account-specific data if available, otherwise use global data
    const data = account.data || globalData;

    if (!data) {
      throw new Error("No data available for account");
    }

    // If account has specific data, create arrays with just that account's data
    let dataArrays;
    if (account.data) {
      dataArrays = {
        A: [data.A],
        B: [data.B],
        C: [data.C],
        D: [data.D],
      };
    } else {
      // Use global data arrays
      dataArrays = data;
    }

    return `
function fillRandomData() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const A_Data = ${JSON.stringify(dataArrays.A)};
  const B_Data = ${JSON.stringify(dataArrays.B)};
  const C_Data = ${JSON.stringify(dataArrays.C)};
  const D_Data = ${JSON.stringify(dataArrays.D)};
  
  const startRow = 2;
  const numRows = Math.min(A_Data.length, B_Data.length, C_Data.length, D_Data.length);
  sheet.getRange(startRow, 3, numRows, 2).clearContent();
  for (let i = 0; i < numRows; i++) {
    sheet.getRange(startRow + i, 1).setValue(A_Data[i]);
    sheet.getRange(startRow + i, 2).setValue(B_Data[i]);
    sheet.getRange(startRow + i, 3).setValue(C_Data[i]);
    sheet.getRange(startRow + i, 4).setValue(D_Data[i]);
  }
}
`;
  }

  // Get permission required function
  getPermissionRequiredFunction() {
    return `
function showAuthorizationPopup() {
  SpreadsheetApp.getActiveSpreadsheet();
  Session.getActiveUser().getEmail();
  MailApp.getRemainingDailyQuota()
}
`;
  }

  // Get send emails function
  getSendEmailsFunction() {
    return `
function shareSingleFormToList_GR_v2() {
  var formUrl = "https://docs.google.com/forms/d/e/1FAIpQLSfRXFtxcCgr1xQbKsBahcI8zZ7shwhZ5g1PQeYhBuXWboFQGQ/viewform?usp=dialog";
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Sheet1") || ss.getSheetByName("Hoja 1");
  
  if (!sheet) {
    throw new Error("Không tìm thấy Sheet 1 hoặc Hoja 1");
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var values = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  var senderName = "Meta Verified";
  var replyAddress = Session.getActiveUser().getEmail();

  var subjectVariants = [
    "Meta Blueの検証ステータス",
    "必要な操作: メタデータ検証",
    "検証センター通知",
    "Metaアカウント認証の更新",
    "アカウント情報",
    "アカウント通知",
    "アカウントの詳細",
    "Meta アカウントを更新します。",
    "アカウントのステータス",
    "重要なアカウント通知。",
    "Metaからの通知。",
    "Metaアカウント認証",
    "アカウント確認情報"
  ];

  var openingPool = [];
  var closingPool = [];

  for (var i = 0; i < values.length; i++) {
    if (values[i][2]) openingPool.push(values[i][2].toString());
    if (values[i][3]) closingPool.push(values[i][3].toString());
  }

  if (openingPool.length === 0 || closingPool.length === 0) {
    throw new Error("Cột C hoặc D không có nội dung để random");
  }

  var MAX_PER_RUN = 200;
  var sentCount = 0;
  var quota = MailApp.getRemainingDailyQuota();
  
  if (quota <= 0) return;
  var hardLimit = Math.min(MAX_PER_RUN, quota);

  for (var i = 0; i < values.length; i++) {
    if (sentCount >= hardLimit) break;

    var rowIndex = i + 2;
    var email = (values[i][0] || "").toString().trim();
    var pageName = (values[i][1] || "").toString().trim();

    if (!email) continue;

    var status = String(sheet.getRange(rowIndex, 5).getValue() || "").toLowerCase();
    if (status === "✅ sent") continue;

    if (!isValidEmail_(email)) {
      sheet.getRange(rowIndex, 5).setValue("invalid");
      sheet.getRange(rowIndex, 6).setValue(new Date());
      continue;
    }

    var opening = openingPool[Math.floor(Math.random() * openingPool.length)];
    var closing = closingPool[Math.floor(Math.random() * closingPool.length)];

    opening = opening.replace(/\\[name\\]/gi, pageName || "");
    closing = closing.replace(/\\[name\\]/gi, pageName || "");

    var fullBody = "Dear " + (pageName || "User") + ",\\\\n\\\\n" + opening + "\\\\n\\\\n" + formUrl + "\\\\n\\\\n" + closing;
    var subject = subjectVariants[i % subjectVariants.length];

    try {
      MailApp.sendEmail({
        to: email,
        subject: subject,
        body: fullBody,
        name: senderName,
        replyTo: replyAddress
      });

      Logger.log(rowIndex + " | " + email + " | ✅ Sent");
      sheet.getRange(rowIndex, 5).setValue("✅ Sent");
      sheet.getRange(rowIndex, 6).setValue(new Date());
      sentCount++;
      Utilities.sleep(18000);

    } catch (e) {
      Logger.log(rowIndex + " | " + email + " | ❌ ERROR - STOP");
      sheet.getRange(rowIndex, 5).setValue("❌ Error");
      sheet.getRange(rowIndex, 6).setValue(new Date());
      throw e;
    }
  }

  SpreadsheetApp.flush();
}

function isValidEmail_(email) {
  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/i.test(email);
}
`;
  }

  // Process single account
  async processAccount(account, accountIndex, totalAccounts) {
    const { email, password, secretKey } = account;

    try {
      this.sendMessage(
        "progress",
        `Processing account ${accountIndex + 1}/${totalAccounts}: ${email}`,
        null,
        {
          current: accountIndex + 1,
          total: totalAccounts,
        },
      );

      const userDataDir = path.join(
        __dirname,
        "..",
        "user-data",
        `worker-${email}`,
      );

      // Launch browser with persistent context
      const browser = await chromium.launchPersistentContext(userDataDir, {
        headless: false, // Set to true for headless mode in production
        args: [
          "--disable-blink-features=AutomationControlled",
          "--disable-infobars",
        ],
        executablePath:
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      });

      const page = await browser.newPage();

      this.sendMessage("progress", `Logging in to Google account: ${email}`);

      // Navigate to Google login
      await page.goto("https://accounts.google.com/signin", {
        waitUntil: "domcontentloaded",
      });

      // Enter email
      await page.fill('input[type="email"]', email);
      await this.delay(1000);
      await page.click("#identifierNext");
      await page.waitForTimeout(2000);

      // Enter password
      await page.fill('input[type="password"]', password);
      await this.delay(1000);
      await page.click("#passwordNext");
      await page.waitForTimeout(3000);

      // Handle 2FA if required
      if (
        await page
          .locator('input[type="tel"], input[aria-label*="code"]')
          .isVisible()
      ) {
        this.sendMessage("progress", `Handling 2FA for ${email}`);
        const code = await this.get2FACode(secretKey);

        await page.fill('input[type="tel"], input[placeholder*="code"]', code);
        await this.delay(1000);

        const nextButtonSelector = '#totpNext, button[type="submit"]';
        if (await page.locator(nextButtonSelector).isVisible()) {
          await page.click(nextButtonSelector);
        }
      }

      // Handle "Not now" or "Skip" buttons
      if (
        await page
          .locator('button:has-text("Not now"), button:has-text("Skip")')
          .isVisible()
      ) {
        await page
          .locator('button:has-text("Not now"), button:has-text("Skip")')
          .click();
        await this.delay(2000);
      }

      this.sendMessage("progress", `Creating new Google Sheet for ${email}`);

      // Navigate to Google Sheets and create new sheet
      await this.delay(10000);
      try {
        await page.goto("https://docs.google.com/spreadsheets/create");
      } catch {
        // refresh
        await page.reload();
        await page.goto("https://docs.google.com/spreadsheets/create");
      }
      await this.delay(2000);

      // Navigate to specific spreadsheet (if needed)
      // await page.goto(
      //   "https://docs.google.com/spreadsheets/d/1mVQ44j5Q0ecnrXIglQ4QxtV3eJHSZQpRFSRQI1VgvTo/edit?gid=0#gid=0",
      // );

      this.sendMessage("progress", `Opening Apps Script for ${email}`);

      // Open Apps Script
      const extensionsMenuSelector = "#docs-extensions-menu";
      await page.waitForSelector(extensionsMenuSelector, { timeout: 10000 });
      await page.click(extensionsMenuSelector);
      await this.delay(2000);

      const [newPage] = await Promise.all([
        browser.waitForEvent("page"),
        page.click('//*[text()="Apps Script"]'),
      ]);

      await newPage.waitForLoadState();
      await this.delay(5000);

      // Execute functions in Apps Script
      await this.executeFunction(newPage, this.getPermissionRequiredFunction());
      this.sendMessage("progress", `Permission function executed for ${email}`);

      // Handle permission authorization
      await this.handlePermissionAuthorization(browser, newPage, secretKey);

      // Execute fill data function with account-specific or global data
      const fillDataFunc = this.getDefaultFillDataFunction(
        account,
        this.config.data,
      );
      await this.executeFunction(newPage, fillDataFunc);
      this.sendMessage("progress", `Fill data function executed for ${email}`);
      await this.delay(5000);

      // Execute send emails function
      await this.executeFunction(newPage, this.getSendEmailsFunction());
      this.sendMessage(
        "progress",
        `Send emails function executed for ${email}`,
      );

      // Monitor execution and re-run if needed
      await this.monitorExecution(newPage);

      this.sendMessage("success", `Account ${email} processed successfully`);

      // Close browser
      await browser.close();

      return { success: true, account: email };
    } catch (error) {
      this.sendMessage(
        "error",
        `Error processing account ${email}: ${error.message}`,
      );
      return { success: false, account: email, error: error.message };
    }
  }

  // Execute function in Apps Script
  async executeFunction(page, funcString) {
    await page.evaluate(async (funcString) => {
      await new Promise((resolve) => {
        if (window.monaco && window.monaco.editor) {
          resolve();
        } else {
          const checkMonaco = setInterval(() => {
            if (window.monaco && window.monaco.editor) {
              clearInterval(checkMonaco);
              resolve();
            }
          }, 100);
        }
      });

      const monacoEditor = window.monaco.editor.getModels()[0];
      monacoEditor.setValue(funcString);
    }, funcString);

    // Save script (Ctrl + S)
    await page.keyboard.down("Control");
    await page.keyboard.press("KeyS");
    await page.keyboard.up("Control");

    await this.delay(5000);

    // Run script (Ctrl + R)
    await page.keyboard.press("Control+KeyR");
    await page.keyboard.up("Control");
    await this.delay(5000);
  }

  // Handle permission authorization
  async handlePermissionAuthorization(browser, newPage, secretKey) {
    try {
      await this.delay(5000);
      await newPage.evaluate(async () => {
        document
          .querySelector("[role='dialog']")
          .querySelectorAll("button")[1]
          .click();
      });

      const [reviewPermissionsPage] = await Promise.all([
        browser.waitForEvent("page"),
        newPage.waitForTimeout(2000),
      ]);

      await reviewPermissionsPage.waitForLoadState();

      // Handle OTP if required
      try {
        const otpCode = await this.get2FACode(secretKey);
        await reviewPermissionsPage.fill(
          'input[type="tel"], input[aria-label*="code"]',
          otpCode,
        );
        await this.delay(1000);
        await reviewPermissionsPage.click('#totpNext, button[type="submit"]');
      } catch (error) {
        // OTP might not be required
      }

      // Click "Advanced"
      await reviewPermissionsPage
        .locator('a:has-text("Advanced")')
        .click({ timeout: 10000 });

      // Click "Go to Untitled project (unsafe)"
      await reviewPermissionsPage
        .locator("text=Go to Untitled project (unsafe)")
        .click({ timeout: 10000 });

      // Click "Continue"
      await reviewPermissionsPage
        .locator('button:has-text("Continue")')
        .click({ timeout: 10000 });

      // Select all permissions
      try {
        await reviewPermissionsPage
          .locator("text=Select all")
          .click({ timeout: 10000 });
      } catch (error) {
        await reviewPermissionsPage.evaluate(() => {
          const checkboxes = document.querySelectorAll(
            'input[type="checkbox"]',
          );
          checkboxes.forEach((checkbox) => {
            if (!checkbox.checked) {
              checkbox.click();
            }
          });
        });
      }

      // Click Continue again
      await reviewPermissionsPage
        .locator('button:has-text("Continue")')
        .click({ timeout: 10000 });

      // Wait for execution completed
      await newPage.waitForSelector('div:has-text("Execution completed")', {
        timeout: 60000,
      });
    } catch (error) {
      this.sendMessage(
        "info",
        "Không tìm thấy hộp thoại ủy quyền bỏ qua chạy tiếp scripts.",
      );
    }
  }

  // Monitor script execution and re-run if needed
  async monitorExecution(newPage) {
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 100;

      const checkExecution = async () => {
        if (attempts >= maxAttempts) {
          resolve();
          return;
        }

        const result = await newPage.evaluate(() => {
          const itemList = document.querySelectorAll('[role="listitem"]');
          if (itemList.length > 0) {
            const lastItem = itemList[itemList.length - 1];
            const texts = lastItem.querySelectorAll("div");

            const errorDiv = Array.from(texts).find((div) =>
              div.textContent.includes("Exceeded maximum execution time."),
            );

            if (errorDiv) {
              return { timeout: true };
            }

            const success = Array.from(texts).find((div) =>
              div.textContent.includes("Execution completed"),
            );

            if (success) {
              return { success: true };
            }
          }

          return {};
        });

        if (result.timeout) {
          this.sendMessage(
            "progress",
            `Execution timeout detected, re-running script (attempt ${attempts + 1})`,
          );
          await this.reRunScript(newPage);
          attempts++;
          setTimeout(checkExecution, 5000);
        } else if (result.success) {
          this.sendMessage(
            "progress",
            `Script execution completed successfully`,
          );
          resolve();
        } else {
          setTimeout(checkExecution, 5000);
        }
      };

      checkExecution();
    });
  }

  // Re-run script
  async reRunScript(page) {
    await page.keyboard.press("Control+KeyR");
    await page.keyboard.up("Control");
  }

  // Start processing accounts
  async start(config) {
    this.config = config;
    this.isRunning = true;

    this.sendMessage(
      "progress",
      `Worker started processing ${config.accounts.length} accounts`,
    );

    const results = [];

    for (let i = 0; i < config.accounts.length; i++) {
      if (!this.isRunning) {
        this.sendMessage("progress", "Worker stopped by request");
        break;
      }

      const account = config.accounts[i];
      const result = await this.processAccount(
        account,
        i,
        config.accounts.length,
      );
      results.push(result);

      // Small delay between accounts
      await this.delay(2000);
    }

    this.sendMessage(
      "completed",
      `Worker completed processing ${results.length} accounts`,
      {
        results,
        successCount: results.filter((r) => r.success).length,
        errorCount: results.filter((r) => !r.success).length,
      },
    );
  }

  stop() {
    this.isRunning = false;
    this.sendMessage("progress", "Worker stopping...");

    if (this.browser) {
      this.browser.close().catch(console.error);
    }
  }
}

// Initialize worker
const worker = new WorkerProcess();

// Handle messages from main process
process.on("message", async (message) => {
  if (message.type === "start") {
    await worker.start(message.config);
  } else if (message.type === "stop") {
    worker.stop();
  }
});

// Handle process termination
process.on("SIGTERM", () => {
  worker.stop();
  process.exit(0);
});

process.on("SIGINT", () => {
  worker.stop();
  process.exit(0);
});

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  worker.sendMessage("error", `Uncaught exception: ${error.message}`);
  worker.stop();
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  worker.sendMessage("error", `Unhandled rejection: ${reason}`);
  worker.stop();
  process.exit(1);
});
