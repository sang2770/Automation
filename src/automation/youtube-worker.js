const path = require("path");
require.main.paths.push(
  path.join(process.resourcesPath, "app.asar.unpacked", "node_modules"),
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
    const enabledLinks = config.links.filter((link) => link.enabled);
    const totalViews = enabledLinks.reduce((sum, link) => sum + link.views, 0);

    this.stats = {
      total: totalViews,
      completed: 0,
      successful: 0,
      failed: 0,
    };

    try {
      this.sendMessage("automation-update", {
        total: this.stats.total,
        completed: this.stats.completed,
        running: 0,
        failed: this.stats.failed,
        progress: 0,
      });

      // Create tasks for each link and its views
      const tasks = [];
      enabledLinks.forEach((link) => {
        for (let i = 0; i < link.views; i++) {
          tasks.push({
            link: link,
            taskId: `${link.id}_${i + 1}`,
            method: config.settings.randomMethod
              ? Math.random() > 0.5
                ? "method1"
                : "method2"
              : "method1",
          });
        }
      });

      // Grid layout for positioning (3 rows x 4 columns = 12 positions)
      const gridPositions = 12; // 3 rows x 4 columns for positioning
      const maxConcurrentTasks = config.maxThreads; // Remove grid limitation
      let taskIndex = 0;
      const runningTasks = new Set();

      this.sendMessage("automation-progress", {
        message: `Starting ${maxConcurrentTasks} concurrent tasks. Total tasks: ${tasks.length}`,
      });

      if (maxConcurrentTasks > gridPositions) {
        this.sendMessage("automation-progress", {
          message: `ℹ️  Running ${maxConcurrentTasks} workers.`,
        });
      }

      // Function to process a single task
      const processTask = async (task, workerId) => {
        const worker = new YouTubeWorker(workerId, null, this); // Use workerId for positioning
        this.workers.push(worker);

        try {
          // Get proxy for this worker (rotate through available proxies)
          const proxyConfig = this.getProxyForWorker(workerId, config);

          // Create new profile for this specific task
          await worker.createNewProfile(task.link, proxyConfig);
          await worker.initialize();

          if (!this.isRunning) {
            return;
          }

          try {
            await worker.processTask(task, config.settings);
            this.stats.successful++;

            const gridPos = worker.calculateGridPosition(workerId);
            this.sendMessage("automation-progress", {
              message: `${gridPos.gridInfo}: Successfully processed ${task.link.url} (${task.method})`,
            });
          } catch (error) {
            console.error(
              `Worker ${workerId} error processing task ${task.taskId}:`,
              error,
            );
            this.stats.failed++;

            const gridPos = worker.calculateGridPosition(workerId);
            this.sendMessage("automation-progress", {
              message: `${gridPos.gridInfo}: Failed task ${task.taskId} - ${error.message}`,
            });
          }

          this.stats.completed++;
          // Note: Update message will be sent in taskPromise.finally() to avoid duplication
        } finally {
          await worker.cleanup();
          // Remove worker from array after cleanup
          const index = this.workers.indexOf(worker);
          if (index > -1) {
            this.workers.splice(index, 1);
          }
        }
      };

      // Function to start next available task
      const startNextTask = async () => {
        while (taskIndex < tasks.length && this.isRunning) {
          // Wait if we've reached max concurrent tasks
          while (runningTasks.size >= maxConcurrentTasks && this.isRunning) {
            await this.delay(100);
          }

          if (!this.isRunning || taskIndex >= tasks.length) break;

          const currentTask = tasks[taskIndex];
          const workerId = taskIndex; // Use taskIndex as workerId
          taskIndex++;

          const gridPos = new YouTubeWorker(
            workerId,
            null,
            this,
          ).calculateGridPosition(workerId);
          this.sendMessage("automation-progress", {
            message: `Task ${taskIndex}/${tasks.length}: Starting at ${gridPos.gridInfo} - ${currentTask.link.url}`,
          });

          // Start the task
          const taskPromise = processTask(currentTask, workerId).finally(() => {
            runningTasks.delete(taskPromise);
            // Update running count after task completion
            this.sendMessage("automation-update", {
              completed: this.stats.completed,
              total: this.stats.total,
              running: runningTasks.size,
              failed: this.stats.failed,
              progress: this.stats.completed / this.stats.total,
            });
          });

          runningTasks.add(taskPromise);

          // Update running count after task starts
          this.sendMessage("automation-update", {
            completed: this.stats.completed,
            total: this.stats.total,
            running: runningTasks.size,
            failed: this.stats.failed,
            progress: this.stats.completed / this.stats.total,
          });

          // Add delay between starting tasks
          if (this.isRunning && taskIndex < tasks.length) {
            await this.delay(1000 + Math.random() * 1000);
          }
        }

        // Wait for all remaining tasks to complete
        while (runningTasks.size > 0 && this.isRunning) {
          await this.delay(1000);
        }

        // Final update when all tasks are completed
        if (this.isRunning) {
          this.sendMessage("automation-update", {
            completed: this.stats.completed,
            total: this.stats.total,
            running: 0,
            failed: this.stats.failed,
            progress: this.stats.completed / this.stats.total,
          });
        }
      };

      await startNextTask();

      // Mark automation as completed
      this.isRunning = false;

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

      // Mark as stopped on error
      this.isRunning = false;
      throw error;
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

  getProxyForWorker(workerId, config) {
    if (
      !config.proxy ||
      !config.proxy.enabled ||
      !config.proxy.list ||
      config.proxy.list.length === 0
    ) {
      return null;
    }

    const proxyIndex = workerId % config.proxy.list.length;
    const proxyString = config.proxy.list[proxyIndex];

    // Parse proxy string: ip:port:username:password or ip:port
    const parts = proxyString.split(":");
    if (parts.length >= 2) {
      const proxy = {
        server: `http://${parts[0]}:${parts[1]}`,
        host: parts[0],
        port: parts[1],
      };

      if (parts.length >= 4) {
        proxy.username = parts[2];
        proxy.password = parts[3];
      }

      this.sendMessage("automation-progress", {
        message: `Worker ${workerId}: Using proxy ${proxy.server}`,
      });

      return proxy;
    }

    return null;
  }

  sendMessage(type, data) {
    if (process.send) {
      process.send({ type, data });
    }
  }

  getGridStatus(gridSlots) {
    // This method is no longer needed since we removed grid slot limitations
    // Keeping for backward compatibility
    return {
      total: "unlimited",
      occupied: this.workers.length,
      available: "unlimited",
      occupancy: `${this.workers.length}/unlimited`,
      details: [],
    };
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
    this.createdProfileId = null; // Store the created profile ID
  }

  async createNewProfile(linkConfig, proxyConfig = null) {
    try {
      // Generate a unique profile name
      const profileName = `AutoProfile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const profileData = {
        profile_name: profileName,
        group_name: "All",
        browser_core: "chromium",
        browser_name: "Chrome",
        browser_version: "142.0.7444.163",
        is_random_browser_version: false,
        raw_proxy: "",
        startup_urls: "",
        is_masked_font: true,
        is_noise_canvas: false,
        is_noise_webgl: false,
        is_noise_client_rect: false,
        is_noise_audio_context: true,
        is_random_screen: false,
        is_masked_webgl_data: true,
        is_masked_media_device: true,
        is_random_os: false,
        os: "Windows 11",
        webrtc_mode: 2,
      };

      // Add proxy if provided
      if (proxyConfig) {
        if (proxyConfig.username && proxyConfig.password) {
          profileData.raw_proxy = `${proxyConfig.host}:${proxyConfig.port}:${proxyConfig.username}:${proxyConfig.password}`;
        } else {
          profileData.raw_proxy = `${proxyConfig.host}:${proxyConfig.port}`;
        }
      }

      const response = await axios.post(
        `${baseGPMAPIUrl}/api/v3/profiles/create`,
        profileData,
        {
          headers: {
            "Content-Type": "application/json",
          },
          timeout: 15000,
        },
      );

      if (!response.data.success) {
        throw new Error(`Failed to create profile: ${response.data.message}`);
      }
      this.createdProfileId = response.data.data.id;
      this.profileId = this.createdProfileId;

      this.parent.sendMessage("automation-progress", {
        message: `Worker ${this.workerId}: Created new GPM profile ${this.profileId}${proxyConfig ? ` with proxy ${proxyConfig.server}` : ""}`,
      });

      return this.profileId;
    } catch (error) {
      if (error.code === "ECONNREFUSED") {
        throw new Error(
          "GPMLogin is not running. Please start GPMLogin application first.",
        );
      }
      throw new Error(`Failed to create GPM profile: ${error.message}`);
    }
  }

  async deleteProfile() {
    try {
      if (this.createdProfileId) {
        const response = await axios.get(
          `${baseGPMAPIUrl}/api/v3/profiles/delete/${this.createdProfileId}?mode=2`,
          { timeout: 10000 },
        );

        if (response.data.success) {
          this.parent.sendMessage("automation-progress", {
            message: `Worker ${this.workerId}: Deleted GPM profile ${this.createdProfileId}`,
          });
        } else {
          this.parent.sendMessage("automation-progress", {
            message: `Worker ${this.workerId}: Failed to delete profile: ${response.data.message}`,
          });
        }
      }
    } catch (error) {
      this.parent.sendMessage("automation-progress", {
        message: `Worker ${this.workerId}: Error deleting GPM profile: ${error.message}`,
      });
    }
  }

  async initialize() {
    try {
      // Check if GPMLogin is running
      const isGPMRunning = await this.checkGPMLoginStatus();
      if (!isGPMRunning) {
        throw new Error(
          "GPMLogin is not running. Please start GPMLogin application first.",
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

  async startGPMProfile(options = {}) {
    try {
      // Calculate grid position for 3 rows x 4 columns layout
      const { width, height, x, y } = this.calculateGridPosition(this.workerId);

      let baseUrl = `${baseGPMAPIUrl}/api/v3/profiles/start/${this.profileId}`;

      // Use calculated grid dimensions or custom options
      const windowWidth = options.width || width;
      const windowHeight = options.height || height;
      const windowX = options.x || x;
      const windowY = options.y || y;

      // Start the profile using GPMLogin API with grid positioning
      baseUrl += `?win_size=${windowWidth},${windowHeight}`;
      baseUrl += `&win_pos=${windowX},${windowY}`;

      const response = await axios.get(baseUrl, { timeout: 30000 });

      if (!response.data.success) {
        throw new Error(`Failed to start profile: ${response.data.message}`); f
      }

      this.debugPort = response.data.data.remote_debugging_address;

      const gridInfo = this.getGridInfo();
      this.parent.sendMessage("automation-progress", {
        message: `Worker ${this.workerId}: Started GPMLogin profile ${this.profileId}`,
      });
    } catch (error) {
      if (error.code === "ECONNREFUSED") {
        throw new Error(
          "GPMLogin is not running. Please start GPMLogin application first.",
        );
      }
      throw new Error(`Failed to start GPMLogin profile: ${error.message}`);
    }
  }

  calculateGridPosition(workerId) {
    // Screen dimensions (you can adjust these based on your screen resolution)
    const screenWidth = 1920; // Adjust to your screen width
    const screenHeight = 1080; // Adjust to your screen height

    // Grid layout: 3 rows x 4 columns
    const rows = 3;
    const cols = 4;
    const maxGridPositions = rows * cols; // 12 positions

    // Cycle through grid positions if workerId exceeds available positions
    const gridPosition = workerId % maxGridPositions;

    // Calculate window dimensions with small margins
    const margin = 2; // 2px margin between windows
    const windowWidth = Math.floor((screenWidth - (cols + 1) * margin) / cols);
    const windowHeight = Math.floor(
      (screenHeight - (rows + 1) * margin) / rows,
    );

    // Calculate grid position based on cycled workerId
    const col = gridPosition % cols; // Column (0-3)
    const row = Math.floor(gridPosition / cols) % rows; // Row (0-2)

    // Calculate window position with margins
    const x = col * (windowWidth + margin) + margin;
    const y = row * (windowHeight + margin) + margin;

    // Add small offset for overlapping windows (if multiple workers use same grid position)
    const cycle = Math.floor(workerId / maxGridPositions);
    const offsetX = cycle * 20; // 20px offset for each cycle
    const offsetY = cycle * 20; // 20px offset for each cycle

    return {
      width: windowWidth,
      height: windowHeight,
      x: x + offsetX,
      y: y + offsetY,
      col: col,
      row: row,
      cycle: cycle,
      gridInfo:
        cycle > 0
          ? `Grid[${row + 1},${col + 1}]+${cycle}` // Show cycle number if overlapping
          : `Grid[${row + 1},${col + 1}]`, // Normal grid position
    };
  }

  getGridInfo() {
    const gridPos = this.calculateGridPosition(this.workerId);
    return {
      workerId: this.workerId,
      gridPosition: gridPos.gridInfo,
      coordinates: `(${gridPos.x}, ${gridPos.y})`,
      size: `${gridPos.width}x${gridPos.height}`,
      row: gridPos.row + 1,
      col: gridPos.col + 1,
      cycle: gridPos.cycle,
      isOverlapped: gridPos.cycle > 0,
    };
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
          userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
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
        `Failed to connect to profile via debug port: ${error.message}`,
      );
    }
  }

  async processTask(task, settings) {
    const { link, method } = task;

    try {
      this.parent.sendMessage("automation-progress", {
        message: `Worker ${this.workerId}: Starting ${method} for ${link.url}`,
      });

      if (method === "method1") {
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
      await this.page.goto("https://www.youtube.com/", {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await this.delay(2000);

      // Step 2: Search for keyword if available
      if (link.keywords && link.keywords.length > 0) {
        const randomKeyword =
          link.keywords[Math.floor(Math.random() * link.keywords.length)];
        // #search-button-narrow
        try {
          const searchButtonNarrow = await this.page.$("#search-button-narrow");
          if (searchButtonNarrow) {
            await searchButtonNarrow.click();
          }
          await this.delay(2000);
        } catch (error) {
          // TODO
        }

        // Find and click search box
        const searchBox = await this.page.$('input[name="search_query"]');
        await searchBox.click();
        await this.humanType(searchBox, randomKeyword);

        // Submit search
        const searchButton = await this.page.$('button[aria-label="Search"]');
        if (searchButton) {
          await searchButton.click();
        } else {
          await searchBox.press("Enter");
        }

        await this.page.waitForLoadState("domcontentloaded");
        await this.delay(3000);

        // Scroll to load videos
        await this.page.evaluate(async () => {
          for (let i = 0; i < 2; i++) {
            window.scrollBy(0, window.innerHeight);
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        });

        await this.delay(2000);

        // Step 3: Click on first video result
        const listVideos = await this.page.$$(".ytd-video-renderer");
        let firstVideo = null;
        for (const video of listVideos) {
          try {
            // find default overlay-style="DEFAULT"
            await video.$('[overlay-style="DEFAULT"]');
            firstVideo = await video.$("a#video-title");
            break;
          } catch {
            continue;
          }
        }
        if (!firstVideo) {
          this.parent.sendMessage("automation-progress", {
            message: `Worker ${this.workerId}: No valid video found in search results, using direct navigation`,
          });
          await this.navigateToTargetVideo(link.url);
          return;
        }
        await firstVideo.click();
        await this.page.waitForLoadState("domcontentloaded");
        for (let i = 0; i < 3; i++) {
          await this.page.evaluate(() => {
            window.scrollBy(0, window.innerHeight);
          });
          await this.delay(2000);
        }
        const videoSelectors = ["yt-lockup-view-model a"];
        let replaceableVideo = null;

        for (const selector of videoSelectors) {
          try {
            this.parent.sendMessage("automation-progress", {
              message: `Worker ${this.workerId}: Waiting for ${selector} (max 2s)...`,
            });

            replaceableVideo = await this.page.waitForSelector(selector, {
              timeout: 2000,
              state: "attached", // Element exists in DOM
            });

            if (replaceableVideo) {
              // Verify nó có href hợp lệ không
              const href = await replaceableVideo.getAttribute("href");
              if (href && href.includes("watch")) {
                this.parent.sendMessage("automation-progress", {
                  message: `Worker ${this.workerId}: Found valid video with ${selector}`,
                });
                break;
              } else {
                replaceableVideo = null;
                continue;
              }
            }
          } catch (e) {
            // Timeout hoặc error, thử selector tiếp theo
            continue;
          }
        }
        if (!replaceableVideo) {
          this.parent.sendMessage("automation-progress", {
            message: `Worker ${this.workerId}: No replaceable video found, using direct navigation`,
          });
        }
        // Step 4: Navigate to related videos section and replace first link
        await this.navigateToTargetVideo(link.url, replaceableVideo);
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
      await this.page.goto("https://www.youtube.com/results?search_query=home", {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });

      // Scroll to load videos
      await this.page.evaluate(async () => {
        for (let i = 0; i < 3; i++) {
          window.scrollBy(0, window.innerHeight);
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      });
      await this.delay(2000);
      const videoSelectors = [
        "a#video-title",
      ];
      let replaceableVideo = null;
      for (const selector of videoSelectors) {
        try {
          replaceableVideo = await this.page.waitForSelector(selector, {
            timeout: 10000,
          });
          if (replaceableVideo) {
            break;
          }
        } catch {
          continue;
        }
      }
      if (!replaceableVideo) {
        this.parent.sendMessage("automation-progress", {
          message: `Worker ${this.workerId}: No replaceable video found on homepage, using direct navigation`,
        });
      }
      // Step 2: Navigate directly to target video
      await this.navigateToTargetVideo(link.url, replaceableVideo);

      // Step 3: Wait for ads and click if enabled
      await this.handleAds(settings);
    } catch (error) {
      throw new Error(`Method 2 failed: ${error.message}`);
    }
  }

  async navigateToTargetVideo(targetUrl, replaceableVideo = null) {
    try {
      // this.parent.sendMessage("automation-progress", {
      //   message: `Worker ${this.workerId}: Navigating to target video via replaceable element ${replaceableVideo ? "found" : "not found"}`,
      // });
      if (replaceableVideo) {
        try {
          // const currentUrl = await replaceableVideo.getAttribute("href");
          // this.parent.sendMessage("automation-progress", {
          //   message: `Worker ${this.workerId}: Current replaceable video URL is ${currentUrl}`,
          // });

          const elementSelector = await replaceableVideo.evaluate((el) => {
            if (el.id) return `#${el.id}`;
            if (el.className) return `.${el.className.split(" ").join(".")}`;
            return el.tagName.toLowerCase();
          });

          // Replace href thông qua page.evaluate
          const success = await this.page.evaluate(
            ({ elementSelector, targetUrl }) => {
              const element = document.querySelector(elementSelector);
              if (element?.href) {
                document
                  .querySelectorAll(`[href="${element.href}"]`)
                  .forEach((el) => {
                    el.href = targetUrl;
                  });
                element.href = targetUrl;
                return true;
              }
              return false;
            },
            { elementSelector, targetUrl },
          );

          if (!success) {
            throw new Error("Failed to update href");
          }
        } catch (e) {
          this.parent.sendMessage("automation-progress", {
            message: `Worker ${this.workerId}: Error replacing video link: ${e.message}, navigating directly`,
          });
          await this.page.goto(targetUrl, { waitUntil: "domcontentloaded" });
        } finally {
          try {
            await this.page.click(`[href="${targetUrl}"]`);
          } catch {
            // Ignore
            await this.page.goto(targetUrl, { waitUntil: "domcontentloaded" });
          }
        }
      } else {
        await this.page.goto(targetUrl, { waitUntil: "domcontentloaded" });
      }
      // Navigate directly to the target video
      await this.delay(3000);

      // Wait for video player to load
      await this.page.waitForSelector("#ytd-player", { timeout: 15000 });

      this.parent.sendMessage("automation-progress", {
        message: `Worker ${this.workerId}: Navigated to target video`,
      });
    } catch (error) {
      throw new Error(`Failed to navigate to target video: ${error.message}`);
    }
  }

  async handleAds(settings) {
    try {
      this.parent.sendMessage("automation-progress", {
        message: `Worker ${this.workerId}: Checking for ads...`,
      });

      // Wait for ad to appear (check multiple ad selectors based on provided structure)
      const adSelectors = [
        ".video-ads.ytp-ad-module",
        ".ytp-ad-player-overlay-layout",
        ".ytp-ad-module",
        ".ytp-ad-overlay-container",
        '[class*="ad-showing"]',
        ".ytp-ad-text",
        ".ytp-ad-player-overlay",
      ];

      let adFound = false;
      let adElement = null;
      const maxWaitTime = 20000; // 20 seconds
      const startTime = Date.now();

      // Check for ads periodically
      while (Date.now() - startTime < maxWaitTime && !adFound) {
        for (const selector of adSelectors) {
          try {
            const element = await this.page.$(selector);
            if (element) {
              // Verify the element is visible
              const isVisible = await element.isVisible();
              if (isVisible) {
                adFound = true;
                adElement = element;
                this.parent.sendMessage("automation-progress", {
                  message: `Worker ${this.workerId}: Ad detected with selector: ${selector}`,
                });
                break;
              }
            }
          } catch (error) {
            // Continue to next selector
            continue;
          }
        }

        if (!adFound) {
          await this.delay(1000);
        }
      }

      if (adFound) {
        await this.clickOnAdView(adElement);
      } else if (!adFound) {
        this.parent.sendMessage("automation-progress", {
          message: `Worker ${this.workerId}: No ads detected within ${maxWaitTime}ms`,
        });
      }

      this.parent.sendMessage("automation-progress", {
        message: `Worker ${this.workerId}: Successfully handled ads.`,
      });
    } catch (error) {
      this.parent.sendMessage("automation-progress", {
        message: `Worker ${this.workerId}: Error handling ads: ${error.message}`,
      });
    }
  }

  async clickOnAdView(adElement) {
    try {
      this.parent.sendMessage("automation-progress", {
        message: `Worker ${this.workerId}: Attempting to click on ad view...`,
      });

      // Define clickable ad elements in priority order based on provided structure
      const adClickTargets = [
        // Primary ad button - "Truy cập trang web" button
        {
          selector: ".ytp-ad-button-vm",
          name: "Visit Website Button",
          waitTime: 3000,
        },
        // Advertiser link
        {
          selector: ".ytp-visit-advertiser-link",
          name: "Advertiser Link",
          waitTime: 2000,
        },
        // Avatar lockup card (clickable ad area)
        {
          selector: ".ytp-ad-avatar-lockup-card.ytp-ad-component--clickable",
          name: "Avatar Card",
          waitTime: 2000,
        },
        // Fallback - any clickable ad component
        {
          selector: ".ytp-ad-component--clickable",
          name: "Any Clickable Component",
          waitTime: 1500,
        },
      ];

      let clickedSuccessfully = false;

      for (const target of adClickTargets) {
        try {
          // Wait a bit for the ad to fully load
          await this.delay(1000);

          const elements = await this.page.$$(target.selector);

          if (elements.length > 0) {
            // Try clicking on the first visible element
            for (const element of elements) {
              try {
                const isVisible = await element.isVisible();
                const isEnabled = await element.isEnabled();

                if (isVisible && isEnabled) {
                  // Scroll element into view if needed
                  await element.scrollIntoViewIfNeeded();
                  await this.delay(500);

                  // Try different click methods
                  try {
                    await element.click({ force: true });
                  } catch {
                    // Fallback to JavaScript click
                    await element.evaluate((el) => el.click());
                  }

                  this.parent.sendMessage("automation-progress", {
                    message: `Worker ${this.workerId}: Successfully clicked on ${target.name}`,
                  });

                  clickedSuccessfully = true;
                  await this.delay(target.waitTime);
                  break;
                }
              } catch (elementError) {
                // Continue to next element
                continue;
              }
            }

            if (clickedSuccessfully) {
              break;
            }
          }
        } catch (selectorError) {
          // Continue to next selector
          continue;
        }
      }

      if (!clickedSuccessfully) {
        this.parent.sendMessage("automation-progress", {
          message: `Worker ${this.workerId}: Could not find clickable ad elements`,
        });
      } else {
        // Wait after clicking ad to allow page navigation/popup
        await this.delay(3000);

        // Handle potential new tab/popup
        await this.handleAdPopup();
      }
    } catch (error) {
      this.parent.sendMessage("automation-progress", {
        message: `Worker ${this.workerId}: Error clicking on ad view: ${error.message}`,
      });
    }
  }

  async handleAdPopup() {
    try {
      // Wait for potential popup/new tab
      await this.delay(2000);

      const pages = this.context.pages();
      if (pages.length > 1) {
        // New tab opened, close it and return to original
        const newPage = pages[pages.length - 1];

        await this.delay(3000);
        this.parent.sendMessage("automation-progress", {
          message: `Worker ${this.workerId}: Ad opened new tab, completed.`,
        });
        await newPage.close();
        await this.delay(1000);

        // Focus back on main page
        await this.page.bringToFront();
      }
    } catch (error) {
      this.parent.sendMessage("automation-progress", {
        message: `Worker ${this.workerId}: Error handling ad popup: ${error.message}`,
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
          },
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

      // Delete the created profile
      await this.deleteProfile();

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
  console.log("Worker received message:", message);
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
