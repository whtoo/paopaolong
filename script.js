const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let rightPressed = false;
let leftPressed = false;

// Ball properties
let ball = {
    x: canvas.width / 2,
    y: canvas.height - 30,
    dx: 2,
    dy: -2,
    radius: 10,
    color: '#FFD700' // Golden color
};

// Paddle properties
let paddle = {
    height: 10,
    width: 75,
    x: (canvas.width - 75) / 2,
    color: '#007AFF', // Blue color
    speed: 7
};

// Customizable controls
let controls = {
    left: 'ArrowLeft',
    right: 'ArrowRight'
};

// Draw ball
function drawBall() {
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = ball.color;
    ctx.fill();
    ctx.closePath();
}

// Draw paddle
function drawPaddle() {
    ctx.beginPath();
    ctx.rect(paddle.x, canvas.height - paddle.height, paddle.width, paddle.height);
    ctx.fillStyle = paddle.color;
    ctx.fill();
    ctx.closePath();
}

// Collision detection for paddle
function paddleCollision() {
    if (ball.y + ball.dy > canvas.height - ball.radius - paddle.height) {
        if (ball.x > paddle.x && ball.x < paddle.x + paddle.width) {
            ball.dy = -ball.dy;
        }
    }
}

// Update game state
function update() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBall();
    drawPaddle();

    // Ball movement
    ball.x += ball.dx;
    ball.y += ball.dy;

    // Ball collision with walls
    if (ball.x + ball.dx > canvas.width - ball.radius || ball.x + ball.dx < ball.radius) {
        ball.dx = -ball.dx;
    }
    if (ball.y + ball.dy < ball.radius) {
        ball.dy = -ball.dy;
    } else if (ball.y + ball.dy > canvas.height - ball.radius) {
        paddleCollision();
        if (ball.y + ball.dy > canvas.height - ball.radius) {
            // Game over
            document.location.reload();
            alert("游戏结束！");
        }
    }

    // Paddle movement
    if (rightPressed && paddle.x < canvas.width - paddle.width) {
        paddle.x += paddle.speed;
    } else if (leftPressed && paddle.x > 0) {
        paddle.x -= paddle.speed;
    }

    requestAnimationFrame(update);
}

// Keyboard event handlers
document.addEventListener('keydown', (e) => {
    if (e.key === controls.right) {
        rightPressed = true;
    } else if (e.key === controls.left) {
        leftPressed = true;
    }
});

document.addEventListener('keyup', (e) => {
    if (e.key === controls.right) {
        rightPressed = false;
    } else if (e.key === controls.left) {
        leftPressed = false;
    }
});

// Customize controls functionality
const customizeButton = document.getElementById('customizeControls');
customizeButton.addEventListener('click', () => {
    const newLeftKey = prompt(`请输入新的左移键 (当前: ${controls.left}):`);
    if (newLeftKey) {
        controls.left = newLeftKey;
    }
    const newRightKey = prompt(`请输入新的右移键 (当前: ${controls.right}):`);
    if (newRightKey) {
        controls.right = newRightKey;
    }
    alert(`控制键已更新：左移 - ${controls.left}, 右移 - ${controls.right}`);
    document.querySelector('.controls p:nth-child(2)').textContent = `当前控制键：左移 (${controls.left}), 右移 (${controls.right})`;
});

// Start the game
update();