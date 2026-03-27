class AutomationApp {
  constructor() {
    this.accounts = [];
    this.accountCombinedList = [];
    this.accountSeparatedList = [];
    this.data = { A: [], B: [], C: [], D: [] };
    this.isRunning = false;
    this.workers = [];
    this.inputFormat = "separated"; // 'separated' or 'combined'
    this.saveTimeout = null; // For debouncing auto-save
    this.usedDataIndexes = { A: [], B: [] }; // Track used data indexes for cleanup
    this.accountResults = {
      success: [],
      failed: []
    };

    this.initializeElements();
    this.setupEventListeners();
    this.setupWorkerUpdateListener();

    // Load config with a slight delay to ensure everything is ready
    setTimeout(() => {
      this.loadConfigData();
      // Ensure default function is loaded if textarea is empty
      if (!this.customSendEmailsFunction.value.trim()) {
        this.customSendEmailsFunction.value = this.getDefaultSendEmailsFunction();
      }
    }, 100);
  }

  initializeElements() {
    // File import buttons
    this.importAccountsBtn = document.getElementById("importAccountsBtn");
    this.importDataBtn = document.getElementById("importDataBtn");
    this.importCombinedBtn = document.getElementById("importCombinedBtn");
    this.addAccountBtn = document.getElementById("addAccountBtn");
    this.importAccountDataBtn = document.getElementById("importAccountDataBtn");

    // Input elements
    this.accountsInput = document.getElementById("accountsInput");
    this.combinedInput = document.getElementById("combinedInput");
    this.columnAData = document.getElementById("columnAData");
    this.columnBData = document.getElementById("columnBData");
    this.columnCData = document.getElementById("columnCData");
    this.columnDData = document.getElementById("columnDData");
    this.autoGenerateBtn = document.getElementById("autoGenerateBtn");
    this.cancelPreviewBtn = document.getElementById("cancelPreviewBtn");
    this.concurrentWorkers = document.getElementById("concurrentWorkers");
    this.customSendEmailsFunction = document.getElementById("customSendEmailsFunction");
    this.resetFunctionBtn = document.getElementById("resetFunctionBtn");
    this.validateFunctionBtn = document.getElementById("validateFunctionBtn");
    this.customSendEmailsFunction = document.getElementById("customSendEmailsFunction");
    this.resetFunctionBtn = document.getElementById("resetFunctionBtn");
    this.validateFunctionBtn = document.getElementById("validateFunctionBtn");

    // Format sections
    this.separatedFormat = document.getElementById("separatedFormat");
    this.combinedFormat = document.getElementById("combinedFormat");
    this.dataSection = document.getElementById("dataSection");
    this.accountEditor = document.getElementById("accountEditor");

    // Account editor elements
    this.accountSelect = document.getElementById("accountSelect");
    this.accountDataForm = document.getElementById("accountDataForm");
    this.editEmail = document.getElementById("editEmail");
    this.editPassword = document.getElementById("editPassword");
    this.editSecretKey = document.getElementById("editSecretKey");
    this.editDataA = document.getElementById("editDataA");
    this.editDataB = document.getElementById("editDataB");
    this.editDataC = document.getElementById("editDataC");
    this.editDataD = document.getElementById("editDataD");
    this.saveAccountBtn = document.getElementById("saveAccountBtn");
    this.cancelEditBtn = document.getElementById("cancelEditBtn");
    this.deleteAccountBtn = document.getElementById("deleteAccountBtn");

    // Control buttons
    this.startBtn = document.getElementById("startBtn");
    this.stopBtn = document.getElementById("stopBtn");
    this.statusBtn = document.getElementById("statusBtn");

    // Display elements
    this.accountsCount = document.getElementById("accountsCount");
    this.combinedCount = document.getElementById("combinedCount");
    this.status = document.getElementById("status");
    this.workersContainer = document.getElementById("workersContainer");
    this.logsContainer = document.getElementById("logsContainer");

    // Results elements
    this.successCount = document.getElementById("successCount");
    this.failedCount = document.getElementById("failedCount");
    this.totalCount = document.getElementById("totalCount");
    this.successTab = document.getElementById("successTab");
    this.failedTab = document.getElementById("failedTab");
    this.successAccountsList = document.getElementById("successAccountsList");
    this.failedAccountsList = document.getElementById("failedAccountsList");
    this.successAccounts = document.getElementById("successAccounts");
    this.failedAccounts = document.getElementById("failedAccounts");

    // Format radio buttons
    this.formatRadios = document.getElementsByName("inputFormat");

    // Current editing state
    this.currentEditingAccountIndex = -1;
  }

  setupEventListeners() {
    // Format radio button handlers
    this.formatRadios.forEach((radio) => {
      radio.addEventListener("change", (e) =>
        this.handleFormatChange(e.target.value),
      );
    });

    // File import handlers
    this.importAccountsBtn.addEventListener("click", () =>
      this.importAccountsFile(),
    );
    this.importDataBtn.addEventListener("click", () => this.importDataFile());
    this.importCombinedBtn.addEventListener("click", () =>
      this.importCombinedFile(),
    );
    this.importAccountDataBtn.addEventListener("click", () =>
      this.importDataForSelectedAccount(),
    );

    // Function editor handlers
    this.resetFunctionBtn.addEventListener("click", () => this.resetFunction());
    this.validateFunctionBtn.addEventListener("click", () => this.validateFunction());
    this.customSendEmailsFunction.addEventListener("input", () => this.debouncedSave());

    // Account management handlers
    this.addAccountBtn.addEventListener("click", () => this.addNewAccount());
    this.accountSelect.addEventListener("change", () =>
      this.handleAccountSelection(),
    );
    this.saveAccountBtn.addEventListener("click", () => this.saveAccountData());
    this.cancelEditBtn.addEventListener("click", () =>
      this.cancelAccountEdit(),
    );
    this.deleteAccountBtn.addEventListener("click", () =>
      this.deleteSelectedAccount(),
    );

    // Function editor handlers
    this.resetFunctionBtn.addEventListener("click", () => this.resetFunction());
    this.validateFunctionBtn.addEventListener("click", () => this.validateFunction());
    this.customSendEmailsFunction.addEventListener("input", () => this.debouncedSave());
    // Control handlers
    this.startBtn.addEventListener("click", () => this.startAutomation());
    this.stopBtn.addEventListener("click", () => this.stopAutomation());
    this.statusBtn.addEventListener("click", () => this.checkStatus());

    // Results tab handlers
    this.successTab.addEventListener("click", () => this.showResultsTab("success"));
    this.failedTab.addEventListener("click", () => this.showResultsTab("failed"));

    // Input change handlers
    this.accountsInput.addEventListener("input", () => this.parseAccounts());
    this.combinedInput.addEventListener("input", () =>
      this.parseCombinedInput(),
    );
    this.columnAData.addEventListener("input", () => this.parseData());
    this.columnBData.addEventListener("input", () => this.parseData());
    this.columnCData.addEventListener("input", () => this.parseData());
    this.columnDData.addEventListener("input", () => this.parseData());
    this.concurrentWorkers.addEventListener("change", () =>
      this.debouncedSave(),
    );
  }

  setupWorkerUpdateListener() {
    window.electronAPI.onWorkerUpdate((data) => {
      this.handleWorkerUpdate(data);
    });
  }

  async loadConfigData() {
    try {
      // Check if electronAPI is available
      if (!window.electronAPI || !window.electronAPI.getConfig) {
        console.error("electronAPI not available");
        this.addLog(
          "❌ Electron API not available, using default data",
          "error",
        );
        this.loadDefaultData();
        return;
      }

      console.log("Attempting to load config...");
      const result = await window.electronAPI.getConfig();
      if (result.success && result.config) {
        const config = result.config;
        this.inputFormat = config.automation.inputFormat || "separated";

        const parseAccountList = (accountList) => {
          return accountList.map((acc) => ({
            email: acc.email || "",
            password: acc.password || "",
            secretKey: acc.secretKey || "",
            data: acc.data
              ? {
                A: Array.isArray(acc.data.A)
                  ? acc.data.A
                  : [acc.data.A].filter((x) => x),
                B: Array.isArray(acc.data.B)
                  ? acc.data.B
                  : [acc.data.B].filter((x) => x),
                C: Array.isArray(acc.data.C)
                  ? acc.data.C
                  : [acc.data.C].filter((x) => x),
                D: Array.isArray(acc.data.D)
                  ? acc.data.D
                  : [acc.data.D].filter((x) => x),
              }
              : null,
          }));
        };
        this.accountSeparatedList = parseAccountList(config.accountSeparatedList || []);
        this.accountCombinedList = parseAccountList(config.accountCombinedList || []);
        if (this.inputFormat === "separated") {
          this.accounts = this.accountSeparatedList;
          this.updateAccountsTextarea();

        }
        if (this.inputFormat === "combined") {
          this.accounts = this.accountCombinedList;
          this.updateCombinedTextarea();
        }

        // Load default shared data columns (for separated format)
        if (config.defaultData && this.inputFormat === "separated") {
          if (config.defaultData.A && config.defaultData.A.length > 0) {
            this.columnAData.value = config.defaultData.A.join("\n");
          }
          if (config.defaultData.B && config.defaultData.B.length > 0) {
            this.columnBData.value = config.defaultData.B.join("\n");
          }
          if (config.defaultData.C && config.defaultData.C.length > 0) {
            this.columnCData.value = config.defaultData.C.join("\n");
          }
          if (config.defaultData.D && config.defaultData.D.length > 0) {
            this.columnDData.value = config.defaultData.D.join("\n");
          }

          this.parseData();
          this.addLog(`📂 Loaded default shared data columns`, "info");
        }

        // Load automation settings
        if (config.automation) {
          if (config.automation.concurrent) {
            this.concurrentWorkers.value = config.automation.concurrent;
          }
          if (config.automation.inputFormat) {
            this.inputFormat = config.automation.inputFormat;
          }
          if (config.automation.customSendEmailsFunction) {
            this.customSendEmailsFunction.value = config.automation.customSendEmailsFunction;
          } else {
            // Load default function if no custom function is saved
            this.customSendEmailsFunction.value = this.getDefaultSendEmailsFunction();
          }
        } else {
          // Load default function if no config.automation exists
          this.customSendEmailsFunction.value = this.getDefaultSendEmailsFunction();
        }

        // Set the correct format radio button and update UI
        const formatRadio = document.querySelector(
          `input[name="inputFormat"][value="${this.inputFormat}"]`,
        );
        if (formatRadio) {
          formatRadio.checked = true;
          this.handleFormatChange(this.inputFormat);
        }

        this.addLog("✅ Configuration loaded successfully", "success");
      } else {
        // Load default data if no config exists
        this.loadDefaultData();
      }
    } catch (error) {
      console.error("Error loading config:", error);
      this.addLog(
        "❌ Error loading configuration, using default data",
        "error",
      );
      this.loadDefaultData();
    }
  }

  updateAccountsTextarea() {
    // For separated format: just email|password|secret
    const lines = this.accounts.map(
      (account) => `${account.email}|${account.password}|${account.secretKey}`,
    );
    this.accountsInput.value = lines.join("\n");
    this.accountsCount.textContent = `${this.accounts.length} accounts loaded`;
    this.updateDataStats(); // Cập nhật thông tin chia dữ liệu
    console.log("Accounts textarea updated");
  }

  async saveCurrentState() {
    try {
      // Save accounts in new structure
      if (this.accounts.length > 0) {
        const accountsData = this.accounts.map((acc) => ({
          email: acc.email,
          password: acc.password,
          secretKey: acc.secretKey,
          data:
            this.inputFormat === "combined" && acc.data
              ? {
                A: Array.isArray(acc.data.A) ? acc.data.A : [],
                B: Array.isArray(acc.data.B) ? acc.data.B : [],
                C: Array.isArray(acc.data.C) ? acc.data.C : [],
                D: Array.isArray(acc.data.D) ? acc.data.D : [],
              }
              : null,
        }));

        await window.electronAPI.updateConfig(this.inputFormat === "combined" ? "accountCombinedList" : "accountSeparatedList", accountsData);
      }

      // Save default shared data columns (for separated format)
      if (this.inputFormat === "separated") {
        await window.electronAPI.updateConfig("defaultData", {
          A: this.data.A,
          B: this.data.B,
          C: this.data.C,
          D: this.data.D,
        });
      } else {
        // Keep existing default data when in combined format
        // Don't clear it as it might be used when switching back to separated
      }
      // Save current automation settings
      await window.electronAPI.updateConfig("automation", {
        concurrent: parseInt(this.concurrentWorkers.value) || 1,
        inputFormat: this.inputFormat,
        customSendEmailsFunction: this.customSendEmailsFunction.value.trim(),
      });

      this.addLog("💾 Current state saved to config", "success");
    } catch (error) {
      console.error("Error saving state:", error);
    }
  }

  // Debounced auto-save function
  debouncedSave() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.saveCurrentState();
    }, 2000); // Save after 2 seconds of inactivity
  }

  loadDefaultData() {
    // Load default function
    if (this.customSendEmailsFunction) {
      this.customSendEmailsFunction.value = this.getDefaultSendEmailsFunction();
    }

    // Load default data from the original main.js
    const defaultDataA = [
      "nattaponglum@gmail.com",
      "sabulonss@gmail.com",
      "rungtawan251988@gmail.com",
      "suksomsap.sssc@gmail.com",
      "fantasticchair9@gmail.com",
      "kaws.condo@gmail.com",
      "aujcharapom@gmail.com",
      "beet999auto@gmail.com",
      "preordershopchill@gmail.com",
      "bokboondelivery@gmail.com",
    ];

    const defaultDataB = [
      "บริษัท ไดว่า พร๊อพเพอร์ตี้ แอนด์ คอนสทรัคชั่น จำกัด",
      "บริษัทกิตติศักดิ์การก่อสร้าง แอนด์ ดีไซน์ จำกัด",
      "บริษัทรุ่งตะวันเพิ่มทรัพย์เกษตรอินทรีย์ไทยจำกัด",
      "บริษัทสุขสมทรัพย์รับสร้างบ้านครบวงจร",
      "บริษัทเก้าอี้มหัศจรรย์ตาแสวง จำกัด",
      "บริหารขาย บ้าน คอนโด มือหนึ่ง และ  รีโนเวทใหม่-รับฝากขาย",
      "บลูคริสตัลรีสอร์ทแหลมสิงห์ Blue Crystal Resort",
      "บลูทูธสเตอริโอระดับเทพ",
      "บอกต่อของถูก",
      "บอกบุญ เดลิเวอรี่",
    ];

    const defaultDataC = [
      "เรียน [Name], ขอแสดงความยินดีที่ได้รับป้ายสีน้ำเงิน!",
      "เรียน [Name], ป้ายสีน้ำเงินของคุณเปิดใช้งานแล้ว!",
      "เรียน [Name], ความสำเร็จได้รับการยืนยันแล้ว!",
      "เรียน [Name], ขอแสดงความยินดีด้วย!",
      "เรียน [Name], ป้ายสีน้ำเงินของคุณแสดงให้เห็นถึงความเป็นมืออาชีพ",
    ];

    const defaultDataD = [
      "คลิกแบบฟอร์มนี้เพื่อรับ Blue Badge ของคุณทันที",
      "แตะลิงก์นี้เพื่อเปิดใช้งาน Blue Badge ของคุณ",
      "กรอกแบบฟอร์มนี้เพื่อรับ Blue Badge",
      "คลิกที่นี่เพื่อรับ Blue Badge ของคุณ",
      "ลงทะเบียนตอนนี้เพื่อรับ Blue Badge",
    ];

    this.columnAData.value = defaultDataA.join("\n");
    this.columnBData.value = defaultDataB.join("\n");
    this.columnCData.value = defaultDataC.join("\n");
    this.columnDData.value = defaultDataD.join("\n");

    this.parseData();
  }

  handleFormatChange(format) {
    this.inputFormat = format;

    if (format === "separated") {
      this.separatedFormat.style.display = "block";
      this.combinedFormat.style.display = "none";
      this.dataSection.style.display = "block";
      this.accounts = this.accountSeparatedList;
      this.updateDataStats(); // Cập nhật thông tin chia dữ liệu
    } else {
      this.separatedFormat.style.display = "none";
      this.combinedFormat.style.display = "block";
      this.dataSection.style.display = "none";
      this.accounts = this.accountCombinedList;
      this.updateCombinedTextarea();
      this.updateAccountEditor();
      this.updateDataStats(); // Ẩn thông tin chia dữ liệu
    }

    // Save format change
    this.debouncedSave();
  }

  updateAccountEditor() {
    if (this.inputFormat === "combined" && this.accounts.length > 0) {
      this.accountEditor.style.display = "block";
      this.updateAccountSelect();
    } else {
      this.accountEditor.style.display = "none";
      this.accountDataForm.style.display = "none";
    }
  }

  updateAccountSelect() {
    // Clear existing options
    this.accountSelect.innerHTML =
      '<option value="">-- Choose an account --</option>';

    // Add options for each account
    this.accounts.forEach((account, index) => {
      const option = document.createElement("option");
      option.value = index;
      option.textContent = `${account.email} (Account ${index + 1})`;
      this.accountSelect.appendChild(option);
    });
  }

  addNewAccount() {
    // Add empty account template
    const newAccount = {
      email: "",
      password: "",
      secretKey: "",
      data: {
        A: [],
        B: [],
        C: [],
        D: [],
      },
    };

    this.accounts.push(newAccount);
    this.updateCombinedTextarea();
    this.updateAccountEditor();

    // Auto-select the new account for editing
    this.accountSelect.value = this.accounts.length - 1;
    this.handleAccountSelection();

    this.addLog(
      `➕ Added new empty account (Account ${this.accounts.length})`,
      "info",
    );
  }

  handleAccountSelection() {
    const selectedIndex = parseInt(this.accountSelect.value);

    if (selectedIndex >= 0 && selectedIndex < this.accounts.length) {
      this.currentEditingAccountIndex = selectedIndex;
      this.loadAccountDataToForm(this.accounts[selectedIndex]);
      this.accountDataForm.style.display = "block";
      this.deleteAccountBtn.disabled = false;
    } else {
      this.accountDataForm.style.display = "none";
      this.currentEditingAccountIndex = -1;
      this.deleteAccountBtn.disabled = true;
    }
  }

  loadAccountDataToForm(account) {
    this.editEmail.value = account.email || "";
    this.editPassword.value = account.password || "";
    this.editSecretKey.value = account.secretKey || "";
    this.editDataA.value = account.data?.A
      ? Array.isArray(account.data.A)
        ? account.data.A.join("\n")
        : account.data.A
      : "";
    this.editDataB.value = account.data?.B
      ? Array.isArray(account.data.B)
        ? account.data.B.join("\n")
        : account.data.B
      : "";
    this.editDataC.value = account.data?.C
      ? Array.isArray(account.data.C)
        ? account.data.C.join("\n")
        : account.data.C
      : "";
    this.editDataD.value = account.data?.D
      ? Array.isArray(account.data.D)
        ? account.data.D.join("\n")
        : account.data.D
      : "";
  }

  saveAccountData() {
    if (this.currentEditingAccountIndex < 0) {
      this.addLog("❌ No account selected for editing", "error");
      return;
    }

    // Validate required fields
    if (!this.editEmail.value.trim()) {
      this.addLog("❌ Email is required", "error");
      this.editEmail.focus();
      return;
    }

    if (!this.editPassword.value.trim()) {
      this.addLog("❌ Password is required", "error");
      this.editPassword.focus();
      return;
    }

    if (!this.editSecretKey.value.trim()) {
      this.addLog("❌ Secret key is required", "error");
      this.editSecretKey.focus();
      return;
    }

    // Update the account
    const account = this.accounts[this.currentEditingAccountIndex];
    account.email = this.editEmail.value.trim();
    account.password = this.editPassword.value.trim();
    account.secretKey = this.editSecretKey.value.trim();
    account.data = {
      A: this.editDataA.value
        .trim()
        .split("\n")
        .filter((line) => line.trim()),
      B: this.editDataB.value
        .trim()
        .split("\n")
        .filter((line) => line.trim()),
      C: this.editDataC.value
        .trim()
        .split("\n")
        .filter((line) => line.trim()),
      D: this.editDataD.value
        .trim()
        .split("\n")
        .filter((line) => line.trim()),
    };

    // Update UI
    this.updateCombinedTextarea();
    this.updateAccountSelect();
    this.accountSelect.value = this.currentEditingAccountIndex; // Keep selection
    this.debouncedSave();
    this.addLog(`💾 Saved data for account: ${account.email}`, "success");
  }

  cancelAccountEdit() {
    if (this.currentEditingAccountIndex >= 0) {
      // Reload original data
      this.loadAccountDataToForm(
        this.accounts[this.currentEditingAccountIndex],
      );
    }
    this.addLog("❌ Cancelled account edit", "info");
  }

  deleteSelectedAccount() {
    if (this.currentEditingAccountIndex < 0) {
      this.addLog("❌ No account selected for deletion", "error");
      return;
    }

    const account = this.accounts[this.currentEditingAccountIndex];
    const confirmDelete = confirm(
      `Are you sure you want to delete account: ${account.email}?`,
    );

    if (confirmDelete) {
      this.accounts.splice(this.currentEditingAccountIndex, 1);
      this.updateCombinedTextarea();
      this.updateAccountEditor();
      this.accountDataForm.style.display = "none";
      this.currentEditingAccountIndex = -1;

      this.addLog(`🗑️ Deleted account: ${account.email}`, "warning");
    }
  }

  async importDataForSelectedAccount() {
    if (this.currentEditingAccountIndex < 0) {
      this.addLog("❌ No account selected", "error");
      return;
    }

    try {
      const result = await window.electronAPI.importDataFile();
      if (result.success) {
        const lines = result.content.split("\n").filter((line) => line.trim());

        if (lines.length > 0) {
          // Parse first line as CSV data
          const columns = lines[0].split(",").map((col) => col.trim());

          // Update form fields
          this.editDataA.value = columns[0] || "";
          this.editDataB.value = columns[1] || "";
          this.editDataC.value = columns[2] || "";
          this.editDataD.value = columns[3] || "";

          this.addLog(
            `📁 Imported data for selected account from: ${result.filePath}`,
            "success",
          );
        } else {
          this.addLog("❌ No data found in file", "error");
        }
      } else {
        this.addLog(`❌ Failed to import data: ${result.error}`, "error");
      }
    } catch (error) {
      this.addLog(`❌ Error importing data: ${error.message}`, "error");
    }
  }

  updateCombinedTextarea() {
    this.combinedCount.textContent = `${this.accounts.length} accounts with data loaded`;
  }

  async importCombinedFile() {
    try {
      const result = await window.electronAPI.importAccountsFile();
      if (result.success) {
        this.combinedInput.value = result.content;
        this.parseCombinedInput();
        this.addLog(
          `📁 Imported combined data from: ${result.filePath}`,
          "success",
        );
      } else {
        this.addLog(
          `❌ Failed to import combined data: ${result.error}`,
          "error",
        );
      }
    } catch (error) {
      this.addLog(
        `❌ Error importing combined data: ${error.message}`,
        "error",
      );
    }
  }

  parseCombinedInput() {
    const text = this.combinedInput.value.trim();
    if (!text) {
      this.accounts = [];
      this.combinedCount.textContent = "0 accounts with data loaded";
      this.updateAccountEditor();
      return;
    }

    const lines = text.split("\n").filter((line) => line.trim());
    this.accounts = [];

    for (const line of lines) {
      const parts = line.split("|").map((part) => part.trim());
      if (parts.length >= 3) {
        // Check if there's data after the secret key (format: email:pass:secret|A|B|C|D)
        const restOfLine = parts.slice(3).join("|"); // Rejoin in case there were pipes in data
        const dataParts = restOfLine.split("|").map((part) => part.trim());

        this.accounts.push({
          email: parts[0],
          password: parts[1],
          secretKey: parts[2],
          data: {
            A: dataParts[1]
              ? dataParts[1].split(";").filter((x) => x.trim())
              : [],
            B: dataParts[2]
              ? dataParts[2].split(";").filter((x) => x.trim())
              : [],
            C: dataParts[3]
              ? dataParts[3].split(";").filter((x) => x.trim())
              : [],
            D: dataParts[4]
              ? dataParts[4].split(";").filter((x) => x.trim())
              : [],
          },
        });
      }
    }

    this.combinedCount.textContent = `${this.accounts.length} accounts with data loaded`;
    this.updateAccountEditor();
    this.debouncedSave(); // Auto-save when accounts change
  }

  async importAccountsFile() {
    try {
      const result = await window.electronAPI.importAccountsFile();
      if (result.success) {
        this.accountsInput.value = result.content;
        this.parseAccounts();
        this.addLog(`📁 Imported accounts from: ${result.filePath}`, "success");
      } else {
        this.addLog(`❌ Failed to import accounts: ${result.error}`, "error");
      }
    } catch (error) {
      this.addLog(`❌ Error importing accounts: ${error.message}`, "error");
    }
  }

  async importDataFile() {
    try {
      const result = await window.electronAPI.importDataFile();
      if (result.success) {
        // Parse CSV/text file content
        const lines = result.content.split("\n").filter((line) => line.trim());

        // Assume CSV format: A,B,C,D
        const dataA = [],
          dataB = [],
          dataC = [],
          dataD = [];

        for (const line of lines) {
          const columns = line.split(",").map((col) => col.trim());
          if (columns.length >= 4) {
            dataA.push(columns[0]);
            dataB.push(columns[1]);
            dataC.push(columns[2]);
            dataD.push(columns[3]);
          }
        }

        this.columnAData.value = dataA.join("\n");
        this.columnBData.value = dataB.join("\n");
        this.columnCData.value = dataC.join("\n");
        this.columnDData.value = dataD.join("\n");

        this.parseData();
        this.addLog(`📁 Imported data from: ${result.filePath}`, "success");
      } else {
        this.addLog(`❌ Failed to import data: ${result.error}`, "error");
      }
    } catch (error) {
      this.addLog(`❌ Error importing data: ${error.message}`, "error");
    }
  }

  parseAccounts() {
    const text = this.accountsInput.value.trim();

    if (!text) {
      this.accounts = [];
      this.accountsCount.textContent = "0 accounts loaded";
      this.updateDataStats(); // Cập nhật thông tin chia dữ liệu
      return;
    }

    const lines = text.split("\n").filter((line) => line.trim());
    this.accounts = [];

    for (const line of lines) {
      const parts = line.split("|");
      if (parts.length >= 3) {
        this.accounts.push({
          email: parts[0].trim(),
          password: parts[1].trim(),
          secretKey: parts[2].trim(),
          data: null, // No individual data in separated format
        });
      }
    }

    this.accountsCount.textContent = `${this.accounts.length} accounts loaded`;
    this.updateDataStats(); // Cập nhật thông tin chia dữ liệu
    this.debouncedSave(); // Auto-save when accounts change
  }

  parseData() {
    this.data.A = this.columnAData.value
      .split("\n")
      .filter((line) => line.trim());
    this.data.B = this.columnBData.value
      .split("\n")
      .filter((line) => line.trim());
    this.data.C = this.columnCData.value
      .split("\n")
      .filter((line) => line.trim());
    this.data.D = this.columnDData.value
      .split("\n")
      .filter((line) => line.trim());

    // Cập nhật thông tin số lượng dữ liệu
    this.updateDataStats();
    this.debouncedSave(); // Auto-save when data changes
  }

  // Cập nhật thông tin thống kê dữ liệu
  updateDataStats() {
    if (this.inputFormat === "separated" && this.accounts.length > 0) {
      const minLength = Math.min(
        this.data.A.length,
        this.data.B.length,
        this.data.C.length,
        this.data.D.length
      );
      const itemsPerAccount = Math.floor(minLength / this.accounts.length);

      // Cập nhật thông tin hiển thị
      let dataInfo = document.querySelector('.data-info');
      if (!dataInfo) {
        dataInfo = document.createElement('div');
        dataInfo.className = 'data-info info';
        this.dataSection.appendChild(dataInfo);
      }

      if (minLength > 0 && itemsPerAccount > 0) {
        dataInfo.innerHTML = `📊 Dữ liệu sẽ được chia đều: <strong>${itemsPerAccount} items/tài khoản</strong> cho ${this.accounts.length} tài khoản<br>
        <small>📝 A:${this.data.A.length}, B:${this.data.B.length}, C:${this.data.C.length}, D:${this.data.D.length}</small><br>
        <small>🤖 <em>Cột A và B sẽ tự động xóa sau khi hoàn thành, cột C và D giữ nguyên</em></small>`;
        dataInfo.style.display = 'block';
      } else {
        dataInfo.innerHTML = `⚠️ Không đủ dữ liệu để chia cho ${this.accounts.length} tài khoản. Cần ít nhất ${this.accounts.length} items trong mỗi cột.`;
        dataInfo.style.display = 'block';
      }
    } else {
      // Ẩn thông tin nếu không phải chế độ separated
      const dataInfo = document.querySelector('.data-info');
      if (dataInfo) {
        dataInfo.style.display = 'none';
      }
    }
  }

  // Chia đều dữ liệu cho các account trong chế độ separated
  distributeDataToAccounts() {
    if (this.inputFormat !== "separated" || this.accounts.length === 0) {
      return this.data;
    }

    const accountCount = this.accounts.length;

    // Tìm số lượng tối thiểu của các cột
    const minLength = Math.min(
      this.data.A.length,
      this.data.B.length,
    );

    if (minLength === 0) {
      this.addLog("⚠️ Không có đủ dữ liệu trong các cột A, B, C, D", "warning");
      return this.data;
    }

    // Tính số dữ liệu mỗi account nhận
    const itemsPerAccount = Math.floor(minLength / accountCount);

    if (itemsPerAccount === 0) {
      this.addLog(`⚠️ Không đủ dữ liệu để chia cho ${accountCount} tài khoản. Cần ít nhất ${accountCount} items trong mỗi cột.`, "warning");
      return this.data;
    }

    // Reset usage tracking
    this.usedDataIndexes = { A: [], B: [] };

    // Cập nhật accounts với dữ liệu được chia
    for (let i = 0; i < accountCount; i++) {
      const startIndex = i * itemsPerAccount;
      const endIndex = Math.min(startIndex + itemsPerAccount, minLength);

      // Track indexes sẽ được sử dụng cho cột A và B
      for (let j = startIndex; j < endIndex; j++) {
        this.usedDataIndexes.A.push(j);
        this.usedDataIndexes.B.push(j);
      }

      // Gán dữ liệu chia đều cho từng account
      this.accounts[i].data = {
        A: this.data.A.slice(startIndex, endIndex),
        B: this.data.B.slice(startIndex, endIndex),
        C: this.data.C.slice(0, itemsPerAccount), // Luôn lấy từ đầu cho C và D
        D: this.data.D.slice(0, itemsPerAccount),
      };
    }

    this.addLog(`📊 Đã chia đều dữ liệu: ${itemsPerAccount} items/account cho ${accountCount} tài khoản (tổng: ${minLength} items)`, "info");

    return this.data;
  }

  // Cleanup dữ liệu đã sử dụng từ cột A và B
  cleanupUsedData() {
    if (this.inputFormat !== "separated" || !this.usedDataIndexes) {
      return;
    }

    // Sắp xếp indexes theo thứ tự giảm dần để xóa từ cuối lên đầu
    const sortedIndexesA = [...new Set(this.usedDataIndexes.A)].sort((a, b) => b - a);
    const sortedIndexesB = [...new Set(this.usedDataIndexes.B)].sort((a, b) => b - a);

    // Xóa dữ liệu đã sử dụng từ cột A
    sortedIndexesA.forEach(index => {
      if (index < this.data.A.length) {
        this.data.A.splice(index, 1);
      }
    });

    // Xóa dữ liệu đã sử dụng từ cột B
    sortedIndexesB.forEach(index => {
      if (index < this.data.B.length) {
        this.data.B.splice(index, 1);
      }
    });

    // Cập nhật UI
    this.columnAData.value = this.data.A.join('\n');
    this.columnBData.value = this.data.B.join('\n');

    // Reset tracking
    this.usedDataIndexes = { A: [], B: [] };

    this.addLog(`🧹 Tự động xóa dữ liệu đã sử dụng từ cột A và B. Còn lại: A(${this.data.A.length}), B(${this.data.B.length}), C(${this.data.C.length}), D(${this.data.D.length})`, "info");

    // Cập nhật thông tin hiển thị
    this.updateDataStats();
    this.debouncedSave();
  }

  async startAutomation() {
    if (this.isRunning) {
      this.addLog("⚠️ Automation is already running", "warning");
      return;
    }

    if (this.accounts.length === 0) {
      this.addLog("❌ No accounts loaded", "error");
      return;
    }

    // Clear previous results
    this.clearResults();

    const concurrent = parseInt(this.concurrentWorkers.value) || 2;

    // Save current state before starting
    await this.saveCurrentState();

    this.isRunning = true;
    this.startBtn.disabled = true;
    this.stopBtn.disabled = false;

    this.updateStatus("🚀 Starting automation...", "running");
    this.addLog(
      `▶️ Starting automation with ${concurrent} workers for ${this.accounts.length} accounts (${this.inputFormat} format)`,
    );

    try {
      // Chia đều dữ liệu cho các account nếu là chế độ separated
      if (this.inputFormat === "separated") {
        this.distributeDataToAccounts();
      }

      const config = {
        accounts: this.accounts,
        data: null,
        concurrent,
        inputFormat: this.inputFormat,
        customSendEmailsFunction: this.customSendEmailsFunction.value.trim() || this.getDefaultSendEmailsFunction(),
      };

      const result = await window.electronAPI.startAutomation(config);

      if (result.success) {
        this.addLog("✅ Automation completed successfully", "success");
        this.updateStatus("✅ Automation completed", "completed");
      } else {
        this.addLog(`❌ Automation failed: ${result.error}`, "error");
        this.updateStatus("❌ Automation failed", "error");
      }
    } catch (error) {
      this.addLog(`❌ Error starting automation: ${error.message}`, "error");
      this.updateStatus("❌ Error occurred", "error");
    } finally {
      // Auto cleanup dữ liệu đã sử dụng từ cột A và B (luôn chạy sau khi hoàn thành)
      if (this.inputFormat === "separated") {
        this.cleanupUsedData();
      }

      this.isRunning = false;
      this.startBtn.disabled = false;
      this.stopBtn.disabled = true;
    }
  }

  async stopAutomation() {
    try {
      this.addLog("⏹️ Stopping all workers...");
      const result = await window.electronAPI.stopAutomation();

      if (result.success) {
        this.addLog("✅ All workers stopped", "success");
        this.updateStatus("⏹️ Stopped", "stopped");
      } else {
        this.addLog(`❌ Failed to stop workers: ${result.error}`, "error");
      }

      this.isRunning = false;
      this.startBtn.disabled = false;
      this.stopBtn.disabled = true;
    } catch (error) {
      this.addLog(`❌ Error stopping automation: ${error.message}`, "error");
    }
  }

  async checkStatus() {
    try {
      const result = await window.electronAPI.getWorkersStatus();
      this.updateWorkersDisplay(result.workers);
      this.addLog(`📊 Status checked - ${result.workers.length} workers found`);
    } catch (error) {
      this.addLog(`❌ Error checking status: ${error.message}`, "error");
    }
  }

  updateWorkersDisplay(workers) {
    this.workersContainer.innerHTML = "";

    if (workers.length === 0) {
      this.workersContainer.innerHTML = "<p>No active workers</p>";
      return;
    }

    for (const worker of workers) {
      const workerDiv = document.createElement("div");
      workerDiv.className = `worker-item ${worker.status}`;
      workerDiv.innerHTML = `
                <div>
                    <strong>Worker ${worker.id.substring(0, 8)}</strong>
                    <br><small>PID: ${worker.pid}</small>
                </div>
                <span class="worker-status ${worker.status}">${worker.status}</span>
            `;
      this.workersContainer.appendChild(workerDiv);
    }
  }

  handleWorkerUpdate(data) {
    const { workerId, type, message, progress, accountData } = data;
    const workerName = `Worker ${workerId.substring(0, 8)}`;

    switch (type) {
      case "progress":
        this.addLog(`🔄 ${workerName}: ${message}`);
        break;
      case "success":
        this.addLog(`✅ ${workerName}: ${message}`, "success");
        // Thêm tài khoản vào danh sách thành công
        if (accountData) {
          this.addAccountResult("success", accountData, message);
        }
        break;
      case "error":
        this.addLog(`❌ ${workerName}: ${message}`, "error");
        // Thêm tài khoản vào danh sách lỗi
        if (accountData) {
          this.addAccountResult("failed", accountData, message);
        }
        break;
      case "completed":
        this.addLog(`🎉 ${workerName}: Completed`, "success");
        break;
      default:
        this.addLog(`📝 ${workerName}: ${message}`);
    }

    // Update status if needed
    if (progress) {
      this.updateStatus(
        `🔄 Processing... (${progress.current}/${progress.total})`,
        "running",
      );
    }
  }

  updateStatus(message, type = "info") {
    this.status.innerHTML = `<p class="${type}">${message}</p>`;
  }

  addLog(message, type = "info") {
    const timestamp = new Date().toLocaleTimeString();
    const logDiv = document.createElement("div");
    logDiv.className = `log-item ${type}`;
    logDiv.textContent = `[${timestamp}] ${message}`;

    this.logsContainer.appendChild(logDiv);
    this.logsContainer.scrollTop = this.logsContainer.scrollHeight;

    // Keep only last 100 log entries
    while (this.logsContainer.children.length > 100) {
      this.logsContainer.removeChild(this.logsContainer.firstChild);
    }
  }

  // Function editor methods
  resetFunction() {
    const defaultFunction = this.getDefaultSendEmailsFunction();
    this.customSendEmailsFunction.value = defaultFunction;
    this.debouncedSave();
    this.addLog("\ud83d\udd04 Kh\u00f4i ph\u1ee5c h\u00e0m m\u1eb7c \u0111\u1ecbnh th\u00e0nh c\u00f4ng", "info");
  }

  validateFunction() {
    const code = this.customSendEmailsFunction.value.trim();
    if (!code) {
      this.addLog("\u26a0\ufe0f Vui l\u00f2ng nh\u1eadp code tr\u01b0\u1edbc khi ki\u1ec3m tra", "error");
      return;
    }

    try {
      // Basic syntax check - try to create a function
      new Function(code);
      this.addLog("\u2705 C\u00fa ph\u00e1p h\u1ee3p l\u1ec7! C\u00f3 th\u1ec3 s\u1eed d\u1ee5ng function n\u00e0y.", "success");
    } catch (error) {
      this.addLog(`\u274c L\u1ed7i c\u00fa ph\u00e1p: ${error.message}`, "error");
    }
  }

  // Results management methods
  addAccountResult(type, accountData, message) {
    const timestamp = new Date().toLocaleString();
    const result = {
      email: accountData.email || "N/A",
      message: message,
      timestamp: timestamp,
      accountData: accountData
    };

    if (type === "success") {
      this.accountResults.success.push(result);
    } else if (type === "failed") {
      this.accountResults.failed.push(result);
    }

    this.updateResultsDisplay();
  }

  updateResultsDisplay() {
    // Update counters
    this.successCount.textContent = this.accountResults.success.length;
    this.failedCount.textContent = this.accountResults.failed.length;
    this.totalCount.textContent = this.accountResults.success.length + this.accountResults.failed.length;

    // Update lists
    this.updateAccountsList("success", this.accountResults.success);
    this.updateAccountsList("failed", this.accountResults.failed);
  }

  updateAccountsList(type, accounts) {
    const container = type === "success" ? this.successAccounts : this.failedAccounts;

    if (accounts.length === 0) {
      container.innerHTML = `<p class="no-data">Chưa có tài khoản nào ${type === "success" ? "được xử lý thành công" : "bị lỗi"}.</p>`;
      return;
    }

    const html = accounts.map((account, index) => `
      <div class="account-result-item ${type}">
        <div class="account-info">
          <span class="email">${account.email}</span>
          <span class="timestamp">${account.timestamp}</span>
        </div>
        <div class="message">${account.message}</div>
      </div>
    `).join("");

    container.innerHTML = html;
  }

  showResultsTab(tabType) {
    // Update tab buttons
    this.successTab.classList.toggle("active", tabType === "success");
    this.failedTab.classList.toggle("active", tabType === "failed");

    // Show/hide lists
    this.successAccountsList.style.display = tabType === "success" ? "block" : "none";
    this.failedAccountsList.style.display = tabType === "failed" ? "block" : "none";
  }

  clearResults() {
    this.accountResults.success = [];
    this.accountResults.failed = [];
    this.updateResultsDisplay();
  }

  getDefaultSendEmailsFunction() {
    return `function shareSingleFormToList_GR_v2() {
  var formUrl = "https://docs.google.com/forms/d/e/1FAIpQLSfRXFtxcCgr1xQbKsBahcI8zZ7shwhZ5g1PQeYhBuXWboFQGQ/viewform?usp=dialog";
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Sheet1") || ss.getSheetByName("Hoja 1");
  
  if (!sheet) {
    throw new Error("Kh\u00f4ng t\u00ecm th\u1ea5y Sheet 1 ho\u1eb7c Hoja 1");
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var values = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  var senderName = "Meta Verified";
  var replyAddress = Session.getActiveUser().getEmail();

  var subjectVariants = [
    "Meta Blue\u306e\u691c\u8a3c\u30b9\u30c6\u30fc\u30bf\u30b9",
    "\u5fc5\u8981\u306a\u64cd\u4f5c: \u30e1\u30bf\u30c7\u30fc\u30bf\u691c\u8a3c",
    "\u691c\u8a3c\u30bb\u30f3\u30bf\u30fc\u901a\u77e5",
    "Meta\u30a2\u30ab\u30a6\u30f3\u30c8\u8a8d\u8a3c\u306e\u66f4\u65b0",
    "\u30a2\u30ab\u30a6\u30f3\u30c8\u60c5\u5831",
    "\u30a2\u30ab\u30a6\u30f3\u30c8\u901a\u77e5",
    "\u30a2\u30ab\u30a6\u30f3\u30c8\u306e\u8a73\u7d30",
    "Meta \u30a2\u30ab\u30a6\u30f3\u30c8\u3092\u66f4\u65b0\u3057\u307e\u3059\u3002",
    "\u30a2\u30ab\u30a6\u30f3\u30c8\u306e\u30b9\u30c6\u30fc\u30bf\u30b9",
    "\u91cd\u8981\u306a\u30a2\u30ab\u30a6\u30f3\u30c8\u901a\u77e5\u3002",
    "Meta\u304b\u3089\u306e\u901a\u77e5\u3002",
    "Meta\u30a2\u30ab\u30a6\u30f3\u30c8\u8a8d\u8a3c",
    "\u30a2\u30ab\u30a6\u30f3\u30c8\u78ba\u8a8d\u60c5\u5831"
  ];

  var openingPool = [];
  var closingPool = [];

  for (var i = 0; i < values.length; i++) {
    if (values[i][2]) openingPool.push(values[i][2].toString());
    if (values[i][3]) closingPool.push(values[i][3].toString());
  }

  if (openingPool.length === 0 || closingPool.length === 0) {
    throw new Error("C\u1ed9t C ho\u1eb7c D kh\u00f4ng c\u00f3 n\u1ed9i dung \u0111\u1ec3 random");
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
    if (status === "\u2705 sent") continue;

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

      Logger.log(rowIndex + " | " + email + " | \u2705 Sent");
      sheet.getRange(rowIndex, 5).setValue("\u2705 Sent");
      sheet.getRange(rowIndex, 6).setValue(new Date());
      sentCount++;
      Utilities.sleep(18000);

    } catch (e) {
      Logger.log(rowIndex + " | " + email + " | \u274c ERROR - STOP");
      sheet.getRange(rowIndex, 5).setValue("\u274c Error");
      sheet.getRange(rowIndex, 6).setValue(new Date());
      throw e;
    }
  }

  SpreadsheetApp.flush();
}

function isValidEmail_(email) {
  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/i.test(email);
}`;
  }
}

function setupPasswordGate() {
  const requiredPassword = "hihivietdz123";
  const gate = document.getElementById("passwordGate");
  const form = document.getElementById("passwordForm");
  const input = document.getElementById("passwordInput");
  const error = document.getElementById("passwordError");
  const appContainer = document.getElementById("appContainer");

  if (!gate || !form || !input || !error || !appContainer) {
    new AutomationApp();
    return;
  }

  const unlockApp = () => {
    gate.classList.add("hidden");
    appContainer.classList.remove("app-locked");
    new AutomationApp();
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (input.value === requiredPassword) {
      error.textContent = "";
      unlockApp();
      return;
    }

    error.textContent = "Mật khẩu không đúng. Vui lòng thử lại.";
    input.value = "";
    input.focus();
  });

  input.focus();
}

// Initialize app when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  setupPasswordGate();
});
