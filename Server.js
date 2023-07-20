const WebSocket = require('ws')
const wss= new WebSocket.Server({ port: 80 },()=>{
    console.log('서버 시작')
})

// 유저 아이디 발급을 위한 카운트 변수
let cnt = 0;
// 게임 대기 큐 - 최대 길이 : 2, 2명 매치 시 게임 시작
let queue = [];
// 유저 목록, userId를 인덱스로 접근
let users = [0];

// 소켓에 플레이어가 연결된 경우
wss.on('connection', function(ws) {
    // 유저 아이디 발급
    let userId = ++cnt;
    // 유저 목록에 유저 데이터 등록한다.
    console.log(userId + " connected");
    users.push(new UserData(ws));

    // ws.on("Msg", function(data) {
    //     console.log(data);
    //     ws.emit("MsgRes", data);
    // })
    // 유저로부터 메시지를 받은 경우
    ws.on('message', (msg) => {
        if (Buffer.isBuffer(msg)) {
            msg = msg.toString('utf8');
        }
        msg = JSON.parse(msg);
        // 게임 관련 정보
        if (msg.type == 'info') {
            // 유저가 enqueue 메시지를 보낸 경우 게임 대기 혹은 게임 시작
            console.log('info');
            if (msg.data == 'enqueue') {
                console.log('enqueue');
                // 만약 게임 중이거나, 이미 기다리고 있는 유저이면 무시
                if (users[userId].inGame || users[userId].waiting) return;
                // enqueue
                queue.push(userId);

                // 만약 큐 길이가 2이고 둘 다 유효한 플레이어이면 게임 시작하고 큐 비움
                if (queue.length == 2 && users[queue[0]] && users[queue[1]]) {
                    beginGame(queue[0], queue[1]);
                    queue = [];
                }
                // 아니면 기다린다고 유저에게 알려줌
                else {
                    users[userId].waiting = 1;
                    sendMessage(userId, 'info', 'waiting');
                }
            }
        }
        // 유저가 상대방을 쏜 경우
        else if (msg.type == 'shoot') {
            shoot(userId, users[userId].opId, parseInt(msg.data));
        }
        // 유저가 현재 자신의 위치와 총구 방향ㅡ hp을 보낸 경우
        // (빈도는 client 코드에서 설정)
        else if (msg.type == 'position') {
            sendPosition(users[userId].opId, msg.data);
        }
    })
    // 유저가 연결이 끊기면
    ws.on('close', function(msg) {
        console.log(userId + " disconnected");
        // 게임 중인 경우 유저와 opponent의 게임을 종료시킨다.
        // (게임 중이 아니면 endGame함수 내부의 동작이 무의미)
        endGame(userId, users[userId].opId);

        // 유저 목록에서 invalid 표시
        // pop하지 않은 이유는 id를 index로 접근하기 위함
        users[userId] = null;

        // 혼자 기다리고 있던 유저가 나간 경우
        if (queue.length == 1) {
            if (queue[0] == userId) {
                queue = [];
            }
        }
        // 둘이 기다리고 있던 유저 중 한 명이 나간 경우
        // 나머지 한 명만 큐에 남도록 한다.
        else if (queue.length == 2) {
            if (queue[0] == userId) {
                let tmp = queue[1];
                queue = [];
                queue.push(tmp);
            }
            if (queue[1] == userId) {
                queue.pop();
            }
        }
    })
});

// 서버 소켓이 기다리는 경우 로그 출력
wss.on('listening',()=>{
   console.log('리스닝 ...')
})

function shoot(userId, opId, damage) {
    //if (damage == 0) {
   //   sendMessage(opId, 'shot', '0');
//      return;
 //   }
    users[opId].hp -= damage;
    if (users[opId].hp <= 0) {
        users[opId.hp] = 0;
        sendMessage(opId, 'myHP', users[opId].hp);
        sendMessage(userId, 'opHP', users[opId].hp);
        endGame(opId, userId);
    }
    else {
        sendMessage(opId, 'myHP', users[opId].hp);
        sendMessage(userId, 'opHP', users[opId].hp);
    }
}

// 웹 소켓이 연결된 경우 users에 넣을 유저 데이터 생성자
function UserData(ws) {
    this.ws = ws;
    this.hp = 100;
    this.position = (0, 0, 0);
    this.rotation = (0, 0, 0);
    this.opId = 0;
    this.inGame = 0;
    this.waiting = 0;
}

// 상대방에게 위치를 그대로 전달
function sendPosition(opId, position) {
    sendMessage(opId, 'position', position);
}

// id에 해당하는 유저에게 type, data를 json형식으로 보내는 함수
function sendMessage(id, type, data) {
    if (id == 0) return;
    users[id].ws.send(JSON.stringify(new SocketMessage(type, data)));
}

// 소켓 메시지 생성자 - json 형식을 반환
function SocketMessage(type, data) {
    this.type = type;
    this.data = data;
}

// queue에 있던 두 플레이어의 게임을 시작하는 함수
function beginGame(id1, id2) {
    users[id1].opId = id2;
    users[id2].opId = id1;

    users[id1].inGame = 1;
    users[id2].inGame = 1;

    users[id1].waiting = 0;
    users[id2].waiting = 0;

    console.log('beginGame ' + id1 + ' ' + id2);

    sendMessage(id1, 'info', 'start');
    sendMessage(id2, 'info', 'start');
}

// shoot 후 상대방의 hp <= 0이 되면 게임이 끝났음을 알림
function endGame(loser, winner) {
    console.log('end game ' + loser + ' ' + winner);
    sendMessage(loser, 'info', 'lose');
    sendMessage(winner, 'info', 'win');
    users[winner] = new UserData(users[winner].ws);
    users[loser] = new UserData(users[loser].ws);
}
