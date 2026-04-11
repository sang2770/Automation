const btnInput1 = document.getElementById('btn-input1');
const pathInput1 = document.getElementById('path-input1');
const countInput1 = document.getElementById('count-input1');

const btnInput2 = document.getElementById('btn-input2');
const pathInput2 = document.getElementById('path-input2');
const countInput2 = document.getElementById('count-input2');

const btnInput3 = document.getElementById('btn-input3');
const pathInput3 = document.getElementById('path-input3');
const countInput3 = document.getElementById('count-input3');




const btnG2Input1 = document.getElementById('btn-g2-input1');
const pathG2Input1 = document.getElementById('path-g2-input1');

const btnG2Input2 = document.getElementById('btn-g2-input2');
const pathG2Input2 = document.getElementById('path-g2-input2');

const btnG2Input3 = document.getElementById('btn-g2-input3');
const pathG2Input3 = document.getElementById('path-g2-input3');

const btnOutput = document.getElementById('btn-output');
const pathOutput = document.getElementById('path-output');

const runCountInput = document.getElementById('run-count');

const btnProcess = document.getElementById('btn-process');
const logContent = document.getElementById('log-content');

// Device ID and Activation Elements
const deviceIdElement = document.getElementById('device-id');
const copyDeviceIdBtn = document.getElementById('copy-device-id');
const activationStatus = document.getElementById('activation-status');
const checkActivationBtn = document.getElementById('check-activation');

let paths = {
    input1: null,
    input2: null,
    input3: null,

    g2input1: null,
    g2input2: null,
    g2input3: null,
    output: null
};

let currentDeviceId = null;
let isActivated = false;

// UI Helpers
function log(msg, type = 'info') {
    const p = document.createElement('p');
    p.className = `log-entry log-${type}`;
    p.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logContent.appendChild(p);
    logContent.scrollTop = logContent.scrollHeight;
}

// Event Listeners
btnInput1.addEventListener('click', () => selectFolder('input1', pathInput1));
btnInput2.addEventListener('click', () => selectFolder('input2', pathInput2));
btnInput3.addEventListener('click', () => selectFolder('input3', pathInput3));

btnG2Input1.addEventListener('click', () => selectFolder('g2input1', pathG2Input1));
btnG2Input2.addEventListener('click', () => selectFolder('g2input2', pathG2Input2));
btnG2Input3.addEventListener('click', () => selectFolder('g2input3', pathG2Input3));
btnOutput.addEventListener('click', () => selectFolder('output', pathOutput));

btnProcess.addEventListener('click', async () => {
    // Check activation first
    if (!isActivated) {
        log('Lỗi: Phần mềm chưa được kích hoạt. Vui lòng kiểm tra kích hoạt trước.', 'error');
        return;
    }
    // Validate main inputs
    const missing = [];
    if (!paths.input1) missing.push("Đầu vào 1");
    if (!paths.input2) missing.push("Đầu vào 2");
    if (!paths.input3) missing.push("Đầu vào 3");

    if (!paths.g2input1) missing.push("G2 - Đầu vào 1");
    if (!paths.g2input2) missing.push("G2 - Đầu vào 2");
    if (!paths.g2input3) missing.push("G2 - Đầu vào 3");
    if (!paths.output) missing.push("Đầu ra");

    if (missing.length > 0) {
        log(`Lỗi: Vui lòng chọn thêm: ${missing.join(', ')}`, 'error');
        return;
    }

    const runCount = parseInt(runCountInput.value) || 1;

    const config = {
        input1: { path: paths.input1, count: parseInt(countInput1.value) || 1 },
        input2: { path: paths.input2, count: parseInt(countInput2.value) || 1 },
        input3: { path: paths.input3, count: parseInt(countInput3.value) || 1 },

        group2input1: { path: paths.g2input1 },
        group2input2: { path: paths.g2input2 },
        group2input3: { path: paths.g2input3 },
        output: paths.output,
        runCount: runCount
    };

    btnProcess.disabled = true;
    btnProcess.textContent = 'Đang xử lý...';

    log(`Bắt đầu xử lý ${runCount} lần (Chế độ Không Lặp)...`, 'info');
    try {
        await window.electronAPI.processAudio(config);
    } catch (err) {
        log(`Lỗi không mong muốn: ${err.message}`, 'error');
        btnProcess.disabled = false;
        btnProcess.textContent = 'Bắt đầu Xử lý';
    }
});

// Device ID and Activation Functions
async function initializeDeviceId() {
    try {
        log('Đang tải ID thiết bị...', 'info');
        currentDeviceId = await window.electronAPI.getDeviceId();
        if (currentDeviceId) {
            deviceIdElement.textContent = currentDeviceId.substring(0, 12) + '...';
            deviceIdElement.title = currentDeviceId; // Show full ID on hover
            log(`ID thiết bị: ${currentDeviceId}`, 'success');
            // Check activation status on startup
            await checkActivationStatus();
            copyDeviceIdBtn.addEventListener('click', copyDeviceIdToClipboard);
            checkActivationBtn.addEventListener('click', checkActivationStatus);
        } else {
            deviceIdElement.textContent = 'Lỗi tải ID';
            log('Không thể tải ID thiết bị', 'error');
        }
    } catch (error) {
        console.error('Error initializing device ID:', error);
        deviceIdElement.textContent = 'Lỗi tải ID';
        log('Lỗi khởi tạo ID thiết bị', 'error');
    }
}

async function checkActivationStatus() {
    if (!currentDeviceId) {
        log('Không có ID thiết bị để kiểm tra', 'error');
        return;
    }

    try {
        checkActivationBtn.disabled = true;
        checkActivationBtn.textContent = 'Đang kiểm tra...';

        log('Đang kiểm tra trạng thái kích hoạt...', 'info');
        const result = await window.electronAPI.checkActivation(currentDeviceId);

        if (result.active) {
            isActivated = true;
            activationStatus.textContent = 'Đã kích hoạt';
            activationStatus.className = 'status-active';
            log(result.message, 'success');
        } else {
            isActivated = false;
            activationStatus.textContent = 'Chưa kích hoạt';
            activationStatus.className = 'status-inactive';
            log(result.message, 'warning');
        }
    } catch (error) {
        console.error('Error checking activation:', error);
        isActivated = false;
        activationStatus.textContent = 'Lỗi kiểm tra';
        activationStatus.className = 'status-inactive';
        log('Lỗi khi kiểm tra kích hoạt', 'error');
    } finally {
        checkActivationBtn.disabled = false;
        checkActivationBtn.textContent = 'Kiểm tra';
    }
}

function copyDeviceIdToClipboard() {
    if (currentDeviceId) {
        navigator.clipboard.writeText(currentDeviceId).then(() => {
            log('Đã sao chép ID thiết bị vào clipboard', 'success');
            copyDeviceIdBtn.textContent = 'Đã sao chép';
            setTimeout(() => {
                copyDeviceIdBtn.textContent = 'Sao chép';
            }, 2000);
        }).catch((error) => {
            console.error('Error copying to clipboard:', error);
            log('Lỗi sao chép ID thiết bị', 'error');
        });
    }
}

// Settings Logic
function getSettings() {
    return {
        input1: { path: paths.input1, count: countInput1.value },
        input2: { path: paths.input2, count: countInput2.value },
        input3: { path: paths.input3, count: countInput3.value },

        g2input1: { path: paths.g2input1 },
        g2input2: { path: paths.g2input2 },
        g2input3: { path: paths.g2input3 },
        output: paths.output,
        runCount: runCountInput.value
    };
}

function saveSettings() {
    const settings = getSettings();
    window.electronAPI.saveSettings(settings);
}

async function loadSettings() {
    const settings = await window.electronAPI.loadSettings();
    if (!settings) return;

    if (settings.input1) {
        paths.input1 = settings.input1.path;
        pathInput1.textContent = paths.input1 || 'Chưa chọn thư mục...';
        pathInput1.title = paths.input1 || '';
        countInput1.value = settings.input1.count || 1;
    }

    if (settings.input2) {
        paths.input2 = settings.input2.path;
        pathInput2.textContent = paths.input2 || 'Chưa chọn thư mục...';
        pathInput2.title = paths.input2 || '';
        countInput2.value = settings.input2.count || 1;
    }

    if (settings.input3) {
        paths.input3 = settings.input3.path;
        pathInput3.textContent = paths.input3 || 'Chưa chọn thư mục...';
        pathInput3.title = paths.input3 || '';
        countInput3.value = settings.input3.count || 1;
    }




    if (settings.g2input1) {
        paths.g2input1 = settings.g2input1.path;
        pathG2Input1.textContent = paths.g2input1 || 'Chưa chọn thư mục...';
        pathG2Input1.title = paths.g2input1 || '';
    }

    if (settings.g2input2) {
        paths.g2input2 = settings.g2input2.path;
        pathG2Input2.textContent = paths.g2input2 || 'Chưa chọn thư mục...';
        pathG2Input2.title = paths.g2input2 || '';
    }

    if (settings.g2input3) {
        paths.g2input3 = settings.g2input3.path;
        pathG2Input3.textContent = paths.g2input3 || 'Chưa chọn thư mục...';
        pathG2Input3.title = paths.g2input3 || '';
    }

    if (settings.output) {
        paths.output = settings.output;
        pathOutput.textContent = paths.output || 'Chưa chọn thư mục...';
        pathOutput.title = paths.output || '';
    }

    log('Đã tải cấu hình lưu trước đó.', 'success');
}

// Attach Save Listeners
const inputsToWatch = [
    countInput1, countInput2, countInput3,
    runCountInput
];

inputsToWatch.forEach(el => {
    el.addEventListener('change', saveSettings);
    el.addEventListener('input', saveSettings);
});

// Helper for path selection
async function selectFolder(key, displayElement) {
    const result = await window.electronAPI.selectDirectory();
    if (result) {
        paths[key] = result;
        displayElement.textContent = result;
        displayElement.title = result;
        log(`Đã chọn ${key}: ${result}`, 'info');
        saveSettings();
    }
}

// Initial Load
loadSettings();
initializeDeviceId();

// IPC Listeners
window.electronAPI.onLog((event, msg) => {
    log(msg.text, msg.type);
});

window.electronAPI.onComplete((event, msg) => {
    log(msg, 'success');
    btnProcess.disabled = false;
    btnProcess.textContent = 'Bắt đầu Xử lý';
});

window.electronAPI.onError((event, msg) => {
    log(msg, 'error');
    btnProcess.disabled = false;
    btnProcess.textContent = 'Bắt đầu Xử lý';
});
