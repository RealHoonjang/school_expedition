// Teachable Machine 관련 변수들
let model, webcam, ctx, labelContainer, maxPredictions;
const URL = "./my_model/";

// Teachable Machine 초화 함수
async function init() {
    const modelURL = URL + "model.json";
    const metadataURL = URL + "metadata.json";

    // 모델 로드
    model = await tmPose.load(modelURL, metadataURL);
    maxPredictions = model.getTotalClasses();

    // 웹캠 설정
    const size = 200;
    const flip = true; // 웹캠 좌우 반전
    webcam = new tmPose.Webcam(size, size, flip);
    await webcam.setup(); // 웹캠 접근 권한 요청
    await webcam.play();

    // 캔버스 설정
    const canvas = document.getElementById("canvas");
    canvas.width = size;
    canvas.height = size;
    ctx = canvas.getContext("2d");

    // 레이블 컨테이너 설정
    labelContainer = document.getElementById("label-container");
    for (let i = 0; i < maxPredictions; i++) {
        labelContainer.appendChild(document.createElement("div"));
    }

    // 포즈 감지 루프 시작
    window.requestAnimationFrame(loop);
}

// 포즈 감지 루프
async function loop() {
    webcam.update();
    await predict();
    window.requestAnimationFrame(loop);
}

// drawPose 함수 추가
function drawPose(pose) {
    if (webcam.canvas) {
        ctx.drawImage(webcam.canvas, 0, 0);
        // 포즈가 감지되면 키포인트와 스켈레톤 그리기
        if (pose) {
            const minPartConfidence = 0.5;
            tmPose.drawKeypoints(pose.keypoints, minPartConfidence, ctx);
            tmPose.drawSkeleton(pose.keypoints, minPartConfidence, ctx);
        }
    }
}

// predict 함수 수정
async function predict() {
    try {
        const { pose, posenetOutput } = await model.estimatePose(webcam.canvas);
        const prediction = await model.predict(posenetOutput);
        const currentTime = performance.now();

        const highestPrediction = prediction.reduce((prev, current) => 
            current.probability > prev.probability ? current : prev
        );

        let poseName = highestPrediction.className;
        if (poseName === '달리기1') poseName = 'class1';
        if (poseName === '달리기2') poseName = 'class2';
        if (poseName === '점프') poseName = 'class3';

        const requiredConfidence = 
            (poseName === 'class1' || poseName === 'class2') ? 0.7 : 0.9;

        if (highestPrediction.probability > requiredConfidence) {
            switch (poseName) {
                case 'class1':
                case 'class2':
                    // 달리기 동작이 번갈아 나타날 때 이동 상태 유지
                    if (gameState.lastPose !== poseName && 
                        (gameState.lastPose === 'class1' || gameState.lastPose === 'class2')) {
                        gameState.lastRunTime = currentTime;
                        gameState.isRunning = true;
                        keys.right = true;
                        gameState.isMoving = true;
                        if (DEBUG_MODE) console.log('달리기 동작 감지');
                    }
                    gameState.lastPose = poseName;
                    break;
                    
                case 'class3':
                    if (!character.isJumping && !gameState.isJumping) {
                        jump();
                    }
                    break;
            }
        }

        // 달리기 시간 체크
        if (gameState.isRunning && currentTime - gameState.lastRunTime > gameState.runningTimeout) {
            gameState.isRunning = false;
            keys.right = false;
            gameState.isMoving = false;
            if (DEBUG_MODE) console.log('달리기 시간 초과');
        }

        // 레이블 컨테이너 업데이트
        for (let i = 0; i < maxPredictions; i++) {
            const classPrediction = prediction[i];
            labelContainer.childNodes[i].innerHTML = 
                `${classPrediction.className}: ${classPrediction.probability.toFixed(2)}`;
        }

        drawPose(pose);

    } catch (error) {
        console.error('포즈 인식 오류:', error);
    }
}

// 키 입력 시뮬레이션 함수 추가
function simulateKeyPress(keyCode) {
    const event = new KeyboardEvent('keydown', { code: keyCode });
    document.dispatchEvent(event);
}

function simulateKeyRelease(keyCode) {
    const event = new KeyboardEvent('keyup', { code: keyCode });
    document.dispatchEvent(event);
}

// 포즈 동작 처리 함수 추가
function handlePoseAction(className, probability) {
    const currentTime = performance.now();
    
    if (DEBUG_MODE) {
        console.log('포즈 감지:', className, 'Previous:', gameState.lastPose);
    }

    switch (className) {
        case 'class1':
        case 'class2':
            // class1과 class2가 번갈아 나타날 때만 이동
            if (className !== gameState.lastPose && 
                (gameState.lastPose === 'class1' || gameState.lastPose === 'class2')) {
                gameState.isMoving = true;
                gameState.gameSpeed = gameState.baseSpeed;
                if (DEBUG_MODE) console.log('달리기 동작 활성화');
            }
            break;
            
        case 'class3':
            // 점프 동작
            if (!character.isJumping && !gameState.isJumping) {
                character.isJumping = true;
                gameState.isJumping = true;
                character.velocityY = -15; // 점프 힘 조정
                if (DEBUG_MODE) console.log('점프 실행');
            }
            break;
            
        case 'class4':
            // class4 포즈 지속 시간 계산
            if (gameState.lastPose !== 'class4') {
                gameState.poseStartTime = currentTime;
            }
            gameState.class4Duration = currentTime - gameState.poseStartTime;
            
            // 2초 이상 유지되면 정지
            if (gameState.class4Duration >= 2000) {
                gameState.isMoving = false;
                gameState.gameSpeed = 0;
                if (DEBUG_MODE) console.log('2초 이상 정지 자세 유지 - 정지');
            }
            break;
    }

    // 현재 포즈를 이전 포즈로 저장
    gameState.lastPose = className;
    
    // 상태 표시 업데이트
    updateMovementStatus();
}

// 상태 표시 업데이트 함수
function updateMovementStatus() {
    let status = '';
    if (gameState.isMoving) status = '달리기';
    else if (gameState.isJumping) status = '점프';
    else status = '정지';
    
    document.getElementById('movement-status').textContent = `이동 상태: ${status}`;
}

// 키보드 입력 상태 객체 추가
const keys = {
    right: false,
    left: false,
    space: false
};

// 키보드 이벤트 리스너 추가
document.addEventListener('keydown', function(event) {
    switch(event.code) {
        case 'ArrowRight':
            keys.right = true;
            gameState.isMoving = true;
            break;
        case 'ArrowLeft':
            keys.left = true;
            gameState.isMoving = true;
            break;
        case 'Space':
            if (!gameState.isJumping) {
                jump();
            }
            break;
    }
});

document.addEventListener('keyup', function(event) {
    switch(event.code) {
        case 'ArrowRight':
            keys.right = false;
            if (!keys.left) gameState.isMoving = false;
            break;
        case 'ArrowLeft':
            keys.left = false;
            if (!keys.right) gameState.isMoving = false;
            break;
    }
});

// 게임 초기화 관련 코드를 추가합니다
document.addEventListener('DOMContentLoaded', function() {
    // 닉네임 입력 필드와 시��� 버튼 요소 가져오기
    const nicknameInput = document.getElementById('nickname');
    const startButton = document.getElementById('start-button');
    const startScreen = document.getElementById('start-screen');

    // Made by 훈장님 텍스트 추가
    const creditText = document.createElement('p');
    creditText.textContent = 'Made by 훈장님';
    creditText.style.cssText = `
        margin-top: 20px;
        color: #666;
        font-size: 14px;
        font-style: italic;
        text-align: center;
    `;
    
    // 시작 화면에 텍스트 추가
    startScreen.appendChild(creditText);

    // 닉네임 입력 이벤트 리스너
    nicknameInput.addEventListener('input', function() {
        const isEmpty = this.value.trim() === '';
        startButton.disabled = isEmpty;
        console.log('닉네임 입력:', this.value, '버튼 상태:', !isEmpty);
    });

    // 시작 버튼 클릭 이벤트 리스너
    startButton.addEventListener('click', function() {
        const nickname = nicknameInput.value.trim();
        if (nickname) {
            startGame(nickname);
        }
    });
});

// 게임 시작 함수
async function startGame(nickname) {
    try {
        // 플레이어 이름 표시
        document.getElementById('player-name').textContent = `플레이어: ${nickname}`;
        
        // 시작 화면 숨기기
        document.getElementById('start-screen').style.display = 'none';
        
        // 게임 컨테이너와 캔버스 표시
        document.getElementById('game-container').style.display = 'block';
        document.getElementById('game-canvas').style.display = 'block';
        document.getElementById('game-info').style.display = 'block';
        
        // 게임 초기화 및 작
        gameStarted = true;
        lastTime = performance.now();
        
        // Teachable Machine 초기화
        await init();
        
        // 게임 루프 시작
        requestAnimationFrame(gameLoop);
    } catch (error) {
        console.error('게임 시작 중 오류 발생:', error);
        alert('게임을 시작하는 중 오류가 발생했습니다.');
    }
}

// 게임 태 객체 수정
const gameState = {
    isMoving: false,
    gameSpeed: 0,
    isJumping: false,
    score: 0,
    stage: 1,
    distance: 0,
    timeLeft: 180,
    baseSpeed: 1,
    runningSpeedMultiplier: 2,
    initialObstacleDelay: 10000,  // 10000에서 20000으로 증가 (20초 지연)
    firstObstacleSpawned: false,
    gameStartTime: 0,
    currentPose: 'class4',
    lastPose: 'class4',
    poseStartTime: 0,
    class4Duration: 0,
    backgroundX: 0,
    backgroundSpeed: 2,
    lastRunTime: 0,           // 마지막 달리기 동작 시간
    runningTimeout: 1000,     // 달리기 제한 시간 (1초)
    isRunning: false
};

// 캐릭터 초기 설정 수정
const character = {
    x: 50,
    y: 300,
    width: 75,
    height: 75,
    velocityY: 0,
    jumpForce: -18,    // 점프 높이 유지
    gravity: 0.35,     // 0.5에서 0.35로 감소 (체공시간 증가)
    isJumping: false,
    initialY: 275
};

// 게임 시작 여부와 마지막 시간 초기화
let gameStarted = false;
let lastTime = 0;
let timer = 60; // 60초 타이머

// 게임 캔버스 컨텍스트 가져오기
const gameCanvas = document.getElementById('game-canvas');
const gameCtx = gameCanvas.getContext('2d');

// 이미지 로드 함수 수정
function loadImages() {
    return {
        run1: document.getElementById('character-run1'),
        run2: document.getElementById('character-run2'),
        jump: document.getElementById('character-jump'),
        idle: document.getElementById('character-idle'),
        obstacle: document.getElementById('obstacle'),
        background: document.getElementById('background')
    };
}

// 배경 그리기 함수
function drawBackground() {
    const background = loadImages().background;
    gameCtx.drawImage(background, 0, 0, gameCanvas.width, gameCanvas.height);
}

// 캐릭터 그리기 함수 수정 (필요한 경우 위치 조정)
function drawCharacter() {
    const images = loadImages();
    let characterImage;

    if (gameState.isJumping) {
        characterImage = images.jump;
    } else if (gameState.isMoving) {
        characterImage = Math.floor(Date.now() / 100) % 2 === 0 ? images.run1 : images.run2;
    } else {
        characterImage = images.idle;
    }

    if (characterImage && characterImage.complete) {
        gameCtx.save();
        
        // 왼쪽으로 이동할 때 이미지 반전
        if (gameState.gameSpeed < 0) {
            gameCtx.scale(-1, 1);
            gameCtx.drawImage(
                characterImage,
                -character.x - character.width,
                character.y,
                character.width,
                character.height
            );
        } else {
            gameCtx.drawImage(
                characterImage,
                character.x,
                character.y,
                character.width,
                character.height
            );
        }
        
        gameCtx.restore();
    }
}

// 장애물 업데이트 함수
function updateObstacles(currentTime) {
    // 게임 시작 후 20초 동안은 장애물 생성하지 않음
    if (!gameState.firstObstacleSpawned) {
        const elapsedTime = currentTime - gameState.gameStartTime;
        if (elapsedTime < gameState.initialObstacleDelay) {
            if (DEBUG_MODE) {
                console.log(`첫 장애물 대기 중... ${((gameState.initialObstacleDelay - elapsedTime) / 1000).toFixed(1)}초 남음`);
            }
            return;  // 초기 지연 시간 동안 장애물 생성하지 않음
        }
    }

    // 장애물 생성 로직
    if (!gameState.firstObstacleSpawned || 
        currentTime - lastObstacleTime >= stageSettings[gameState.stage].spawnInterval) {
        createObstacle();
        lastObstacleTime = currentTime;
        if (!gameState.firstObstacleSpawned) {
            gameState.firstObstacleSpawned = true;
            if (DEBUG_MODE) console.log('첫 번째 장애물 생성');
        }
    }
    
    // 장애물 이동 및 업데이트
    for (let i = obstacles.length - 1; i >= 0; i--) {
        const obstacle = obstacles[i];
        
        // 달리기 동작 시 장애물도 더 빠르게 접근하는 것처럼 보이도록 조정
        if (keys.right || gameState.isMoving) {
            obstacle.x -= (stageSettings[gameState.stage].obstacleSpeed * gameState.runningSpeedMultiplier * 0.8);
        } else {
            obstacle.x -= stageSettings[gameState.stage].obstacleSpeed;
        }

        // 화면 밖으로 나간 장애물 제거
        if (obstacle.x + obstacle.width < 0) {
            obstacles.splice(i, 1);
            continue;
        }

        // 장애물 그리기
        if (obstacleImage && obstacleImage.complete) {
            gameCtx.drawImage(
                obstacleImage,
                obstacle.x,
                obstacle.y,
                obstacle.width,
                obstacle.height
            );
        }
    }
}

// 게임 정보 업데이트 함수
function updateGameInfo() {
    // DOM 요소들 가져오기
    const stageElement = document.getElementById('stage');
    const heartsElement = document.getElementById('hearts');
    const timerElement = document.getElementById('timer');
    const scoreElement = document.getElementById('score');
    const progressElement = document.getElementById('progress');
    const movementStatusElement = document.getElementById('movement-status');

    // 게임이 진행 중이 아니면 업데이트하지 않음
    if (!gameStarted) return;

    // 각 요소가 존재할 때만 업데이트
    try {
        if (stageElement) {
            stageElement.textContent = `스테이지: ${gameState.stage}`;
        }

        if (heartsElement) {
            const hearts = '♥'.repeat(gameState.lives);
            heartsElement.textContent = hearts;
        }

        if (timerElement) {
            const timeLeft = Math.max(0, Math.ceil(gameState.timeLeft));
            timerElement.textContent = timeLeft;
        }

        if (scoreElement) {
            scoreElement.textContent = `점수: ${Math.floor(gameState.score)}`;
        }

        if (progressElement) {
            const progress = Math.min(100, Math.floor((gameState.distance / stageSettings[gameState.stage].goalDistance) * 100));
            progressElement.textContent = `진행도: ${progress}%`;
        }

        if (movementStatusElement) {
            const status = gameState.isMoving ? '달리는 중' : 
                          gameState.isJumping ? '점프 중' : '정지';
            movementStatusElement.textContent = `이동 상태: ${status}`;
        }
    } catch (error) {
        console.warn('게임 정보 업데이트 중 오류:', error);
        // 오류가 발생해도 게임은 계속 진행
    }
}

// 게임 종료 함수
function gameOver() {
    gameStarted = false;
    const nickname = document.getElementById('player-name').textContent.replace('플레이어: ', '');
    gameRecords.saveRecord(nickname, gameState.score);
    
    // 게임 오버 화면 표시
    const gameContainer = document.getElementById('game-container');
    gameContainer.innerHTML = `
        <div class="game-over">
            <h1>게임 오버</h1>
            <p>점수: ${gameState.score}</p>
            ${gameRecords.displayRecords()}
        </div>
    `;
}

// 점프 함수 수정
function jump() {
    if (!character.isJumping && !gameState.isJumping) {
        character.isJumping = true;
        gameState.isJumping = true;
        character.velocityY = -18;  // 수직 점프력 유지
        
        // 점프 시 전진 상태 활성화
        keys.right = true;
        gameState.isMoving = true;
        
        if (DEBUG_MODE) console.log('점프 실행 - 전진 점프');
    }
}

// gameLoop 함수 수정
function gameLoop(currentTime) {
    if (!gameStarted) return;
    
    try {
        const deltaTime = (currentTime - lastTime) / 1000;
        lastTime = currentTime;
        
        // 캔버스 클리어
        gameCtx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
        
        // 배경 업데이트 및 그리기
        updateBackground();
        
        // 이동 처리 - 부드러운 이동을 위해 deltaTime 사용
        if (keys.right || gameState.isMoving) {
            gameState.distance += gameState.baseSpeed * gameState.runningSpeedMultiplier * deltaTime;
        }
        
        // 캐릭터 업데이트
        updateCharacter(deltaTime);
        
        // 장애물 업데이트
        updateObstacles(currentTime);
        
        // 충돌 검사
        checkCollisions();
        
        // 게임 정보 업데이트
        try {
            updateGameInfo();
        } catch (error) {
            console.warn('게임 정보 업데이트 실패:', error);
        }
        
        requestAnimationFrame(gameLoop);
    } catch (error) {
        console.error('게임 루프 오류:', error);
        gameOver();
    }
}

// 장애물 객체 배열
let obstacles = [];

// 스테이지 설정 수정 - 장애물 속도 조정
const stageSettings = {
    1: { 
        obstacleSpeed: 2,      // 더 천천히 이동
        spawnInterval: 3000,   
        goalDistance: 9000,
        timeLimit: 180
    },
    2: { 
        obstacleSpeed: 2.5,    // 단계별로 조금씩 증가
        spawnInterval: 2800,   
        goalDistance: 10500,
        timeLimit: 180
    },
    3: { 
        obstacleSpeed: 3,
        spawnInterval: 2600,   
        goalDistance: 12000,
        timeLimit: 180
    },
    4: { 
        obstacleSpeed: 3.5,
        spawnInterval: 2400,   
        goalDistance: 13500,
        timeLimit: 180
    },
    5: { 
        obstacleSpeed: 4,
        spawnInterval: 2200,   
        goalDistance: 15000,
        timeLimit: 180
    }
};

// 장애물 생성 함수 수
function createObstacle() {
    const obstacle = {
        x: gameCanvas.width,
        y: gameCanvas.height - 140,  // y 위치를 높이 증가에 맞게 조정
        width: 100,                  // 기존 50에서 2배로 증가
        height: 100,                 // 기존 50에서 2배로 증가
        speed: stageSettings[gameState.stage].obstacleSpeed,
        image: loadImages().obstacle
    };
    obstacles.push(obstacle);
}

// 장애물 스폰 타이머 설정
let lastObstacleTime = 0;

// 배경 이동 함수
let backgroundX = 0;
function updateBackground() {
    // 배경 스크롤
    if (keys.right || gameState.isMoving) {
        gameState.backgroundX -= gameState.backgroundSpeed * gameState.runningSpeedMultiplier;
    }

    // 배경 반복을 위한 위치 계산
    if (Math.abs(gameState.backgroundX) >= gameCanvas.width) {
        gameState.backgroundX = 0;
    }

    // 두 개의 배경 이미지를 연속해서 그리기
    if (backgroundImage && backgroundImage.complete) {
        // 첫 번째 배경
        gameCtx.drawImage(
            backgroundImage, 
            gameState.backgroundX, 
            0, 
            gameCanvas.width, 
            gameCanvas.height
        );

        // 두 번째 배경 (첫 번째 배경 바로 뒤에 위치)
        gameCtx.drawImage(
            backgroundImage, 
            gameState.backgroundX + gameCanvas.width, 
            0, 
            gameCanvas.width, 
            gameCanvas.height
        );

        // 세 번째 배경 (끊김 방지를 위해 추가)
        gameCtx.drawImage(
            backgroundImage, 
            gameState.backgroundX - gameCanvas.width, 
            0, 
            gameCanvas.width, 
            gameCanvas.height
        );
    }
}

// 캐릭터 상태 업데이트
function updateCharacter(deltaTime) {
    // 중력 적용
    if (character.isJumping || character.y < character.initialY) {
        character.velocityY += character.gravity;
        
        // 상승 중일 때는 기존 중력 적용
        if (character.velocityY < 0) {
            character.velocityY += character.gravity;
            // 점프 중 전진 속도 3배 증가
            gameState.distance += gameState.baseSpeed * 3.6;  // 1.2 * 3
        } 
        // 하강 중일 때는 더 약한 중력 적용
        else {
            character.velocityY += character.gravity * 0.8;
            // 하강 중에도 전진 속도 3배 증가
            gameState.distance += gameState.baseSpeed * 3.3;  // 1.1 * 3
        }
        
        character.y += character.velocityY;

        // 최대 낙하 속도 제한
        if (character.velocityY > 10) {
            character.velocityY = 10;
        }
    }

    // 바닥 충돌 체크
    if (character.y > character.initialY) {
        character.y = character.initialY;
        character.velocityY = 0;
        character.isJumping = false;
        gameState.isJumping = false;
        
        // 착지 시 전진 상태 해제
        keys.right = false;
        gameState.isMoving = false;
    }

    // 이동 처리
    if (keys.right || gameState.isMoving) {
        gameState.distance += gameState.baseSpeed;
        backgroundX -= gameState.baseSpeed;
        if (backgroundX <= -gameCanvas.width) {
            backgroundX = 0;
        }
    }

    drawCharacter();
}

// 충돌 검사 함수
function checkCollisions() {
    let isOnAnyObstacle = false;

    obstacles.forEach(obstacle => {
        const characterHitbox = {
            x: character.x + 10,
            y: character.y + 5,
            width: character.width - 20,
            height: character.height - 10
        };

        const obstacleHitbox = {
            x: obstacle.x + 10,
            y: obstacle.y + 45,        // y 위치를 더 아래로 조정 (30에서 45로)
            width: obstacle.width - 20,
            height: 15                 // 히트박스 높이를 30에서 15로 감소
        };

        // 디버그 모드에서 히트박스 표시
        if (DEBUG_MODE) {
            gameCtx.strokeStyle = 'yellow';
            gameCtx.strokeRect(characterHitbox.x, characterHitbox.y, characterHitbox.width, characterHitbox.height);
            gameCtx.strokeStyle = 'red';
            gameCtx.strokeRect(obstacleHitbox.x, obstacleHitbox.y, obstacleHitbox.width, obstacleHitbox.height);
        }

        // 나머지 충돌 감지 로직은 그대로 유지
        if (characterHitbox.x < obstacleHitbox.x + obstacleHitbox.width &&
            characterHitbox.x + characterHitbox.width > obstacleHitbox.x &&
            characterHitbox.y < obstacleHitbox.y + obstacleHitbox.height &&
            characterHitbox.y + characterHitbox.height > obstacleHitbox.y) {
            
            const characterBottom = characterHitbox.y + characterHitbox.height;
            const obstacleTop = obstacleHitbox.y;
            
            if (character.velocityY > 0 && 
                characterBottom - character.velocityY <= obstacleTop) {
                // 장애물 위에 착지
                character.y = obstacleHitbox.y - character.height;
                character.velocityY = 0;
                character.isJumping = false;
                gameState.isJumping = false;
                character.isOnObstacle = true;
                character.currentObstacle = obstacle;
                isOnAnyObstacle = true;
                if (DEBUG_MODE) console.log("장애물 위 착지");
            } else {
                // 측면 충돌
                gameOver();
            }
        }
    });

    // 어떤 장애물 위에도 없고, 공중에 있다면 낙하 상태로 전환
    if (!isOnAnyObstacle && !character.isJumping && character.y < character.initialY) {
        character.isJumping = true;
        character.velocityY = 1;
        console.log("낙하 상태로 전환"); // 디버깅용
    }
}

// 스테이지 진행도 체크 함수
function checkStageProgress() {
    if (gameState.distance >= stageSettings[gameState.stage].goalDistance) {
        if (gameState.stage < Object.keys(stageSettings).length) {
            nextStage();
        } else {
            gameWin();
        }
    }
}

// 다음 스테이지로 이동 함수 수정
function nextStage() {
    gameState.stage++;
    gameState.distance = 0;
    gameState.timeLeft = stageSettings[gameState.stage].timeLimit;
    gameState.baseSpeed += 1;
    gameState.firstObstacleSpawned = false;  // 첫 장애물 생성 상 초화
    gameState.gameStartTime = performance.now();  // 새로운 스테이지 시작 시간 설정
    obstacles = [];
    
    // 보너스 점수 계산 수정
    const timeBonus = Math.floor(gameState.timeLeft * 10);
    const speedBonus = Math.floor(gameState.baseSpeed * 100);
    const totalBonus = timeBonus + speedBonus;
    
    gameState.score += totalBonus;
    
    alert(`스테이지 ${gameState.stage} 클리어!\n` +
          `시간 너스: +${timeBonus}점\n` +
          `속도 보너스: +${speedBonus}점\n` +
          `총 보너스: +${totalBonus}점\n\n` +
          `다음 스테이지 시작!`);
}

// 게임 승리
function gameWin() {
    gameStarted = false;
    const nickname = document.getElementById('player-name').textContent.replace('플레이어: ', '');
    gameRecords.saveRecord(nickname, gameState.score);
    
    // 게임 클리어 화면 ��시
    const gameContainer = document.getElementById('game-container');
    gameContainer.innerHTML = `
        <div class="game-clear">
            <h1>게임 클리어!</h1>
            <p>축하합니다!</p>
            <p>최종 점수: ${gameState.score}</p>
            ${gameRecords.displayRecords()}
        </div>
    `;
}

// 디버그 모드 변수 추가 (개발 중에만 true로 설정)
const DEBUG_MODE = true;

// 이미지 객체 생성
const backgroundImage = document.getElementById('background');
const characterRun1Image = document.getElementById('character-run1');
const characterRun2Image = document.getElementById('character-run2');
const characterJumpImage = document.getElementById('character-jump');
const characterIdleImage = document.getElementById('character-idle');
const obstacleImage = document.getElementById('obstacle');

// 게임 시작 전 이미지 로드 확인
function checkImagesLoaded() {
    return backgroundImage.complete && 
           characterRun1Image.complete && 
           characterRun2Image.complete && 
           characterJumpImage.complete && 
           characterIdleImage.complete && 
           obstacleImage.complete;
}

// 게임 초기화 함수 수정
function initGame() {
    if (!checkImagesLoaded()) {
        // 이미지가 아직 로드되지 않았다면 잠시 후 다시 시도
        setTimeout(initGame, 100);
        return;
    }

    gameStarted = true;
    lastTime = performance.now();
    gameState.gameStartTime = lastTime;  // 게임 시작 시간 저장
    gameState.firstObstacleSpawned = false;
    
    // 게임 루프 시작
    requestAnimationFrame(gameLoop);
}

// 시작 버튼 클릭 이벤트 수정
document.getElementById('start-button').addEventListener('click', function() {
    const nickname = document.getElementById('nickname').value.trim();
    if (nickname) {
        document.getElementById('start-screen').style.display = 'none';
        document.getElementById('game-container').style.display = 'block';
        document.getElementById('game-info').style.display = 'block';
        document.getElementById('player-name').textContent = `플레이어: ${nickname}`;
        
        // 게임 초기화 및 시작
        initGame();
    }
});

// 게임 기록 관련 함수들 추가
const gameRecords = {
    // 게임 록 저장
    saveRecord: function(nickname, score) {
        let records = this.getRecords();
        records.push({ nickname, score, date: new Date().toLocaleDateString() });
        
        // 점수 기준으로 내림차순 정렬
        records.sort((a, b) => b.score - a.score);
        
        // 상위 10개 기록만 유지
        records = records.slice(0, 10);
        
        localStorage.setItem('gameRecords', JSON.stringify(records));
    },

    // 저장된 기록 가져오기
    getRecords: function() {
        const records = localStorage.getItem('gameRecords');
        return records ? JSON.parse(records) : [];
    },

    // 기록 표시
    displayRecords: function() {
        const records = this.getRecords();
        let recordsHtml = `
            <div class="game-records">
                <h2>최고 기록</h2>
                <table>
                    <tr>
                        <th>순위</th>
                        <th>닉네임</th>
                        <th>점수</th>
                        <th>날짜</th>
                    </tr>
        `;

        records.forEach((record, index) => {
            recordsHtml += `
                <tr>
                    <td>${index + 1}</td>
                    <td>${record.nickname}</td>
                    <td>${record.score}</td>
                    <td>${record.date}</td>
                </tr>
            `;
        });

        recordsHtml += `
                </table>
                <button onclick="location.reload()">다��� 시작</button>
            </div>
        `;

        return recordsHtml;
    }
};

