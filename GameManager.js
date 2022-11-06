

/*
    This should keep track of all the data for all the current live game rooms and manage all apsects

*/
class JSONAbleMap extends Map {
    toJSON() {
      return [...this.entries()]
    }
  }

// note: at some point, we convert to player id since we would use that to track all progress
// key = roomId, value = {config: {}, boardData: Map<socketId, object for tracking current board info>}
const GameRoomData = new JSONAbleMap();

function setGameRoom(roomId, newRoomData) {
    console.log(newRoomData);
    if(GameRoomData.has(roomId) === false && newRoomData !== undefined) {
        GameRoomData.set(roomId, newRoomData);

        console.log("setGameRoom() for roomId: " + roomId + " , data: " + newRoomData); 
        return true;
    }
    console.log("Fail to set room. Room either exists or data given was undefined. [" + roomId, "," + newRoomData+"]");
    return false;
}

function updateGameRoom(roomId, newRoomData) {
    console.log(newRoomData);
    if(GameRoomData.has(roomId) === true && newRoomData !== undefined) {
        GameRoomData.set(roomId, newRoomData);

        console.log("setGameRoom() for roomId: " + roomId + " , data: " + newRoomData); 
        return true;
    }
    console.log("Fail to set room. Room either doesn't exists or data given was undefined. [" + roomId, "," + newRoomData+"]");
    return false;
}


function getGameRoom(roomId) {
    if(GameRoomData.has(roomId) ) {
        console.log("getGameRoom() for roomId: " + roomId); 

        console.log("returning: " + GameRoomData.get(roomId));
        return GameRoomData.get(roomId);
    }
    console.log("getGameRoom() for roomId: " + roomId + ". room does not exist"); 
    return undefined;
}

function setGameRoomConfig(roomId, config) {
    if(GameRoomData.has(roomId) && config !== undefined) {
        let data = GameRoomData.get(roomId);
        data['config'] = config;
        GameRoomData.set(roomId, data);
    }
}

function setGameRoomWordList(roomId, wordList) {
    if(GameRoomData.has(roomId) && wordList !== undefined) {
        let data = GameRoomData.get(roomId);
        data['wordList'] = wordList;
        GameRoomData.set(roomId, data);
    }
}

function getGameRoomConfig(roomId) {
    if(GameRoomData.has(roomId)) {
        let data = GameRoomData.get(roomId);
        return data['config'];
    }
}

function getGameRoomBoardData(roomId) {
    if(GameRoomData.has(roomId)) {
        let data = GameRoomData.get(roomId);
        return data['boardData'];
    }
}

function getGameRoomDataByPlayer(roomId, playerId) {
    if(GameRoomData.has(roomId)) {
        let boardData = GameRoomData.get(roomId)['boardData'];
        if(boardData !== undefined && boardData.has(playerId)) {
            return boardData.get(playerId);
        }
    }
}

function setGameRoomDataByPlayer(roomId, playerId, data) {
    if(GameRoomData.has(roomId)) {
        let boardData = GameRoomData.get(roomId)['boardData'];
        if(boardData !== undefined) {
            boardData.set(playerId, data);
            
            console.log("successfully updated board data for player \'" + playerId + "\' in room id: " + roomId);
            return getGameRoom(roomId);
        }
    }
    console.log("failed updated board data for player \'" + playerId + "\' in room id: " + roomId);
    return getGameRoom(roomId);
}

function removeGameRoomDataByPlayer(roomId, playerId) {
    console.log("removeGameRoomDataByPlayer() inputs: " + roomId, playerId);

    if(GameRoomData.has(roomId)) {
        let boardData = GameRoomData.get(roomId)['boardData'];
        if(boardData !== undefined && boardData.has(playerId)) {

            // if removing a player that was the host of the room, assign a new host at random
            const player = boardData.get(playerId);
            if(player["isLobbyHost"] === true) {
                console.log("player is a host. finding new host")
                // find a new possible host
                for(const otherPlayer of boardData.entries()) {
                    if(otherPlayer[1]["isLobbyHost"] === false) {
                        changeRoomHost(roomId, otherPlayer[0]);
                        break;
                    }
                }
            }

            // delete player from room
            boardData.delete(playerId);
            
            // delete the room since there are no longer any players in it
            if(boardData.size <= 0) {
                console.log("no players in room. Deleting room id: " + roomId);
                GameRoomData.delete(roomId);
            }
            console.log("successfully remove board data for player \'" + playerId + "\' in room id: " + roomId);
            return getGameRoom(roomId);
        }
    }
    console.log("failed remove board data for player \'" + playerId + "\' in room id: " + roomId);
    return getGameRoom(roomId);
}

function changeRoomHost(roomId, newHostPlayerId) {

    console.log("changeRoomHost() inputs: " + roomId, newHostPlayerId);

    if(GameRoomData.has(roomId)) {
        let boardData = GameRoomData.get(roomId)['boardData'];
        if(boardData !== undefined && boardData.has(newHostPlayerId)) {
            // step one: find host of this room

            let oldHost = undefined;
            for (const board of boardData.entries()) {
                const mapVal = board[1]
                if(mapVal["isLobbyHost"] === true) {
                    oldHost = mapVal;
                    break
                }
            }

            // now change the host
            oldHost["isLobbyHost"] = false;
            let newPlayerBoard = boardData.get(newHostPlayerId);
            newPlayerBoard["isLobbyHost"] = true;
            newPlayerBoard["playerStatus"] = "NOT_READY";
            console.log("successfully changed host from player \'" + oldHost["playerId"] + "\' to \'" + newHostPlayerId + "\' in room id: " + roomId);
            return getGameRoom(roomId);
        }
    }

    console.log("failed changed host from player \'" + oldHost["playerId"] + "\' to \'" + newHostPlayerId + "\' in room id: " + roomId);
    return getGameRoom(roomId);
}

function initGameStart(roomId) {

    console.log("initGameStart() inputs: " + roomId);
    let room = GameRoomData.get(roomId);
    if(GameRoomData.has(roomId) && room["wordList"].length > 0) {
        let boardData = GameRoomData.get(roomId)['boardData'];
        if(boardData !== undefined) {
            room["gameStatus"] = "IN-PROGRESS";
            for (const board of boardData.entries()) {
                const mapVal = board[1]

                // 0 out variables for player board
                mapVal["currentWordIndex"] = 0; // starts everyone with the first word
                mapVal["currentNumTries"] = 0;
                mapVal["health"] = 100;
                mapVal["playerStatus"] = "ALIVE";
                mapVal["letterStates"] = initLetterStates(room['config']['numTries'], room['config']['wordLength']);
            }

            console.log("successfully started game in room id: " + roomId);
        }
    }

    const returnVal = getGameRoom(roomId);
    console.log(returnVal);
    console.log("initGameStart returning:  " + mapToString(returnVal))
    return returnVal;
}

function updateLetterStates(roomId, playerId, targetRow, letterStates) {
    let room = GameRoomData.get(roomId);

    if(room !== undefined && GameRoomData.has(roomId)) {
        let boardData = room['boardData'];
        if(boardData !== undefined && boardData.has(playerId)) {
            let playerBoard = boardData.get(playerId);

            if(targetRow >= 0 && targetRow < playerBoard["letterStates"].length){
                playerBoard["letterStates"][targetRow] = [...letterStates];
            }

            console.log(playerBoard["currentNumTries"]);
            if(targetRow + 1 <= room["config"]["numTries"]) {
                playerBoard["currentNumTries"] = targetRow + 1; // increase try attempt
            }
            console.log("pushed letter states");
            console.log(letterStates);
            console.log(playerBoard["letterStates"]);
        }
    }
    return getGameRoom(roomId);
}


function fetchNextWordByPlayer(roomId, playerId, isCorrectGuess) {
    let room = GameRoomData.get(roomId);

    if(room !== undefined && GameRoomData.has(roomId)) {
        let boardData = room['boardData'];
        if(boardData !== undefined && boardData.has(playerId)) {
            let playerBoard = boardData.get(playerId);

            let curNumTries = playerBoard["currentNumTries"];
            let curWordIndex = playerBoard["currentWordIndex"];
            let currentHealth = playerBoard["health"];

            if( isCorrectGuess === false ){
                playerBoard["health"] = currentHealth - 20; // need to know if board has used up all guesses
                if(playerBoard["health"] <= 0) {
                    playerBoard["playerStatus"] = "DEAD";
                }
            }
            else if(isCorrectGuess === true) {
                playerBoard["health"] = currentHealth + 20;
                playerBoard["numCorrectGuess"] = playerBoard["numCorrectGuess"] + 1 // they got the correct word
            } 

            playerBoard["currentNumTries"] = 0;
            playerBoard["currentWordIndex"] = curWordIndex + 1
            playerBoard["letterStates"] = initLetterStates(room['config']['numTries'], room['config']['wordLength']);
        }

        if(isGameOver(roomId) === true) {
            room["gameStatus"] = "GAME_OVER";
            setPlayerPlacements(roomId);
        }    
    }

    return getGameRoom(roomId);
}

// to be called after each fetch attempt of a word
function isGameOver(roomId) {
    console.log("isGameOver() - inputs: " + roomId);
    let room = GameRoomData.get(roomId);
    if(room !== undefined && GameRoomData.has(roomId)) {
        let boardData = room['boardData'];
        let playersAlive = 0;
        let playersInRoom = 0;
        for (const boardVal of boardData.values()) {
            console.log(boardVal);

            if(boardVal["health"] > 0 && boardVal["playerStatus"] === "ALIVE") playersAlive++;

            if(boardVal["playerStatus"] !== "LEFT-MIDGAME") playersInRoom++;


            if(boardVal["health"] > 0 && boardVal["currentWordIndex"] >= room["wordList"].length) { // assumes one person reaches the end of the wordlist
                console.log("game is over - we have a winner");
                return true;
            }
        }

        console.log(room["numPlayers"]);

        if (playersInRoom <= 0) {
            console.log("there is no one in the room anymore. everyone left mid game");
            console.log("deleting the room");
            GameRoomData.delete(roomId);
        }

        if((room["numPlayers"] > 1 && playersAlive <= 1) || (room["numPlayers"] <= 1 && playersAlive <= 0)) {
            console.log("game is over - all players are dead / only one left");
            return true;
        }
    }

    if(room === undefined || !GameRoomData.has(roomId)) {
        console.log("game is over - room doesn't exist");
        return true;
    }

    return false;
}

function setPlayerPlacements(roomId) {
    console.log("setPlayerPlacements()");
    let room = GameRoomData.get(roomId);

    if(room !== undefined && GameRoomData.has(roomId)) {
        let boardData = room['boardData'];

        let placementOrder = [];

        for (const boardVal of boardData.values()) {
            let placeEntry = [boardVal["playerId"], boardVal["health"], boardVal["numCorrectGuess"]];
            placementOrder.push(placeEntry);
        }

        console.log("before sort: " + placementOrder);
        // sort by decending order in placement (1st place, first entry)
        placementOrder.sort((a, b) => {
            // [playerId, health, currentWordIndex]
            // if a has more or equal health than b and a is ahead by one word than b. a comes before b 
            // and has more correct guesses
            if(a[1] >= b[1] && a[2] >= b[2]) {
                return -1;
            }
            return 0; // keep order
        });
        console.log("after sort: " + placementOrder);

        // set placement per board / player
        let place = 0;
        placementOrder.forEach((entry) => {
            boardData.get(entry[0])["placement"] = place;
            let playerStatus = boardData.get(entry[0])["playerStatus"];
            console.log("stats: " + playerStatus);
            if(playerStatus !== "LEFT-MIDGAME") {
                boardData.get(entry[0])["playerStatus"] = "GAME_OVER";
            }
            place++;
        });

    }
    console.log("setPlayerPlacements - end");
    return getGameRoom(roomId);
}

// applies dot damage to players over time
// until game over
function serverTick(roomId) {
    let room = GameRoomData.get(roomId);

    if(room !== undefined && GameRoomData.has(roomId)) {
        let boardData = room['boardData'];

        const dotDamage = room["config"]["dotDamage"];
        for (const playerBoard of boardData.values()) {
            playerBoard["health"] = playerBoard["health"] - dotDamage;
            if(playerBoard["health"] <= 0 && playerBoard["playerStatus"] === "ALIVE") {
                playerBoard["playerStatus"] = "DEAD";
            }
        }

        if(isGameOver(roomId) === true) {
            room["gameStatus"] = "GAME_OVER";
            setPlayerPlacements(roomId);
        }    
    }

    return getGameRoom(roomId);
}

// will prune any players based on the given status list
function kickPlayersByStatus(roomId, statuses) {
    let room = GameRoomData.get(roomId);

    if(room !== undefined && GameRoomData.has(roomId)) {
        let boardData = room['boardData'];

        let targetIds = [];

        for (const playerBoard of boardData.values()) {
            if(statuses.includes(playerBoard["playerStatus"])) {
                targetIds.push(playerBoard["playerId"]);
            }
        }

        console.log("targeted players for removal: " + targetIds);
        for (let i = 0; i < targetIds.length; i++) {
            removeGameRoomDataByPlayer(roomId, targetIds[i]); // this handles host changes, etc
            room["numPlayers"] = room["numPlayers"] - 1; // decrease per kick
        }
    }

    return getGameRoom(roomId);
}

function getPlayerBoard(roomId, playerId) {
    let room = GameRoomData.get(roomId);

    if(room !== undefined && GameRoomData.has(roomId)) {
        let boardData = room['boardData'];
        if(boardData !== undefined && boardData.has(playerId)) {
            let playerBoard = boardData.get(playerId);
            return playerBoard;
        }
    }
    return undefined;
}


function mapAwareReplacer(key, value) {
    if (value instanceof Map && typeof value.toJSON !== "function") {
        return [...value.entries()]
    }
    return value
}
function mapToString(data) {
    return JSON.stringify(data, mapAwareReplacer);
}

function isAlpha(char) {
    return char.length === 1 && /^[A-Za-z]$/i.test(char);
  }

function getLetterFrequencies(word) {

    let result = new Map();

    if(word) {
      for(let i = 0 ; i < word.length; i++) {
        let key = word[i];
        let letterCount = result.get(key);
        
        console.log('letter: ' + letterCount);
        if(letterCount !== undefined) {
          result.set(key, letterCount + 1);
        } else {
          result.set(key, 1);
        }
      }
    }
    return result;
  }

  function initLetterStates(rowLen, colLen) {
    let letterStates = [];

    // init board
    for(let row = 0; row < rowLen; row++) { 
        let rowBoxes = [];
        for(let col = 0; col < colLen; col++) {
        rowBoxes.push({letter: "", state : 0})
        }
        letterStates.push(rowBoxes);
    }

    return letterStates;
}

module.exports = {
    setGameRoom,
    getGameRoom,
    setGameRoomConfig,
    getGameRoomConfig,
    getGameRoomBoardData,
    getGameRoomDataByPlayer,
    setGameRoomDataByPlayer,
    removeGameRoomDataByPlayer,
    changeRoomHost,
    initGameStart,
    updateLetterStates,
    fetchNextWordByPlayer,
    serverTick,
    isGameOver,
    GameRoomData,
    setGameRoomWordList,
    kickPlayersByStatus,
    updateGameRoom,
    initLetterStates
};