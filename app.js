
global.__base = __dirname + '/';
var createError = require('http-errors');
var express = require('express');
var path = require('path');
const config = require(__base + 'config');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var cors = require('cors')
var debug = require('debug')('bardle-api:server');
var http = require('http');
const db = require("./database-service");
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
var app = express();



/**
 * Create HTTP server.
 */
var server = http.createServer(app);

// inits socket instance
require("./socket").initialize(server);

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

// routes
app.use('/', indexRouter);
app.use('/users', usersRouter);

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());
// bcrypt properties
const saltRounds = 10;

// // catch 404 and forward to error handler (no idea why this was even created, this throws 404s, which nullifies any routes u register after this point)
// app.use(function(req, res, next) {
//   next(createError(404));
// });

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});


/**
 * Get port from environment and store in Express.
 */

var port = normalizePort(process.env.PORT || '3000');
app.set('port', port);


/**
 * 
 * Accounts APIs
 */

/*
data = {
    playerName: string,
    email: string,
    password: string (will encrypt on this side)
}
*/
app.post("/registerPlayer", async (req, res) => {
  console.log("registerPlayer event triggered");

  console.log(req["body"]);
  let {playerName, email, password} = req["body"];

  if(playerName == null || playerName == undefined) {
    playerName = "Guest";
  }

  if(email == null || email == undefined || password == undefined || password == null) {
    console.log("email/password is required");
    console.log("email: " + email);
    res.status(400).send({code: 1002, message:"email/password is required"});
    return;
  }

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

  if(await db.getPlayerByEmail(email)) {
      console.log("player already exist");
      res.status(400).send({code:1001, message:"account exists"});
      return;
  } else {
      newPlayer = await db.insertNewPlayer(playerObj);
      if(newPlayer) {
        delete newPlayer.password; // user browser doesnt need to know the password
      }
  }

  console.log("returning new player info to user");
  console.log(newPlayer);
  res.send(newPlayer);
});

/*
data = {
    email: string,
    password: string (what the user typed in)
}
*/
app.post("/loginPlayer", async (req, res) => {
    console.log("loginPlayer event triggered");
    let {email, password} = req["body"];

    const playerInfo = await db.getPlayerByEmail(email);

    if(playerInfo) {
        const isValidPassword = checkPassword(password, playerInfo["password"]);
        console.log("isPasswordValid: " + isValidPassword);
        if(isValidPassword) {
            console.log("user password is valid")
            delete playerInfo.password;
            res.send(playerInfo);
            return;
        }
    }

    res.status(400).send({code:1003, message:"invalid login / player info not found for given email"});
});

/*
expectation is ui will pass player data structure with the fields it wants to update.
no update = field omitted

data =  {
      playerName,
      email,
      password: safePassword,
      stats : {
          gamesPlayed: 0,
          wordsGuessedCorrect: 0,
          wordsGuessedWrong: 0,
          averagePlacement: 0
      }
  }
*/
app.post("/updatePlayerData", async (req, res) => {
  console.log("updatePlayerData event triggered");
  let {playerData, updatedFields} = req["body"];

  const playerInfo = await db.getPlayerByEmail(playerData['email']);

  if(playerInfo) {
    // check if updated fields are the same fields in existing player info
    let existingFields = Object.keys(playerInfo);
    let targetFields = Object.keys(updatedFields);

    let difference = targetFields.filter(x => !existingFields.includes(x));

    if(difference && difference.length > 0) {
      console.log("found attempt to update invalid field. bad update. difference: " + JSON.stringify(difference));
      res.status(422).send({code:1004, message:"invalid update player request"});
      return;
    }
    let updateResult;

    for (const [key, value] of Object.entries(updatedFields)) {
      updateResult = await db.updatePlayerById(playerInfo["playerId"], key, value);
      if(updateResult === undefined) {
        console.log("failed to update field: " + key + " value: " + value);
      }
    }
    const updatedPlayerInfo = await db.getPlayerByEmail(playerData['email']);
    res.status(200).send(updatedPlayerInfo);
    return;
  }

  res.status(400).send({code:1003, message:"player info not found for given email"});
  return
});

/**
 * Listen on provided port, on all network interfaces.
 */

server.listen(port);
server.on('error', onError);
server.on('listening', onListening);
console.log("server started. listening on port: " + port);


/**
 * Normalize a port into a number, string, or false.
 */

function normalizePort(val) {
  var port = parseInt(val, 10);

  if (isNaN(port)) {
    // named pipe
    return val;
  }

  if (port >= 0) {
    // port number
    return port;
  }

  return false;
}

/**
 * Event listener for HTTP server "error" event.
 */

function onError(error) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  var bind = typeof port === 'string'
    ? 'Pipe ' + port
    : 'Port ' + port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      console.error(bind + ' requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(bind + ' is already in use');
      process.exit(1);
      break;
    default:
      throw error;
  }
}

/**
 * Event listener for HTTP server "listening" event.
 */

function onListening() {
  var addr = server.address();
  var bind = typeof addr === 'string'
    ? 'pipe ' + addr
    : 'port ' + addr.port;
  debug('Listening on ' + bind);
}

function hashPassword(password, saltRounds) {
  return bcrypt.hashSync(password, saltRounds);
}

function checkPassword(plainPassword, passwordHash) {
  return bcrypt.compareSync(plainPassword, passwordHash);
}

module.exports = app;


