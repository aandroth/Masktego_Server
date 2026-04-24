const Websocket = require('ws');
const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'pems');
const https = require('https');
const { Console } = require('console');
const m_port = 5000;
const args = require('minimist')(process.argv.slice(2));
const SERVER_NAME = args['serverName'];
let CERT = "";
let PRIV = "";
if (args['cert'] != "file") {
    CERT = "-----BEGIN CERTIFICATE----- \n" + args['cert'] + " \n-----END CERTIFICATE-----";
    PRIV = "-----BEGIN PRIVATE KEY----- \n" + args['priv'] + " \n-----END PRIVATE KEY-----";
}
else {
    CERT = fs.readFileSync(path.join(filePath, 'cert.pem')).toString();
    PRIV = fs.readFileSync(path.join(filePath, 'privkey.pem')).toString();
}

const UPDATE_INTERVAL_TIME = 20;
const NO_PLAYER_TIME_OUT = 120 * 1000;

var m_orangePlayer = -1;
var m_purplePlayer = -1;

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


 const serverOptions = {
    cert: CERT,
     key: PRIV
};

const m_allowedOrigins = [
    'https://aquinsgreatgames.com',
    'http://localhost:61114', // For local development
    'https://localhost' // For local development
];


console.log("Server " + SERVER_NAME + " has started on port " + m_port);
//console.log("With cert:");
//console.log(CERT);
//console.log(" And priv: ");
//console.log(PRIV);

// Create HTTPS server to handle upgrade requests
const server = https.createServer(serverOptions, (req, res) => {
    // Handle CORS preflight for polling fallback
    console.log("req.headers.referer : " + req.headers.referer);
    console.log("info.origin: " + info.origin);
    if (req.method === 'OPTIONS') {
        const origin = req.headers.origin;
        console.log(`Received OPTIONS request from origin: ${origin}`);
        if (m_allowedOrigins.includes(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            res.setHeader('Access-Control-Allow-Credentials', 'true');

            res.writeHead(204);
            res.end("This is the Masktego Server!");
            return;
        }
        else {
            console.log(`Received OPTIONS request with undefined origin. Allowing for local development.`);
            res.writeHead(404);
            res.end("Origin is undefined");
            return;
        }
    }

    
    console.log("req.method === OPTIONS results as false");
    res.writeHead(404);
    res.end("Options failed");
});

//const server = https.createServer(serverOptions, (req, res) => {
//    res.writeHead(200);
//    res.end("This is the Masktego Server!");
//});

console.log("Server created");

//const wss = new Websocket.Server({port: 5000});

const wss = new Websocket.Server({
    server: server,
    //host: '0.0.0.0',  // all
    //port: 5000,
    verifyClient: (info, callback) => {
        // For WebSocket connections, we can allow all origins since the client will handle CORS for polling fallback
        const origin = info.origin || info.req.headers.origin;

        //Check if the origin is in the allowed list
        if (m_allowedOrigins.includes(origin)) {
            console.log(`Connection from origin ${origin} ALLOWED.`);
            callback(true);
        }
        else {
            console.log(`Connection from origin ${origin} BLOCKED.`);
            callback(false, 403, 'Origin not allowed');
        }
    }
});
console.log("Websocket created");

server.listen(m_port, () => console.log("Server listening on port " + m_port));

wss.on('connection', ws => {
    console.log(`Client connected!`);
    var id = -1;
    if (m_orangePlayer == -1) {
        m_orangePlayer = 1;
        id = 1;
    }
    else if (m_purplePlayer == -1) {
        m_purplePlayer = 2;
        id = 2;
    }
    ws.id = id;

    HandleMessage_initial(ws, id);
    if (id != -1) {
        m_noPlayerCountUp = 0;

        ws.on("message", data => {
            var stringData = `${data}`;
            var listedData = stringData.split(',');
            if (listedData[0] != "Ping")
                console.log(`Received Message: ${stringData}`);

            if (listedData[0] == "Ping") {
                HandleMessage_ping(ws);
            }
            else if (listedData[0] == "Player_Swapped") {
                HandleMessage_Player_Swapped(parseInt(listedData[1]), listedData);
            }
            else if (listedData[0] == "Board_Update") {
                HandleMessage_Board_Update(parseInt(listedData[1]), stringData);
            }
            else {
                console.log(`Unhandled message type: ${listedData[0]}`);
            }
        });

        ws.on("close", () => {
            console.log("Client disconnected!");
            if (id == 1) { m_orangePlayer = -1; id = -1; }
            if (id == 2) { m_purplePlayer = -1; id = -1; }
        });
    }
});
console.log("Websocket set");

function SendMessageToClient(ws, messageAction = "", messageData = {}) {
    if (messageAction == "") {
        console.log(`Message to Client must have a type!`);
        return;
    }
    messageData.action = messageAction;
    var messageToClient = JSON.stringify(messageData);
    ws.send(messageToClient);
}
function SendMessageToAllClients(messageAction = "", messageData = {}, idOfSendingPlayer = -1) { // -1 means send to all
    if (messageAction == "") {
        console.log(`Message to Client must have a type!`);
        return;
    }
    var messageToClient = JSON.stringify(messageData);
    //console.log(`SendMessageToAllClients: ${messageToClient}`);
    wss.clients.forEach(client => { if (client.id != idOfSendingPlayer) client.send(messageToClient); });
}

const HandleMessage_initial = (ws, id) => {

    console.log(`Sending: Init,${ id }`);
    SendMessageToClient(ws, "player_init", `Init,${id}`);
}


const HandleMessage_ping = (ws) => {
    SendMessageToClient(ws, "Ping", "Ping");
}


const HandleMessage_Player_Swapped = (id, listedData) => {
//"Action, playerId, pos0.x | pos0.y, pos1.x | pos1.y
//      0,        1,               2,               3
    console.log(`Player ${id} has swapped.`);
    m_playerReadinessDictionary.set(id, true);
    SendMessageToAllClients("Board_Update", `Board_Update,${listedData[1]},${listedData[2]},${listedData[3]}`, id);

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