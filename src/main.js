const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');

class ElectronApp {
  constructor() {
    this.mainWindow = null;
    this.workers = new Map(); // Lưu trữ các worker threads
    this.isDevMode = process.argv.includes('--dev');
  }

  async createWindow() {
    // Tạo cửa sổ chính
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        preload: path.join(__dirname, 'preload.js')
      },
      icon: path.join(__dirname, 'assets', 'icon.png'), // Thêm icon nếu có
      show: true
    });

    // Load file HTML
    await this.mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    // Show window khi đã load xong
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow.show();
      if (this.isDevMode) {
        this.mainWindow.webContents.openDevTools();
      }
    });

    // Xử lý khi đóng cửa sổ
    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
      this.terminateAllWorkers();
    });
  }

  setupIpcHandlers() {
    // Xử lý import file CSV/Excel với accounts
    ipcMain.handle('import-accounts-file', async () => {
      try {
        const result = await dialog.showOpenDialog(this.mainWindow, {
          properties: ['openFile'],
          filters: [
            { name: 'CSV Files', extensions: ['csv'] },
            { name: 'Excel Files', extensions: ['xlsx', 'xls'] },
            { name: 'Text Files', extensions: ['txt'] }
          ]
        });

        if (!result.canceled && result.filePaths.length > 0) {
          const filePath = result.filePaths[0];
          const content = await fs.readFile(filePath, 'utf-8');
          return { success: true, content, filePath };
        }
        
        return { success: false, error: 'No file selected' };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    // Xử lý import file dữ liệu
    ipcMain.handle('import-data-file', async () => {
      try {
        const result = await dialog.showOpenDialog(this.mainWindow, {
          properties: ['openFile'],
          filters: [
            { name: 'CSV Files', extensions: ['csv'] },
            { name: 'Excel Files', extensions: ['xlsx', 'xls'] },
            { name: 'Text Files', extensions: ['txt'] }
          ]
        });

        if (!result.canceled && result.filePaths.length > 0) {
          const filePath = result.filePaths[0];
          const content = await fs.readFile(filePath, 'utf-8');
          return { success: true, content, filePath };
        }
        
        return { success: false, error: 'No file selected' };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    // Bắt đầu automation với nhiều workers
    ipcMain.handle('start-automation', async (event, config) => {
      try {
        const { accounts, data, concurrent, fillDataFunc, inputFormat } = config;
        
        console.log(`Starting automation with ${concurrent} concurrent workers (${inputFormat} format)`);
        
        // Chia accounts thành các nhóm cho từng worker
        const accountsPerWorker = Math.ceil(accounts.length / concurrent);
        const workerPromises = [];

        for (let i = 0; i < concurrent; i++) {
          const startIndex = i * accountsPerWorker;
          const endIndex = Math.min(startIndex + accountsPerWorker, accounts.length);
          const workerAccounts = accounts.slice(startIndex, endIndex);

          if (workerAccounts.length > 0) {
            const workerId = uuidv4();
            const workerPromise = this.startWorker(workerId, {
              accounts: workerAccounts,
              data,
              fillDataFunc,
              inputFormat,
              workerIndex: i
            });
            
            workerPromises.push(workerPromise);
          }
        }

        // Đợi tất cả workers hoàn thành
        const results = await Promise.allSettled(workerPromises);
        
        return {
          success: true,
          message: 'Automation completed',
          results: results.map((result, index) => ({
            workerIndex: index,
            status: result.status,
            value: result.status === 'fulfilled' ? result.value : null,
            reason: result.status === 'rejected' ? result.reason : null
          }))
        };

      } catch (error) {
        console.error('Error starting automation:', error);
        return { success: false, error: error.message };
      }
    });

    // Dừng tất cả automation
    ipcMain.handle('stop-automation', async () => {
      try {
        this.terminateAllWorkers();
        return { success: true, message: 'All workers terminated' };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    // Lấy trạng thái workers
    ipcMain.handle('get-workers-status', async () => {
      const workersStatus = Array.from(this.workers.entries()).map(([id, worker]) => ({
        id,
        status: worker.killed ? 'stopped' : 'running',
        pid: worker.pid
      }));
      
      return { workers: workersStatus };
    });
  }

  async startWorker(workerId, config) {
    return new Promise((resolve, reject) => {
      // Tạo worker process
      const worker = fork(path.join(__dirname, 'worker.js'), [], {
        silent: false
      });

      this.workers.set(workerId, worker);

      // Lắng nghe tin nhắn từ worker
      worker.on('message', (message) => {
        // Gửi cập nhật tới renderer
        if (this.mainWindow) {
          this.mainWindow.webContents.send('worker-update', {
            workerId,
            ...message
          });
        }

        // Xử lý khi worker hoàn thành
        if (message.type === 'completed' || message.type === 'error') {
          this.workers.delete(workerId);
          
          if (message.type === 'completed') {
            resolve(message.data);
          } else {
            reject(new Error(message.error));
          }
        }
      });

      // Xử lý lỗi worker
      worker.on('error', (error) => {
        console.error(`Worker ${workerId} error:`, error);
        this.workers.delete(workerId);
        reject(error);
      });

      // Xử lý khi worker bị đóng
      worker.on('exit', (code) => {
        console.log(`Worker ${workerId} exited with code ${code}`);
        this.workers.delete(workerId);
        if (code !== 0) {
          reject(new Error(`Worker exited with code ${code}`));
        }
      });

      // Gửi config tới worker
      worker.send({ type: 'start', config });
    });
  }

  terminateAllWorkers() {
    console.log(`Terminating ${this.workers.size} workers`);
    
    for (const [workerId, worker] of this.workers) {
      try {
        if (!worker.killed) {
          worker.kill('SIGTERM');
        }
      } catch (error) {
        console.error(`Error terminating worker ${workerId}:`, error);
      }
    }
    
    this.workers.clear();
  }

  async initialize() {
    // Đợi app sẵn sàng
    await app.whenReady();

    // Tạo cửa sổ chính
    await this.createWindow();
    
    // Setup IPC handlers
    this.setupIpcHandlers();

    // Xử lý khi tất cả cửa sổ đóng
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        this.terminateAllWorkers();
        app.quit();
      }
    });

    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await this.createWindow();
      }
    });

    console.log('Electron app initialized successfully');
  }
}

// Khởi tạo và chạy ứng dụng
const electronApp = new ElectronApp();
electronApp.initialize().catch(console.error);

// Handle graceful shutdown
process.on('SIGINT', () => {
  electronApp.terminateAllWorkers();
  app.quit();
});

process.on('SIGTERM', () => {
  electronApp.terminateAllWorkers();
  app.quit();
});
