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

    async startAutomation(config) {
        if (this.isRunning) {
            throw new Error("Automation is already running");
        }

        this.isRunning = true;

        // Calculate total tasks from all enabled links
        const enabledLinks = config.links.filter(link => link.enabled);
        const totalViews = enabledLinks.reduce((sum, link) => sum + link.views, 0);

        this.stats = {
            total: totalViews,
            completed: 0,
            successful: 0,
            failed: 0,
        };

        try {
            this.sendMessage("automation-progress", {
                message: "Starting YouTube automation...",
            });

            this.sendMessage("automation-update", {
                total: this.stats.total,
                completed: this.stats.completed,
                running: 0,
                failed: this.stats.failed,
                progress: 0
            });

            // Create tasks for each link and its views
            const tasks = [];
            enabledLinks.forEach(link => {
                for (let i = 0; i < link.views; i++) {
                    tasks.push({
                        link: link,
                        taskId: `${link.id}_${i + 1}`,
                        method: config.settings.randomMethod ?
                            (Math.random() > 0.5 ? 'method1' : 'method2') : 'method1'
                    });
                }
            });

            // Create worker pool
            const maxWorkers = Math.min(config.maxThreads, config.profiles.length, tasks.length);
            const workerPromises = [];

            this.sendMessage("automation-progress", {
                message: `Starting ${maxWorkers} workers for ${tasks.length} tasks`,
            });

            // Distribute tasks among workers
            const tasksPerWorker = Math.ceil(tasks.length / maxWorkers);

            for (let i = 0; i < maxWorkers; i++) {
                const profileId = config.profiles[i % config.profiles.length];
                const workerTasks = tasks.slice(i * tasksPerWorker, (i + 1) * tasksPerWorker);

                if (workerTasks.length > 0) {
                    const workerPromise = this.createWorker(config, profileId, i, workerTasks);
                    workerPromises.push(workerPromise);
                }
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

    async createWorker(config, profileId, workerId, tasks) {
        const worker = new YouTubeWorker(workerId, profileId, this);
        this.workers.push(worker);

        try {
            await worker.initialize();
            if (!this.isRunning) {
                return;
            }

            // Process each task for this worker
            for (const task of tasks) {
                if (!this.isRunning) {
                    break;
                }

                try {
                    await worker.processTask(task, config.settings);
                    this.stats.successful++;
                    this.sendMessage("automation-progress", {
                        message: `Worker ${workerId}: Successfully processed ${task.link.url} (${task.method})`,
                    });
                } catch (error) {
                    console.error(
                        `Worker ${workerId} error processing task ${task.taskId}:`,
                        error
                    );
                    this.stats.failed++;
                    this.sendMessage("automation-progress", {
                        message: `Worker ${workerId}: Failed task ${task.taskId} - ${error.message}`,
                    });
                }

                this.stats.completed++;
                this.sendMessage("automation-update", {
                    completed: this.stats.completed,
                    total: this.stats.total,
                    running: Math.max(0, this.workers.length - 1),
                    failed: this.stats.failed,
                    progress: this.stats.completed / this.stats.total,
                });

                // Add delay between tasks
                if (this.isRunning && task !== tasks[tasks.length - 1]) {
                    await this.delay(config.settings.delayBetweenActions + Math.random() * 2000);
                }
            }
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

class YouTubeWorker {
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
            this.parent.sendMessage("automation-progress", {
                message: `Worker ${this.workerId}: Started GPMLogin profile ${this.profileId}`,
            });
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
                    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
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
                message: `Worker ${this.workerId}: Connected to browser`,
            });
        } catch (error) {
            throw new Error(
                `Failed to connect to profile via debug port: ${error.message}`
            );
        }
    }

    async processTask(task, settings) {
        const { link, method } = task;

        try {
            this.parent.sendMessage("automation-progress", {
                message: `Worker ${this.workerId}: Starting ${method} for ${link.url}`,
            });

            if (method === 'method1') {
                await this.executeMethod1(link, settings);
            } else {
                await this.executeMethod2(link, settings);
            }

            this.parent.sendMessage("automation-progress", {
                message: `Worker ${this.workerId}: Completed ${method} for ${link.url}`,
            });

        } catch (error) {
            this.parent.sendMessage("automation-progress", {
                message: `Worker ${this.workerId}: Error in ${method}: ${error.message}`,
            });
            throw error;
        }
    }

    async executeMethod1(link, settings) {
        // Method 1: Go to YouTube → Search keyword → Click first video → Navigate to related videos → Replace with target link
        try {
            // Step 1: Go to YouTube
            await this.page.goto('https://www.youtube.com/', { waitUntil: 'networkidle' });
            await this.delay(2000);

            // Step 2: Search for keyword if available
            if (link.keywords && link.keywords.length > 0) {
                const randomKeyword = link.keywords[Math.floor(Math.random() * link.keywords.length)];

                // Find and click search box
                const searchBox = await this.page.waitForSelector('input#search', { timeout: 10000 });
                await searchBox.click();
                await this.humanType(searchBox, randomKeyword);

                // Submit search
                const searchButton = await this.page.$('button#search-icon-legacy');
                if (searchButton) {
                    await searchButton.click();
                } else {
                    await searchBox.press('Enter');
                }

                await this.page.waitForLoadState('networkidle');
                await this.delay(3000);

                // Step 3: Click on first video result
                const firstVideo = await this.page.waitForSelector('a#video-title', { timeout: 10000 });
                await firstVideo.click();
                await this.page.waitForLoadState('networkidle');
                await this.delay(5000);

                // Step 4: Navigate to related videos section and replace first link
                await this.navigateToTargetVideo(link.url);
            } else {
                // If no keywords, go directly to method 2 approach
                await this.navigateToTargetVideo(link.url);
            }

            // Step 5: Wait for ads and click if enabled
            await this.handleAds(settings);

        } catch (error) {
            throw new Error(`Method 1 failed: ${error.message}`);
        }
    }

    async executeMethod2(link, settings) {
        // Method 2: Go to YouTube → Replace first video link with target link → Click
        try {
            // Step 1: Go to YouTube
            await this.page.goto('https://www.youtube.com/', { waitUntil: 'networkidle' });
            await this.delay(2000);

            // Step 2: Navigate directly to target video
            await this.navigateToTargetVideo(link.url);

            // Step 3: Wait for ads and click if enabled
            await this.handleAds(settings);

        } catch (error) {
            throw new Error(`Method 2 failed: ${error.message}`);
        }
    }

    async navigateToTargetVideo(targetUrl) {
        try {
            // Navigate directly to the target video
            await this.page.goto(targetUrl, { waitUntil: 'networkidle' });
            await this.delay(3000);

            // Wait for video player to load
            await this.page.waitForSelector('.video-stream', { timeout: 15000 });

            this.parent.sendMessage("automation-progress", {
                message: `Worker ${this.workerId}: Navigated to target video`,
            });
        } catch (error) {
            throw new Error(`Failed to navigate to target video: ${error.message}`);
        }
    }

    async handleAds(settings) {
        if (!settings.waitForAds) {
            return;
        }

        try {
            this.parent.sendMessage("automation-progress", {
                message: `Worker ${this.workerId}: Waiting for ads...`,
            });

            // Wait for ad to appear (check multiple ad selectors)
            const adSelectors = [
                '.video-ads .videoAdUi',
                '.ytp-ad-module',
                '.ytp-ad-overlay-container',
                '[class*="ad-showing"]',
                '.ytp-ad-text'
            ];

            let adFound = false;
            const maxWaitTime = 15000; // 15 seconds
            const startTime = Date.now();

            while (Date.now() - startTime < maxWaitTime && !adFound) {
                for (const selector of adSelectors) {
                    const adElement = await this.page.$(selector);
                    if (adElement) {
                        adFound = true;
                        this.parent.sendMessage("automation-progress", {
                            message: `Worker ${this.workerId}: Ad detected`,
                        });

                        if (settings.clickAds) {
                            await this.clickOnAd(adElement);
                        }
                        break;
                    }
                }

                if (!adFound) {
                    await this.delay(1000);
                }
            }

            if (!adFound) {
                this.parent.sendMessage("automation-progress", {
                    message: `Worker ${this.workerId}: No ads detected within timeout`,
                });
            }

            // Watch video for a random duration (10-30 seconds)
            const watchDuration = 10000 + Math.random() * 20000;
            await this.delay(watchDuration);

        } catch (error) {
            this.parent.sendMessage("automation-progress", {
                message: `Worker ${this.workerId}: Error handling ads: ${error.message}`,
            });
        }
    }

    async clickOnAd(adElement) {
        try {
            // Try different click approaches for ads
            const clickableSelectors = [
                '.ytp-ad-overlay-close-button',
                '.ytp-ad-skip-button',
                '.ytp-ad-overlay-container',
                adElement
            ];

            for (const selector of clickableSelectors) {
                try {
                    const element = typeof selector === 'string' ? await this.page.$(selector) : selector;
                    if (element) {
                        await element.click();
                        this.parent.sendMessage("automation-progress", {
                            message: `Worker ${this.workerId}: Clicked on ad`,
                        });
                        await this.delay(2000);
                        break;
                    }
                } catch (clickError) {
                    // Continue to next selector if click fails
                }
            }
        } catch (error) {
            this.parent.sendMessage("automation-progress", {
                message: `Worker ${this.workerId}: Error clicking ad: ${error.message}`,
            });
        }
    }

    async humanType(element, text) {
        for (const char of text) {
            await element.type(char);
            await this.delay(50 + Math.random() * 100);
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