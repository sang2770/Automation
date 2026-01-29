const { chromium } = require("playwright");
const { TOTP } = require("totp-generator"); // For generating 2FA codes

// Enable stealth plugin for undetected browser
(async () => {
  const userDataDir = "./user-data";
  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
    ],
    executablePath:
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  }); // Set to true for headless mode
  const page = await browser.newPage();

  const email = "beaufortperrowzj77@gmail.com"; // Replace with your Google account email
  const password = "wsk37ptqg"; // Replace with your Google account password
  const secretKey = "7p6ygtmgel6d2jy2ymvkj3r6odhlh6hp"; // Replace with your 2FA secret key (if enabled)

  // Helper function for generating 2FA codes
  const get2FACode = async (secret) =>
    (await TOTP.generate(secret.replace(/\s+/g, ""))).otp;
  const delay = (ms) => new Promise((res) => setTimeout(res, ms));
  try {
    console.log("🚀 Starting Google Sheets automation...");
    // // Go to Google login
    // await page.goto("https://accounts.google.com/signin", {
    //   waitUntil: "domcontentloaded",
    // });
    // console.log("📧 Entering email...");
    // await page.fill('input[type="email"]', email);
    // await delay(1000);
    // await page.click("#identifierNext");
    // await page.waitForTimeout(2000);

    // // Enter password
    // console.log("🔐 Entering password...");
    // await page.fill('input[type="password"]', password);
    // await delay(1000);
    // await page.click("#passwordNext");
    // await page.waitForTimeout(3000);

    // // Handle 2FA if required
    // if (
    //   await page
    //     .locator('input[type="tel"], input[aria-label*="code"]')
    //     .isVisible()
    // ) {
    //   console.log("🔒 Handling 2FA...");
    //   const code = await get2FACode(secretKey);
    //   console.log(`Generated 2FA code: ${code}`);

    //   // Enter 2FA code
    //   await page.fill('input[type="tel"], input[placeholder*="code"]', code);
    //   await delay(1000);

    //   // Click "Next" after entering the 2FA code
    //   const nextButtonSelector = '#totpNext, button[type="submit"]';
    //   if (await page.locator(nextButtonSelector).isVisible()) {
    //     await page.click(nextButtonSelector);
    //     console.log("🔐 2FA code entered successfully!");
    //   } else {
    //     console.log("⚠️ 'Next' button after 2FA not found. Please check manually.");
    //   }
    // }

    // // Wait for Google Sheets to load
    // console.log("📊 Navigating to Google Sheets...");
    // await delay(10000);
    // await page.goto("https://docs.google.com/spreadsheets");
    // await delay(2000);

    // Redirect to new sheet creation
    // console.log("📝 Creating new sheet...");
    // await page.goto("https://docs.google.com/spreadsheets/create");
    // console.log("✅ New Google Sheet created successfully!");

    await page.goto(
      "https://docs.google.com/spreadsheets/d/1StYULnQj__2CN9vUtJV-vNx9BnzyQ5ApPVtTsb4KAv0/edit?gid=0#gid=0",
    );
    // Open Apps Script from menu
    console.log("🔧 Opening Apps Script...");
    try {
      const extensionsMenuSelector = "#docs-extensions-menu";
      await page.waitForSelector(extensionsMenuSelector, { timeout: 5000 }); // Wait for the Extensions menu to appear
      await page.click(extensionsMenuSelector);
      await delay(2000);

      const appsScriptOptionSelector = '//*[text()="Apps Script"]';
      const [newPage] = await Promise.all([
        browser.waitForEvent("page"), // Đợi tab mới được mở
        page.click(appsScriptOptionSelector), // Thực hiện click vào nút mở tab mới
      ]);

      console.log("Tab mới đã được mở!");

      // Chuyển sang tab mới
      await newPage.waitForLoadState(); // Chờ tab mới tải hoàn tất
      console.log("URL của tab mới:", newPage.url());

      await newPage.evaluate(() => {
        const monacoEditor = window.monaco.editor.getModels()[0]; // Lấy model đầu tiên của Monaco Editor
        monacoEditor.setValue(
          `function fillRandomData() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var numRows = 10;
            
  for (var i = 1; i <= numRows; i++) {
    sheet.getRange(i, 1).setValue(Math.floor(Math.random() * 100)); // A
    sheet.getRange(i, 2).setValue(Math.random().toString(36).substring(7)); // B
    sheet.getRange(i, 3).setValue(new Date()); // C
    sheet.getRange(i, 4).setValue("Row " + i); // D
  }
}
`,
        );
      });

      //   Ctrl + S to save the script
      await newPage.keyboard.down("Control");
      await newPage.keyboard.press("KeyS");
      await newPage.keyboard.up("Control");
      console.log("Script saved.");

      await delay(5000);
      // Ctrl + R
      await newPage.keyboard.press("Control+KeyR");
      await newPage.keyboard.up("Control");
      console.log("Script reloaded.");

      await delay(5000);

      await page.keyboard.press("Tab"); // Tab lần 1
      await delay(1000);
      // Nhấn Enter để click vào nút "Review permissions"
      console.log('✅ Nhấn Enter để kích hoạt nút "Review permissions"...');
      await page.keyboard.press("Enter"); // Nhấn Enter

      // click text Review permissions
      const [reviewPermissionsPage] = await Promise.all([
        browser.waitForEvent("page"), // Lắng nghe tab mới/chờ cửa sổ bật lên
        page.waitForTimeout(2000),
      ]);

      console.log("🚀 Cửa sổ cấp quyền đã được mở.");

      // Đợi tab được load hoàn tất và chuyển sang tab mới
      await reviewPermissionsPage.waitForLoadState();
      console.log(`Tab mới URL: ${reviewPermissionsPage.url()}`);

      console.log("🔑 Đang xử lý nhập OTP...");
      const otpCode = await get2FACode(secretKey);
      await reviewPermissionsPage.fill(
        'input[type="tel"], input[aria-label*="code"]',
        otpCode,
      );
      await delay(1000);
      await reviewPermissionsPage.click('#totpNext, button[type="submit"]');
      console.log("✅ OTP đã được nhập thành công.");

      //   click text Nâng cao or Advanced
      await reviewPermissionsPage.waitForTimeout(3000);
      const advancedButtonSelector = "text=Nâng cao, text=Advanced";
      await reviewPermissionsPage.click(advancedButtonSelector);
      console.log("✅ Đã nhấp vào nút Nâng cao/Advanced.");
      //   click text không an toàn or not safe
      await reviewPermissionsPage.waitForTimeout(2000);
      const notSafeButtonSelector = "text=không an toàn, text=not safe";
      await reviewPermissionsPage.click(notSafeButtonSelector);
      console.log("✅ Đã nhấp vào nút không an toàn/Not Safe.");
      // đợi loading
      await reviewPermissionsPage.waitForTimeout(2000);
      //   click button has text Tiếp tục or Continue
      const continueButtonSelector =
        'button:has-text("Tiếp tục"), button:has-text("Continue")';
      await reviewPermissionsPage.click(continueButtonSelector);
      console.log("✅ Đã nhấp vào nút Tiếp tục/Continue.");
      await delay(100000000);

      console.log("🎉 Successfully opened Apps Script!");
    } catch (error) {
      console.log(
        "⚠️ Failed to open Apps Script menu. Proceeding anyway..." +
          error.message,
      );
      await delay(100000000);
    }

    await page.waitForTimeout(5000); // Pause for manual inspection (optional)
  } catch (error) {
    console.error(`❌ An error occurred: ${error.message}`);
  } finally {
    console.log("Closing browser...");
    await browser.close();
  }
})();
