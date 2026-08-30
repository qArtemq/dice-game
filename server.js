const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { networkInterfaces } = require('os');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const DATA_FILE = path.join(__dirname, 'data.json');

// Хранилище статистики пользователей
let friendsStats = {};
let sixesHistory = []; // История шестерок: { name, roll }

// Загрузка статистики из файла при старте сервера
if (fs.existsSync(DATA_FILE)) {
    try {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        const data = JSON.parse(raw);
        friendsStats = data.friendsStats || {};
        sixesHistory = data.sixesHistory || [];
    } catch (e) {
        console.error("Ошибка загрузки данных:", e);
    }
}

// Функция сохранения
function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ friendsStats, sixesHistory }), 'utf8');
}

io.on('connection', (socket) => {
    console.log('Пользователь подключился:', socket.id);

    socket.on('join', (data) => {
        const username = typeof data === 'string' ? data : data.username;
        socket.username = username;
        
        if (!friendsStats[username]) {
            friendsStats[username] = { count: 0, sum: 0, lastRoll: null, luck: 0, sixes: 0, lastRollTime: null, falls: {1:0, 2:0, 3:0, 4:0, 5:0, 6:0} };
        }

        const user = friendsStats[username];
        if (!user.falls) user.falls = {1:0, 2:0, 3:0, 4:0, 5:0, 6:0};

        // ВОССТАНОВЛЕНИЕ: Если сервер перезапускался (бросков 0), а на телефоне игрока уже есть броски
        if (typeof data === 'object' && data.localTotal > 0 && user.count === 0) {
            user.count = data.localTotal;
            let sum = 0;
            for (let i = 1; i <= 6; i++) {
                sum += (data.localFalls[i] || 0) * i;
            }
            user.sum = sum;
            user.luck = (sum / user.count).toFixed(2);
            user.sixes = data.localFalls[6] || 0;
            user.falls = data.localFalls;
            
            // Восстанавливаем примерный график (просто ставим точки на первые броски)
            sixesHistory = sixesHistory.filter(h => h.name !== username);
            for(let i = 1; i <= user.sixes; i++) {
                 sixesHistory.push({ name: username, roll: i });
            }
            saveData();
        }

        io.emit('game_state', { stats: friendsStats, history: sixesHistory });
    });

    socket.on('roll', (value) => {
        if (socket.username) {
            const user = friendsStats[socket.username];
            if (!user.falls) user.falls = {1:0, 2:0, 3:0, 4:0, 5:0, 6:0};
            
            user.count += 1;
            user.sum += value;
            user.lastRoll = value;
            user.luck = (user.sum / user.count).toFixed(2);
            user.falls[value] += 1;
            
            if (value === 6) {
                user.sixes += 1;
                sixesHistory.push({ name: socket.username, roll: user.count });
            }
            
            user.lastRollTime = Date.now();
            saveData(); // Сохраняем после броска
            io.emit('game_state', { stats: friendsStats, history: sixesHistory });
        }
    });

    socket.on('reset_game', () => {
        for (const user in friendsStats) {
            friendsStats[user] = { count: 0, sum: 0, lastRoll: null, luck: 0, sixes: 0, lastRollTime: null, falls: {1:0, 2:0, 3:0, 4:0, 5:0, 6:0} };
        }
        sixesHistory = [];
        saveData(); // Сохраняем обнуление
        io.emit('game_state', { stats: friendsStats, history: sixesHistory });
        io.emit('game_reset'); 
    });

    socket.on('delete_user', (usernameToDelete) => {
        if (friendsStats[usernameToDelete]) {
            delete friendsStats[usernameToDelete];
            sixesHistory = sixesHistory.filter(h => h.name !== usernameToDelete);
            saveData();
            io.emit('game_state', { stats: friendsStats, history: sixesHistory });
        }
    });

    // Отправляем текущую историю при подключении
    socket.emit('game_state', { stats: friendsStats, history: sixesHistory });

    socket.on('disconnect', () => {
        console.log('Пользователь отключился:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    
    console.log('\n========================================');
    console.log('🎲 Сервер ИГРЫ В КУБИК успешно запущен!');
    console.log('========================================');
    console.log(`\n💻 Играть на этом компьютере:\n   http://localhost:${PORT}`);
    
    console.log(`\n📱 Играть на телефоне (введите этот адрес в браузере телефона):`);
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                console.log(`   http://${net.address}:${PORT}`);
            }
        }
    }
    console.log('\n========================================');
    console.log('Нажмите Ctrl+C, чтобы остановить сервер.');
});
