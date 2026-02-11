const btnInput1 = document.getElementById('btn-input1');
const pathInput1 = document.getElementById('path-input1');
const countInput1 = document.getElementById('count-input1');

const btnInput2 = document.getElementById('btn-input2');
const pathInput2 = document.getElementById('path-input2');
const countInput2 = document.getElementById('count-input2');

const btnInput3 = document.getElementById('btn-input3');
const pathInput3 = document.getElementById('path-input3');
const countInput3 = document.getElementById('count-input3');

const loopMode = document.getElementById('loop-mode');
const durationSettings = document.getElementById('duration-settings');
const minutesInput = document.getElementById('minutes');
const hoursInput = document.getElementById('hours');

const btnOutput = document.getElementById('btn-output');
const pathOutput = document.getElementById('path-output');

const btnProcess = document.getElementById('btn-process');
const logContent = document.getElementById('log-content');

let paths = {
    input1: null,
    input2: null,
    input3: null,
    output: null
};

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
btnOutput.addEventListener('click', () => selectFolder('output', pathOutput));

loopMode.addEventListener('change', (e) => {
    if (e.target.checked) {
        durationSettings.classList.remove('hidden');
    } else {
        durationSettings.classList.add('hidden');
    }
});

btnProcess.addEventListener('click', async () => {
    // Validate
    const missing = [];
    if (!paths.input1) missing.push("Đầu vào 1");
    if (!paths.input2) missing.push("Đầu vào 2");
    if (!paths.input3) missing.push("Đầu vào 3");
    if (!paths.output) missing.push("Đầu ra");

    if (missing.length > 0) {
        log(`Lỗi: Vui lòng chọn thêm: ${missing.join(', ')}`, 'error');
        return;
    }

    const config = {
        input1: { path: paths.input1, count: parseInt(countInput1.value) || 1 },
        input2: { path: paths.input2, count: parseInt(countInput2.value) || 1 },
        input3: { path: paths.input3, count: parseInt(countInput3.value) || 1 },
        output: paths.output,
        loop: loopMode.checked,
        duration: (parseInt(minutesInput.value) || 0) * 60 + (parseInt(hoursInput.value) || 0) * 3600
    };

    if (config.loop && config.duration <= 0) {
        log('Lỗi: Thời lượng phải lớn hơn 0 trong Chế độ Lặp.', 'error');
        return;
    }

    btnProcess.disabled = true;
    btnProcess.textContent = 'Đang xử lý...';
    log('Bắt đầu xử lý...', 'info');

    try {
        await window.electronAPI.processAudio(config);
    } catch (err) {
        log(`Lỗi không mong muốn: ${err.message}`, 'error');
        btnProcess.disabled = false;
        btnProcess.textContent = 'Bắt đầu Xử lý';
    }
});

// Settings Logic
function getSettings() {
    return {
        input1: { path: paths.input1, count: countInput1.value },
        input2: { path: paths.input2, count: countInput2.value },
        input3: { path: paths.input3, count: countInput3.value },
        output: paths.output,
        loop: loopMode.checked,
        duration: {
            minutes: minutesInput.value,
            hours: hoursInput.value
        }
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

    if (settings.output) {
        paths.output = settings.output;
        pathOutput.textContent = paths.output || 'Chưa chọn thư mục...';
        pathOutput.title = paths.output || '';
    }

    if (settings.loop !== undefined) {
        loopMode.checked = settings.loop;
        if (settings.loop) {
            durationSettings.classList.remove('hidden');
        } else {
            durationSettings.classList.add('hidden');
        }
    }

    if (settings.duration) {
        minutesInput.value = settings.duration.minutes || 5;
        hoursInput.value = settings.duration.hours || 0;
    }

    log('Đã tải cấu hình lưu trước đó.', 'success');
}

// Attach Save Listeners
const inputsToWatch = [
    countInput1, countInput2, countInput3,
    loopMode, minutesInput, hoursInput
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
