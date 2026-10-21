// State variables
let parsedForm = null;
let pollingInterval = null;

// DOM Elements
const formUrlInput = document.getElementById('form-url');
const btnAnalyze = document.getElementById('btn-analyze');
const submitCard = document.getElementById('submit-card');
const configCard = document.getElementById('config-card');
const questionsList = document.getElementById('questions-list');
const submitCountInput = document.getElementById('submit-count');
const statusIndicator = document.getElementById('status-indicator');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const successFailText = document.getElementById('success-fail-text');
const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const consoleBox = document.getElementById('console-box');
const btnClearLogs = document.getElementById('btn-clear-logs');
const btnResetWeights = document.getElementById('btn-reset-weights');
const btnRealisticRandom = document.getElementById('btn-realistic-random');

// Logging utility
function log(message, type = 'info') {
    const time = new Date().toLocaleTimeString();
    const line = document.createElement('div');
    line.className = `log-line ${type}`;
    line.innerText = `[${time}] ${message}`;
    consoleBox.appendChild(line);
    consoleBox.scrollTop = consoleBox.scrollHeight;
}

// Reset UI
btnClearLogs.addEventListener('click', () => {
    consoleBox.innerHTML = '';
});

// Analyze Google Form
btnAnalyze.addEventListener('click', async () => {
    const url = formUrlInput.value.trim();
    if (!url) {
        log("Vui lòng nhập đường dẫn Google Form hợp lệ.", "error");
        return;
    }

    log("Đang phân tích cấu trúc Google Form...", "system");
    btnAnalyze.disabled = true;

    try {
        const response = await fetch(`/api/analyze?url=${encodeURIComponent(url)}`);
        const data = await response.json();

        if (response.ok) {
            parsedForm = data;
            log(`Phân tích thành công: "${data.title}"`, "success");
            log(`Tìm thấy ${data.questions.length} trường câu hỏi cần điền.`, "success");
            
            renderConfigurator(data.questions);
            
            // Show Cards
            submitCard.style.display = 'block';
            configCard.style.display = 'block';
        } else {
            log(`Lỗi phân tích: ${data.error}`, "error");
        }
    } catch (err) {
        log(`Không kết nối được tới server: ${err.message}`, "error");
    } finally {
        btnAnalyze.disabled = false;
    }
});

// Render question weight configurations
function renderConfigurator(questions, presetType = 'default') {
    questionsList.innerHTML = '';

    questions.forEach((q, qIndex) => {
        const item = document.createElement('div');
        item.className = 'question-item';
        item.dataset.id = q.id;
        item.dataset.entryId = q.entryId;
        item.dataset.type = q.type;

        // Title
        const titleEl = document.createElement('div');
        titleEl.className = 'question-title';
        titleEl.innerText = `${qIndex + 1}. ${q.title}`;
        item.appendChild(titleEl);

        // Mode selector (Fixed / Random)
        const modeSelector = document.createElement('div');
        modeSelector.className = 'mode-selector';

        const randBtn = document.createElement('button');
        randBtn.className = 'mode-btn active';
        randBtn.innerText = 'Ngẫu nhiên (%)';
        randBtn.dataset.mode = 'random';

        const fixedBtn = document.createElement('button');
        fixedBtn.className = 'mode-btn';
        fixedBtn.innerText = 'Cố định';
        fixedBtn.dataset.mode = 'fixed';

        modeSelector.appendChild(randBtn);
        modeSelector.appendChild(fixedBtn);
        item.appendChild(modeSelector);

        // Options Config Container
        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'options-config';
        item.appendChild(optionsContainer);

        // Handle switching mode
        const setMode = (mode) => {
            optionsContainer.innerHTML = '';
            if (mode === 'fixed') {
                randBtn.classList.remove('active');
                fixedBtn.classList.add('active');
                
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'fixed-input';
                input.placeholder = q.choices ? `Giá trị cố định (gợi ý: ${q.choices.join(', ')})` : 'Nhập câu trả lời cố định...';
                if (q.choices && q.choices.length > 0) {
                    input.value = q.choices[0];
                } else if (q.type === 5) {
                    input.value = "5"; // default for rating scales
                }
                optionsContainer.appendChild(input);
            } else {
                fixedBtn.classList.remove('active');
                randBtn.classList.add('active');
                
                const choices = q.choices || ["1", "2", "3", "4", "5", "6"];
                
                choices.forEach((choice) => {
                    const row = document.createElement('div');
                    row.className = 'option-row';

                    const label = document.createElement('span');
                    label.className = 'option-label';
                    label.innerText = choice;
                    row.appendChild(label);

                    const inputWrapper = document.createElement('div');
                    inputWrapper.className = 'option-input-wrapper';

                    const slider = document.createElement('input');
                    slider.type = 'range';
                    slider.className = 'weight-slider';
                    slider.min = '0';
                    slider.max = '10';
                    
                    // Set weights based on preset mode
                    if (presetType === 'realistic') {
                        const num = parseInt(choice);
                        if (!isNaN(num)) {
                            // Scale distribution (Normal Bell Curve skewing to positive)
                            const totalChoices = choices.length;
                            // Target center around 4 or 5 depending on total choices
                            const center = totalChoices >= 6 ? 4.5 : 4;
                            const diff = Math.abs(num - center);
                            if (diff <= 0.5) slider.value = '10';
                            else if (diff <= 1.5) slider.value = '7';
                            else if (diff <= 2.5) slider.value = '3';
                            else slider.value = '1';
                        } else {
                            // Staggered weights for textual items
                            const index = choices.indexOf(choice);
                            slider.value = String(Math.max(2, 8 - index * 2));
                        }
                    } else {
                        // Default weights
                        if (q.type === 5) {
                            const num = parseInt(choice);
                            if (num >= 4) {
                                slider.value = '8'; 
                            } else if (num === 3) {
                                slider.value = '4';
                            } else {
                                slider.value = '1';
                            }
                        } else {
                            slider.value = '5';
                        }
                    }

                    const percent = document.createElement('span');
                    percent.className = 'weight-percent';
                    percent.innerText = '0%';

                    inputWrapper.appendChild(slider);
                    inputWrapper.appendChild(percent);
                    row.appendChild(inputWrapper);
                    optionsContainer.appendChild(row);

                    slider.addEventListener('input', () => {
                        updatePercentages(optionsContainer);
                    });
                });

                updatePercentages(optionsContainer);
            }
        };

        randBtn.addEventListener('click', () => setMode('random'));
        fixedBtn.addEventListener('click', () => setMode('fixed'));

        // Initialize default mode
        setMode('random');

        questionsList.appendChild(item);
    });
}

// Recalculate relative weights/percentages on sliders change
function updatePercentages(container) {
    const rows = container.querySelectorAll('.option-row');
    let totalWeight = 0;

    rows.forEach(row => {
        totalWeight += parseInt(row.querySelector('.weight-slider').value);
    });

    rows.forEach(row => {
        const sliderVal = parseInt(row.querySelector('.weight-slider').value);
        const percentEl = row.querySelector('.weight-percent');
        if (totalWeight === 0) {
            percentEl.innerText = '0%';
        } else {
            const pct = Math.round((sliderVal / totalWeight) * 100);
            percentEl.innerText = `${pct}%`;
        }
    });
}

// Reset weights to default
btnResetWeights.addEventListener('click', () => {
    if (parsedForm) {
        renderConfigurator(parsedForm.questions, 'default');
        log("Đã khôi phục cài đặt trọng số mặc định.", "system");
    }
});

// Realistic Random Preset
btnRealisticRandom.addEventListener('click', () => {
    if (parsedForm) {
        renderConfigurator(parsedForm.questions, 'realistic');
        log("Đã kích hoạt thuật toán phân phối chuẩn (khách quan, mô phỏng hành vi thật).", "success");
    }
});


// Start auto-submission run
btnStart.addEventListener('click', async () => {
    if (!parsedForm) return;

    const count = parseInt(submitCountInput.value) || 100;
    const questionsConfig = [];

    // Collect all configs
    const items = questionsList.querySelectorAll('.question-item');
    items.forEach((item) => {
        const id = item.dataset.id;
        const entryId = item.dataset.entryId;
        const type = parseInt(item.dataset.type);
        const activeMode = item.querySelector('.mode-btn.active').dataset.mode;

        const config = {
            id,
            entryId,
            type,
            mode: activeMode
        };

        if (activeMode === 'fixed') {
            config.fixedValue = item.querySelector('.fixed-input').value;
        } else {
            const choices = [];
            const weights = {};
            const rows = item.querySelectorAll('.option-row');

            rows.forEach((row) => {
                const choice = row.querySelector('.option-label').innerText;
                const weight = parseInt(row.querySelector('.weight-slider').value);
                choices.push(choice);
                weights[choice] = weight;
            });

            config.choices = choices;
            config.weights = weights;
        }

        questionsConfig.push(config);
    });

    log(`Bắt đầu quy trình tự động gửi ${count} biểu mẫu...`, "system");
    btnStart.disabled = true;
    btnStop.disabled = false;

    try {
        const response = await fetch('/api/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                actionUrl: parsedForm.actionUrl,
                count: count,
                questionsConfig: questionsConfig,
                pageHistory: parsedForm.pageHistory
            })
        });


        const data = await response.json();

        if (response.ok) {
            startPolling();
        } else {
            log(`Không thể chạy: ${data.error}`, "error");
            btnStart.disabled = false;
            btnStop.disabled = true;
        }
    } catch (err) {
        log(`Lỗi kết nối: ${err.message}`, "error");
        btnStart.disabled = false;
        btnStop.disabled = true;
    }
});

// Stop run
btnStop.addEventListener('click', async () => {
    btnStop.disabled = true;
    try {
        await fetch('/api/stop', { method: 'POST' });
        log("Yêu cầu dừng đang được xử lý...", "warn");
    } catch (err) {
        log(`Lỗi yêu cầu dừng: ${err.message}`, "error");
    }
});

// Poll status from backend
function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);

    statusIndicator.className = 'status-indicator active';
    statusIndicator.innerText = 'Đang chạy...';

    pollingInterval = setInterval(async () => {
        try {
            const response = await fetch('/api/status');
            const data = await response.json();

            // Update Progress UI
            const pct = data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0;
            progressFill.style.width = `${pct}%`;
            progressText.innerText = `Đã hoàn thành: ${pct}% (${data.completed}/${data.total})`;
            successFailText.innerText = `Thành công: ${data.success} | Lỗi: ${data.failed}`;

            // Sync console logs
            if (data.logs && data.logs.length > 0) {
                // Reverse logs to write chronological in the box or just output raw
                // Clear and dump to keep synced
                consoleBox.innerHTML = '';
                data.logs.forEach(item => {
                    const line = document.createElement('div');
                    line.className = 'log-line';
                    if (item.message.includes('[Error]')) line.className += ' error';
                    else if (item.message.includes('[Warning]')) line.className += ' warn';
                    else if (item.message.includes('Completed') || item.message.includes('Progress:')) line.className += ' success';
                    else line.className += ' system';
                    
                    line.innerText = `[${item.timestamp}] ${item.message}`;
                    consoleBox.appendChild(line);
                });
            }

            if (!data.active) {
                stopPolling(data.failed === 0 ? 'success' : 'idle');
            }
        } catch (err) {
            log(`Lỗi lấy thông tin tiến độ: ${err.message}`, "error");
        }
    }, 600);
}

function stopPolling(finalState) {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }

    btnStart.disabled = false;
    btnStop.disabled = true;
    
    if (finalState === 'success') {
        statusIndicator.className = 'status-indicator success';
        statusIndicator.innerText = 'Hoàn thành!';
        log("Quá trình điền form hoàn tất thành công 100%!", "success");
    } else {
        statusIndicator.className = 'status-indicator';
        statusIndicator.innerText = 'Đã dừng';
        log("Đã dừng tiến trình.", "warn");
    }
}
