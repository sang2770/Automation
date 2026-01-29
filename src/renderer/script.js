const { ipcRenderer } = require('electron');

class YouTubeAutomationUI {
    constructor() {
        this.config = {
            links: [],
            profiles: [],
            maxThreads: 3,
            settings: {
                delayBetweenActions: 2000,
                randomMethod: true
            },
            proxy: {
                enabled: false,
                list: []
            }
        };

        this.isRunning = false;
        this.currentLinkId = 0;

        this.initializeEventListeners();
        this.loadConfiguration();
    }

    initializeEventListeners() {
        // IPC listeners
        ipcRenderer.on('worker-message', (event, message) => {
            this.handleWorkerMessage(message);
        });

        document.getElementById('addLink').addEventListener('click', () => {
            this.showLinkModal();
        });

        document.getElementById('saveConfig').addEventListener('click', () => {
            this.saveConfiguration();
        });

        document.getElementById('startAutomation').addEventListener('click', () => {
            this.startAutomation();
        });

        document.getElementById('stopAutomation').addEventListener('click', () => {
            this.stopAutomation();
        });

        document.getElementById('clearLog').addEventListener('click', () => {
            this.clearLog();
        });

        document.getElementById('saveLinkBtn').addEventListener('click', () => {
            this.saveLink();
        });

        // Settings change listeners
        ['maxThreads', 'actionDelay', 'randomMethod', 'enableProxy', 'proxyList'].forEach(id => {
            const element = document.getElementById(id);
            element.addEventListener('change', async () => {
                this.updateSettingsFromUI();
                // Auto-save when settings change
                await this.saveConfiguration();
            });
        });

        // Enable/disable proxy list based on enable proxy checkbox
        document.getElementById('enableProxy').addEventListener('change', (e) => {
            const proxyList = document.getElementById('proxyList');
            proxyList.disabled = !e.target.checked;
            if (!e.target.checked) {
                proxyList.value = '';
            }
        });

        // Bootstrap modal events
        const linkModal = document.getElementById('linkModal');
        linkModal.addEventListener('hidden.bs.modal', () => {
            this.resetLinkForm();
        });
    }

    async loadConfiguration() {
        const result = await ipcRenderer.invoke('load-config');
        if (result.success) {
            this.config = { ...this.config, ...result.config };
            this.updateUIFromConfig();
            this.addLog('Configuration loaded', 'success');
        } else {
            this.addLog(`Failed to load configuration: ${result.error}`, 'error');
        }
    }

    async saveConfiguration() {
        this.updateConfigFromUI();
        const result = await ipcRenderer.invoke('save-config', this.config);

        if (result.success) {
            this.addLog('Configuration saved successfully', 'success');
            this.showToast('Configuration saved!', 'success');
        } else {
            this.addLog(`Failed to save configuration: ${result.error}`, 'error');
            this.showToast('Failed to save configuration', 'error');
        }
    }

    updateUIFromConfig() {
        // Update settings
        document.getElementById('maxThreads').value = this.config.maxThreads || 3;
        document.getElementById('actionDelay').value = this.config.settings?.delayBetweenActions || 2000;
        document.getElementById('randomMethod').checked = this.config.settings?.randomMethod !== false;

        // Update proxy settings
        document.getElementById('enableProxy').checked = this.config.proxy?.enabled || false;
        document.getElementById('proxyList').value = this.config.proxy?.list?.join('\n') || '';
        document.getElementById('proxyList').disabled = !this.config.proxy?.enabled;

        // Render links
        this.renderLinks();
    }

    updateConfigFromUI() {
        this.config.maxThreads = parseInt(document.getElementById('maxThreads').value);
        this.updateSettingsFromUI();
    }

    updateSettingsFromUI() {
        this.config.settings = {
            delayBetweenActions: parseInt(document.getElementById('actionDelay').value),
            randomMethod: document.getElementById('randomMethod').checked
        };

        // Update proxy config
        const enableProxy = document.getElementById('enableProxy').checked;
        const proxyListText = document.getElementById('proxyList').value.trim();

        this.config.proxy = {
            enabled: enableProxy,
            list: enableProxy && proxyListText ?
                proxyListText.split('\n').map(line => line.trim()).filter(line => line.length > 0) :
                []
        };
    }

    renderLinks() {
        const linksList = document.getElementById('linksList');

        if (!this.config.links || this.config.links.length === 0) {
            linksList.innerHTML = '<div class="list-group-item text-muted">No links configured</div>';
            return;
        }

        let html = '';
        this.config.links.forEach((link, index) => {
            const keywords = Array.isArray(link.keywords) ? link.keywords.join(', ') : (link.keywords || '');
            const statusBadge = link.enabled ?
                '<span class="badge bg-success">Enabled</span>' :
                '<span class="badge bg-secondary">Disabled</span>';

            html += `
                <div class="list-group-item mb-2">
                    <div class="d-flex justify-content-between align-items-start flex-wrap">
                        <div class="flex-grow-1">
                            <div class="fw-semibold text-truncate" title="${link.url}">
                                ${link.url}
                            </div>
                            <small class="text-muted">
                                Views: ${link.views} | Keywords: ${keywords || 'None'}
                            </small>
                        </div>
                        <div class="d-flex align-items-center gap-2">
                            ${statusBadge}
                            <button class="btn btn-outline-primary btn-sm" onclick="ui.editLink(${link.id || index})">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-outline-danger btn-sm" onclick="ui.deleteLink(${link.id || index})">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });

        linksList.innerHTML = html;
    }

    showLinkModal(linkData = null) {
        const modal = new bootstrap.Modal(document.getElementById('linkModal'));
        const title = document.getElementById('linkModalTitle');

        if (linkData) {
            title.textContent = 'Edit Link';
            document.getElementById('linkUrl').value = linkData.url || '';
            document.getElementById('linkViews').value = linkData.views || 10;
            document.getElementById('linkKeywords').value = Array.isArray(linkData.keywords) ?
                linkData.keywords.join(', ') : (linkData.keywords || '');
            document.getElementById('linkEnabled').checked = linkData.enabled !== false;
            this.currentLinkId = linkData.id;
        } else {
            title.textContent = 'Add Link';
            this.currentLinkId = Date.now(); // Use timestamp as ID for new links
        }

        modal.show();
    }

    async saveLink() {
        const url = document.getElementById('linkUrl').value.trim();
        const views = parseInt(document.getElementById('linkViews').value);
        const keywordsText = document.getElementById('linkKeywords').value.trim();
        const enabled = document.getElementById('linkEnabled').checked;

        if (!url) {
            this.showToast('Please enter a valid YouTube URL', 'error');
            return;
        }

        if (!views || views < 1) {
            this.showToast('Please enter a valid number of views', 'error');
            return;
        }

        const keywords = keywordsText ? keywordsText.split(',').map(k => k.trim()).filter(k => k) : [];

        const linkData = {
            id: this.currentLinkId,
            url,
            views,
            keywords,
            enabled
        };

        // Find existing link or add new one
        const existingIndex = this.config.links.findIndex(link => link.id === this.currentLinkId);

        if (existingIndex >= 0) {
            this.config.links[existingIndex] = linkData;
            this.addLog(`Updated link: ${url}`, 'info');
        } else {
            this.config.links.push(linkData);
            this.addLog(`Added link: ${url}`, 'success');
        }

        this.renderLinks();

        // Auto-save configuration after adding/updating link
        await this.saveConfiguration();

        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('linkModal'));
        modal.hide();
    }

    editLink(linkId) {
        const link = this.config.links.find(l => l.id === linkId || this.config.links.indexOf(l) === linkId);
        if (link) {
            this.showLinkModal(link);
        }
    }

    async deleteLink(linkId) {
        if (confirm('Are you sure you want to delete this link?')) {
            this.config.links = this.config.links.filter((l, index) =>
                l.id !== linkId && index !== linkId
            );
            this.renderLinks();
            this.addLog('Link deleted', 'info');

            // Auto-save configuration after deleting link
            await this.saveConfiguration();
        }
    }

    resetLinkForm() {
        document.getElementById('linkForm').reset();
        document.getElementById('linkEnabled').checked = true;
        this.currentLinkId = 0;
    }

    async startAutomation() {
        if (this.isRunning) {
            this.showToast('Automation is already running', 'warning');
            return;
        }

        // Validate configuration
        if (this.config.links.filter(l => l.enabled).length === 0) {
            this.showToast('Please add and enable at least one link', 'error');
            return;
        }

        this.updateConfigFromUI();

        const result = await ipcRenderer.invoke('start-automation', this.config);

        if (result.success) {
            this.isRunning = true;
            this.updateRunningState();
            this.addLog('Starting automation...', 'info');
            this.resetStats();
        } else {
            this.addLog(`Failed to start automation: ${result.error}`, 'error');
            this.showToast('Failed to start automation', 'error');
        }
    }

    async stopAutomation() {
        if (!this.isRunning) {
            this.showToast('No automation is currently running', 'warning');
            return;
        }

        const result = await ipcRenderer.invoke('stop-automation');

        if (result.success) {
            this.addLog('Stopping automation...', 'warning');
        } else {
            this.addLog(`Failed to stop automation: ${result.error}`, 'error');
        }
    }

    handleWorkerMessage(message) {
        const { type, data } = message;

        switch (type) {
            case 'automation-progress':
                this.addLog(data.message, 'info');
                break;

            case 'automation-update':
                this.updateStats(data);
                break;

            case 'automation-complete':
                this.addLog('Automation completed successfully', 'success');
                this.isRunning = false;
                this.updateRunningState();
                this.showToast('Automation completed', 'success');
                break;

            case 'automation-stopped':
                console.log('Automation stopped with code:', data.code);

                this.addLog('Automation stopped', 'warning');
                this.isRunning = false;
                this.updateRunningState();
                this.showToast('Automation stopped', 'info');
                break;

            case 'automation-error':
                this.addLog(`Automation error: ${data.message}`, 'error');
                this.isRunning = false;
                this.updateRunningState();
                this.showToast('Automation error', 'error');
                break;

            default:
                console.log('Unknown worker message:', message);
        }
    }

    updateRunningState() {
        console.log('Updating running state:', this.isRunning);
        const startBtn = document.getElementById('startAutomation');
        startBtn.disabled = this.isRunning;
        if (this.isRunning) {
            startBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Running...';
        } else {
            startBtn.innerHTML = '<i class="fas fa-play me-2"></i>Start Automation';
        }
    }

    resetStats() {
        document.getElementById('totalTasks').textContent = '0';
        document.getElementById('completedTasks').textContent = '0';
        document.getElementById('runningTasks').textContent = '0';
        document.getElementById('failedTasks').textContent = '0';
        document.getElementById('progressBar').style.width = '0%';
    }

    updateStats(data) {
        if (data.total !== undefined) {
            document.getElementById('totalTasks').textContent = data.total;
        }
        if (data.completed !== undefined) {
            document.getElementById('completedTasks').textContent = data.completed;
        }
        if (data.running !== undefined) {
            document.getElementById('runningTasks').textContent = data.running;
        }
        if (data.failed !== undefined) {
            document.getElementById('failedTasks').textContent = data.failed;
        }
        if (data.progress !== undefined) {
            const percentage = Math.round(data.progress * 100);
            document.getElementById('progressBar').style.width = `${percentage}%`;
        }
    }

    addLog(message, type = 'info') {
        const logContainer = document.getElementById('logContainer');
        const timestamp = new Date().toLocaleTimeString();

        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        logEntry.innerHTML = `<span class="timestamp">[${timestamp}]</span> ${message}`;

        logContainer.appendChild(logEntry);
        logContainer.scrollTop = logContainer.scrollHeight;

        // Remove old entries if too many
        const entries = logContainer.querySelectorAll('.log-entry');
        if (entries.length > 500) {
            entries[0].remove();
        }
    }

    clearLog() {
        const logContainer = document.getElementById('logContainer');
        logContainer.innerHTML = '<div class="text-muted p-3">Log cleared...</div>';
    }

    showToast(message, type = 'info') {
        // Simple toast implementation
        const alertClass = {
            'success': 'alert-success',
            'error': 'alert-danger',
            'warning': 'alert-warning',
            'info': 'alert-info'
        }[type] || 'alert-info';

        const toast = document.createElement('div');
        toast.className = `alert ${alertClass} alert-dismissible position-fixed`;
        toast.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
        toast.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;

        document.body.appendChild(toast);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 5000);
    }
}

// Initialize the UI when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.ui = new YouTubeAutomationUI();
});