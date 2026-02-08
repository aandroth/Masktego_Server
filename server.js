const Websocket = require('ws');
const m_port = 5000;
const wss = new Websocket.Server({ port: m_port });
const args = require('minimist')(process.argv.slice(2));
const SERVER_NAME = args['serverName'];

const UPDATE_INTERVAL_TIME = 20;
const NO_PLAYER_TIME_OUT = 60 * 1000;
const NUMBER_OF_PLAYER_SLOTS = 4;

const RAT_CATCHING_GAME_TIME = 120.0;
const TRAP_MAKING_GAME_TIME = 120.0;
const HALLWAY_GAME_TIME = 120.0;
const GOLEM_GAME_TIME = 120.0;

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
let m_serverState = SERVER_STATE.NOT_PLAYING;
let m_gameState = GAME_STATE.NOT_PLAYING;


let m_boardCells = [
    "1", "2", "0", "-2", "-1",
    "3", "1", "8", "-1", "-3",
    "7", "9", "0", "-9", "-7",
    "3", "1", "8", "-1", "-3",
    "1", "2", "0", "-2", "-1"];


console.log("Server " + SERVER_NAME + " has started on port " + m_port);

wss.on('connection', ws => {
    console.log(`Client connected!`);
    var id = -1;
    if (m_orangePlayer == -1) {
        m_orangePlayer = 1;
        id = 0;
    }
    else if (m_purplePlayer == -1) {
        m_purplePlayer = 2;
        id = 1;
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
            else if (listedData[0] == "Player_1_Moved") {
                HandleMessage_Player_1_Moved(listedData, stringData);
            }
            else if (listedData[0] == "Player_2_Moved") {
                HandleMessage_Player_2_Moved(listedData, stringData);
            }
            else if (listedData[0] == "Player_Swapped") {
                HandleMessage_Player_Swapped(listedData, stringData);
            }
            else if (listedData[0] == "Player_1_Won") {
                HandleMessage_Player_1_Won(listedData, stringData, id);
            }
            else if (listedData[0] == "Player_2_Won") {
                HandleMessage_Player_2_Won(listedData, stringData, id);
            }
            else if (listedData[0] == "Player_1_Attack") {
                HandleMessage_Player_1_Attack(listedData, stringData, id);
            }
            else if (listedData[0] == "Player_2_Attack") {
                HandleMessage_Player_2_Attack(listedData, stringData, id);
            }
            else {
                console.WriteLine(`Unhandled message type: ${listedData[0]}`);
            }
        });

        ws.on("close", () => {
            console.log("Client disconnected!");
        });
    }
});

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

const HandleMessage_Player_1_Moved = (id, listedData) => {
    console.log(`Player 1 turn is over.`);
    SendMessageToAllClients("Player_2_Turn", `Player_2_Turn,${listedData[1]}`, 0);

}

const HandleMessage_Player_2_Moved = (id, listedData) => {
    console.log(`Player 2 turn is over.`);
    m_boardCells = listedData[1].split('|');
    SendMessageToAllClients("Player_Swap", `Player_Swap,${listedData}`);
}



const HandleMessage_Player_Swapped = (id, listedData) => {
    console.log(`Player ${id} has swapped.`);
    m_playerReadinessDictionary.set(id, true);

    let pos0 = { x: parseInt(listedData[1]), y: parseInt(listedData[2]) };
    let pos1 = { x: parseInt(listedData[3]), y: parseInt(listedData[4]) };
    SwapCellsOnBoard(pos0, pos1);

    if (m_playerReadinessDictionary.size == 2) {
        SendMessageToAllClients("Player_1_Turn", `Player_1_Turn,${m_boardCells}`);
        m_playerReadinessDictionary = new Map();
    }
}

function SwapCellsOnBoard(pos0, pos1){

    let temp = m_boardCells[(pos0.x * 5) + pos0.y];
    m_boardCells[(pos0.x * 5) + pos0.y] = m_boardCells[(pos1.x * 5) + pos1.y];
    m_boardCells[(pos1.x * 5) + pos1.y] = temp;
}

//let ccc = 0;
async function ServerUpdate() {

    let deltaTime = Date.now() - m_CurrGameTime;
    if (m_orangePlayer == -1 && m_purplePlayer == -1) {
        m_noPlayerCountUp += deltaTime;
        //console.log(`No players connected for ${m_noPlayerCountUp * 0.001} seconds.`);
        if (m_noPlayerCountUp >= NO_PLAYER_TIME_OUT) {
            console.log(`No players connected for ${NO_PLAYER_TIME_OUT * 0.001} seconds. Shutting down server.`);
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

m_intervalUpdateId = setInterval(() => ServerUpdate(), UPDATE_INTERVAL_TIME);
ServerUpdate();