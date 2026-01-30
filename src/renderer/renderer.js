class AutomationApp {
  constructor() {
    this.accounts = [];
    this.data = { A: [], B: [], C: [], D: [] };
    this.isRunning = false;
    this.workers = [];
    this.inputFormat = "separated"; // 'separated' or 'combined'
    this.saveTimeout = null; // For debouncing auto-save

    this.initializeElements();
    this.setupEventListeners();
    this.setupWorkerUpdateListener();

    // Load config with a slight delay to ensure everything is ready
    setTimeout(() => {
      this.loadConfigData();
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
    // Control handlers
    this.startBtn.addEventListener("click", () => this.startAutomation());
    this.stopBtn.addEventListener("click", () => this.stopAutomation());
    this.statusBtn.addEventListener("click", () => this.checkStatus());

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

        // Load accounts data
        if (config.accounts && config.accounts.length > 0) {
          console.log("Handle Accounts");
          // New structure: array of account objects
          this.accounts = config.accounts.map((acc) => ({
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
          this.updateAccountsTextarea();
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
    // For separated format: just email:password:secret
    const lines = this.accounts.map(
      (account) => `${account.email}:${account.password}:${account.secretKey}`,
    );
    this.accountsInput.value = lines.join("\n");
    this.accountsCount.textContent = `${this.accounts.length} accounts loaded`;
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

        await window.electronAPI.updateConfig("accounts", accountsData);
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
      this.parseAccounts();
    } else {
      this.separatedFormat.style.display = "none";
      this.combinedFormat.style.display = "block";
      this.dataSection.style.display = "none";
      this.parseCombinedInput();
      this.updateAccountEditor();
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
    const lines = this.accounts.map((account) => {
      const accountPart = `${account.email || ""}:${account.password || ""}:${account.secretKey || ""}`;
      const dataA = account.data?.A
        ? Array.isArray(account.data.A)
          ? account.data.A.join(";")
          : account.data.A
        : "";
      const dataB = account.data?.B
        ? Array.isArray(account.data.B)
          ? account.data.B.join(";")
          : account.data.B
        : "";
      const dataC = account.data?.C
        ? Array.isArray(account.data.C)
          ? account.data.C.join(";")
          : account.data.C
        : "";
      const dataD = account.data?.D
        ? Array.isArray(account.data.D)
          ? account.data.D.join(";")
          : account.data.D
        : "";
      const dataPart = `|${dataA}|${dataB}|${dataC}|${dataD}`;
      return accountPart + dataPart;
    });

    this.combinedInput.value = lines.join("\n");
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
      const parts = line.split(":").map((part) => part.trim());
      if (parts.length >= 3) {
        // Check if there's data after the secret key (format: email:pass:secret|A|B|C|D)
        const restOfLine = parts.slice(3).join(":"); // Rejoin in case there were colons in data
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
    console.log("Parsing accounts from input:", text);

    if (!text) {
      this.accounts = [];
      this.accountsCount.textContent = "0 accounts loaded";
      return;
    }

    const lines = text.split("\n").filter((line) => line.trim());
    this.accounts = [];

    for (const line of lines) {
      const parts = line.split(":");
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

    this.debouncedSave(); // Auto-save when data changes
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
      const config = {
        accounts: this.accounts,
        data: this.inputFormat === "separated" ? this.data : null, // Global data only for separated format
        concurrent,
        inputFormat: this.inputFormat,
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
    const { workerId, type, message, progress } = data;
    const workerName = `Worker ${workerId.substring(0, 8)}`;

    switch (type) {
      case "progress":
        this.addLog(`🔄 ${workerName}: ${message}`);
        break;
      case "success":
        this.addLog(`✅ ${workerName}: ${message}`, "success");
        break;
      case "error":
        this.addLog(`❌ ${workerName}: ${message}`, "error");
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
}

// Initialize app when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new AutomationApp();
});
