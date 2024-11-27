// Teachable Machine 관련 변수들
let model, webcam, ctx, labelContainer, maxPredictions;
const URL = "./my_model/";

// Teachable Machine 초기화 함수
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

        // 가장 높은 확률의 포즈 찾기
        const highestPrediction = prediction.reduce((prev, current) => 
            current.probability > prev.probability ? current : prev
        );

        // 확률이 0.8 이상일 때만 동작 실행
        if (highestPrediction.probability > 0.8) {
            // 포즈 이름 변환 (달리기1, 달리기2, 점프, 정지 -> class1, class2, class3, class4)
            let poseName = highestPrediction.className;
            if (poseName === '달리기1') poseName = 'class1';
            if (poseName === '달리기2') poseName = 'class2';
            if (poseName === '점프') poseName = 'class3';
            if (poseName === '정지') poseName = 'class4';

            if (DEBUG_MODE) {
                console.log('포즈 인식:', poseName, '확률:', highestPrediction.probability.toFixed(2));
            }
            
            // 포즈에 따른 키보드 입력 시뮬레이션
            switch (poseName) {
                case 'class1':
                case 'class2':
                    // class1과 class2가 번갈아 나타날 때만 오른쪽 키 활성화
                    if (gameState.lastPose !== poseName && 
                        (gameState.lastPose === 'class1' || gameState.lastPose === 'class2')) {
                        simulateKeyPress('ArrowRight');
                        gameState.isMoving = true;
                        if (DEBUG_MODE) console.log('달리기 동작 활성화');
                    }
                    break;
                    
                case 'class3':
                    if (!character.isJumping && !gameState.isJumping) {
                        simulateKeyPress('Space');
                        if (DEBUG_MODE) console.log('점프 동작 활성화');
                    }
                    break;
                    
                case 'class4':
                    if (gameState.lastPose !== 'class4') {
                        gameState.poseStartTime = Date.now();
                    }
                    
                    if (Date.now() - gameState.poseStartTime >= 2000) {
                        simulateKeyRelease('ArrowRight');
                        gameState.isMoving = false;
                        if (DEBUG_MODE) console.log('정지 동작 활성화');
                    }
                    break;
            }
            
            gameState.lastPose = poseName;
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
    // 닉네임 입력 필드와 시작 버튼 요소 가져오기
    const nicknameInput = document.getElementById('nickname');
    const startButton = document.getElementById('start-button');

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
        
        // 게임 초기화 및 시작
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

// 게임 상태 객체 수정
const gameState = {
    isMoving: false,
    gameSpeed: 0,
    isJumping: false,
    score: 0,
    stage: 1,
    distance: 0,
    timeLeft: 180,
    baseSpeed: 5,
    lastPose: null,
    poseStartTime: 0
};

// 캐릭터 초기 설정
const character = {
    x: 50,
    y: 300,               // 초기 y 위치
    width: 50,
    height: 50,
    jumpForce: -15,      // 점프 힘 (위로 올라가는 속도)
    gravity: 0.8,        // 중력
    velocityY: 0,        // y축 속도
    isJumping: false,
    initialY: 300        // 바닥 y 위치
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

// 캐릭터 그리기 함수
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
        gameCtx.save(); // 현재 컨텍스트 상태 저장
        
        // 왼쪽으로 이동할 때 이미지 반전
        if (gameState.gameSpeed < 0) {
            gameCtx.scale(-1, 1);
            gameCtx.drawImage(
                characterImage,
                -character.x - character.width, // x 좌표 조정
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
        
        gameCtx.restore(); // 컨텍스트 상태 복원
    }
}

// 장애물 업데이트 함수
function updateObstacles(deltaTime) {
    // 장애물 관련 로직 구현
}

// 게임 정보 업데이트 함수
function updateGameInfo() {
    // 시간 표시 형식 변경 (MM:SS)
    const minutes = Math.floor(gameState.timeLeft / 60);
    const seconds = Math.floor(gameState.timeLeft % 60);
    const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    // 거리 표시를 미터 단위로 변환
    const distanceInMeters = Math.floor(gameState.distance / 10); // 10픽셀을 1미터로 계산
    const goalDistanceInMeters = Math.floor(stageSettings[gameState.stage].goalDistance / 10);
    
    document.getElementById('stage').textContent = `스테이지: ${gameState.stage}`;
    document.getElementById('timer').textContent = timeString;
    document.getElementById('score').textContent = `점수: ${gameState.score}`;
    document.getElementById('progress').textContent = 
        `진행도: ${Math.floor((gameState.distance / stageSettings[gameState.stage].goalDistance) * 100)}% (${distanceInMeters}m / ${goalDistanceInMeters}m)`;
}

// 게임 종료 함수
function gameOver() {
    gameStarted = false;
    alert('게임 종료!');
    location.reload(); // 페이지 새로고침
}

// 점프 함수 추가
function jump() {
    if (!character.isJumping && !gameState.isJumping) {
        character.isJumping = true;
        gameState.isJumping = true;
        character.velocityY = -15;  // 점프 힘
        if (DEBUG_MODE) console.log('점프 실행');
    }
}

// gameLoop 함수 수정
function gameLoop(currentTime) {
    if (!gameStarted) return;
    
    const deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;
    
    // 캔버스 클리어
    gameCtx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
    
    // 이동 처리
    if (keys.right || gameState.isMoving) {
        gameState.distance += gameState.baseSpeed;
        backgroundX -= gameState.baseSpeed;
        if (backgroundX <= -gameCanvas.width) {
            backgroundX = 0;
        }
    }
    
    // 캐릭터 업데이트
    updateCharacter(deltaTime);
    
    // 장애물 업데이트
    updateObstacles(currentTime);
    
    // 충돌 검사
    checkCollisions();
    
    // 게임 정보 업데이트
    updateGameInfo();
    
    if (DEBUG_MODE) {
        console.log('게임 상태:', {
            isMoving: gameState.isMoving,
            distance: gameState.distance,
            speed: gameState.baseSpeed,
            keys: keys
        });
    }
    
    requestAnimationFrame(gameLoop);
}

// 장애물 객체 배열
let obstacles = [];

// 스테이지 설정 수정
const stageSettings = {
    1: { 
        obstacleSpeed: 5, 
        spawnInterval: 2000,    // 2초마다 장애물 생성
        goalDistance: 9000,     // 기존 3000에서 3배 증가
        timeLimit: 180          // 시간도 3배로 증가 (3분)
    },
    2: { 
        obstacleSpeed: 6, 
        spawnInterval: 1800,    // 1.8초마다 장애물 생성
        goalDistance: 10500,    // 기존 3500에서 3배 증가
        timeLimit: 180
    },
    3: { 
        obstacleSpeed: 7, 
        spawnInterval: 1600,    // 1.6초마다 장애물 생성
        goalDistance: 12000,    // 기존 4000에서 3배 증가
        timeLimit: 180
    },
    4: { 
        obstacleSpeed: 8, 
        spawnInterval: 1400,    // 1.4초마다 장애물 생성
        goalDistance: 13500,    // 기존 4500에서 3배 증가
        timeLimit: 180
    },
    5: { 
        obstacleSpeed: 9, 
        spawnInterval: 1200,    // 1.2초마다 장애물 생성
        goalDistance: 15000,    // 기존 5000에서 3배 증가
        timeLimit: 180
    }
};

// 장애물 생성 함수 수정
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

// gameLoop 함수 수정
function gameLoop(currentTime) {
    if (!gameStarted) return;
    
    const deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;
    
    // 캔버스 클리어
    gameCtx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
    
    // 이동 처리
    if (keys.right || gameState.isMoving) {
        gameState.distance += gameState.baseSpeed;
        backgroundX -= gameState.baseSpeed;
        if (backgroundX <= -gameCanvas.width) {
            backgroundX = 0;
        }
    }
    
    // 캐릭터 업데이트
    updateCharacter(deltaTime);
    
    // 장애물 업데이트
    updateObstacles(currentTime);
    
    // 충돌 검사
    checkCollisions();
    
    // 게임 정보 업데이트
    updateGameInfo();
    
    if (DEBUG_MODE) {
        console.log('게임 상태:', {
            isMoving: gameState.isMoving,
            distance: gameState.distance,
            speed: gameState.baseSpeed,
            keys: keys
        });
    }
    
    requestAnimationFrame(gameLoop);
}

// 배경 이동 함수
let backgroundX = 0;
function updateBackground() {
    if (gameState.isMoving) {
        backgroundX -= gameState.gameSpeed;
        if (backgroundX <= -gameCanvas.width) {
            backgroundX = 0;
        }
    }
    
    const background = loadImages().background;
    gameCtx.drawImage(background, backgroundX, 0, gameCanvas.width, gameCanvas.height);
    gameCtx.drawImage(background, backgroundX + gameCanvas.width, 0, gameCanvas.width, gameCanvas.height);
}

// 캐릭터 상태 업데이트
function updateCharacter(deltaTime) {
    // 중력 적용
    if (character.isJumping || character.y < character.initialY) {
        character.velocityY += character.gravity;
        character.y += character.velocityY;

        if (character.y >= character.initialY) {
            character.y = character.initialY;
            character.velocityY = 0;
            character.isJumping = false;
            gameState.isJumping = false;
        }
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

// updateObstacles 함수 수정
function updateObstacles(currentTime) {
    // 게임 시작 후 3초 지연
    if (!gameState.firstObstacleSpawned) {
        if (currentTime - gameState.gameStartTime < 3000) {  // 3000ms = 3초
            return;  // 3초 동안은 장애물 생성하지 않음
        } else {
            gameState.firstObstacleSpawned = true;
            lastObstacleTime = currentTime;  // 첫 장애물 생성 시간 설정
        }
    }

    // 새로운 장애물 생성
    if (currentTime - lastObstacleTime > stageSettings[gameState.stage].spawnInterval) {
        createObstacle();
        lastObstacleTime = currentTime;
    }
    
    // 장애물 이동 및 그리기
    obstacles.forEach((obstacle, index) => {
        obstacle.x -= obstacle.speed;
        
        // 장애물이 화면을 벗어나면 제거
        if (obstacle.x + obstacle.width < 0) {
            obstacles.splice(index, 1);
            gameState.score += 10;
        }
        
        // 장애물 이미지 그리기
        if (obstacle.image && obstacle.image.complete) {
            gameCtx.drawImage(
                obstacle.image,
                obstacle.x,
                obstacle.y,
                obstacle.width,
                obstacle.height
            );
            
            // 디버그 모드일 때 히트박스 표시
            if (DEBUG_MODE) {
                gameCtx.strokeStyle = 'red';
                gameCtx.strokeRect(
                    obstacle.x,
                    obstacle.y,
                    obstacle.width,
                    obstacle.height
                );
            }
        }
    });

    // 디버그 모드일 때 첫 장애물 생성 시간 표시
    if (DEBUG_MODE && !gameState.firstObstacleSpawned) {
        const remainingTime = ((3000 - (currentTime - gameState.gameStartTime)) / 1000).toFixed(1);
        console.log(`첫 장애물 생성까지 남은 시간: ${remainingTime}초`);
    }
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
            x: obstacle.x + 10,      // 히트박스 여백 조정
            y: obstacle.y + 5,       // 히트박스 여백 조정
            width: obstacle.width - 20,  // 히트박스 크기 조정
            height: obstacle.height - 10  // 히트박스 크기 조정
        };

        // 디버그 모드 히트박스 표시
        if (DEBUG_MODE) {
            gameCtx.strokeStyle = 'yellow';
            gameCtx.strokeRect(characterHitbox.x, characterHitbox.y, characterHitbox.width, characterHitbox.height);
            gameCtx.strokeStyle = 'red';
            gameCtx.strokeRect(obstacleHitbox.x, obstacleHitbox.y, obstacleHitbox.width, obstacleHitbox.height);
        }

        // 충돌 감지
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
                console.log("장애물 위 착지"); // 디버깅용
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
    gameState.firstObstacleSpawned = false;  // 첫 장애물 생성 상 초기화
    gameState.gameStartTime = performance.now();  // 새로운 스테이지 시작 시간 설정
    obstacles = [];
    
    // 보너스 점수 계산 수정
    const timeBonus = Math.floor(gameState.timeLeft * 10);
    const speedBonus = Math.floor(gameState.baseSpeed * 100);
    const totalBonus = timeBonus + speedBonus;
    
    gameState.score += totalBonus;
    
    alert(`스테이지 ${gameState.stage} 클리어!\n` +
          `시간 보너스: +${timeBonus}점\n` +
          `속도 보너스: +${speedBonus}점\n` +
          `총 보너스: +${totalBonus}점\n\n` +
          `다음 스테이지 시작!`);
}

// 게임 승리
function gameWin() {
    gameStarted = false;
    alert(`축하합니다! 모든 스테이지를 클리어했습니다!\n최종 점수: ${gameState.score}`);
    location.reload();
}

// 디버그 모드 변수 추가 (개발 중에만 true로 설정)
const DEBUG_MODE = true;

