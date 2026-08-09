//const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");
//const lambdaClient = new LambdaClient({ region: "us-west-2" });

const Websocket = require('ws');
const { WebSocket } = require('ws');
const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'pems');
//const https = require('https');
const http = require('http');
const { Console } = require('console');
const m_port = 5000;
const args = require('minimist')(process.argv.slice(2));
let CERT = "";
let PRIV = "";
const fetch = require('node-fetch');

const UPDATE_INTERVAL_TIME = 20;
const NO_PLAYER_TIME_OUT = 120 * 1000;

var m_orangePlayer = -1;
var m_purplePlayer = -1;

const SERVER_NAME = args['serverName'];
const WEBSOCKET_COMM_FUNC = args['websocketCommFunc'];
const CALLBACK_URL = args['callbackUrl'];
var m_orangePlayerConnectionId = args['player1'];
var m_purplePlayerConnectionId = args['player2'];

let m_noPlayerCountUp = 0.0;
let m_CurrGameTime = Date.now();
var m_playerReadinessDictionary = new Map();

const SERVER_STATE = Object.freeze({
    LEVEL_LOADING: Symbol("level_loading"),
    CHAR_CREATION: Symbol("char_creation"),
    GAME_INTRO: Symbol("game_intro"),
    GAME_READY: Symbol("game_ready"),
    GAME_PLAYING: Symbol("game_playing"),
    GAME_ENDED: Symbol("game_ended"),
    GAME_OUTRO: Symbol("game_outro")
});
const GAME_STATE = Object.freeze({
    PLAYER_1_TURN: Symbol("player_1_turn"),
    PLAYER_2_TURN: Symbol("player_2_turn"),
    PLAYER_SWAP: Symbol("player_swap"),
});


// const serverOptions = {
//    cert: CERT,
//     key: PRIV,
//     hostname: "masktego.aquinsgreatgames.com"
//};

const m_allowedOrigins = [
    'http://localhost:61114', // For local development
    'https://localhost' // For local development
];


console.log("Server " + SERVER_NAME + " has started on port " + m_port);
console.log("WEBSOCKET_COMM_FUNC: " + WEBSOCKET_COMM_FUNC);
console.log("CALLBACK_URL: " + CALLBACK_URL);
console.log("m_orangePlayerConnectionId: " + m_orangePlayerConnectionId);
console.log("m_purplePlayerConnectionId: " + m_purplePlayerConnectionId);

const server = http.createServer((req, res) => {

    console.log("req: " + req.method);

    if (req.method === 'POST') {
        let body = '';
        req.on('message', () => {
            const data = JSON.parse(body);

            var stringData = `${data}`;
            var listedData = stringData.split(',');

            if (listedData[0] != "Ping")
                console.log(`Received Message: ${stringData}`);

            if (listedData[0] == "Ping") {
                HandleMessage_ping(ws);
            }
            else if (listedData[0] == "Player_Joined") {
                HandleMessage_Player_Joined(parseInt(listedData[1]), listedData);
            }
            else if (listedData[0] == "Player_Swapped") {
                HandleMessage_Player_Swapped(parseInt(listedData[1]), listedData);
            }
            else if (listedData[0] == "Board_Update") {
                HandleMessage_Board_Update(parseInt(listedData[1]), stringData);
            }
            else if (listedData[0] == "Kill_Server") {
                HandleMessage_killGame();
            }
            else {
                console.log(`Unhandled message type: ${listedData[0]}`);
            }
        });
        req.on('end', () => {
            try {
                // Parse the raw string into a JavaScript Object
                const jsonData = JSON.parse(body);

                console.log('Received JSON:', jsonData);

                // Send a successful response back to the client
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'Data received successfully!', data: jsonData }));
            } catch (error) {
                // Handle invalid JSON payload errors
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON format' }));
            }
        });
    }
    else {
        res.writeHead(404);
        res.end("call failed");
    }
}).listen(5000, () => {
    console.log('server running on port 5000');
});

async function SendMessageToClient(clientConnectionId, messageAction = "", message = {}, playerId = -1) {
    if (messageAction == "") {
        console.log(`Message to Client must have a type!`);
        return;
    }
    messageData = {};
    messageData.route = "message";
    messageData.msgType = "gameController";
    messageData.action = messageAction;
    messageData.message = `${message},${playerId}`;

    var dataToFunction = {
        "data": messageData,
        "callbackUrl": CALLBACK_URL,
        "connectionId": clientConnectionId
    }
    
    try {
        const response = await fetch(WEBSOCKET_COMM_FUNC, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(dataToFunction),
        });

        // Always check response.ok because fetch won't reject on standard HTTP errors (like 404 or 500)
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Success:', data);
    } catch (error) {
        console.error('Error during POST request:', error);
    }
}
async function SendMessageToAllClients(messageAction = "", message = "", idOfSendingPlayer = -1) { // -1 means send to all
    if (messageAction == "") {
        console.log(`Message to Client must have a type!`);
        return;
    }

    messageData = {};
    messageData.route = "message";
    messageData.msgType = "gameController";
    messageData.action = messageAction;
    messageData.message = message;


    for (var i = 1; i <= 2; ++i) {
        if (i == idOfSendingPlayer) // We skip data sent by the player that sent it, as they already have the data.
            continue;

        messageData.message = `${message},${i}`;

        var dataToFunction = {
            "data": messageData,
            "callbackUrl": CALLBACK_URL,
            "connectionId": i == 1 ? m_orangePlayerConnectionId : m_purplePlayerConnectionId
        }

        console.log(`Sending messageAction: ${messageAction} to players with message: ${message}, to user: ${i == 1 ? m_orangePlayerConnectionId : m_purplePlayerConnectionId}`);

        try {
            const response = await fetch(WEBSOCKET_COMM_FUNC, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(dataToFunction),
            });

            // Always check response.ok because fetch won't reject on standard HTTP errors (like 404 or 500)
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Success:', data);
        } catch (error) {
            console.error('Error during POST request:', error);
        }
    }
}

const HandleMessage_initial = () => {

    console.log(`Sending: Init to players`);
    SendMessageToAllClients("Init", "2");
    //SendMessageToAllClients("Player_Join", "Player_Join"); Might need this...
}


const HandleMessage_ping = () => {
    SendMessageToAllClients("ping", "ping");
}

HandleMessage_initial();


//const HandleMessage_Player_Joined = (id, listedData) => {
////"Action, playerId, connectionId
////      0,        1,            2
//    console.log(`Player ${id} is joining.`);
//    m_playerReadinessDictionary.set(id, true);
//    if (m_orangePlayer == -1) {
//        m_orangePlayer = 1;
//        m_orangePlayerConnectionId = Number(listedData[2]);
//    }
//    else if (m_purplePlayer == -1) {
//        m_purplePlayer = 2;
//        m_purplePlayerConnectionId = Number(listedData[2]);
//    }
//    SendMessageToAllClients("Player_Join", `${id}}`);

//    if (m_playerReadinessDictionary.size == 2) {
//        SendMessageToAllClients("Player_1_Turn", "Player_1_Turn");
//        m_playerReadinessDictionary = new Map();
//    }
//}


const HandleMessage_Player_Swapped = (id, listedData) => {
//"Action, playerId, pos0.x | pos0.y, pos1.x | pos1.y
//      0,        1,               2,               3
    console.log(`Player ${id} has swapped.`);
    m_playerReadinessDictionary.set(id, true);
    let action = "Board_Update";
    let message = `${listedData[1]},${listedData[2]},${listedData[3]}`;
    SendMessageToAllClients(action, message, id);

    if (m_playerReadinessDictionary.size == 2) {
        SendMessageToAllClients("Player_1_Turn", "Player_1_Turn");
        m_playerReadinessDictionary = new Map();
    }
}

const HandleMessage_Board_Update = (id, stringData) => {
    console.log(`Player ${id} sent board update.`);

    //"Action, playerId, pos0.x | pos0.y, pos1.x | pos1.y
    //      0,        1,               2,               3
    SendMessageToAllClients("Board_Update", stringData, id);
}


//let ccc = 0;
async function ServerUpdate() {

    let deltaTime = Date.now() - m_CurrGameTime;
    m_CurrGameTime = Date.now();
    if (m_orangePlayer == -1 && m_purplePlayer == -1) {
        m_noPlayerCountUp += deltaTime;
        //console.log(`No players connected for ${m_noPlayerCountUp * 0.001} seconds.`);
        if (m_noPlayerCountUp >= NO_PLAYER_TIME_OUT) {
            console.log(`No players connected for ${m_noPlayerCountUp * 0.001} seconds. Shutting down server.`);
            process.exit();
        }
    }
}

const HandleMessage_killGame = (data) => {
    console.log(`data: ${data}`);
    console.log(`Killing game server`);
    SendMessageToAllClients("load_level", `Load_Level,0`);
    process.exit();
}

///////////////////////////////////////////////////////////////////////

//m_intervalUpdateId = setInterval(() => ServerUpdate(), UPDATE_INTERVAL_TIME);
//ServerUpdate();

//async function getData() {
//    try {
//        const response = await fetch('https://example.com');
//        if (!response.ok) {
//            throw new Error(`HTTP error! status: ${response.status}`);
//        }
//        const data = await response.json();
//        console.log(data);
//    } catch (error) {
//        console.error('Error fetching data:', error);
//    }
//}

//getData();



//const server = https.createServer(serverOptions);

//const wss = new WebSocket.Server({
//    server: server,
//    rejectUnauthorized: false
//});

//wss.on('connection', (ws) => {
//    console.log('Client connected securely!');
//    ws.on('message', (msg) => console.log(`Received: ${msg}`));
//});



//console.log("With cert:");
//console.log(CERT);
//console.log(" And priv: ");
//console.log(PRIV);


//console.log("Server created");


//const wss = new WebSocket.Server({
//    server: server,
//    //host: '0.0.0.0',  // all
//    //port: 5000,
//    verifyClient: (info, callback) => {
//        // For WebSocket connections, we can allow all origins since the client will handle CORS for polling fallback
//        const origin = info.origin || info.req.headers.origin;

//        //Check if the origin is in the allowed list
//        if (m_allowedOrigins.includes(origin)) {
//            console.log(`Connection from origin ${origin} ALLOWED.`);
//            callback(true);
//        }
//        else {
//            console.log(`Connection from origin ${origin} BLOCKED.`);
//            callback(false, 403, 'Origin not allowed');
//        }
//    }
//});
//console.log("Websocket created");


//wss.on('connection', ws => {
//    console.log(`Client connected!`);
//    var id = -1;
//    if (m_orangePlayer == -1) {
//        m_orangePlayer = 1;
//        id = 1;
//    }
//    else if (m_purplePlayer == -1) {
//        m_purplePlayer = 2;
//        id = 2;
//    }
//    ws.id = id;

//    HandleMessage_initial(ws, id);
//    if (id != -1) {
//        m_noPlayerCountUp = 0;

//        ws.on("message", data => {
//            var stringData = `${data}`;
//            var listedData = stringData.split(',');
//            if (listedData[0] != "Ping")
//                console.log(`Received Message: ${stringData}`);

//            if (listedData[0] == "Ping") {
//                HandleMessage_ping(ws);
//            }
//            else if (listedData[0] == "Player_Swapped") {
//                HandleMessage_Player_Swapped(parseInt(listedData[1]), listedData);
//            }
//            else if (listedData[0] == "Board_Update") {
//                HandleMessage_Board_Update(parseInt(listedData[1]), stringData);
//            }
//            else {
//                console.log(`Unhandled message type: ${listedData[0]}`);
//            }
//        });

//        ws.on("close", () => {
//            console.log("Client disconnected!");
//            if (id == 1) { m_orangePlayer = -1; id = -1; }
//            if (id == 2) { m_purplePlayer = -1; id = -1; }
//        });
//    }
//});
//console.log("Websocket set");

//server.listen(m_port, () => console.log("Server listening on port " + m_port));
