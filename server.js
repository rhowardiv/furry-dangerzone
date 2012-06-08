/*
 * Hi, I'm the multiplayer server.
 */

var PORT = 3939,
	io = require("/usr/lib/node_modules/socket.io").listen(PORT),
	// sockets keyed by nicknames
	clients = {},
	// times of connections, keyed by nicknames
	connect_times = {},
	boss;

io.sockets.on("connection", function (socket) {

	var socket_id;

	socket.on("hello", function (from) {
		console.log("hello from " + from);
		socket_id = from;
		socket.broadcast.emit("hello", socket_id);
		clients[socket_id] = socket;
		connect_times[socket_id] = +new Date;
		if (Object.keys(clients).length === 1) {
			// A lone client should always be boss
			setBoss(socket_id);
		}
	});
	socket.on("disconnect", function () {
		delete clients[socket_id];
		delete connect_times[socket_id];
		if (socket_id === boss) {
			pickNewBoss();
		}
	});
	socket.on("start", function () {
		socket.get("boss", function (e, is_boss) {
			// Only bosses can start the game
			socket.broadcast.emit("start");
		});
	});
	socket.on("board", function (board) {
		socket.broadcast.emit("board", board);
	});
	socket.on("win", function (from) {
		socket.broadcast.emit("win", from);
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
		oldest_time = +new Date + 1,
		oldest_id,
		i;
	
	for (i = 0; i < ids.length; i++) {
		if (connect_times[i] <= oldest_time) {
			oldest_time = connect_times[i];
			oldest_id = ids[i];
		}
	}
	if (oldest_id) {
		setBoss(oldest_id);
	}
}
