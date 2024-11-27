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

async function predict() {
    try {
        // 포즈 추정
        const { pose, posenetOutput } = await model.estimatePose(webcam.canvas);
        // 포즈 분류
        const prediction = await model.predict(posenetOutput);

        // 각 클래스의 확률 확인 및 게임 상태 업데이트
        for (let i = 0; i < maxPredictions; i++) {
            const className = prediction[i].className;
            const probability = prediction[i].probability;

            // 레이블 컨테이너 업데이트
            labelContainer.childNodes[i].innerHTML = `${className}: ${probability.toFixed(2)}`;

            // 디버그 정보 표시
            document.getElementById('debug-info').textContent = 
                `현재 동작: ${className} (${(probability * 100).toFixed(1)}%)`;

            // 높은 확률(0.8 이상)로 인식된 포즈에 따라 게임 상태 업데이트
            if (probability > 0.8) {
                switch (className) {
                    case 'class1':
                    case 'class2':
                        // 달리기 포즈
                        gameState.isMoving = true;
                        gameState.gameSpeed = 5;
                        document.getElementById('movement-status').textContent = '이동 상태: 달리기';
                        break;
                    case 'class3':
                        // 점프 포즈
                        if (!gameState.isJumping) {
                            jump();
                            document.getElementById('movement-status').textContent = '이동 상태: 점프';
                        }
                        break;
                    case 'class4':
                        // 정지 포즈
                        gameState.isMoving = false;
                        gameState.gameSpeed = 0;
                        document.getElementById('movement-status').textContent = '이동 상태: 정지';
                        break;
                }
            }
        }

        // 포즈 스켈레톤 그리기
        drawPose(pose);
    } catch (error) {
        console.error('포즈 인식 중 오류:', error);
    }
}

function gameLoop(currentTime) {
    if (!gameStarted) return;
    
    const deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;
    
    // 캔버스 클리어
    gameCtx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
    
    // 배경 그리기
    drawBackground();
    
    // 캐릭터 상태 업데이트
    if (gameState.isMoving) {
        // 달리기 애니메이션 및 이동 처리
        character.x += gameState.gameSpeed;
        if (character.x > gameCanvas.width - character.width) {
            character.x = gameCanvas.width - character.width;
        }
    }
    
    // 캐릭터 그리기
    drawCharacter();
    
    // 장애물 업데이트 및 그리기
    updateObstacles(deltaTime);
    
    // 타이머 업데이트
    timer -= deltaTime;
    if (timer <= 0) {
        gameOver();
        return;
    }
    
    // 게임 정보 업데이트
    updateGameInfo();
    
    // 다음 프레임 요청
    requestAnimationFrame(gameLoop);
}

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

// 게임 상태 초기화
const gameState = {
    isMoving: false,
    gameSpeed: 0,
    isJumping: false,
    score: 0,
    stage: 1
};

// 캐릭터 초기 설정
const character = {
    x: 50,                    // 왼쪽 여백
    y: 300,                   // 바닥 기준 위치
    width: 50,
    height: 50,
    jumpHeight: 150,         // 점프 높이
    jumpSpeed: 8,           // 점프 속도
    gravity: 0.5,           // 중력
    initialY: 300          // 초기 Y 위치 저장
};

// 게임 시작 여부와 마지막 시간 초기화
let gameStarted = false;
let lastTime = 0;
let timer = 60; // 60초 타이머

// 게임 캔버스 컨텍스트 가져오기
const gameCanvas = document.getElementById('game-canvas');
const gameCtx = gameCanvas.getContext('2d');

// 이미지 로드 함수
function loadImages() {
    const images = {
        run1: document.getElementById('character-run1'),
        run2: document.getElementById('character-run2'),
        jump: document.getElementById('character-jump'),
        idle: document.getElementById('character-idle'),
        obstacle: document.getElementById('obstacle'),
        background: document.getElementById('background')
    };
    return images;
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
        // 달리기 애니메이션을 위한 이미지 전환
        characterImage = Math.floor(Date.now() / 100) % 2 === 0 ? images.run1 : images.run2;
    } else {
        characterImage = images.idle;
    }

    // 캐릭터 이미지가 로드되었는지 확인
    if (characterImage && characterImage.complete) {
        gameCtx.drawImage(
            characterImage,
            character.x,
            character.y,
            character.width,
            character.height
        );
    }
}

// 장애물 업데이트 함수
function updateObstacles(deltaTime) {
    // 장애물 관련 로직 구현
}

// 게임 정보 업데이트 함수
function updateGameInfo() {
    document.getElementById('timer').textContent = Math.ceil(timer);
    document.getElementById('stage').textContent = `스테이지: ${gameState.stage}`;
    document.getElementById('score').textContent = `점수: ${gameState.score}`;
}

// 게임 종료 함수
function gameOver() {
    gameStarted = false;
    alert('게임 종료!');
    location.reload(); // 페이지 새로고침
}

// 점프 함수 추가
function jump() {
    if (gameState.isJumping) return;
    
    gameState.isJumping = true;
    let jumpVelocity = -character.jumpSpeed;
    
    function jumpLoop() {
        if (!gameStarted) return;

        // 중력 적용
        jumpVelocity += character.gravity;
        character.y += jumpVelocity;

        // 바닥 충돌 체크
        if (character.y >= character.initialY) {
            character.y = character.initialY;
            gameState.isJumping = false;
            jumpVelocity = 0;
            return;
        }

        requestAnimationFrame(jumpLoop);
    }

    requestAnimationFrame(jumpLoop);
}
