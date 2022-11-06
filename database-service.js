/*
MongoDb client setup
*/
const { MongoClient, ServerApiVersion } = require('mongodb');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const config = require(__base + 'config');

console.log("base:" + __base);
const credentials = __base + config.databaseCertPath
const client = new MongoClient(config.databaseURL, {
  sslKey: credentials,
  sslCert: credentials,
  serverApi: ServerApiVersion.v1
});
client.connect();

async function test() {
  try {
    const database = client.db("bardle");
    const collection = database.collection("accounts");
    const docCount = await collection.countDocuments({});
    console.log(docCount);
    // perform actions using client
  } finally {
    console.log("finished test()");
  }
}


async function insertNewPlayer(playerData) {
    console.log("insert new player");
    try {
      const database = client.db("bardle");
      const collection = database.collection("accounts");

      let playerId = uuidv4();

     let existingCount = await collection.countDocuments( { playerId :  playerId});

     // conflict = regen the uuid
     while(existingCount > 0) {
        console.log("player id conflict when generating - retrying")
        playerId = uuidv4();
        existingCount = await collection.countDocuments( { playerId :  playerId});
     }

     console.log("new player id is: " + playerId);

     let playerObject = {
        playerId,
        ...playerData
     }

     console.log("inserting following player: ");
     console.log(playerObject);
      const res = await collection.insertOne(playerObject);
      console.log("successful insert of new player");
      console.log(res);
     return playerObject;
      // perform actions using client
    } catch(err) {
        console.log("failed to insert new player: " + err);
        return undefined;
    } finally {
      // Ensures that the client will close when you finish/error
      console.log("finished insert new player");
    }
  }

  async function getPlayerById(playerId) {
    console.log("getPlayerById() - start: " + playerId);
    try {
      const database = client.db("bardle");
      const collection = database.collection("accounts");

     console.log("searching for player id: " + playerId);

      const result = await collection.findOne( {playerId: playerId});
      console.log("successful fetch of player data");
      console.log(result);
      return result;

    } catch(err)  {
        console.log("failed to fetch player by id: " + err);
        return undefined;
    } finally {
      console.log("getPlayerById() - end: " + playerId);
    }
  }

  async function getPlayerByEmail(email) {
    console.log("getPlayerByEmail() - start: " + email);

    if(!email) {
      console.log("no email given");
      return undefined;
    }
    
    try {
      const database = client.db("bardle");
      const collection = database.collection("accounts");

     console.log("searching for player email: " + email);

      const result = await collection.findOne( {email: email});
      console.log("successful fetch of player data");
      console.log(result);
      return result;

    } catch(err)  {
        console.log("failed to fetch player by email: " + err);
        return undefined;
    } finally {
      console.log("getPlayerByEmail() - end: " + email);
    }
  }

  async function updatePlayerById(playerId, fieldName, newValue) {
    console.log("updatePlayerById() - start: " + playerId + "," + fieldName + "," + newValue);
    try {
      const database = client.db("bardle");
      const collection = database.collection("accounts");

     console.log("updating for player id: " + playerId);
      const result = await collection.updateOne( {playerId: playerId}, {$set: {[fieldName]: newValue}});
      console.log("successful update of player data");
      console.log(result);
      return result["modifiedCount"] > 0;

    } catch(err) {
        console.log(err)
        console.log("failed to update player by id: " + err);
        return undefined;
    } finally {
      console.log("updatePlayerById() - end: " + playerId);
    }
  }

  // probably dont need to close the db connection unless server restarts
  function closeConnection() {
    client.close();
  }


module.exports = {
    test,
    closeConnection,
    insertNewPlayer,
    getPlayerById,
    getPlayerByEmail,
    updatePlayerById
};