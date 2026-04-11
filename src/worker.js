const { chromium } = require("playwright");
const { TOTP } = require("totp-generator");
const path = require("path");
const fs = require("fs");

class WorkerProcess {
  constructor() {
    this.browser = null;
    this.config = null;
    this.isRunning = false;
    this.reusableDataPool = [];
  }

  // Generate 2FA code
  async get2FACode(secret) {
    return (await TOTP.generate(secret.replace(/\s+/g, ""))).otp;
  }

  // Delay function
  delay(ms) {
    return new Promise((res) => setTimeout(res, ms));
  }

  // Build a realistic desktop fingerprint profile to reduce automation signals
  getStealthProfile() {
    const userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
    ];

    const viewportPresets = [
      { width: 1366, height: 768 },
      { width: 1440, height: 900 },
      { width: 1536, height: 864 },
      { width: 1920, height: 1080 },
    ];

    return {
      userAgent: userAgents[Math.floor(Math.random() * userAgents.length)],
      viewport: viewportPresets[Math.floor(Math.random() * viewportPresets.length)],
      locale: "en-US",
      timezoneId: "America/New_York",
      colorScheme: "light",
      platform: "Win32",
      languages: ["en-US", "en"],
    };
  }

  async applyContextStealth(context, profile) {
    await context.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      "Upgrade-Insecure-Requests": "1",
      DNT: "1",
    });

    await context.addInitScript((stealthProfile) => {
      Object.defineProperty(navigator, "webdriver", {
        get: () => undefined,
      });

      Object.defineProperty(navigator, "platform", {
        get: () => stealthProfile.platform,
      });

      Object.defineProperty(navigator, "language", {
        get: () => stealthProfile.languages[0],
      });

      Object.defineProperty(navigator, "languages", {
        get: () => stealthProfile.languages,
      });

      if (!window.chrome) {
        window.chrome = { runtime: {} };
      } else if (!window.chrome.runtime) {
        window.chrome.runtime = {};
      }

      Object.defineProperty(navigator, "plugins", {
        get: () => [
          { name: "Chrome PDF Plugin" },
          { name: "Chrome PDF Viewer" },
          { name: "Native Client" },
        ],
      });

      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters && parameters.name === "notifications"
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters)
      );
    }, profile);
  }

  // Send message to main process
  sendMessage(type, message, data = null, progress = null, accountData = null) {
    process.send({
      type,
      message,
      data,
      progress,
      accountData,
      timestamp: new Date().toISOString(),
    });
  }

  isManualCloseError(error) {
    const msg = (error && error.message ? error.message : String(error || ""))
      .toLowerCase();

    return (
      msg.includes("target page, context or browser has been closed") ||
      msg.includes("target closed") ||
      msg.includes("context closed") ||
      msg.includes("browser has been closed") ||
      msg.includes("page has been closed")
    );
  }

  getAccountReusableData(account) {
    if (!account) {
      return null;
    }

    const candidate = account.distributedData || account.data;
    if (!candidate) {
      return null;
    }

    return {
      A: Array.isArray(candidate.A) ? [...candidate.A] : [],
      B: Array.isArray(candidate.B) ? [...candidate.B] : [],
      C: Array.isArray(candidate.C) ? [...candidate.C] : [],
      D: Array.isArray(candidate.D) ? [...candidate.D] : [],
    };
  }

  // Generate default fillDataFuncString with account-specific or global data
  getDefaultFillDataFunction(account, globalData) {
    // Use account-specific data if available, otherwise use global data
    let data = account.data || globalData;

    // Nếu là chế độ separated và có distributedData, sử dụng dữ liệu đã chia
    if (account.distributedData) {
      data = account.distributedData;
    }

    if (!data) {
      throw new Error("No data available for account");
    }

    // If account has specific data, create arrays with just that account's data
    let dataArrays;
    if (account.data || account.distributedData) {
      dataArrays = {
        A: data.A,
        B: data.B,
        C: data.C,
        D: data.D,
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
    // Use custom function from config if available, otherwise use default
    if (this.config && this.config.customSendEmailsFunction && this.config.customSendEmailsFunction.trim()) {
      return this.config.customSendEmailsFunction;
    }

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

  async cleanupUserDataDir(userDataDir) {
    try {
      await fs.promises.rmdir(userDataDir, { recursive: true });
      this.sendMessage("info", `Cleaned up user data directory: ${userDataDir}`);
    } catch (error) {
      this.sendMessage("warn", `Failed to clean up user data directory: ${userDataDir} - ${error.message}`);
      console.error(error);
    }
  }

  // Process single account
  async processAccount(account, accountIndex, totalAccounts) {
    const { email, password, secretKey } = account;

    let browser = null;
    let userDataDir = null;

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

      const exeDir = path.dirname(process.execPath);
      const safeEmail = email.replace(/[^a-zA-Z0-9]/g, "_");
      userDataDir = path.join(exeDir, `worker-${safeEmail}_${Date.now()}`);
      const stealthProfile = this.getStealthProfile();
      // const userDataDir = path.join(
      //   __dirname,
      //   "..",
      //   "user-data",
      //   `worker-${email}`,
      // );

      // Launch browser with persistent context
      browser = await chromium.launchPersistentContext(userDataDir, {
        headless: false, // Set to true for headless mode in production
        ignoreDefaultArgs: ["--enable-automation"],
        locale: stealthProfile.locale,
        timezoneId: stealthProfile.timezoneId,
        userAgent: stealthProfile.userAgent,
        viewport: stealthProfile.viewport,
        colorScheme: stealthProfile.colorScheme,
        args: [
          "--disable-blink-features=AutomationControlled",
          "--disable-infobars",
          "--disable-dev-shm-usage",
          "--disable-features=IsolateOrigins,site-per-process",
          "--no-first-run",
          "--no-default-browser-check",
          "--password-store=basic",
          "--start-maximized",
          "--lang=en-US,en",
        ],
        executablePath:
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        // "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      });

      // await this.applyContextStealth(browser, stealthProfile);

      const page = await browser.newPage();

      this.sendMessage("progress", `Logging in to Google account: ${email}`);

      // Navigate to Google login
      await page.goto("https://accounts.google.com/signin", {
        waitUntil: "domcontentloaded",
      });

      // Enter email
      await page.fill('input[type="email"]', email, {
        timeout: 30000,
      });
      await this.delay(1000);
      await page.click("#identifierNext");
      await page.waitForTimeout(2000);

      // Enter password
      await page.fill('input[type="password"]', password, {
        timeout: 30000,
      });
      await this.delay(1000);
      await page.click("#passwordNext");
      await page.waitForTimeout(3000);

      try {
        await page.locator('text=Google Authenticator').isVisible({ timeout: 5000 });
        this.sendMessage("progress", `Handling Google Authenticator prompt for ${email}`);
        await page.click('text=Google Authenticator');
        await this.delay(5000);
      } catch (error) {
        // TODO: Handle other potential post-login prompts (e.g. suspicious login, new device confirmation, etc.)
      }

      // Handle 2FA if required
      if (
        !secretKey.includes("@") &&
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
      } else {
        this.sendMessage("progress", `No 2FA required for ${email}`);
      }

      try {
        if (
          secretKey.includes("@") &&
          await page.locator('text=Confirm your recovery email')
            .isVisible()
        ) {
          this.sendMessage("progress", `Handling recovery email confirmation for ${email}`);
          await page.click('text=Confirm your recovery email');
          await this.delay(5000);

          this.sendMessage("progress", `Entering recovery email for ${secretKey}`);
          // name="knowledgePreregisteredEmailResponse"
          await page.fill('input[name="knowledgePreregisteredEmailResponse"], input[type="email"]', secretKey);
          await this.delay(1000);
          await page.click('button:has-text("Next"), button[type="submit"]');
          await this.delay(5000);
        } else {
          this.sendMessage("progress", `No recovery email confirmation required for ${email}`);
        }
      } catch (error) {
        this.sendMessage("warn", `Error handling recovery email confirmation for ${email}: ${error.message}`);
      }

      // Handle "Not now" or "Skip" buttons
      try {
        // Array.from(document.querySelectorAll("button")).map(item => item.innerText);
        await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll("button"));
          const targetButton = buttons.find(button => {
            const text = button.innerText.toLowerCase();
            return text.includes("not now") || text.includes("skip");
          });
          if (targetButton) {
            targetButton.click();
          }
        });

        await this.delay(2000);

        if (
          await page
            .locator('button:has-text("Not now"), button:has-text("Skip")')
            .isVisible()
        ) {
          await page
            .locator('button:has-text("Not now"), button:has-text("Skip")')
            .click();
          await this.delay(2000);
          this.sendMessage("progress", "Đã bấm not now")
        } else {
          this.sendMessage("progress", `Không tìm thấy nút not now hoặc skip cho ${email}, tiếp tục...`);
        }
      } catch (error) {
        // Ignore if not found
        this.sendMessage("error", `Không tìm thấy nút not now hoặc skip cho ${email}, tiếp tục... ${error.message}`);
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
      await this.delay(5000);
      await page.reload();
      await this.delay(5000);

      //  Check url is Login
      if (page.url().includes("signin")) {
        this.sendMessage("error", `Tài khoản ${email} chưa đăng nhập thành công`);
        return;
      }
      // Navigate to specific spreadsheet (if needed)
      // await page.goto(
      //   "https://docs.google.com/spreadsheets/d/1mVQ44j5Q0ecnrXIglQ4QxtV3eJHSZQpRFSRQI1VgvTo/edit?gid=0#gid=0",
      // );

      this.sendMessage("progress", `Opening Apps Script for ${email}`);
      var res = await page.evaluate(async () => {
        let attempts = 0;
        let maxAttempts = 5;
        while (!document.querySelector("#docs-extensions-menu") && attempts < maxAttempts) {
          // Wait until the menu is available
          console.log("Waiting menu...");
          attempts++;
          await new Promise(res => setTimeout(res, 5000));
        }
        if (attempts === maxAttempts) {
          return false;
        }
        console.log("Menu found, clicking...");
        const el_test = document.querySelector("#docs-insert-menu");
        el_test.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        el_test.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        el_test.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await new Promise(res => setTimeout(res, 2000));

        const el = document.querySelector("#docs-extensions-menu");
        el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        return true;
      });

      if (!res) {
        throw new Error("Failed to open Extensions menu");
      }

      await this.delay(3000);

      const [newPage] = await Promise.all([
        browser.waitForEvent("page"),
        page.click('//*[text()="Apps Script"]', { timeout: 30000 * 2 }),
      ]);

      await newPage.waitForLoadState();
      await this.delay(5000);

      // Execute functions in Apps Script
      await this.executeFunction(newPage, this.getPermissionRequiredFunction());
      this.sendMessage("progress", `Permission function executed for ${email}`);
      await this.delay(5000);
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
      await this.handlePermissionAuthorization(browser, newPage, secretKey, true);
      await this.delay(5000);

      // Execute send emails function
      await this.executeFunction(newPage, this.getSendEmailsFunction());
      this.sendMessage(
        "progress",
        `Send emails function executed for ${email}`,
      );
      await this.delay(5000);
      await this.handlePermissionAuthorization(browser, newPage, secretKey, true);

      // Monitor execution and re-run if needed
      const monitorResult = await this.monitorExecution(newPage);
      if (monitorResult && monitorResult.interrupted) {
        const interruptionError = new Error(
          monitorResult.message || "Execution interrupted by manual tab close",
        );
        interruptionError.manualClose = true;
        throw interruptionError;
      }

      this.sendMessage("success", `Account ${email} processed successfully`, null, null, { email: email, password: account.password });

      return { success: true, account: email };
    } catch (error) {
      const manualClose = this.isManualCloseError(error) || !!error.manualClose;
      const reusableData = manualClose ? this.getAccountReusableData(account) : null;

      this.sendMessage(
        "error",
        `Error processing account ${email}: ${error.message}`,
        {
          manualClose,
          reusableData,
        },
        null,
        { email: email, password: account.password }
      );

      if (manualClose && reusableData) {
        this.reusableDataPool.push(reusableData);
        this.sendMessage(
          "info",
          `Manual tab close detected for ${email}. Data returned to pool (${this.reusableDataPool.length} available).`,
          { poolSize: this.reusableDataPool.length },
        );
      }

      return {
        success: false,
        account: email,
        error: error.message,
        manualClose,
        reusableData,
      };
    } finally {
      // Close browser if it was initialized
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          this.sendMessage("error", `Error closing browser: ${closeError.message}`);
        }
      }

      // Cleanup user data directory if it was created
      if (userDataDir) {
        await this.cleanupUserDataDir(userDataDir);
      }
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
  async handlePermissionAuthorization(browser, newPage, secretKey, recheck = false) {
    try {
      await this.delay(10000);
      try {
        await newPage.click('text=Review Permissions', { timeout: 15000 });
        console.log("Clicked Review Permissions button");
      } catch {
        await newPage.evaluate(async () => {
          let attempts = 0;
          const maxAttempts = 10;

          const checkDialog = () => {
            console.log("Checking for dialog...", document.querySelectorAll("[role='dialog']"));
            return document.querySelector("[role='dialog']") !== null;
          }
          while (attempts < maxAttempts) {
            if (checkDialog()) {
              console.log("Found!");
              break;
            }
            await new Promise(res => setTimeout(res, Math.random() * 3000 + 2000));
            attempts++;
          }
          await new Promise(res => setTimeout(res, 5000));
          const buttonSelectorList = ["[role='dialog'] button:nth-child(2)", "button:has-text('Allow')", "button:has-text('Continue')"];
          const btn = buttonSelectorList.map(selector => document.querySelector(selector)).find(el => el);
          if (!btn) {
            console.log("No button found to click in permission dialog");
            return;
          }
          btn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
          btn.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
          btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

          console.log("Đã nhấn nút ủy quyền: ", btn);
        });
      }

      const [reviewPermissionsPage] = await Promise.all([
        browser.waitForEvent("page"),
        newPage.waitForTimeout(10000),
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
        try {
          if (attempts >= maxAttempts) {
            resolve({ interrupted: false });
            return;
          }

          const result = await newPage.evaluate(() => {
            const itemList = document.querySelectorAll('[role="listitem"]');
            if (itemList.length > 0) {
              const lastItem = itemList[itemList.length - 1];
              const texts = lastItem.querySelectorAll("div");

              const errorDiv = Array.from(texts).find((div) =>
                div.textContent.includes("Exceeded maximum execution time") || div.textContent.includes("too many times"),
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

              // An unknown error has occurred, please try again later
              const unknownErrorDiv = Array.from(texts).find((div) =>
                div.textContent.includes(
                  "An unknown error has occurred, please try again later",
                ),
              );

              if (unknownErrorDiv) {
                return { error: true };
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
              "Script execution completed successfully",
            );
            resolve({ interrupted: false });
          } else if (result.error) {
            // Unknown error or still running
            await this.reRunScript(newPage);
            attempts++;
            setTimeout(checkExecution, 5000);
          } else {
            this.sendMessage(
              "progress",
              `Waiting for script execution to complete (attempt ${attempts + 1})`,
            );
            setTimeout(checkExecution, 5000);
          }
        } catch (error) {
          if (this.isManualCloseError(error)) {
            resolve({
              interrupted: true,
              message: "Tab/browser was closed manually during script execution",
            });
            return;
          }

          this.sendMessage(
            "warn",
            `Monitor execution error: ${error.message}`,
          );
          attempts++;
          setTimeout(checkExecution, 3000);
        }
      };

      checkExecution();
    });
  }

  // Re-run script
  async reRunScript(page) {
    // Reload the page
    await page.reload();
    await this.delay(5000);

    // Run script (Ctrl + R)
    await page.keyboard.down("Control");
    await page.keyboard.press("KeyR");
    await page.keyboard.up("Control");
  }

  // Start processing accounts
  async start(config) {
    this.config = config;
    this.isRunning = true;
    this.reusableDataPool = [];

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

      const account = { ...config.accounts[i] };

      if (this.reusableDataPool.length > 0) {
        account.distributedData = this.reusableDataPool.shift();
        this.sendMessage(
          "info",
          `Assigned recycled data to next worker slot (remaining pool: ${this.reusableDataPool.length})`,
          { poolSize: this.reusableDataPool.length },
        );
      }

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
      this.browser.close().then(() => {
        this.sendMessage("progress", "Browser closed successfully");
      }).catch((error) => {
        this.sendMessage("error", `Error closing browser: ${error.message}`);
      });
    }

    // Force exit after a timeout
    setTimeout(() => {
      this.sendMessage("progress", "Force terminating worker process");
      process.exit(0);
    }, 5000);
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
