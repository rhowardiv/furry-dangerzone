/*jshint laxbreak: true, loopfunc: true*/
var
	// Setup our javascript framework
	$ = function (id) { return document.getElementById(id); },

	// Game constants
	BOARD_WIDTH = 8,
	BOARD_HEIGHT = 17, // allow an extra top row for rotation
	MAX_START_HEIGHT = 13,
	NUM_COLORS = 3,
	MATCH_PENDING = NUM_COLORS * 2 + 1, // state of a matched block
	NUM_TO_MATCH = 4, // pieces in a row required for match
	DEFAULT_LOOP_DELAY = 20,
	START_MAX_IN_A_ROW = 2, // don't allow too many adjacent colors at start
	TICKS_TO_SPEEDUP = 550, // downward moves plus new pieces * 10; change to time?
	SPEEDUP_FACTOR = 0.8,
	// starting speeds (ms between drops etc.)
	SPEEDS = {
		low: 780,
		med: 620,
		high: 460
	},

	// A block's connections are stored as state in these bits
	CONNECT_TOP = 0x0100,
	CONNECT_RIGHT = 0x0200,
	CONNECT_BOTTOM = 0x0400,
	CONNECT_LEFT = 0x0800,
	// A helper number representing any connection
	CONNECTIONS = CONNECT_TOP | CONNECT_RIGHT | CONNECT_BOTTOM | CONNECT_LEFT,

	// New piece template
	NEW_PIECE = [
		// [ position, connect state[, ...] ]
		// (random color is added at generation)
		// These positions represent the middle of the second row from top.
		(BOARD_HEIGHT - 2) * BOARD_WIDTH + Math.floor(BOARD_WIDTH / 2) - 1,
		CONNECT_RIGHT,
		(BOARD_HEIGHT - 2) * BOARD_WIDTH + Math.floor(BOARD_WIDTH / 2),
		CONNECT_LEFT
	],

	// create a function that accepts a value or array
	mappable = function (fn) {
		return function (arg) {
			return Array.isArray(arg) ? arg.map(fn) : fn(arg);
		};
	},

	// How to move around the board
	go = {
		up: mappable(function (p) {
			return (BOARD_HEIGHT - Math.floor(p / BOARD_WIDTH) - 1)
			? (p + BOARD_WIDTH)
			: -1;
		}),
		right: mappable(function (p) {
			return (BOARD_WIDTH - (p % BOARD_WIDTH) - 1)
			? (p + 1)
			: -1;
		}),
		down: mappable(function (p) {
			return Math.floor(p / BOARD_WIDTH)
			? (p - BOARD_WIDTH)
			: -1;
		}),
		left: mappable(function (p) {
			return (p % BOARD_WIDTH)
			? (p - 1)
			: -1;
		}),
		rotate_left: function (ps, oriented) {
			return [
				function (ps) {
					return [
						ps[0],
						go.up(go.left(ps[1]))
					];
				},
				function (ps) {
					return [
						go.right(ps[0]),
						go.down(ps[1])
					];
				},
				function (ps) {
					return [
						go.up(go.left(ps[0])),
						ps[1]
					];
				},
				function (ps) {
					return [
						go.down(ps[0]),
						go.right(ps[1])
					];
				}
			][oriented](ps);
		},
		rotate_right: function (ps, oriented) {
			return [
				function (ps) {
					return [
						go.up(go.right(ps[0])),
						ps[1]
					];
				},
				function (ps) {
					return [
						go.left(ps[0]),
						go.down(ps[1])
					];
				},
				function (ps) {
					return [
						ps[0],
						go.up(go.right(ps[1]))
					];
				},
				function (ps) {
					return [
						go.down(ps[0]),
						go.left(ps[1])
					];
				}
			][oriented](ps);
		}
	},
	// Directional sugar
	up = "up",
	right = "right",
	down = "down",
	left = "left",
	rotate_left = "rotate_left",
	rotate_right = "rotate_right",
	opposite = {
		up: down,
		right: left,
		down: up,
		left: right,
		rotate_left: rotate_right,
		rotate_right: rotate_left
	},

	// A way to declare objects as literals with expressions as keys;
	// not really necessary but I hate the alternative.
	keysValues = function() {
		var i, obj = {};
		for (i = 0; i < arguments.length; i += 2) {
			obj[arguments[i]] = arguments[i + 1];
		}
		return obj;
	},
	// Some maps for connections
	go_connect = keysValues(
		CONNECT_TOP, go.up,
		CONNECT_RIGHT, go.right,
		CONNECT_BOTTOM, go.down,
		CONNECT_LEFT, go.left
	),
	opposite_connection = keysValues(
		CONNECT_TOP, CONNECT_BOTTOM,
		CONNECT_RIGHT, CONNECT_LEFT,
		CONNECT_BOTTOM, CONNECT_TOP,
		CONNECT_LEFT, CONNECT_RIGHT
	),

	id = function (x) {
		return x;
	},

	// How to maintain connections (state) when moving
	rotation_state = {
		up: mappable(id),
		right: mappable(id),
		down: mappable(id),
		left: mappable(id),
		rotate_left: function (ss, oriented) {
			return [
				function (ss) { return [
					(ss[0] ^ CONNECT_RIGHT) | CONNECT_TOP,
					(ss[1] ^ CONNECT_LEFT) | CONNECT_BOTTOM
				]; },
				function (ss) { return [
					(ss[0] ^ CONNECT_TOP) | CONNECT_LEFT,
					(ss[1] ^ CONNECT_BOTTOM) | CONNECT_RIGHT
				]; },
				function (ss) { return [
					(ss[0] ^ CONNECT_LEFT) | CONNECT_BOTTOM,
					(ss[1] ^ CONNECT_RIGHT) | CONNECT_TOP
				]; },
				function (ss) { return [
					(ss[0] ^ CONNECT_BOTTOM) | CONNECT_RIGHT,
					(ss[1] ^ CONNECT_TOP) | CONNECT_LEFT
				]; }
			][oriented](ss);
		},
		rotate_right: function (ss, oriented) {
			return [
				function (ss) { return [
					(ss[0] ^ CONNECT_RIGHT) | CONNECT_BOTTOM,
					(ss[1] ^ CONNECT_LEFT) | CONNECT_TOP
				]; },
				function (ss) { return [
					(ss[0] ^ CONNECT_TOP) | CONNECT_RIGHT,
					(ss[1] ^ CONNECT_BOTTOM) | CONNECT_LEFT
				]; },
				function (ss) { return [
					(ss[0] ^ CONNECT_LEFT) | CONNECT_TOP,
					(ss[1] ^ CONNECT_RIGHT) | CONNECT_BOTTOM
				]; },
				function (ss) { return [
					(ss[0] ^ CONNECT_BOTTOM) | CONNECT_LEFT,
					(ss[1] ^ CONNECT_TOP) | CONNECT_RIGHT
				]; }
			][oriented](ss);
		}
	},
	// How orientation changes when moving
	rotation_orient = {
		up: id,
		right: id,
		down: id,
		left: id,
		rotate_left: function (o) {
			return (o + 1) % 4;
		},
		rotate_right: function (o) {
			return (o + 3) % 4;
		}
	},
	Renderer = function () {
		var main_block_size;

		// Construct a main board renderer (no argument) or enemy board
		// renderer (one argument)
		return function (enemy) {
			return {
				board_dom: null,
				init: init,
				block_size: 0,
				setupBoardDom: arguments.length > 0 ? setupBoardDomEnemy : setupBoardDom,
				render: render,
				destruct: destruct
			};
		};

		function init(nick) {
			this.board_dom = this.setupBoardDom(nick);
		}

		function makeBlocks(board_dom, block_size) {
			var i, j, e;
			for (i = 0; i < BOARD_HEIGHT; i++) {
				for (j = 0; j < BOARD_WIDTH; j++) {
					e = document.createElement("div");
					e.className = "c0 block";
					e.style.bottom = i * block_size + "px";
					e.style.left = j * block_size + "px";
					e.style.width = block_size + "px";
					e.style.height = block_size + "px";
					//e.innerHTML = (i * BOARD_WIDTH) + j;
					board_dom.appendChild(e);
				}
			}
		}

		function setupBoardDom() {
			var board_dom = $("board"),
				screen_w = window.document.documentElement.clientWidth,
				screen_h = window.document.documentElement.clientHeight;

			main_block_size = Math.floor(0.95 * (
				Math.min(screen_w, screen_h) / Math.max(BOARD_WIDTH, BOARD_HEIGHT)
			));

			board_dom.style.width = main_block_size * BOARD_WIDTH + "px";
			board_dom.style.height = main_block_size * BOARD_HEIGHT + "px";

			makeBlocks(board_dom, main_block_size);
			return board_dom;
		}

		function setupBoardDomEnemy(nick) {
			var board_dom = document.createElement("div"),
				block_size = Math.floor(main_block_size / 3),
				name_dom = document.createElement("div");

			board_dom.className = "enemy-board";
			board_dom.style.width = block_size * BOARD_WIDTH + "px";
			board_dom.style.height = block_size * BOARD_HEIGHT + "px";

			makeBlocks(board_dom, block_size);
			name_dom.innerHTML = nick;
			name_dom.className = "name";
			board_dom.appendChild(name_dom);
			$("enemy-boards").appendChild(board_dom);
			return board_dom;
		}

		function render(board) {
			var i, c = this.board_dom.childNodes;
			for (i = 0; i < board.length; i++) {
				c[i].className = "block c" + (board[i] % 256)
					+ " b" + (board[i] >> 8)
					// for debugging; raw piece state
					+ " n" + (board[i])
				;
			}
		}

		function destruct() {
			this.board_dom.parentNode.removeChild(this.board_dom);
		}
	}(),
	renderer = Renderer(),
	enemy_renderers = {},

	// A list of integers representing the state of every spot on the board,
	// starting from the lower left. Possible states, where n = NUM_COLORS:
	// -1 invalid (not on board)
	//  0 empty
	//  1 - n monster blocks placed at start
	//  n+1 - 2n player blocks
	// 2n+1 matched blocks
	//  ... Player block states can have the bits 2^8-11 flipped on to
	// indicate bindings to the top, right, bottom and left, respectively.
	board = [],

	// todo: toss all game state into one object?

	game_over = false,
	// The controllable piece, if one exists
	piece,
	// Current speed; gets smaller
	interval,

	// Game settings
	speed = SPEEDS.low, // selected speed
	level = 5,

	// socket.io multiplayer connection
	socket,
	SOCKET_PORT = 13939,
	is_boss = false,

	// countdown to a speedup
	speedupTick = function () {
		var ticks = 0;
		return function (n) {
			n = n || 1;
			ticks += n;
			if (ticks >= TICKS_TO_SPEEDUP) {
				ticks = 0;
				interval = Math.floor(SPEEDUP_FACTOR * interval);
			}
		};
	}(),

	// get or set a pending neener
	pendingNeener = (function () {
		var neener;

		function neenerPlace(ps, length, n) {
			var i, p, left, right;

			// tentatively put a piece down
			p = Math.floor((length * Math.random()));

			// Any more points to place?
			if (n === 1) {
				// No--done!
				return p;
			}

			// see how many pieces will fit left and right
			left = Math.floor(p / 2);
			right = Math.floor((length - 1 - p) / 2);

			// hmmm

			return p;
		}

		function generateNeener(combo) {
			var i, n = 0, ps;
			for (i = 0; i < combo.length; i++) {
				n += Math.min(1, combo[i].length - 4);
			}
			n = Math.max(n, 4);
			ps = placeAndBisect([], BOARD_WIDTH, n);
			for (i = 0; i < ps.length; i++) {
				// new npp blah blah
			}
		}

		return function () {
			if (arguments.length === 1) {
				//neener = generateNeener(arguments[0]);
				console.log('implement neener generation');
				return;
			}

			console.log('implement neener pending query');
			var r = neener;
			neener = undefined;
			return r;
		};
	}()),

	/*
	* Main controller
	*
	* Passes control between the various types of game loops; also
	* throws game state at renderer whenever it changes.
	*/
	next = function () {
		var prev_board;

		function boardsEqual(bp, bn) {
			var i;
			if (bp.length !== bn.length) {
				return false;
			}
			for (i = 0; i < bp.length; i++) {
				if (bp[i] !== bn[i]) {
					return false;
				}
			}
			return true;
		}

		return function (fn, args, interval) {
			if (game_over) {
				return;
			}
			if (!prev_board || !boardsEqual(prev_board, board)) {
				if (socket) {
					socket.emit("board", board);
				}
				renderer.render(board);
				prev_board = board.slice(0);
			}
			setTimeout(
				function () {
					fn.apply(null, args);
				},
				interval || DEFAULT_LOOP_DELAY
			);
		};
	}(),

	// todo: pausing; right now this just starts the game
	playPause = function (socket_force) {
		if (isGameStarted()) {
			return; // no unpause yet
		}
		if (socket && !socket_force) {
			if (!is_boss) {
				console.log("Only boss can start!");
				return;
			} else {
				socket.emit("start");
				return;
			}
		}
		game_over = false;
		interval = speed;
		initBoard();
		next(playerLoop);
	};

function isGameStarted() {
	return board.length > 0 && !game_over;
}

function colorOf(p) {
	return (board[p] & ~CONNECTIONS) % NUM_COLORS;
}

function match(direction, p) {
	var g;

	if (board[p] === 0) {
		return [];
	}

	g = go[direction](p);

	if (g === -1 || colorOf(g) !== colorOf(p)) {
		return [p];
	}

	// g matches so keep looking that way
	return [p].concat(match(direction, g));
}

function matchScan() {
	var p,
		check_match,
		matches = [];
	for (p = 0; p < board.length; p++) {
		[up, right].forEach(function (dir) {
			check_match = match(dir, p);
			if (check_match.length >= NUM_TO_MATCH) {
				matches = matches.concat(check_match);
			}
		});
	}
	return matches;
}

function isPlayerBlock(p) {
	return board[p] > NUM_COLORS;
}

function canCascade(p, npps, from_conn) {
	from_conn = from_conn || 0;

	var below = go.down(p),
		below_is_empty = board[below] === 0,
		below_is_attached = from_conn === CONNECT_BOTTOM,
		more_connections = (board[p] & (CONNECTIONS ^ from_conn)),
		conn_check,
		conn_cascades = [],
		i;

	if (!isPlayerBlock(p)) {
		return [];
	}

	if (!below_is_empty && !below_is_attached && nppsSearch(below, npps) === -1) {
		// Block below is neither empty, attached to me nor cascading
		return [];
	}

	if (more_connections === 0) {
		return [p];
	}

	// loop over all possible connections
	for (i = CONNECT_TOP; i & CONNECTIONS; i = i << 1) {
		if (i & from_conn || !(board[p] & i)) {
			// we came from this direction, or not connected
			continue;
		}
		conn_check = canCascade(go_connect[i](p), npps, opposite_connection[i]);
		if (conn_check.length === 0) {
			// All connected blocks must be cascadable
			return [];
		} else {
			conn_cascades = conn_cascades.concat(conn_check);
		}
	}
	return conn_cascades.concat(p);
}

function cascadeScan() {
	var i, j,
		// "Non-Player Pieces"
		npps = [],
		cascade_check,
		already_cascading = {};

	// We can skip the first row for obvious reasons
	for (i = BOARD_WIDTH; i < board.length; i++) {
		if (already_cascading.hasOwnProperty(i)) {
			continue;
		}

		cascade_check = canCascade(i, npps);
		for (j = 0; j < cascade_check.length; j++) {
			already_cascading[cascade_check[j]] = true;
			npps = npps.concat(newNpp(cascade_check[j]));
		}
	}
	return npps;
}

function checkCombo(combo) {
	if (socket && combo.length > 1 || combo[0].length > 4) {
		socket.emit("neener", combo);
		console.log('Nice combo! You neenered someone.');
	} else {
		console.log('Not bad');
	}
}

/*
 * Create the starting board.
 *
 * This may need to change to something a little more deterministic wrt
 * the number of monsters generated, but it's okay for now.
 */
function initBoard() {
	var START_HEIGHT = Math.floor(
			level * (MAX_START_HEIGHT / (BOARD_HEIGHT - 1)) / 20 * BOARD_HEIGHT
		),
		// Probabilistic density of pieces on starting board, between 0 (nothing)
		// and 1 (completely full)
		// This varies with level 5-20 between 0.5 and 0.75
		START_DENSITY = (level - 5) / 60 + 0.5;

	(function fill(p, allow_empty) {
		if (p >= START_HEIGHT * BOARD_WIDTH) {
			board[p] = 0;
		} else if (!allow_empty || Math.random() <= START_DENSITY) {
			board[p] = Math.floor(Math.random() * (NUM_COLORS) + 1);
		} else {
			board[p] = 0;
		}

		if (p + 1 < (BOARD_HEIGHT * BOARD_WIDTH)) {
			if (
				match(left, p).length <= START_MAX_IN_A_ROW
				&& match(down, p).length <= START_MAX_IN_A_ROW
			) {
				fill(++p, true);
			} else {
				fill(p, false);
			}
		}
	}(0, true));
}

function gameOver() {
	game_over = true;
}

function isWin() {
	var p;
	for (p = 0; p < board.length; p++) {
		if (board[p] > 0 && board[p] <= NUM_COLORS) {
			return false;
		}
	}
	return true;
}

function win(from_socket) {
	gameOver();
	if (socket && !from_socket) {
		socket.emit("win");
	} else {
		console.log("You WIN!");
	}
}

function lose(from_socket) {
	gameOver();
	if (socket && !from_socket) {
		socket.emit("lose");
	} else {
		console.log("You LOSE!");
	}
}

function checkMove(direction) {
	var i,
		moved = go[direction](this.blocks, this.orientation);

	for (i = 0; i < moved.length; i++) {
		if (
			0 !== board[moved[i]]
			&& this.blocks.indexOf(moved[i]) === -1
		) {
			return false;
		}
	}
	return true;
}

function move(direction) {
	var i,
		states = [];

	for (i = 0; i < this.blocks.length; i++) {
		states[i] = board[this.blocks[i]];
		board[this.blocks[i]] = 0;
	}
	this.blocks = go[direction](this.blocks, this.orientation);

	states = rotation_state[direction](states, this.orientation);
	for (i = 0; i < states.length; i++) {
		board[this.blocks[i]] = states[i];
	}
	this.orientation = rotation_orient[direction](this.orientation);
}

/*
 * Constructor for a player-controlled piece.
 */
function Piece(now) {
	var i, blocks = [];
	for (i = 0; i < NEW_PIECE.length; i += 2) {
		if (board[NEW_PIECE[i]] !== 0) {
			// GAME OVER
			return;
		}
		board[NEW_PIECE[i]] = Math.floor(
			// a random color
			Math.random() * (NUM_COLORS)
			// set state for player piece
			+ NUM_COLORS + 1
			// set connection
			+ NEW_PIECE[i + 1]
		);
		blocks.push(NEW_PIECE[i]);
	}

	return {
		blocks: blocks,
		orientation: 0,
		// When the piece will move downward next
		pending_drop: now + interval,
		// When the piece will stick to the block below
		pending_settle: 0,
		pending_moves: [],
		// If the player has triggered the all-the-way-down move
		pending_slam: false,
		// methods
		move: move,
		checkMove: checkMove
	};
}

/*
 * Constructor for a non-player piece.
 *
 * (Not a monster piece either; basically a cascading piece).
 */
function newNpp(p) {
	return {
		blocks: [p],
		pending_drop: 0,
		move: move,
		checkMove: checkMove
	};
}

// Find if the block is in the npps
function nppsSearch(p, npps) {
	var i, j;
	for (i = 0; i < npps.length; i++) {
		for (j = 0; j < npps[i].blocks.length; j++) {
			if (npps[i].blocks[j] === p) {
				return i;
			}
		}
	}
	return -1;
}

// Remove the connection from the piece connected to.
function removeConnectionComplement(p) {
	var target = go_connect[board[p] & CONNECTIONS](p);
	board[target] = board[target] & ~CONNECTIONS;
}

// Controller for when the player is moving the piece, or the board is
// ready for a new piece.
function playerLoop() {
	var now = +new Date(),
		i, j,
		m,
		matches = [];

	if (!piece) {
		piece = Piece(now);
		if (!piece) {
			lose();
			return;
		}
		speedupTick(10);
		next(playerLoop);
		return;
	}

	if (piece.pending_settle) {
		if (piece.pending_settle <= now) {
			piece = false;
			matches = matchScan();
			if (matches.length > 0) {
				next(setMatches, [matches, [matches]], interval);
				return;
			}
			next(playerLoop);
			return;
		}
	} else if (!piece.checkMove(down)) {
		piece.pending_settle = now + interval;
		piece.pending_drop = 0;
	} else if (piece.pending_drop && piece.pending_drop <= now) {
		piece.move(down);
		piece.pending_drop = now + interval;
		speedupTick();
	}

	m = piece.pending_moves.pop();
	if (m && playerMove(m)) {
		if (m === down && piece.checkMove(down)) {
			// Reset drop timer (but update speedup ticks) when piece is
			// moved down
			piece.pending_drop = now + interval;
			speedupTick();
		} else {
			if (piece.pending_settle && piece.checkMove(down)) {
				// Unset the settle timer and re-set drop timer if the
				// move has resulted in more possible down moves.
				piece.pending_settle = 0;
				piece.pending_drop = now + interval;
			}
		}
	} else if (!m && piece.pending_slam) {
		while (piece.checkMove(down)) {
			piece.move(down);
			speedupTick();
		}
		piece.pending_settle = now;
	}
	next(playerLoop);
}

/* Attempt to execute a player move
 *
 * I think this needs a little work in the (literal) edge case for
 * rotations.
 */
function playerMove(m) {
	if (piece.checkMove(m)) {
		piece.move(m);
		return true;
	}

	if (m !== rotate_left && m !== rotate_right) {
		return false;
	}

	piece.blocks.reverse();
	piece.orientation = (2 + piece.orientation) % 4;
	m = opposite[m];

	if (!piece.checkMove(m)) {
		piece.blocks.reverse();
		piece.orientation = (2 + piece.orientation) % 4;
		m = opposite[m];

		return false;
	}

	piece.move(m);
	return true;
}

function nppCompare(npp1, npp2) {
	return npp1.blocks[0] - npp2.blocks[0];
}

// Controller for when a cascade is happening.
function cascadeLoop(npps, combo) {
	var i,
		matches,
		new_npps;

	// Move the lowest npps first
	npps.sort(nppCompare);

	for (i = 0; i < npps.length; i++) {
		npps[i].move(down);
	}

	new_npps = cascadeScan();

	if (new_npps.length < npps.length) {
		matches = matchScan();
		if (matches.length > 0) {
			combo.push(matches);
			next(setMatches, [matches, combo], interval);
			return;
		}
	}

	if (new_npps.length > 0) {
		next(cascadeLoop, [new_npps, combo], interval);
	} else {
		checkCombo(combo);
		next(playerLoop);
	}
}

// Controller for when matches have been made.
function setMatches(matches, combo) {
	var i;
	for (i = 0; i < matches.length; i++) {
		if (board[matches[i]] & CONNECTIONS) {
			removeConnectionComplement(matches[i]);
		}

		board[matches[i]] = MATCH_PENDING;
	}
	next(clearMatches, [matches, combo], interval);
}

// Controller for when matches are ready to be cleared.
function clearMatches(matches, combo) {
	var i,
		npps = [];

	for (i = 0; i < matches.length; i++) {
		board[matches[i]] = 0;
	}

	if (isWin()) {
		return next(win);
	}

	npps = cascadeScan();

	if (npps.length > 0) {
		next(cascadeLoop, [npps, combo]);
	} else {
		checkCombo(combo);
		next(playerLoop);
	}
}

function queueMove(direction) {
	if (piece && !piece.pending_slam) {
		piece.pending_moves.unshift(direction);
	}
}

renderer.init();

/*
 * Set up controls
 */

$('start').addEventListener('click', function () {
	playPause();
});

(function bindSpeed() {
	var i,
		speed_box = $('speed'),
		speed_keys = Object.keys(SPEEDS);

	// make sure speed control matches actual speed
	for (i = 0; i < speed_keys.length; i++) {
		if (speed === SPEEDS[speed_keys[i]]) {
			speed_box.className = speed_keys[i];
		}
	}

	speed_box.addEventListener('click', function (e) {
		if (isGameStarted()) {
			return;
		}
		if (Object.keys(SPEEDS).indexOf(e.target.className) > -1) {
			speed_box.className = e.target.className;
			speed = SPEEDS[e.target.className];
		}
	});
}());

(function bindLevel() {
	var level_input = $('level-input'),
		level_show = $('level-show');

	level_input.value = level;
	level_show.innerHTML = level;

	level_input.addEventListener('change', function (e) {
		if (isGameStarted()) {
			return false;
		}
		level_show.innerHTML = level_input.value;
		level = level_input.value;
	});
}());

(function bindMultiplayer() {
	var nick_input = $('nickname'),
		host_input = $('host');

	host_input.value = location.hostname;

	$('multiplayer').addEventListener('change', function (e) {
		var nick = nick_input.value,
			host = host_input.value;

		if (nick && host) {
			startSocket(host, nick);
		}
	});
}());

function startSocket(host, nick) {
	socket = io.connect("http://" + host + ":" + SOCKET_PORT);
	socket.on("connect", function () {
		socket.emit("hello", nick);
	});
	socket.on("boss", function () {
		console.log("You're the boss!");
		// Once you're the boss you will stay the boss.
		is_boss = true;
	});
	socket.on("hello", function (nick) {
		console.log(nick + ' is here.');
		enemy_renderers[nick] = Renderer(nick);
		enemy_renderers[nick].init(nick);
	});
	socket.on("bye", function (nick) {
		console.log(nick + ' left.');
		enemy_renderers[nick].destruct();
		delete enemy_renderers[nick];
	});
	socket.on("start", function () {
		playPause(true);
	});
	socket.on("board", function (other_board) {
		enemy_renderers[other_board.nick].render(other_board.board);
	});
	socket.on("lose", function () {
		lose(true);
	});
	socket.on("win", function () {
		win(true);
	});
	socket.on("neener", function (combo) {
		console.log('caught neener emit');
		pendingNeener(combo);
		console.log('pendingNeener called with combo:');
		console.log(combo);
	});
}

window.addEventListener('keydown', function (e) {
	var d;
	switch (e.keyCode) {
		case 188: // ","
			queueMove(rotate_left);
			return false;
		case 190: // "."
			queueMove(rotate_right);
			return false;
		case 38: // up arrow
		case 87: // "w"
			if (piece) {
				piece.pending_slam = true;
			}
			return false;
		case 39: // right arrow
		case 68: // "d"
			queueMove(right);
			return false;
		case 40: // down arrow
		case 83: // "s"
			queueMove(down);
			return false;
		case 37: // left arrow
		case 65: // "a"
			queueMove(left);
			return false;
		case 27: // ESC
			if (isGameStarted()) {
				console.log("FORFEIT!");
				lose();
			}
			return false;

		// currently not using these keys
		// todo: remove once control scheme gels
		case 70: // "f"
		case 32: // space
		case 17: // ctrl
		case 13: // enter
		case 16: // shift
		/* falls through */
		default:
			return true;
	}
});
