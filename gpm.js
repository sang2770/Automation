const path = require("path");
require.main.paths.push(
    path.join(process.resourcesPath, "app.asar.unpacked", "node_modules")
);
const { chromium } = require("playwright");
const axios = require("axios");
const baseGPMAPIUrl = "http://127.0.0.1:19995";
class AutomationWorker {
    constructor() {
        this.isRunning = false;
        this.workers = [];
        this.stats = {
            total: 0,
            completed: 0,
            successful: 0,
            failed: 0,
        };
    }

    async startAutomation({ config, profiles, maxThreads = 3 }) {
        if (this.isRunning) {
            throw new Error("Automation is already running");
        }

        this.isRunning = true;
        this.stats = {
            total: 1,
            completed: 0,
            successful: 0,
            failed: 0,
        };

        try {
            this.sendMessage("automation-progress", {
                message: "Starting automation...",
            });

            // Create worker pool
            const workers = Math.min(maxThreads, profiles.length);

            this.sendMessage("automation-progress", {
                message: `Starting ${workers} workers`,
            });

            const workerPromises = [];

            for (let i = 0; i < workers; i++) {
                const profileId = profiles[i % profiles.length];
                const workerPromise = this.createWorker(config, profileId, i);
                workerPromises.push(workerPromise);
            }

            await Promise.all(workerPromises);

            this.sendMessage("automation-complete", {
                successful: this.stats.successful,
                failed: this.stats.failed,
                total: this.stats.total,
            });

            return {
                success: true,
                stats: this.stats,
            };
        } catch (error) {
            console.error("Automation error:", error);
            this.sendMessage("automation-progress", {
                message: `Error: ${error.message}`,
            });
            throw error;
        } finally {
            this.isRunning = false;
        }
    }

    async createWorker(config, profileId, workerId) {
        const worker = new AutomationWorker(workerId, profileId, this);
        this.workers.push(worker);

        try {
            await worker.initialize();
            if (!this.isRunning) {
                return;
            }

            try {
                await worker.process(config);
                this.stats.successful++;
                this.sendMessage("automation-progress", {
                    message: `Worker ${workerId}: Successfully processed ${config.name}`,
                });
            } catch (error) {
                console.error(
                    `Worker ${workerId} error processing ${config.name}:`,
                    error
                );
                this.stats.failed++;
                this.sendMessage("automation-progress", {
                    message: `Worker ${workerId}: Failed to process ${config.name} - ${error.message}`,
                });
            }

            this.stats.completed++;
            this.sendMessage("automation-update", {
                completed: this.stats.completed,
                total: this.stats.total,
                progress: this.stats.completed / this.stats.total,
            });

            // Add delay between forms
            await this.delay(2000 + Math.random() * 3000);
        } finally {
            await worker.cleanup();
        }
    }

    async stopAutomation() {
        this.isRunning = false;

        // Stop all workers
        const stopPromises = this.workers.map((worker) => worker.cleanup());
        await Promise.all(stopPromises);

        this.workers = [];
        this.sendMessage("automation-progress", { message: "Automation stopped" });
    }

    sendMessage(type, data) {
        if (process.send) {
            process.send({ type, data });
        }
    }

    delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

class AutomationWorker {
    constructor(workerId, profileId, parent) {
        this.workerId = workerId;
        this.profileId = profileId;
        this.parent = parent;
        this.browser = null;
        this.context = null;
        this.page = null;
        this.debugPort = null;
    }

    async initialize() {
        try {
            // Check if GPMLogin is running
            const isGPMRunning = await this.checkGPMLoginStatus();
            if (!isGPMRunning) {
                throw new Error(
                    "GPMLogin is not running. Please start GPMLogin application first."
                );
            }


            // Initialize profile using GPMLogin API
            await this.startGPMProfile();

            // Connect to the profile via debug port
            await this.connectToProfile();

        } catch (error) {
            this.parent.sendMessage("automation-progress", {
                message: `Worker ${this.workerId} initialization failed: ${error.message}`,
            });
            throw error;
        }
    }

    async startGPMProfile() {
        try {
            // Start the profile using GPMLogin API
            const response = await axios.get(
                `${baseGPMAPIUrl}/api/v3/profiles/start/${this.profileId}`,
                { timeout: 10000 }
            );

            if (!response.data.success) {
                throw new Error(`Failed to start profile: ${response.data.message}`);
            }

            this.debugPort = response.data.data.remote_debugging_address;
            // this.parent.sendMessage("automation-progress", {
            //   message: `Worker ${this.workerId}: Started GPMLogin profile ${this.profileId} on debug port ${this.debugPort}`,
            // });
        } catch (error) {
            if (error.code === "ECONNREFUSED") {
                throw new Error(
                    "GPMLogin is not running. Please start GPMLogin application first."
                );
            }
            throw new Error(`Failed to start GPMLogin profile: ${error.message}`);
        }
    }

    async connectToProfile() {
        try {
            await new Promise((resolve) => setTimeout(resolve, 4000));
            const response = await fetch(`http://${this.debugPort}/json/version`);
            const data = await response.json();
            const wsUrl = data.webSocketDebuggerUrl;
            // Connect to the browser via debug port
            this.browser = await chromium.connectOverCDP(wsUrl);

            // Get existing contexts or create new one
            const contexts = this.browser.contexts();
            if (contexts.length > 0) {
                this.context = contexts[0];
            } else {
                this.context = await this.browser.newContext({
                    viewport: { width: 1366, height: 768 },
                });
            }

            // Get existing pages or create new one
            const pages = this.context.pages();
            if (pages.length > 0) {
                this.page = pages[0];
            } else {
                this.page = await this.context.newPage();
            }

            this.parent.sendMessage("automation-progress", {
                message: `Worker ${this.workerId}: Connected to profile via debug port ${this.debugPort}`,
            });
        } catch (error) {
            throw new Error(
                `Failed to connect to profile via debug port: ${error.message}`
            );
        }
    }

    async stopGPMProfile() {
        try {
            if (this.profileId) {
                await axios.post(
                    `${baseGPMAPIUrl}/api/v3/profiles/stop`,
                    {
                        profile_id: this.profileId,
                    },
                    {
                        headers: {
                            "Content-Type": "application/json",
                        },
                        timeout: 10000,
                    }
                );

                this.parent.sendMessage("automation-progress", {
                    message: `Worker ${this.workerId}: Stopped GPMLogin profile ${this.profileId}`,
                });
            }
        } catch (error) {
            this.parent.sendMessage("automation-progress", {
                message: `Worker ${this.workerId}: Error stopping GPMLogin profile: ${error.message}`,
            });
        }
    }

    async process(config) {

    }

    async simulateSelectOpen(el) {
        if (!el) return;
        await el.dispatchEvent("mousedown");
        await this.delay(500);
        await el.dispatchEvent("mouseup");
        await this.delay(500);
        await el.dispatchEvent("click");
    }

    async fillFormFields(config) {
        const fields = [
            // Required fields
            {
                name: "certificateType",
                selector: `fieldset[aria-labelledby="cert_apply--label"] .list-item:nth-of-type(${config.certificateType === "cryptocurrency" ? 1 : 4
                    }) label[role="presentation"]`,
                type: "radio",
                value: config.certificateType,
            },
            config.certificateType === "cryptocurrency"
                ? {
                    name: "country",
                    selector: "#country_select",
                    value: config.country ?? "default",
                    type: "select",
                    selectorValue: 'ol[role="listbox"] li[role="option"]',
                }
                : {
                    name: "country",
                    selector:
                        'fieldset[aria-labelledby="country_csfp--label"] .list-item:nth-of-type(1) span.contact-form-label__text',
                    value: config.country ?? "default",
                    type: "radio",
                },
            {
                name: "contactName",
                selector: 'input[name="name"]',
                value: config.contactName,
                type: "input",
            },
            {
                name: "companyName",
                selector: "input#end_customer_company_name",
                value: config.companyName,
                type: "input",
            },
            {
                name: "clientName",
                selector: "input#fullclientname",
                value: config.clientName,
                type: "input",
            },
            {
                name: "contactEmail",
                selector: "input#contact_customer_preferred_email",
                value: config.contactEmail,
                type: "input",
            },
            {
                name: "address",
                selector: "input#address",
                value: config.address,
                type: "input",
            },
            {
                name: "ads_gg_email",
                selector: "input#google_ads_login_email",
                value: config.ads_gg_email,
                type: "input",
            },
            {
                parentRoot: ".scSharedCidselectorroot",
                name: "google_account_id",
                selector: `.hcfeSearchselectSelectcontainer`,
                value: config.account_name,
                type: "select",
                selectorValue:
                    ".scSharedCidselectoraccount-info .scSharedCidselectorvalue.scSharedCidselectortext",
            },
            {
                name: "licenseDetails",
                selector: "input#licdetail",
                value: config.licenseDetails,
                type: "input",
            },
            {
                name: "licenseNumber",
                selector: "input#Licnum",
                value: config.licenseNumber,
                type: "input",
            },
            {
                name: "urlsPromote",
                selector: "input#websites",
                value: config.urlsPromote,
                type: "input",
            },
            {
                name: "confirm1",
                selector: "#checkbox_1--informs_1",
                value: "defined",
                type: "checkbox",
            },
            {
                name: "confirm2",
                selector: "#checkbox_1--site_1",
                value: "defined",
                type: "checkbox",
            },
            {
                name: "phone",
                selector: 'input[type="tel"]',
                value: config.phone,
                type: "input",
            },
            {
                name: "ccEmail",
                selector: '.additional-textbox input[name="email_cc_text"]',
                value: config.ccEmail,
                type: "input",
                requires: [
                    {
                        name: "Add CC Email",
                        selector:
                            '[data-frd-value-type="VALUE_TYPE_EMAIL"] a.add-additional',
                        type: "button",
                    },
                ],
            },
            {
                name: "issueSummary",
                selector: 'textarea[name="summary_of_issue_D2S"]',
                value: config.issueSummary,
                type: "textarea",
            },
        ];

        for (const field of fields) {
            try {
                // Skip empty fields
                if (!field.value || field.value.trim() === "") {
                    continue;
                }

                let element = null;
                try {
                    if (field.requires) {
                        for (const req of field.requires) {
                            const reqEl = await this.page.$(req.selector);
                            if (reqEl) {
                                await reqEl.click();
                                await this.delay(500 + Math.random() * 500);
                                // this.parent.sendMessage("automation-progress", {
                                //   message: `Worker ${this.workerId}: Clicked to add required field ${req.name}`,
                                // });
                            }
                        }
                    }
                    element = await this.page.$(field.selector);
                } catch (e) {
                    this.parent.sendMessage("automation-progress", {
                        message: `Worker ${this.workerId}: Error finding element for ${field.name}: ${e.message}`,
                    });
                    // Continue to next selector
                }
                // this.parent.sendMessage("automation-progress", {
                //   message: `Worker ${this.workerId}: Using selector ${
                //     field.selector
                //   } for field ${field.name}: ${element ? "Found" : "Not Found"}`,
                // });

                if (element) {
                    await this.page.waitForTimeout(300 + Math.random() * 200);
                    if (field.type === "checkbox") {
                        // this.parent.sendMessage("automation-progress", {
                        //   message: `Worker ${this.workerId}: Checking checkbox ${field.name}`,
                        // });
                        await element.check({ force: true });
                        await this.delay(500);
                    } else if (field.type === "radio") {
                        // Handle radio buttons
                        await element.click();
                        await this.delay(500);
                    } else if (field.type === "select") {
                        // Handle dropdown/select elements
                        await this.simulateSelectOpen(element);
                        await this.delay(500);
                        const expandAccounts = await this.page.$$(
                            `${field.parentRoot ?? ""} [aria-label="Expand account"]`
                        );
                        for (const btn of expandAccounts) {
                            try {
                                await btn.click();
                                await this.delay(500);
                            } catch (err) {
                                console.warn("Element detached, skip");
                            }
                        }
                        await this.delay(1000);

                        // Try to select by value or text
                        const valueSelector = field.selectorValue;
                        const options = await this.page.$$(
                            `${field.name === "google_account_id" ? "" : field.selector
                            } ${valueSelector}`
                        );
                        let optionValue = null;
                        for (const option of options) {
                            const text = await option.innerText();
                            // this.parent.sendMessage("automation-progress", {
                            //   message: `Worker ${this.workerId}: Found option "${text}" for field ${field.name}`,
                            // });
                            if (text.includes(field.value)) {
                                optionValue = option;
                                break;
                            }
                        }
                        if (optionValue) {
                            await optionValue.click();
                            await this.delay(500);
                        } else {
                            throw new Error(`Option with value "${field.value}" not found`);
                        }
                    } else if (field.type === "textarea") {
                        // Handle textarea elements
                        await element.click();
                        await this.delay(300);
                        await element.fill("");
                        await this.humanType(element, field.value);
                    } else {
                        // Handle regular input elements
                        await element.click();
                        await this.delay(300);
                        await element.fill("");
                        await this.humanType(element, field.value);
                    }

                    await this.delay(200 + Math.random() * 100);

                    // this.parent.sendMessage("automation-progress", {
                    //   message: `Worker ${this.workerId}: Filled ${
                    //     field.name
                    //   } with value: ${field.value.substring(0, 50)}...`,
                    // });
                } else {
                    this.parent.sendMessage("automation-progress", {
                        message: `Worker ${this.workerId}: Could not find element for ${field.name}`,
                    });
                }
            } catch (error) {
                this.parent.sendMessage("automation-progress", {
                    message: `Worker ${this.workerId}: Error filling ${field.name}: ${error.message}`,
                });
            }
        }

        // // Handle file uploads if present
        await this.handleFileUploads(config);

        const submitButton = await this.page.$("button.submit-button");
        if (submitButton) {
            await submitButton.click();
            this.parent.sendMessage("automation-progress", {
                message: `Worker ${this.workerId}: Clicked submit button`,
            });
        } else {
            this.parent.sendMessage("automation-progress", {
                message: `Worker ${this.workerId}: Could not find submit button`,
            });
        }

        await new Promise((resolve) => setTimeout(resolve, 5000000));
    }

    async handleFileUploads(config) {
        try {
            // Handle license file uploads
            if (config.licenseFiles && config.licenseFiles.length > 0) {
                const licenseUploadSelectors = ['input[type="file"]#attach_2'];

                // Convert file info objects to paths for Playwright
                const licensePaths = config.licenseFiles.map(
                    (file) => file.path || file.name
                );

                for (const selector of licenseUploadSelectors) {
                    try {
                        const fileInput = await this.page.$(selector);
                        if (fileInput) {
                            await fileInput.setInputFiles(licensePaths);
                            this.parent.sendMessage("automation-progress", {
                                message: `Worker ${this.workerId}: Uploaded ${config.licenseFiles.length} license file(s)`,
                            });
                            break;
                        }
                    } catch (e) {
                        // Continue to next selector
                        console.warn(
                            `Failed to upload license files with selector ${selector}:`,
                            e.message
                        );
                    }
                }
            }

            // Handle general attachments
            if (config.attachmentFiles && config.attachmentFiles.length > 0) {
                const attachmentSelectors = ['input[type="file"]#submit_attachment'];

                // Convert file info objects to paths for Playwright
                const attachmentPaths = config.attachmentFiles.map(
                    (file) => file.path || file.name
                );

                for (const selector of attachmentSelectors) {
                    try {
                        const fileInput = await this.page.$(selector);
                        if (fileInput) {
                            await fileInput.setInputFiles(attachmentPaths);
                            this.parent.sendMessage("automation-progress", {
                                message: `Worker ${this.workerId}: Uploaded ${config.attachmentFiles.length} attachment(s)`,
                            });
                            break;
                        }
                    } catch (e) {
                        // Continue to next selector
                        console.warn(
                            `Failed to upload attachment files with selector ${selector}:`,
                            e.message
                        );
                    }
                }
            }
        } catch (error) {
            this.parent.sendMessage("automation-progress", {
                message: `Worker ${this.workerId}: Error handling file uploads: ${error.message}`,
            });
        }
    }

    async humanType(element, text) {
        for (const char of text) {
            await element.type(char);
            await this.delay(50 + Math.random() * 100);
        }
    }

    async cleanup() {
        try {
            // Close playwright resources first
            if (this.page) {
                await this.page.close();
            }
            if (this.context) {
                await this.context.close();
            }
            if (this.browser) {
                await this.browser.close();
            }

            // Stop the GPMLogin profile
            await this.stopGPMProfile();

            this.parent.sendMessage("automation-progress", {
                message: `Worker ${this.workerId} cleaned up`,
            });
        } catch (error) {
            this.parent.sendMessage("automation-progress", {
                message: `Worker ${this.workerId} cleanup error: ${error.message}`,
            });
        }
    }

    async checkGPMLoginStatus() {
        try {
            const response = await axios.get(`${baseGPMAPIUrl}/api/v3/profiles`, {
                timeout: 5000,
            });
            return response.data.success;
        } catch (error) {
            return false;
        }
    }

    async getProfileInfo() {
        try {
            const response = await axios.get(
                `${baseGPMAPIUrl}/api/v3/profiles/${this.profileId}`,
                {
                    timeout: 10000,
                }
            );

            if (response.data.success) {
                return response.data.data;
            } else {
                throw new Error(response.data.message);
            }
        } catch (error) {
            throw new Error(`Failed to get profile info: ${error.message}`);
        }
    }

    delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

// Worker process message handler
const automationWorker = new AutomationWorker();

process.on("message", async (message) => {
    try {
        if (message.type === "start") {
            await automationWorker.startAutomation(message.data);
        } else if (message.type === "stop") {
            await automationWorker.stopAutomation();
        }
    } catch (error) {
        console.error("Worker process error:", error);
        process.send({
            type: "automation-progress",
            data: { message: `Error: ${error.message}` },
        });
    }
});

process.on("disconnect", () => {
    automationWorker.stopAutomation();
    process.exit(0);
});