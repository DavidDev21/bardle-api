const sio = require('socket.io');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

let io = null;

// generate word list
let wordList = ["bobob","chick", "popop"]
const gameManager = require('./GameManager');
const db = require("./database-service");
const { request } = require('https');
const e = require('cors');


// keep a map of player to the rooms they are supposedly in. used in clean up operations
// socket id -> data (since we get socket d when disconnect event happens). This is for when socket is disconnected via tab rather than graceful leave room.
const socketToPlayerRooms = new Map(); // socketId -> [[roomId,playerId]]

const wordListMap = new Map();
initWordLists(wordListMap);

// bcrypt properties
const saltRounds = 10;

console.log(gameManager);
module.exports = {
    //Initialize the socket server
    initialize: function(httpServer) {
        io = sio(httpServer, {
            cors: {
              origin: "http://localhost:4200",
              methods: ["GET", "POST"]
            }
          });

        //   async function runner() {
        //     await db.test();

        //     await db.insertNewPlayer({
        //       "playerName": "McDonut",
        //       "stats" : {
        //           "gamesPlayed": 0,
        //           "wordsGuessedCorrect": 0,
        //           "wordsGuessedWrong": 0,
        //           "averagePlacement": 0
        //       }
        //   });
  
        //   await db.getPlayerById("e317eeda-5fssba-4269-8a16-853f1709ee3e")
  
        //   await db.updatePlayerById("e317eeda-5fba-4269-8a16-853f1709ee3e", "playerName", "Yeah?");
        //   }

        //   runner();

        io.on('connection', function(socket) {
            console.log('New client connected with id = ', socket.id);

            // with a guest player, their playerId is the same as socket Id
            let guestPlayer = {
                "playerId": uuidv4(),
                "playerName": "Guest",
                "email" : "",
                "password" : "",
                "stats" : {
                    "gamesPlayed": 0,
                    "wordsGuessedCorrect": 0,
                    "wordsGuessedWrong": 0,
                    "averagePlacement": 0
                }
            }

            console.log("JSON.stringify({playerId: socket.id}): " + JSON.stringify(guestPlayer));
            socket.emit("playerDataFeed", JSON.stringify(guestPlayer));
            socket.on('disconnect', function(reason) {
                console.log('A client disconnected with id = ', socket.id, " reason ==> ", reason);
                // need a reference from scoket to rooms to remove the player from all the rooms.
                const cleanList = socketToPlayerRooms.get(socket.id);
                console.log("executing cleanup for socket id. cleanList: " + cleanList);
                if(socketToPlayerRooms.has(socket.id) && cleanList !== undefined) {
                    for (let i = 0; i < cleanList.length; i++) {
                        console.log(cleanList[i]);
                        const roomId = cleanList[i][0];
                        const playerId = cleanList[i][1];
                        let roomData = gameManager.getGameRoom(roomId);
                        // decrease player count in lobby
                        if(roomData !== undefined && roomData["gameStatus"] !== "IN-PROGRESS") {
                            console.log("player leaving");
                            console.log("decreasing player count in lobby")
                            roomData["numPlayers"] = roomData["numPlayers"] - 1; // move this to removeGameRoomDataByPlayer()
                            gameManager.updateGameRoom(roomId, roomData);

                            /*
                            we must kick for the players that left mid game for them at the end of the game since they no longer have the option to do so themselves
                            otherwise, we have dangling players that stay in the room
                            */
                            gameManager.kickPlayersByStatus(roomId, ["LEFT-MIDGAME"]); 
                            roomData = gameManager.removeGameRoomDataByPlayer(roomId, playerId);
                        } else if(roomData !== undefined && roomData["gameStatus"] === "IN-PROGRESS") { // kill the player effectively. but status is marked with a reason
                            console.log("player leaving mid-game");
                            let playerBoard = gameManager.getGameRoomDataByPlayer(roomId, playerId);
                            playerBoard["health"] = 0;
                            playerBoard["playerStatus"] = "LEFT-MIDGAME";
                            roomData = gameManager.setGameRoomDataByPlayer(roomId, playerId, playerBoard);
                        }

                        // need to handle case where everyone left mid game via the closing window

                        socket.to(roomId).emit('lobbyLeave', JSON.stringify({roomId, roomData}, mapAwareReplacer));
                    }
                    socketToPlayerRooms.delete(socket.id);
                }
            });

            // defining socket event listeners
            socket.on('createSingleGame', (s) => {
                console.log("got event")
                console.log(s);

                socket.emit("singleGameCreated", {wordList: ["bobob", "chick"]});
            });

            /*
            lobbyConfig = {
      numberWords: 10,
      wordLength: 5,
      numTries: 6,
      maxPlayerCount: 1
    }
            */
            socket.on('createLobby', (requestBody) => {
                
                let roomId = makeid(6);
                console.log("creating lobby: " + roomId + ", socket: " + socket.id, "player id: " + requestBody["playerData"]["playerId"]);

                // create if game id has already been made. if so, retry. if still failed, then fail the request.
                socket.join(roomId);
                console.log(socket.rooms);


                let boardData = new Map();
                let {lobbyConfig,playerData} = requestBody;
                let playerId = playerData["playerId"];
                let letterStates = gameManager.initLetterStates(lobbyConfig["numTries"], lobbyConfig["wordLength"]);
                boardData.set(playerId, { 
                    playerId: playerId,
                    currentWordIndex: -1, 
                    currentNumTries: 0, 
                    health: 100, 
                    isLobbyHost: true, 
                    letterStates: letterStates, 
                    playerStatus: "NOT_READY", 
                    placement: 0,
                    numCorrectGuess: 0,
                    playerData: playerData
                });
                console.log(boardData);
                let roomData = {
                    roomId: roomId,
                    gameStatus: "PENDING_START",
                    config: lobbyConfig, 
                    boardData: boardData,
                    wordList: undefined,
                    numPlayers: 1
                };

                findAndAppendMap(socketToPlayerRooms, socket.id, [roomId, playerId]);
                console.log(JSON.stringify(gameManager.GameRoomData, mapAwareReplacer));
                gameManager.setGameRoom(roomId, roomData);
                console.log("player created lobby: " +  JSON.stringify({roomId, roomData}, mapAwareReplacer));

                socket.emit('lobbyCreated', JSON.stringify({roomId, roomData}, mapAwareReplacer));
            });

            socket.on('joinLobby', (requestBody) => {
                
                let {roomId,playerData} = requestBody;
                
                let playerId = playerData["playerId"]
                console.log("joinLobby event: " + roomId + ", socket: " + socket.id + ", playerId:" + playerId);
                let roomData = gameManager.getGameRoom(roomId);
                console.log(roomData);
                if(roomData !== undefined && roomData.config !== undefined && roomData.boardData.size < roomData.config["maxPlayerCount"]) {
                    socket.join(roomId);
                    console.log(socket.rooms);
                    console.log(io.sockets.adapter.rooms.get(roomId)); // shows what socket ids are in given roomId

                    // increase player count in lobby
                    if(roomData["gameStatus"] !== "IN-PROGRESS") {
                        console.log("player joined. increasing player count");
                        roomData["numPlayers"] = roomData["numPlayers"] + 1; // move this to setGameRoomDataByPlayer
                        gameManager.updateGameRoom(roomId, roomData);
                    }

                    let letterStates = gameManager.initLetterStates(roomData.config["numTries"], roomData.config["wordLength"]);

                    // insert player data here into board data
                    let boardData = { 
                        playerId: playerId,
                        currentWordIndex: -1, 
                        currentNumTries: 0, 
                        health: 100, 
                        isLobbyHost: false, 
                        letterStates: letterStates, 
                        playerStatus: "NOT_READY", 
                        placement: 0,
                        numCorrectGuess: 0,
                        playerData: playerData
                    };
                    findAndAppendMap(socketToPlayerRooms, socket.id, [roomId, playerId]);
                    roomData = gameManager.setGameRoomDataByPlayer(roomId, playerId, boardData);
                    console.log("player joined lobby: " +  JSON.stringify({roomId, roomData}, mapAwareReplacer));

                    socket.to(roomId).emit('lobbyJoined', JSON.stringify({roomId, roomData}, mapAwareReplacer));    
                    socket.emit('lobbyJoined', JSON.stringify({roomId, roomData}, mapAwareReplacer));
                } else {
                    console.log("Failed to join lobby - " + roomId);
                    socket.emit('lobbyJoined', undefined);// represents a fail join
                }
            });

            socket.on('leaveLobby', (requestBody) => {
                let {roomId,playerData} = requestBody;
                let playerId = playerData["playerId"];

                console.log("leaveLobby event: " + roomId + ", socket: " + socket.id + ", playerId: " + playerId);
                let roomData = gameManager.getGameRoom(roomId);
                console.log(roomData);

                if(roomData !== undefined) {
                    socket.leave(roomId);
                    console.log(socket.rooms);
                    console.log(io.sockets.adapter.rooms.get(roomId)); // shows what socket ids are in given roomId
                    
                    // decrease player count in lobby
                    if(roomData["gameStatus"] !== "IN-PROGRESS") {
                        console.log("decreasing player count in lobby")
                        roomData["numPlayers"] = roomData["numPlayers"] - 1; // move this to removeGameRoomDataByPlayer()
                        gameManager.updateGameRoom(roomId, roomData);

                        /*
                        we must kick for the players that left mid game for them at the end of the game since they no longer have the option to do so themselves
                        otherwise, we have dangling players that stay in the room
                        */
                        gameManager.kickPlayersByStatus(roomId, ["LEFT-MIDGAME"]); 
                        roomData = gameManager.removeGameRoomDataByPlayer(roomId, playerId);
                    } else if(roomData["gameStatus"] === "IN-PROGRESS") { // kill the player effectively. but status is marked with a reason
                        let playerBoard = gameManager.getGameRoomDataByPlayer(roomId, playerId);
                        playerBoard["health"] = 0;
                        playerBoard["playerStatus"] = "LEFT-MIDGAME";
                        roomData = gameManager.setGameRoomDataByPlayer(roomId, playerId, playerBoard);
                    }
                    /*
                        mark person who leaves mid game with different status
                        create a new event for rematch
                        on first player who clicks rematch, pune board for any players that left mid game
                        - this will allow us to show the board and placement of those who left mid game and also kick them correctly on rematch
                    */
                    // roomData = gameManager.removeGameRoomDataByPlayer(roomId, playerId);

                    console.log("player left lobby: " + JSON.stringify({roomId, roomData}, mapAwareReplacer));

                    socket.to(roomId).emit('lobbyLeave', JSON.stringify({roomId, roomData}, mapAwareReplacer));    
                    socket.emit('lobbyLeave', JSON.stringify({roomId, roomData}, mapAwareReplacer));
                } else {
                    socket.emit('lobbyLeave', undefined);// represents a fail leave
                }
            });

            socket.on('startLobby', (roomId) => {
                
                console.log("startLobby event: " + roomId + ", socket: " + socket.id);
                let roomData = gameManager.getGameRoom(roomId);
                console.log(roomData);

                if(roomData !== undefined) {
                    console.log(socket.rooms);
                    console.log(io.sockets.adapter.rooms.get(roomId)); // shows what socket ids are in given roomId
                    
                    gameManager.setGameRoomWordList(roomId, generateWordList(roomData.config["wordLength"], roomData.config["numberWords"]));
                    roomData = gameManager.initGameStart(roomId);
                    console.log("startLobby: " + JSON.stringify({roomId, roomData}, mapAwareReplacer));
                    
                    // initializes the game feed / server tick (1 data feed per second)
                    let serverTicker = setInterval(() => {
                        console.log("rooMid from tick: " + roomId);
                        gameManager.serverTick(roomId);
                        if(gameManager.isGameOver(roomId) === true) {
                            clearInterval(serverTicker);
                        }
                        console.log('emitting from - ' + socket.id);
                        socket.to(roomId).emit('gameDataFeed', JSON.stringify({roomId, roomData}, mapAwareReplacer));  // emits to room
                        socket.emit('gameDataFeed', JSON.stringify({roomId, roomData}, mapAwareReplacer));  // emits to self
                    }, 1000);

                    socket.to(roomId).emit('gameDataFeed', JSON.stringify({roomId, roomData}, mapAwareReplacer));    
                    socket.emit('gameDataFeed', JSON.stringify({roomId, roomData}, mapAwareReplacer));
                } else {
                    socket.emit('gameDataFeed', undefined);// represents a fail leave
                }
            });

            socket.on('validateGuess', (guessData) => {
                /*
                    few things needed to valdiate a guess:
                    1. roomId to find the room to update current board state and find list of word
                    2. socket id - for this player // player id
                    3. the actual guess
                */

                console.log(guessData);
                guessWord = {}
            });

            socket.on("submitLetterStates", (data) => {
                let {roomId, playerData, letterStates, targetRow} = data;
            
                let roomData = gameManager.updateLetterStates(roomId, playerData["playerId"], targetRow, letterStates);

                socket.emit('gameDataFeed', JSON.stringify({roomId, roomData}, mapAwareReplacer));
            });

            socket.on("fetchNextWord", (data) => {
                let {roomId, playerData, isCorrectGuess} = data;
                
                let roomData = gameManager.fetchNextWordByPlayer(roomId, playerData["playerId"], isCorrectGuess);

                socket.emit('gameDataFeed', JSON.stringify({roomId, roomData}, mapAwareReplacer));
            });

            socket.on("kickPlayer", (data) => {
                let {roomId, playerId} = data;

                const roomData = gameManager.removeGameRoomDataByPlayer(roomId, playerId); // roomid, playerid
                socket.to(roomId).emit('lobbyLeave', JSON.stringify({roomId, roomData}, mapAwareReplacer));
                socket.emit('lobbyLeave', JSON.stringify({roomId, roomData}, mapAwareReplacer));
            });

            socket.on("changeLobbyConfig", (data) => {
                console.log("changeLobbyConfig event triggered");
                let {roomId, lobbyConfig} = data;
                let roomData = gameManager.getGameRoom(roomId);

                if(roomData !== undefined && roomData.boardData !== undefined && roomData.boardData.size < lobbyConfig["maxPlayerCount"]) {
                    gameManager.setGameRoomConfig(roomId, lobbyConfig);
                    roomData = gameManager.getGameRoom(roomId);
                    socket.to(roomId).emit('changeLobbyConfig', JSON.stringify({roomId, roomData}, mapAwareReplacer));
                    socket.emit('changeLobbyConfig', JSON.stringify({roomId, roomData}, mapAwareReplacer));
                } else {
                    console.log("changeLobbyConfig event failed - no room / too many players for new config");
                    socket.to(roomId).emit('changeLobbyConfig', undefined);
                    socket.emit('changeLobbyConfig', undefined);// represents a config update due to player size
                }
            });

            socket.on("changePlayerStatus", (data) => {
                console.log("changePlayerStatus event triggered");
                let {roomId, playerId, status} = data;
                let playerData = gameManager.getGameRoomDataByPlayer(roomId, playerId);

                if(playerData !== undefined) {
                    playerData["playerStatus"] = status;
                    gameManager.getGameRoomDataByPlayer(roomId, playerId, playerData);
                    let roomData = gameManager.getGameRoom(roomId);
                    socket.to(roomId).emit('roomDataFeed', JSON.stringify({roomId, roomData}, mapAwareReplacer));
                    socket.emit('roomDataFeed', JSON.stringify({roomId, roomData}, mapAwareReplacer));
                } else {
                    console.log("changePlayerStatus event failed - no room / too many players for new config");
                    socket.to(roomId).emit('roomDataFeed', undefined);
                    socket.emit('roomDataFeed', undefined);// represents a config update due to player size
                }
            });

            socket.on("rematch", (data) => {
                console.log("rematch event triggered");
                let {roomId, playerId} = data;
                let playerData = gameManager.getGameRoomDataByPlayer(roomId, playerId);

                if(playerData != undefined) {
                    playerData["playerStatus"] = "NOT_READY";
                    gameManager.getGameRoomDataByPlayer(roomId, playerId, playerData);
                    let roomData = gameManager.kickPlayersByStatus(roomId, ["LEFT-MIDGAME"]);
                    socket.to(roomId).emit('roomDataFeed', JSON.stringify({roomId, roomData}, mapAwareReplacer));
                    socket.emit('roomDataFeed', JSON.stringify({roomId, roomData}, mapAwareReplacer));
                } else {
                    console.log("rematch event failed - no room / too many players for new config");
                    socket.to(roomId).emit('roomDataFeed', undefined);
                    socket.emit('roomDataFeed', undefined);// represents a config update due to player size
                }
            });


            // ideally, server searches for any public lobbies that are open and then return the info back to the user
            // should be almost same info as join lobby event (not tested == TDB)
            socket.on("findPublicGame", (data) => {
                console.log("changePlayerStatus event triggered");
                let {roomId, playerId, status} = data;
                let playerData = gameManager.getGameRoomDataByPlayer(roomId, playerId);

                if(playerData !== undefined) {
                    playerData["playerStatus"] = status;
                    gameManager.getGameRoomDataByPlayer(roomId, playerId, playerData);
                    let roomData = gameManager.getGameRoom(roomId);
                    socket.to(roomId).emit('roomDataFeed', JSON.stringify({roomId, roomData}, mapAwareReplacer));
                    socket.emit('roomDataFeed', JSON.stringify({roomId, roomData}, mapAwareReplacer));
                } else {
                    console.log("changePlayerStatus event failed - no room / too many players for new config");
                    socket.to(roomId).emit('roomDataFeed', undefined);
                    socket.emit('roomDataFeed', undefined);// represents a config update due to player size
                }
            });

            /*
            data = {
                playerName: string,
                email: string,
                password: string (will encrypt on this side)
            }
            */
            socket.on("registerPlayer", (data) => {
                console.log("registerPlayer event triggered");
                let {playerName, email, password} = data;

                const safePassword = hashPassword(password, saltRounds);

                let playerObj = {
                    playerName,
                    email,
                    password: safePassword,
                    stats : {
                        gamesPlayed: 0,
                        wordsGuessedCorrect: 0,
                        wordsGuessedWrong: 0,
                        averagePlacement: 0
                    }
                };
                let newPlayer = undefined;

                if(db.getPlayerByEmail(email)) {
                    console.log("player already exist");
                } else {
                    newPlayer = db.insertNewPlayer(playerObj);
                }

                console.log("returning new player info to user");
                console.log(newPlayer);
                socket.io.emit("playerDataFeed", newPlayer);
            });

            /*
            data = {
                email: string,
                password: string (what the user typed in)
            }
            */
            socket.on("loginPlayer", async (data) => {
                console.log("loginPlayer event triggered");
                let {email, password} = data;

                const playerInfo = await db.getPlayerByEmail(email);

                if(playerInfo) {
                    const isValidPassword = checkPassword(playerInfo["password"], password);

                    if(isValidPassword) {
                        console.log("user password is valid")
                        socket.io.emit("playerDataFeed" , playerInfo); // give new data info for player
                        socket.io.emit("playerLogin" , true);
                    }
                }
                socket.io.emit("playerLogin", false);
            });
        });


    },

    //return the io instance
    getInstance: function() {
        if(io === null) {
            console.log("io socket is not initialized. check logs");
        }
        return io;
    }
}

function makeid(length) {
    var result           = '';
    var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    var charactersLength = characters.length;
    for ( var i = 0; i < length; i++ ) {
      result += characters.charAt(Math.floor(Math.random() * 
 charactersLength));
   }
   return result;
}

function initWordLists(wordMap) {

    for (let wordLen = 4; wordLen < 7; wordLen++) {
        try {
            const txtPath =path.join(__dirname, 'public/wordlist/wordlist-'+wordLen+".txt");
    
            let lines = fs.readFileSync(txtPath, "utf8");
            wordMap.set(wordLen, lines.split("\r\n"));
        } catch(e) {
            console.log("failed to init word list of length: " + wordLen);
            console.log("error is: " + e);
        }
    }
}

function generateWordList(wordLen, numberOfWords) { // preload the word list on app startup
    // TODO: generate lst of word based on parameters
    let list = wordListMap.get(wordLen); // list of words for given length
    let result = []
    if(list !== undefined) {
        for (let i = 0; i < numberOfWords; i++) {
            let randomChoice = Math.floor(Math.random() * list.length);
            result.push(list[randomChoice]);
        }
    }
    return result;
}

function mapAwareReplacer(key, value) {
    if (value instanceof Map && typeof value.toJSON !== "function") {
        return Object.values(Object.fromEntries(value))
    }
    return value
}

function findAndAppendMap(map, key, value) {
    if(map instanceof Map) {
        let mapVal = map.get(key);
        if(mapVal === undefined) {
            map.set(key, [value]);
        } else if(mapVal instanceof Array) {
            mapVal.push(value);
        }
    }
    console.log("HELLLASDPASDPASDPASPD")
    printJson("socket map: " , map);
}

function printJson(message, data) {
    console.log(message + JSON.stringify(data, mapAwareReplacer));
}

function hashPassword(password, saltRounds) {
    bcrypt.hash(password, saltRounds, function(err, hash) {
        if(err) {
            console.log("err while hashing password: " + err);
            return undefined;
        }
        console.log("new password hash: " + hash)
        return hash;
    });
}

function checkPassword(plainPassword, passwordHash) {
    bcrypt.compare(plainPassword, passwordHash, function(err, result) {
        if(err) {
            console.log("err while checking password hash: " + err);
            return undefined;
        }
        console.log("isValidPassword: " + result)
        return result;
    });
}