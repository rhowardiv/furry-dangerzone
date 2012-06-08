/*
 * Hi, I'm the multiplayer server.
 */

var PORT = 3939,
	io = require("socket.io").listen(PORT),
	clients = [];

io.sockets.on("connection", function (socket) {

	//just broadcast all received events

	socket.on("hello", function (from) {
		socket.broadcast.emit("hello", from);
	};
	socket.on("board", function (board) {
		socket.broadcast.emit("board", board);
	};
});

