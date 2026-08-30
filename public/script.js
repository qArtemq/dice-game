const socket = io();

// DOM элементы
const diceWrapper = document.getElementById('dice-wrapper');
const dice = document.getElementById('dice');
const totalRollsEl = document.getElementById('total-rolls');
const fallsStatsEl = document.getElementById('falls-stats');
const chancesStatsEl = document.getElementById('chances-stats');
const friendsBtn = document.getElementById('friends-btn');
const toggleStatsBtn = document.getElementById('toggle-stats-btn');
const toggleEffectsBtn = document.getElementById('toggle-effects-btn');
const resetStatsBtn = document.getElementById('reset-stats-btn');
const localStatsContainer = document.getElementById('local-stats-container');

const nameModal = document.getElementById('name-modal');
const usernameInput = document.getElementById('username-input');
const saveNameBtn = document.getElementById('save-name-btn');

const friendsModal = document.getElementById('friends-modal');
const closeModalBtn = document.getElementById('close-friends-btn');
const friendsList = document.getElementById('friends-list');
const toggleRollSoundBtn = document.getElementById('toggle-roll-sound-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings-btn');

// Локальная статистика
let localFalls = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
let localTotal = 0;
let username = localStorage.getItem('dice_username');
let isRolling = false;
let currentFace = null;
let effectsEnabled = localStorage.getItem('dice_effects') !== 'false'; // true by default
let rollSoundEnabled = localStorage.getItem('dice_roll_sound') !== 'false'; // true by default

function updateEffectsBtn() {
    if (toggleEffectsBtn) {
        toggleEffectsBtn.textContent = effectsEnabled ? '🎉 Эффект "6": ВКЛ' : '🎉 Эффект "6": ВЫКЛ';
        toggleEffectsBtn.style.color = effectsEnabled ? '#ffeb3b' : '#888';
    }
}

function updateRollSoundBtn() {
    if (toggleRollSoundBtn) {
        toggleRollSoundBtn.textContent = rollSoundEnabled ? '🎲 Звук броска: ВКЛ' : '🎲 Звук броска: ВЫКЛ';
        toggleRollSoundBtn.style.color = rollSoundEnabled ? '#4CAF50' : '#888';
    }
}

const rollAudio = new Audio('roll.wav');
const winAudio = new Audio('win.wav');

function playWinSound() {
    if (!effectsEnabled) return; // Управляется эффектами
    winAudio.currentTime = 0;
    winAudio.play().catch(e => console.log('Audio error:', e));
}

function playRollSound() {
    if (!rollSoundEnabled) return;
    rollAudio.currentTime = 0;
    rollAudio.play().catch(e => console.log('Audio error:', e));
}

// Текущие углы поворота для бесконечного вращения
let currentRotX = 0;
let currentRotY = 0;
let currentRotZ = 0;

// Поворот к нужной грани
const facesRotations = {
    1: { x: 0, y: 0 },
    6: { x: 0, y: 180 },
    3: { x: 0, y: -90 },
    4: { x: 0, y: 90 },
    2: { x: -90, y: 0 },
    5: { x: 90, y: 0 }
};

// Инициализация
function init() {
    updateCheatIndicator();
    updateEffectsBtn();
    updateRollSoundBtn();
    // Случайная грань при загрузке (кубик смотрит прямо, без 3D наклона)
    const initialFace = Math.floor(Math.random() * 6) + 1;
    currentFace = initialFace;
    
    const baseRot = facesRotations[initialFace];
    currentRotX = baseRot.x;
    currentRotY = baseRot.y;
    dice.style.transform = `rotateX(${currentRotX}deg) rotateY(${currentRotY}deg) rotateZ(0deg)`;
    // Регистрация Service Worker для PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(err => console.log(err));
    }

    // Загрузка локальной статы
    const savedFalls = localStorage.getItem('dice_falls');
    const savedTotal = localStorage.getItem('dice_total');
    if (savedFalls && savedTotal) {
        localFalls = JSON.parse(savedFalls);
        localTotal = parseInt(savedTotal);
        updateLocalStatsUI();
    }

    updateRecentHistoryUI();
    initFaces();
    
    if (!username) {
        nameModal.style.display = 'flex';
    } else {
        socket.emit('join', { username: username, localFalls: localFalls, localTotal: localTotal });
    }
    
    // Запускаем удержание экрана включенным
    initWakeLock();
}

// --- Логика удержания экрана (Screen Wake Lock API) ---
let wakeLock = null;

async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
        }
    } catch (err) {
        console.log(`Wake Lock error: ${err.message}`);
    }
}

function initWakeLock() {
    requestWakeLock();
    // Браузер автоматически снимает блокировку, если вкладка свернута. 
    // Возвращаем её, когда юзер возвращается на вкладку.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            requestWakeLock();
        }
    });

    // Резервный метод для iOS через библиотеку NoSleep.js
    if (window.NoSleep) {
        const noSleep = new NoSleep();
        const enableNoSleep = () => {
            noSleep.enable();
            document.removeEventListener('click', enableNoSleep, false);
            document.removeEventListener('touchstart', enableNoSleep, false);
        };
        document.addEventListener('click', enableNoSleep, false);
        document.addEventListener('touchstart', enableNoSleep, false);
    }
}

// Автоматический вход при подключении (или переподключении)
socket.on('connect', () => {
    if (username) {
        socket.emit('join', { username: username, localFalls: localFalls, localTotal: localTotal });
    }
});

function updateRecentHistoryUI() {
    const histEl = document.getElementById('roll-history');
    if (!histEl) return;
    let recentRolls = JSON.parse(localStorage.getItem('dice_recent_rolls') || '[]');
    if (recentRolls.length > 3) {
        recentRolls = recentRolls.slice(0, 3);
        localStorage.setItem('dice_recent_rolls', JSON.stringify(recentRolls));
    }
    histEl.innerHTML = recentRolls.map(r => `<span class="history-dice">${r}</span>`).join('');
}

function addRollToHistory(result) {
    let recentRolls = JSON.parse(localStorage.getItem('dice_recent_rolls') || '[]');
    recentRolls.unshift(result);
    if (recentRolls.length > 3) recentRolls.pop();
    localStorage.setItem('dice_recent_rolls', JSON.stringify(recentRolls));

    const histEl = document.getElementById('roll-history');
    if (!histEl) return;

    const newEl = document.createElement('span');
    newEl.className = 'history-dice new-item';
    newEl.textContent = result;
    histEl.insertBefore(newEl, histEl.firstChild);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            newEl.classList.remove('new-item');
        });
    });

    if (histEl.children.length > 3) {
        const lastEl = histEl.lastChild;
        lastEl.classList.add('new-item');
        setTimeout(() => {
            if (lastEl.parentNode) lastEl.parentNode.removeChild(lastEl);
        }, 300);
    }
}

// ...сохранение имени...
saveNameBtn.addEventListener('click', () => {
    const val = usernameInput.value.trim();
    if (val) {
        username = val;
        localStorage.setItem('dice_username', username);
        nameModal.style.display = 'none';
        socket.emit('join', { username: username, localFalls: localFalls, localTotal: localTotal });
    }
});

// Работа со статистикой
function loadLocalStats() {
    const saved = localStorage.getItem('dice_local_stats');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            localFalls = data.falls;
            localTotal = data.total;
        } catch(e) {}
    }
}
function saveLocalStats() {
    localStorage.setItem('dice_local_stats', JSON.stringify({ falls: localFalls, total: localTotal }));
}

function updateLocalStatsUI() {
    totalRollsEl.textContent = localTotal;
    
    let fallsHtml = '';
    let chancesHtml = '';
    
    for (let i = 1; i <= 6; i++) {
        const count = localFalls[i];
        const percent = localTotal > 0 ? ((count / localTotal) * 100).toFixed(1) : '0.0';
        fallsHtml += `<div>${i}: ${count}</div>`;
        chancesHtml += `<div>${i}: ${percent}%</div>`;
    }
    
    fallsStatsEl.innerHTML = fallsHtml;
    chancesStatsEl.innerHTML = chancesHtml;
}

// Сброс статистики (Новая игра)
resetStatsBtn.addEventListener('click', () => {
    if (confirm('Начать новую игру? Это сбросит статистику у всех игроков!')) {
        socket.emit('reset_game');
    }
});

// Слушаем команду на глобальный сброс от сервера
socket.on('game_reset', () => {
    localFalls = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    localTotal = 0;
    saveLocalStats();
    updateLocalStatsUI();
    
    // Очищаем историю последних бросков (на экране и в памяти)
    localStorage.removeItem('dice_recent_rolls');
    updateRecentHistoryUI();
    
    // Сбрасываем текущую грань, чтобы первый бросок новой игры не добавлял старую грань в историю
    currentFace = null;
});

// Включение/отключение эффектов
if (toggleEffectsBtn) {
    toggleEffectsBtn.addEventListener('click', () => {
        effectsEnabled = !effectsEnabled;
        localStorage.setItem('dice_effects', effectsEnabled);
        updateEffectsBtn();
    });
}

// Включение/отключение звука броска
if (toggleRollSoundBtn) {
    toggleRollSoundBtn.addEventListener('click', () => {
        rollSoundEnabled = !rollSoundEnabled;
        localStorage.setItem('dice_roll_sound', rollSoundEnabled);
        updateRollSoundBtn();
    });
}

// Скрытие/показ
toggleStatsBtn.addEventListener('click', () => {
    localStatsContainer.classList.toggle('hidden');
});

// Отрисовка точек на гранях
function drawDots(faceEl, value) {
    faceEl.innerHTML = '';
    const createDot = (r, c) => {
        const dot = document.createElement('div');
        dot.className = 'dot';
        dot.style.gridRow = r;
        dot.style.gridColumn = c;
        return dot;
    };

    if (value === 1) {
        faceEl.appendChild(createDot(2, 2));
    } else if (value === 2) {
        faceEl.appendChild(createDot(1, 1));
        faceEl.appendChild(createDot(3, 3));
    } else if (value === 3) {
        faceEl.appendChild(createDot(1, 1));
        faceEl.appendChild(createDot(2, 2));
        faceEl.appendChild(createDot(3, 3));
    } else if (value === 4) {
        faceEl.appendChild(createDot(1, 1));
        faceEl.appendChild(createDot(1, 3));
        faceEl.appendChild(createDot(3, 1));
        faceEl.appendChild(createDot(3, 3));
    } else if (value === 5) {
        faceEl.appendChild(createDot(1, 1));
        faceEl.appendChild(createDot(1, 3));
        faceEl.appendChild(createDot(2, 2));
        faceEl.appendChild(createDot(3, 1));
        faceEl.appendChild(createDot(3, 3));
    } else if (value === 6) {
        faceEl.appendChild(createDot(1, 1));
        faceEl.appendChild(createDot(2, 1));
        faceEl.appendChild(createDot(3, 1));
        faceEl.appendChild(createDot(1, 3));
        faceEl.appendChild(createDot(2, 3));
        faceEl.appendChild(createDot(3, 3));
    }
}

function initFaces() {
    drawDots(document.getElementById('face-front'), 1);
    drawDots(document.getElementById('face-back'), 6);
    drawDots(document.getElementById('face-right'), 3);
    drawDots(document.getElementById('face-left'), 4);
    drawDots(document.getElementById('face-top'), 2);
    drawDots(document.getElementById('face-bottom'), 5);
}

// Бросок (теперь клик по всему экрану, кроме кнопок и истории)
document.addEventListener('click', (e) => {
    // Строго игнорируем клики по любым элементам интерфейса
    if (e.target.closest('.bottom-area') || 
        e.target.closest('.modal') || 
        e.target.closest('.top-btn') || 
        e.target.closest('.recent-history-container') ||
        e.target.tagName === 'BUTTON') {
        return;
    }

    if (isRolling || !username) return;
    
    isRolling = true;
    dice.classList.remove('glow-6');
    playRollSound();
    
    // Мгновенно убираем конфетти при новом броске, чтобы освободить ресурсы телефона
    if (window.confetti) {
        confetti.reset();
    }

    let result = Math.floor(Math.random() * 6) + 1;
    
    // Читерский режим (увеличенная удача)
    // Если чит включен, даем 50% шанс выбросить 5 или 6
    if (localStorage.getItem('dice_cheat_mode') === 'true') {
        if (Math.random() > 0.5) {
            result = Math.floor(Math.random() * 2) + 5; // 5 или 6
        }
    }
    
    // В историю отправляем то, что было на кубике ДО броска (строго прошлая)
    if (currentFace !== null) {
        addRollToHistory(currentFace);
    }
    
    // Сохраняем новый результат как текущий
    currentFace = result;

    // АНИМАЦИЯ ПРЫЖКА (с гравитацией и отскоком)
    const jumpAnim = diceWrapper.animate([
        { transform: 'translateY(0)', offset: 0, easing: 'ease-out' },
        { transform: 'translateY(-160px) scale(1.1)', offset: 0.4, easing: 'ease-in' },
        { transform: 'translateY(0) scale(1)', offset: 0.7, easing: 'ease-out' },
        { transform: 'translateY(-30px)', offset: 0.85, easing: 'ease-in' },
        { transform: 'translateY(0)', offset: 1 }
    ], {
        duration: 900,
        fill: 'forwards'
    });

    // АНИМАЦИЯ ВРАЩЕНИЯ (Естественный кувырок бесконечно вперед/назад)
    const baseRot = facesRotations[result];
    
    const calcNewRot = (current, targetBase) => {
        const diff = targetBase - (current % 360);
        const spins = (Math.floor(Math.random() * 3) + 2) * 360; // 2-4 полных оборота
        const direction = Math.random() > 0.5 ? 1 : -1; // случайно вперед или назад
        return current + diff + (spins * direction);
    };

    const newRotX = calcNewRot(currentRotX, baseRot.x);
    const newRotY = calcNewRot(currentRotY, baseRot.y);
    
    const spinsZ = (Math.floor(Math.random() * 3) + 2) * 360;
    const newRotZ = currentRotZ + (spinsZ * (Math.random() > 0.5 ? 1 : -1));

    const spinAnim = dice.animate([
        { transform: `rotateX(${currentRotX}deg) rotateY(${currentRotY}deg) rotateZ(${currentRotZ}deg)` },
        { transform: `rotateX(${newRotX}deg) rotateY(${newRotY}deg) rotateZ(${newRotZ}deg)` }
    ], {
        duration: 900,
        easing: 'cubic-bezier(0.25, 1, 0.5, 1)', // Идеальное плавное замедление как при трении о стол
        fill: 'forwards'
    });

    currentRotX = newRotX;
    currentRotY = newRotY;
    currentRotZ = newRotZ;
    
    spinAnim.onfinish = () => {
        localFalls[result]++;
        localTotal++;
        saveLocalStats();
        updateLocalStatsUI();
        
        socket.emit('roll', result);
        isRolling = false;

        if (result === 6) {
            playWinSound();
            if (effectsEnabled) {
                dice.classList.add('glow-6');
                if (window.confetti) {
                    confetti({
                        particleCount: 100,
                        spread: 70,
                        origin: { y: 0.6 },
                        colors: ['#FFD700', '#FFA500', '#FF4500'],
                        useWorker: true
                    });
                }
            }
        }
    };
});

// Работа с модалкой друзей
friendsBtn.addEventListener('click', () => {
    if (username) {
        friendsModal.style.display = 'flex';
    }
});

// --- Секретный чит-режим ---
let cheatTaps = 0;
let cheatTimer = null;
const recentHistoryTitle = document.querySelector('.recent-history-title');

function updateCheatIndicator() {
    if (localStorage.getItem('dice_cheat_mode') === 'true') {
        recentHistoryTitle.innerHTML = 'ПРОШЛЫЕ:<span style="opacity: 0.3;">.</span>';
    } else {
        recentHistoryTitle.innerHTML = 'ПРОШЛЫЕ:';
    }
}

recentHistoryTitle.addEventListener('click', () => {
    cheatTaps++;
    clearTimeout(cheatTimer);
    
    if (cheatTaps >= 5) {
        const isCheatActive = localStorage.getItem('dice_cheat_mode') === 'true';
        if (isCheatActive) {
            localStorage.setItem('dice_cheat_mode', 'false');
            alert('Удача вернулась в норму.');
        } else {
            localStorage.setItem('dice_cheat_mode', 'true');
            alert('Секретный режим активирован: удача повышена! 🍀');
        }
        updateCheatIndicator();
        cheatTaps = 0;
    }
    
    cheatTimer = setTimeout(() => {
        cheatTaps = 0;
    }, 1000);
});

closeModalBtn.addEventListener('click', () => {
    friendsModal.style.display = 'none';
});

settingsBtn.addEventListener('click', () => {
    settingsModal.style.display = 'flex';
});

closeSettingsBtn.addEventListener('click', () => {
    settingsModal.style.display = 'none';
});

// Закрытие по клику на пустоту (для модалок)
window.addEventListener('click', (e) => {
    if (e.target === friendsModal) {
        friendsModal.style.display = 'none';
    }
    if (e.target === settingsModal) {
        settingsModal.style.display = 'none';
    }
});

// Удаление отдельного игрока
friendsList.addEventListener('click', (e) => {
    if (e.target.classList.contains('delete-user-btn')) {
        const nameToDelete = e.target.getAttribute('data-name');
        if (confirm(`Вы уверены, что хотите полностью удалить игрока "${nameToDelete}" из статистики?`)) {
            socket.emit('delete_user', nameToDelete);
            
            // Если удалили сами себя, сбрасываем и локальную стату
            if (nameToDelete === username) {
                localFalls = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
                localTotal = 0;
                saveLocalStats();
                updateLocalStatsUI();
                localStorage.removeItem('dice_username');
                username = null;
                friendsModal.style.display = 'none';
                nameModal.style.display = 'flex';
            }
        }
    }
});

let chartInstance = null;

socket.on('game_state', (state) => {
    const stats = state.stats;
    const history = state.history;

    // СИНХРОНИЗАЦИЯ ЛОКАЛЬНОЙ СТАТИСТИКИ С СЕРВЕРОМ
    if (username && stats[username]) {
        const myStats = stats[username];
        // Если сервер знает больше (например, зашли с другого ПК или нажали Ctrl+F5)
        if (myStats.count > localTotal && myStats.falls) {
            localTotal = myStats.count;
            localFalls = myStats.falls;
            saveLocalStats();
            updateLocalStatsUI();
        }
    }

    // ОБНОВЛЕНИЕ ТАБЛИЦЫ
    friendsList.innerHTML = '';
    const sortedFriends = Object.entries(stats).sort((a, b) => b[1].luck - a[1].luck);
    
    for (const [name, data] of sortedFriends) {
        const tr = document.createElement('tr');
        if (name === username) {
            tr.style.backgroundColor = '#444';
            tr.style.fontWeight = 'bold';
        }
        
        let mostFreq = '-';
        if (data.falls) {
            let max = 0;
            for (let i = 1; i <= 6; i++) {
                if (data.falls[i] > max) {
                    max = data.falls[i];
                    mostFreq = i;
                }
            }
        }
        
        tr.innerHTML = `
            <td>
                ${name}
                <span class="delete-user-btn" data-name="${name}">✖</span>
            </td>
            <td>${data.count}</td>
            <td>${data.sum}</td>
            <td>${data.luck}</td>
            <td>${data.sixes || 0}</td>
            <td>${mostFreq}</td>
        `;
        friendsList.appendChild(tr);
    }

    // ОБНОВЛЕНИЕ ГРАФИКА
    const ctx = document.getElementById('statsChart').getContext('2d');
    
    const users = Object.keys(stats);
    const datasets = users.map((user, index) => {
        const colors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'];
        const color = colors[index % colors.length];
        
        const currentUserTotalRolls = stats[user].count;
        const userSixes = history.filter(h => h.name === user).map(h => h.roll);
        const data = [];
        let currentSixes = 0;
        
        for (let r = 0; r <= currentUserTotalRolls; r++) {
            if (userSixes.includes(r)) {
                currentSixes++;
            }
            data.push({ x: r, y: currentSixes });
        }
        
        return {
            label: user,
            data: data,
            borderColor: color,
            backgroundColor: color,
            stepped: true,
            borderWidth: 2,
            pointRadius: 0, // Убираем точки
            pointHoverRadius: 5, // Точки появляются только при наведении
            hitRadius: 20 // Увеличиваем область невидимой точки для легкого наведения мыши
        };
    });

    const customLegendClickHandler = function(e, legendItem, legend) {
        const index = legendItem.datasetIndex;
        const ci = legend.chart;
        
        let allOthersHidden = true;
        for (let i = 0; i < ci.data.datasets.length; i++) {
            if (i !== index && ci.isDatasetVisible(i)) {
                allOthersHidden = false;
                break;
            }
        }
        
        if (allOthersHidden) {
            // Если все остальные уже скрыты, то показываем всех
            for (let i = 0; i < ci.data.datasets.length; i++) {
                ci.show(i);
            }
        } else {
            // Оставляем только кликнутого, остальных скрываем
            for (let i = 0; i < ci.data.datasets.length; i++) {
                if (i === index) {
                    ci.show(i);
                } else {
                    ci.hide(i);
                }
            }
        }
        ci.update();
    };

    if (chartInstance && chartInstance.config.type !== 'line') {
        chartInstance.destroy();
        chartInstance = null;
    }

    if (chartInstance) {
        chartInstance.data.datasets = datasets;
        chartInstance.update();
    } else {
        chartInstance = new Chart(ctx, {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                },
                plugins: {
                    title: { display: true, text: 'График шестёрок', color: '#fff' },
                    legend: { 
                        labels: { color: '#fff' },
                        onClick: customLegendClickHandler 
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        title: { display: true, text: 'Номер броска', color: '#aaa' },
                        ticks: { color: '#aaa', stepSize: 1 }
                    },
                    y: {
                        beginAtZero: true,
                        grace: 1, // Добавляет пустое пространство сверху
                        title: { display: true, text: 'Всего шестёрок', color: '#aaa' },
                        ticks: { stepSize: 1, color: '#aaa' }
                    }
                }
            }
        });
    }
});

// Старт
init();
// Показываем кубик на 1 изначально, если локальная стата есть, то можно не менять
renderDice(1);
