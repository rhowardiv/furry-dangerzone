/*
 * Hi, I'm the multiplayer server.
 * Start me with something like
 * NODE_PATH=/path/to/node_modules node server.js
 */

var PORT = 13939,
	io = require("socket.io").listen(PORT),
	// sockets keyed by nicknames
	clients = {},
	// times of connections, keyed by nicknames
	connect_times = {},
	// nickname of current boss player; only boss can start game
	boss,
	// if no one wins outright, someone will win by attrition
	attrition = {};

io.set("log level", 1);

io.sockets.on("connection", function (socket) {

	var socket_id;

	socket.on("hello", function (from) {
		var i;
		console.log("hello from " + from);
		socket_id = from;

		socket.broadcast.emit("hello", socket_id);
		clients[socket_id] = socket;
		connect_times[socket_id] = +new Date();
		if (Object.keys(clients).length === 1) {
			// A lone client should always be boss
			setBoss(socket_id);
		} else {
			for (i in clients) {
				if (i !== from) {
					// hellos are important
					socket.emit("hello", i);
				}
			}
		}
		console.log("clients " + JSON.stringify(Object.keys(clients)));
	});
	socket.on("disconnect", function () {
		delete clients[socket_id];
		delete connect_times[socket_id];
		delete attrition[socket_id];
		console.log(socket_id  + " left.");
		console.log("clients " + JSON.stringify(Object.keys(clients)));
		socket.broadcast.emit("bye", socket_id);
		if (socket_id === boss) {
			boss = null;
			pickNewBoss();
		}
		var winner = findWinnerByAttrition();
		if (winner) {
			clients[winner].broadcast.emit("lose");
			clients[winner].emit("win");
			attrition = {};
		}
	});
	socket.on("start", function () {
		socket.get("boss", function (e, is_boss) {
			if (!is_boss) {
				return;
			}
			socket.emit("start");
			socket.broadcast.emit("start");
		});
		beginAttrition();
	});
	socket.on("board", function (board) {
		socket.broadcast.emit("board", {nick: socket_id, board: board});
	});
	socket.on("win", function (from) {
		socket.broadcast.emit("lose", from);
		socket.emit("win");
		attrition = {};
	});
	socket.on("lose", function () {
		delete attrition[socket_id];
		var winner = findWinnerByAttrition();
		if (winner) {
			clients[winner].broadcast.emit("lose");
			clients[winner].emit("win");
			attrition = {};
		}
	});
});

function setBoss(socket_id) {
	clients[socket_id].set("boss", true, function () {
		if (boss) {
			// we already got a boss, nvm
		} else if (!clients.hasOwnProperty(socket_id)) {
			// hey, you went away before I could make you boss
			pickNewBoss();
		} else {
			boss = socket_id;
			clients[socket_id].emit("boss");
			console.log("Made " + socket_id + " the boss.");
		}
	});
}

function pickNewBoss() {
	var ids = Object.keys(clients),
		oldest_time = +new Date() + 1,
		oldest_id,
		i;

	console.log("Picking new boss...");

	for (i = 0; i < ids.length; i++) {
		if (connect_times[ids[i]] <= oldest_time) {
			oldest_time = connect_times[i];
			oldest_id = ids[i];
		}
	}
	if (oldest_id) {
		setBoss(oldest_id);
		console.log("New boss is " + oldest_id);
	} else {
		console.log("No new boss!");
	}
}

function beginAttrition() {
	var i;
	attrition = {};
	for (i in clients) {
		attrition[i] = true;
	}
}

function findWinnerByAttrition() {
	var k = Object.keys(attrition);
	return (k.length === 1) ? k[0] : false;
}
