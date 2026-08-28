let canvas, context;
let nextCanvas, nextContext;

let isPaused = false;
let nextPiece = null;

const arena = createMatrix(12, 20);
const player = { pos: {x: 0, y: 0}, matrix: null, score: 0 };

const colors = [null, '#FF0D72', '#0DC2FF', '#0DFF72', '#F500F7', '#E6501E', '#FEDD00', '#3384BC'];

// Input tracking for smooth continuous movement & multi-key handling
const keysPressed = {};
let moveTimerX = 0;
let rotatePressed = false;
let hardDropPressed = false;

// Movement speeds (in milliseconds per grid step)
const FAST_MOVE_INTERVAL = 45; // Smooth horizontal gliding speed
const INITIAL_MOVE_DELAY = 120; // Slight initial delay before rapid glide

function arenaSweep() {
    let rowCount = 1;
    outer: for (let y = arena.length - 1; y > 0; --y) {
        for (let x = 0; x < arena[y].length; ++x) {
            if (arena[y][x] === 0) continue outer;
        }
        const row = arena.splice(y, 1)[0].fill(0);
        arena.unshift(row);
        ++y;
        player.score += rowCount * 10;
        rowCount *= 2;
    }
}

function collide(arena, player) {
    const [m, o] = [player.matrix, player.pos];
    for (let y = 0; y < m.length; ++y) {
        for (let x = 0; x < m[y].length; ++x) {
            if (m[y][x] !== 0 && (arena[y + o.y] && arena[y + o.y][x + o.x]) !== 0) {
                return true;
            }
        }
    }
    return false;
}

function createMatrix(w, h) {
    const matrix = [];
    while (h--) matrix.push(new Array(w).fill(0));
    return matrix;
}

function createPiece(type) {
    if (type === 'T') return [[0,0,0],[1,1,1],[0,1,0]];
    if (type === 'O') return [[2,2],[2,2]];
    if (type === 'L') return [[0,3,0],[0,3,0],[0,3,3]];
    if (type === 'J') return [[0,4,0],[0,4,0],[4,4,0]];
    if (type === 'I') return [[0,5,0,0],[0,5,0,0],[0,5,0,0],[0,5,0,0]];
    if (type === 'S') return [[0,6,6],[6,6,0],[0,0,0]];
    if (type === 'Z') return [[7,7,0],[0,7,7],[0,0,0]];
}

function drawGrid() {
    context.strokeStyle = '#1d4ed8';
    context.lineWidth = 0.04;

    for (let x = 0; x < 12; x++) {
        for (let y = 0; y < 20; y++) {
            context.strokeRect(x, y, 1, 1);
        }
    }
}

function draw() {
    context.fillStyle = '#000';
    context.fillRect(0, 0, canvas.width, canvas.height);

    drawGrid();
    drawMatrix(arena, {x: 0, y: 0}, context);
    drawMatrix(player.matrix, player.pos, context);
}

function drawNext() {
    nextContext.fillStyle = '#000';
    nextContext.fillRect(0, 0, nextCanvas.width, nextCanvas.height);

    if (nextPiece) {
        const offsetX = (5 - nextPiece[0].length) / 2;
        const offsetY = (5 - nextPiece.length) / 2;
        drawMatrix(nextPiece, {x: offsetX, y: offsetY}, nextContext);
    }
}

function drawMatrix(matrix, offset, targetContext) {
    matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                targetContext.fillStyle = colors[value];
                targetContext.fillRect(x + offset.x, y + offset.y, 1, 1);
                
                targetContext.strokeStyle = '#000';
                targetContext.lineWidth = 0.05;
                targetContext.strokeRect(x + offset.x, y + offset.y, 1, 1);
            }
        });
    });
}

function merge(arena, player) {
    player.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) arena[y + player.pos.y][x + player.pos.x] = value;
        });
    });
}

function rotate(matrix, dir) {
    for (let y = 0; y < matrix.length; ++y) {
        for (let x = 0; x < y; ++x) {
            [matrix[x][y], matrix[y][x]] = [matrix[y][x], matrix[x][y]];
        }
    }
    if (dir > 0) matrix.forEach(row => row.reverse());
    else matrix.reverse();
}

function playerDrop() {
    player.pos.y++;
    if (collide(arena, player)) {
        player.pos.y--;
        merge(arena, player);
        playerReset();
        arenaSweep();
        updateScore();
    }
    dropCounter = 0;
}

function playerHardDrop() {
    while (!collide(arena, player)) {
        player.pos.y++;
    }
    player.pos.y--;
    merge(arena, player);
    playerReset();
    arenaSweep();
    updateScore();
    dropCounter = 0;
}

function playerMove(dir) {
    player.pos.x += dir;
    if (collide(arena, player)) player.pos.x -= dir;
}

function getRandomPiece() {
    const pieces = 'ILJOTSZ';
    return createPiece(pieces[pieces.length * Math.random() | 0]);
}

function playerReset() {
    if (!nextPiece) {
        nextPiece = getRandomPiece();
    }
    player.matrix = nextPiece;
    nextPiece = getRandomPiece();

    player.pos.y = 0;
    player.pos.x = (arena[0].length / 2 | 0) - (player.matrix[0].length / 2 | 0);

    if (collide(arena, player)) {
        arena.forEach(row => row.fill(0));
        player.score = 0;
        updateScore();
    }
    drawNext();
}

function playerRotate(dir) {
    const pos = player.pos.x;
    let offset = 1;
    rotate(player.matrix, dir);
    while (collide(arena, player)) {
        player.pos.x += offset;
        offset = -(offset + (offset > 0 ? 1 : -1));
        if (offset > player.matrix[0].length) {
            rotate(player.matrix, -dir);
            player.pos.x = pos;
            return;
        }
    }
}

function togglePause() {
    isPaused = !isPaused;
    const overlay = document.getElementById('pause-overlay');
    if (overlay) {
        overlay.style.display = isPaused ? 'flex' : 'none';
    }
}

let dropCounter = 0;
let dropInterval = 1000;
let lastTime = 0;

// Handles continuous multi-key inputs per frame tick
function handleInput(deltaTime) {
    if (isPaused) return;

    // Handle rotation on initial keypress down (prevents spinning continuously)
    if (keysPressed['ArrowUp'] || keysPressed['KeyW']) {
        if (!rotatePressed) {
            playerRotate(1);
            rotatePressed = true;
        }
    } else {
        rotatePressed = false;
    }

    // Handle single Hard Drop per spacebar press
    if (keysPressed['Space'] || keysPressed[' ']) {
        if (!hardDropPressed) {
            playerHardDrop();
            hardDropPressed = true;
        }
    } else {
        hardDropPressed = false;
    }

    // Handle continuous gliding left/right
    const moveLeft = keysPressed['ArrowLeft'] || keysPressed['KeyA'];
    const moveRight = keysPressed['ArrowRight'] || keysPressed['KeyD'];

    if (moveLeft || moveRight) {
        moveTimerX += deltaTime;
        const currentInterval = moveTimerX > INITIAL_MOVE_DELAY ? FAST_MOVE_INTERVAL : INITIAL_MOVE_DELAY;

        if (moveTimerX >= currentInterval) {
            if (moveLeft) playerMove(-1);
            if (moveRight) playerMove(1);
            moveTimerX = 0;
        }
    } else {
        moveTimerX = FAST_MOVE_INTERVAL; // Instant response on new press
    }

    // Handle fast soft drop sliding
    if (keysPressed['ArrowDown'] || keysPressed['KeyS']) {
        playerDrop();
    }
}

function update(time = 0) {
    const deltaTime = time - lastTime;
    lastTime = time;

    if (!isPaused) {
        handleInput(deltaTime);

        dropCounter += deltaTime;
        if (dropCounter > dropInterval) {
            playerDrop();
        }
        draw();
    }

    requestAnimationFrame(update);
}

function updateScore() {
    const scoreElement = document.getElementById('score');
    if (scoreElement) {
        scoreElement.innerText = player.score;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const hamburgerButton = document.querySelector('.hamburger-button');
    const mainMenu = document.querySelector('.main-menu');
    
    if (hamburgerButton && mainMenu) {
        hamburgerButton.addEventListener('click', function() {
            mainMenu.classList.toggle('active');
            hamburgerButton.classList.toggle('active');
        });
    }

    canvas = document.getElementById('tetris');
    if (canvas) {
        context = canvas.getContext('2d');
        context.scale(25, 25);

        nextCanvas = document.getElementById('next');
        nextContext = nextCanvas.getContext('2d');
        nextContext.scale(24, 24);

        playerReset();
        updateScore();
        update();
    }
});

// Event Listeners for State Tracking
document.addEventListener('keydown', event => {
    if (!document.getElementById('tetris')) return;

    if (event.key === "Escape" || event.keyCode === 27) {
        togglePause();
        return;
    }

    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", " "].indexOf(event.key) > -1) {
        event.preventDefault();
    }

    keysPressed[event.code] = true;
    keysPressed[event.key] = true;
});

document.addEventListener('keyup', event => {
    if (!document.getElementById('tetris')) return;

    delete keysPressed[event.code];
    delete keysPressed[event.key];
});