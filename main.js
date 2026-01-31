const { chromium } = require("playwright");
const { TOTP } = require("totp-generator"); // For generating 2FA codes

// Enable stealth plugin for undetected browser
(async () => {
  const perrmissionRequiredFuncString = `
function showAuthorizationPopup() {
  SpreadsheetApp.getActiveSpreadsheet();
  Session.getActiveUser().getEmail();
  MailApp.getRemainingDailyQuota()
}
`;
  const fillDataFuncString = `
function fillRandomData() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const A_Data = [
    "nattaponglum@gmail.com",
    "sabulonss@gmail.com",
    "rungtawan251988@gmail.com",
    "suksomsap.sssc@gmail.com",
    "fantasticchair9@gmail.com",
    "kaws.condo@gmail.com",
    "aujcharapom@gmail.com",
    "beet999auto@gmail.com",
    "preordershopchill@gmail.com",
    "bokboondelivery@gmail.com"
  ];
  const B_Data = [
    "บริษัท ไดว่า พร๊อพเพอร์ตี้ แอนด์ คอนสทรัคชั่น จำกัด",
    "บริษัทกิตติศักดิ์การก่อสร้าง แอนด์ ดีไซน์ จำกัด",
    "บริษัทรุ่งตะวันเพิ่มทรัพย์เกษตรอินทรีย์ไทยจำกัด",
    "บริษัทสุขสมทรัพย์รับสร้างบ้านครบวงจร",
    "บริษัทเก้าอี้มหัศจรรย์ตาแสวง จำกัด",
    "บริหารขาย บ้าน คอนโด มือหนึ่ง และ  รีโนเวทใหม่-รับฝากขาย",
    "บลูคริสตัลรีสอร์ทแหลมสิงห์ Blue Crystal Resort",
    "บลูทูธสเตอริโอระดับเทพ",
    "บอกต่อของถูก",
    "บอกบุญ เดลิเวอรี่"
  ];
  const C_Data = [
    "เรียน [Name], ขอแสดงความยินดีที่ได้รับป้ายสีน้ำเงิน! การประกาศเกียรติคุณนี้ยกย่องความน่าเชื่อถือ ความจริงใจ และผลกระทบเชิงบวกของคุณ",
    "เรียน [Name], ป้ายสีน้ำเงินของคุณเปิดใช้งานแล้ว! ขอแสดงความยินดีด้วยที่บรรลุเป้าหมายสำคัญด้านความไว้วางใจและการยอมรับในวิชาชีพนี้",
    "เรียน [Name], ความสำเร็จได้รับการยืนยันแล้ว! ป้ายสีน้ำเงินของคุณสะท้อนถึงความซื่อสัตย์ ความทุ่มเท และการมีส่วนร่วมออนไลน์ที่มีความหมายของคุณ",
    "เรียน [Name], ขอแสดงความยินดีด้วย! ป้ายสีน้ำเงินของคุณยกย่องความพยายามอย่างต่อเนื่อง ความเป็นผู้นำ และอิทธิพลที่แท้จริงของคุณ",
    "เรียน [Name], ป้ายสีน้ำเงินของคุณแสดงให้เห็นถึงความเป็นมืออาชีพ ความน่าเชื่อถือ และผลกระทบที่เพิ่มมากขึ้นในชุมชน",
    "เรียน [Name], ทำได้ดีมาก! ป้ายสีน้ำเงินของคุณเน้นย้ำถึงความทุ่มเท ความน่าเชื่อถือ และการมีส่วนร่วมอันทรงคุณค่าของคุณต่อผู้ชม",
    "เรียน [Name], ป้ายสีน้ำเงินของคุณเป็นสัญลักษณ์ของอิทธิพล ความไว้วางใจ และการมีส่วนร่วมอย่างแท้จริงบนแพลตฟอร์ม",
    "เรียน [Name], ขอแสดงความยินดีที่ได้รับป้ายสีน้ำเงินของคุณ! เกียรติยศนี้สะท้อนให้เห็นถึงความมุ่งมั่นของคุณต่อความโปร่งใสและความเป็นผู้นำ",
    "เรียน [Name], ป้ายสีน้ำเงินของคุณเป็นเครื่องยืนยันถึงความเป็นเลิศในวิชาชีพ ความน่าเชื่อถือ และอิทธิพลเชิงบวกบนโลกออนไลน์",
    "เรียน [Name], ความสำเร็จที่ได้รับการยืนยันแล้ว! ป้ายสีน้ำเงินของคุณเป็นเครื่องพิสูจน์ถึงความเป็นมืออาชีพที่สม่ำเสมอและเสียงที่จริงใจ",
];
  const D_Data = [
  "คลิกแบบฟอร์มนี้เพื่อรับ Blue Badge ของคุณทันทีและเพลิดเพลินกับสิทธิประโยชน์สุดพิเศษ",
    "แตะลิงก์นี้เพื่อเปิดใช้งาน Blue Badge ของคุณและค้นพบสิทธิพิเศษที่สงวนไว้สำหรับคุณ",
    "กรอกแบบฟอร์มนี้เพื่อรับ Blue Badge และปลดล็อกข้อเสนอพิเศษ",
    "คลิกที่นี่เพื่อรับ Blue Badge ของคุณและเพลิดเพลินกับสิทธิประโยชน์ที่สงวนไว้สำหรับสมาชิก",
    "ลงทะเบียนตอนนี้เพื่อรับ Blue Badge และเข้าถึงสิทธิพิเศษต่างๆ บนแพลตฟอร์มได้อย่างเต็มที่",
    "แตะลิงก์นี้เพื่อเปิดใช้งาน Blue Badge ของคุณทันทีและเข้าถึงข้อเสนอพิเศษ",
    "กรอกแบบฟอร์มนี้เพื่อรับ Blue Badge และเพลิดเพลินกับสิทธิประโยชน์สุดพิเศษที่สงวนไว้สำหรับคุณ",
    "คลิกที่นี่เพื่อรับ Blue Badge ของคุณทันทีและปลดล็อกสิทธิพิเศษ",
    "ลงทะเบียนตอนนี้เพื่อรับ Blue Badge และเพลิดเพลินกับข้อเสนอพิเศษ",
    "แตะลิงก์นี้เพื่อรับ Blue Badge ของคุณและรับสิทธิพิเศษต่างๆ",
  ];
  const startRow = 2;
  const numRows = Math.min(A_Data.length, B_Data.length, C_Data.length, D_Data.length);
  for (let i = 0; i < numRows; i++) {
    sheet.getRange(startRow + i, 1).setValue(A_Data[i]);
    sheet.getRange(startRow + i, 2).setValue(B_Data[i]);
    sheet.getRange(startRow + i, 3).setValue(C_Data[i]);
    sheet.getRange(startRow + i, 4).setValue(D_Data[i]);
  }
}
`;

  const sendEmailsFuncString = `
function shareSingleFormToList_GR_v2() {

  var formUrl = "https://docs.google.com/forms/d/e/1FAIpQLSfRXFtxcCgr1xQbKsBahcI8zZ7shwhZ5g1PQeYhBuXWboFQGQ/viewform?usp=dialog";

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 🔎 Ưu tiên Sheet 1 → không có thì tìm Hoja 1
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
    "アカウント確認情報",

  ];

  // ===== RANDOM CONTENT POOLS =====
  var openingPool = [];
  var closingPool = [];

  for (var i = 0; i < values.length; i++) {
    if (values[i][2]) openingPool.push(values[i][2].toString());
    if (values[i][3]) closingPool.push(values[i][3].toString());
  }

  if (openingPool.length === 0 || closingPool.length === 0) {
    throw new Error("Cột C hoặc D không có nội dung để random");
  }
  // =================================

  var MAX_PER_RUN = 200;
  var sentCount = 0;

  var quota = MailApp.getRemainingDailyQuota();
  if (quota <= 0) return;

  var hardLimit = Math.min(MAX_PER_RUN, quota);

  for (var i = 0; i < values.length; i++) {
    if (sentCount >= hardLimit) break;

    var rowIndex = i + 2; // số dòng thật trong Sheet

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

    opening = opening.replace(/\[name\]/gi, pageName || "");
    closing = closing.replace(/\[name\]/gi, pageName || "");

    var fullBody =
      "Dear " + (pageName || "User") + ",\\n\\n" +
      opening + "\\n\\n" +
      formUrl + "\\n\\n" +
      closing;

    var subject = subjectVariants[i % subjectVariants.length];

    try {
      MailApp.sendEmail({
        to: email,
        subject: subject,
        body: fullBody,
        name: senderName,
        replyTo: replyAddress
      });

      // ✅ LOG: số dòng | gmail | trạng thái
      Logger.log(rowIndex + " | " + email + " | ✅ Sent");

      sheet.getRange(rowIndex, 5).setValue("✅ Sent");
      sheet.getRange(rowIndex, 6).setValue(new Date());

      sentCount++;
      Utilities.sleep(18000); // ⏱️ delay 18 giây

    } catch (e) {

      // ❌ GỬI THẤT BẠI → GHI LOG + STOP SCRIPT
      Logger.log(rowIndex + " | " + email + " | ❌ ERROR - STOP");

      sheet.getRange(rowIndex, 5).setValue("❌ Error");
      sheet.getRange(rowIndex, 6).setValue(new Date());

      // 🚨 DỪNG TOÀN BỘ SCRIPT
      throw e;
    }
  }

  SpreadsheetApp.flush();
}

function isValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email);
}
`;
  const userDataDir = "./user-data";
  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
    ],
    executablePath:
      // "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
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
    await page.goto("https://myaccount.google.com/", {
      waitUntil: "domcontentloaded",
    });
    await page.goto(
      "https://docs.google.com/spreadsheets/d/1mVQ44j5Q0ecnrXIglQ4QxtV3eJHSZQpRFSRQI1VgvTo/edit?gid=0#gid=0",
    );

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
    //     console.log(
    //       "⚠️ 'Next' button after 2FA not found. Please check manually.",
    //     );
    //   }
    // }

    // // // check is have text Not now or Skip
    // if (
    //   await page
    //     .locator('button:has-text("Not now"), button:has-text("Skip")')
    //     .isVisible()
    // ) {
    //   console.log("⏭️ Handling 'Not now' or 'Skip'...");
    //   await page
    //     .locator('button:has-text("Not now"), button:has-text("Skip")')
    //     .click();
    //   await delay(2000);
    // }

    // // // Wait for Google Sheets to load
    // console.log("📊 Navigating to Google Sheets...");

    // await delay(10000);
    // await page.goto("https://docs.google.com/spreadsheets");
    // await delay(2000);

    // // Redirect to new sheet creation
    // console.log("📝 Creating new sheet...");
    // await page.goto("https://docs.google.com/spreadsheets/create");
    // console.log("✅ New Google Sheet created successfully!");
    // await page.goto(
    //   "https://myaccount.google.com/?hl=en&utm_source=OGB&utm_medium=act&gar=WzJd",
    // );
    // // change avatar

    // await page.goto(
    //   "https://docs.google.com/spreadsheets/d/1mVQ44j5Q0ecnrXIglQ4QxtV3eJHSZQpRFSRQI1VgvTo/edit?gid=0#gid=0",
    // );
    // // Open Apps Script from menu
    // console.log("🔧 Opening Apps Script...");
    // try {
    //   const extensionsMenuSelector = "#docs-extensions-menu";
    //   await page.waitForSelector(extensionsMenuSelector, { timeout: 5000 }); // Wait for the Extensions menu to appear
    //   await page.click(extensionsMenuSelector);
    //   await delay(2000);

    //   const appsScriptOptionSelector = '//*[text()="Apps Script"]';
    //   const [newPage] = await Promise.all([
    //     browser.waitForEvent("page"), // Đợi tab mới được mở
    //     page.click(appsScriptOptionSelector), // Thực hiện click vào nút mở tab mới
    //   ]);

    //   console.log("Tab mới đã được mở!");

    //   // Chuyển sang tab mới
    //   await newPage.waitForLoadState(); // Chờ tab mới tải hoàn tất
    //   await delay(5000);
    //   console.log("URL của tab mới:", newPage.url());
    //   const execute_functions = async (page, funcNames) => {
    //     await page.evaluate(async (perrmissionRequiredFuncString) => {
    //       await new Promise((resolve) => {
    //         if (window.monaco && window.monaco.editor) {
    //           resolve();
    //         } else {
    //           const checkMonaco = setInterval(() => {
    //             if (window.monaco && window.monaco.editor) {
    //               clearInterval(checkMonaco);
    //               resolve();
    //             }
    //           }, 100);
    //         }
    //       });

    //       const monacoEditor = window.monaco.editor.getModels()[0]; // Lấy model đầu tiên của Monaco Editor
    //       monacoEditor.setValue(perrmissionRequiredFuncString);
    //     }, funcNames);

    //     //   Ctrl + S to save the script
    //     await page.keyboard.down("Control");
    //     await page.keyboard.press("KeyS");
    //     await page.keyboard.up("Control");
    //     console.log("Script saved.");

    //     await delay(5000);
    //     // Ctrl + R
    //     await page.keyboard.press("Control+KeyR");
    //     await page.keyboard.up("Control");
    //     console.log("Script reloaded.");
    //   };
    //   await execute_functions(newPage, perrmissionRequiredFuncString);
    //   console.log("✅ Permission function script set.");

    //   await delay(5000);
    //   try {
    //     await newPage.evaluate(async () => {
    //       document
    //         .querySelector("[role='dialog']")
    //         .querySelectorAll("button")[1]
    //         .click();
    //     });

    //     // click text Review permissions
    //     const [reviewPermissionsPage] = await Promise.all([
    //       browser.waitForEvent("page"), // Lắng nghe tab mới/chờ cửa sổ bật lên
    //       newPage.waitForTimeout(2000),
    //     ]);

    //     console.log("🚀 Cửa sổ cấp quyền đã được mở.");

    //     // Đợi tab được load hoàn tất và chuyển sang tab mới
    //     await reviewPermissionsPage.waitForLoadState();
    //     console.log(`Tab mới URL: ${reviewPermissionsPage.url()}`);

    //     console.log("🔑 Đang xử lý nhập OTP...");
    //     try {
    //       const otpCode = await get2FACode(secretKey);
    //       await reviewPermissionsPage.fill(
    //         'input[type="tel"], input[aria-label*="code"]',
    //         otpCode,
    //       );
    //       await delay(1000);
    //       await reviewPermissionsPage.click('#totpNext, button[type="submit"]');
    //       console.log("✅ OTP đã được nhập thành công.");
    //     } catch (error) {
    //       console.log(
    //         "⚠️ Không cần nhập OTP hoặc có lỗi xảy ra: " + error.message,
    //       );
    //     }

    //     // Click "Advanced / Nâng cao"
    //     await reviewPermissionsPage
    //       .locator('a:has-text("Advanced")')
    //       .click({ timeout: 10000 });

    //     console.log("✅ Đã nhấp vào nút Nâng cao/Advanced.");

    //     // Click "Go to Untitled project (unsafe)"
    //     await reviewPermissionsPage
    //       .locator("text=Go to Untitled project (unsafe)")
    //       .click({ timeout: 10000 });

    //     console.log("✅ Đã nhấp vào nút không an toàn/Not Safe.");

    //     // Click "Continue"
    //     await reviewPermissionsPage
    //       .locator('button:has-text("Continue")')
    //       .click({ timeout: 10000 });

    //     console.log("✅ Đã nhấp vào nút Tiếp tục/Continue.");

    //     // Select all permissions
    //     try {
    //       await reviewPermissionsPage
    //         .locator("text=Select all")
    //         .click({ timeout: 10000 });
    //     } catch (error) {
    //       console.log("⚠️ Không tìm thấy nút 'Select all': " + error.message);
    //       await reviewPermissionsPage.evaluate(() => {
    //         // Chọn tất cả các quyền theo cách thủ công
    //         const checkboxes = document.querySelectorAll(
    //           'input[type="checkbox"]',
    //         );
    //         checkboxes.forEach((checkbox) => {
    //           if (!checkbox.checked) {
    //             checkbox.click();
    //           }
    //         });
    //       });
    //     }

    //     // Click Continue lần 2
    //     try {
    //       await reviewPermissionsPage
    //         .locator('button:has-text("Continue")')
    //         .click({ timeout: 10000 });
    //     } catch (error) {
    //       console.log("⚠️ Không tìm thấy nút 'Continue': " + error.message);
    //     }
    //   } catch (error) {
    //     console.log("⚠️ Đã xảy ra lỗi: " + error.message);
    //   }

    //   // Chờ script chạy xong
    //   await newPage.waitForSelector('div:has-text("Execution completed")', {
    //     timeout: 60000,
    //   });

    //   console.log("✅ Script executed successfully!");

    //   await execute_functions(newPage, fillDataFuncString);
    //   console.log("✅ Fill data function script set.");

    //   await delay(5000);

    //   await execute_functions(newPage, sendEmailsFuncString);
    //   const reRun = async () => {
    //     // Ctrl + R
    //     await newPage.keyboard.press("Control+KeyR");
    //     await newPage.keyboard.up("Control");
    //     console.log("Script reloaded for re-run.");
    //   };
    //   let intervalId = setInterval(async () => {
    //     // Check aria-label="Exceeded maximum execution time."
    //     const result = await newPage.evaluate(() => {
    //       const itemList = document.querySelectorAll('[role="listitem"]');
    //       if (itemList.length > 0) {
    //         const lastItem = itemList[itemList.length - 1];
    //         const texts = lastItem.querySelectorAll("div");
    //         const errorDiv = Array.from(texts).find((div) =>
    //           div.textContent.includes("Exceeded maximum execution time."),
    //         );
    //         console.log("Checking for timeout or success...", errorDiv);

    //         if (errorDiv) {
    //           return { timeout: true };
    //         }
    //         const success = Array.from(texts).find((div) =>
    //           div.textContent.includes("Execution completed"),
    //         );
    //         console.log("Checking for success...", success);

    //         if (success) {
    //           return { success: true };
    //         }
    //       }

    //       return {};
    //     });
    //     console.log("Interval check result:", result);

    //     if (result.timeout) {
    //       console.log("⏰ Detected timeout. Re-running the script...");
    //       await reRun();
    //     } else if (result.success) {
    //       console.log("✅ Detected successful execution.");
    //       clearInterval(intervalId);
    //       intervalId = null;
    //     }
    //   }, 5000);
    //   console.log("✅ Send emails function script set.");
    //   console.log("🎉 Successfully opened Apps Script!");
    // } catch (error) {
    //   console.log(
    //     "⚠️ Failed to open Apps Script menu. Proceeding anyway..." +
    //       error.message,
    //   );
    // }

    // await page.waitForTimeout(5000); // Pause for manual inspection (optional)
  } catch (error) {
    console.error(`❌ An error occurred: ${error.message}`);
  } finally {
    console.log("Closing browser...");
    // await browser.close();
  }
})();
