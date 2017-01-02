// Database of all known ganis.
var gani = {};
// Currently previewed gani object.
var current = null;
// Currently displayed frame in the preview.
var current_frame;
// Time (like performance.now()) when current animation was started.
var start_time;
// Object with resources as keys, divs as values.
var resources;
// Whether an animation is currently shown.
var animating = false;

// Retrieve a file from gani/ on the server; call cb with result.
function recv(url, cb, text) {
	var xhr = new XMLHttpRequest();
	xhr.AddEvent('loadend', function() {
		cb(xhr.responseText);
	});
	xhr.open('GET', 'gani/' + url);
	if (text)
		xhr.responseType = 'text';
	xhr.send();
}

// This function begins the setup; it is called when the document is loaded.
AddEvent('load', function() {
	// Initialize everything.
	window.get = function(id) { return document.getElementById(id); };
	recv('find.txt', function(data) {
		var rawfiles = data.split(/\r?\n/);
		var files = [];
		for (var i = 0; i < rawfiles.length; i += 1) {
			if (rawfiles[i].substring(0, 2) == './' && rawfiles[i].slice(-5) == '.gani')
				files.push(rawfiles[i].slice(2, -5));
			else if (rawfiles[i] != '.' && rawfiles[i] != '' && rawfiles[i] != './find.txt')
				console.warn('strange filename in find.txt', rawfiles[i]);
		}
		var loadnext = function(data) {
			var current_gani = files.splice(0, 1);
			var parsed = parse_gani(data);
			if (parsed !== null)
				gani[current_gani] = parsed;
			if (files.length <= 0)
				loadend();
			else
				recv(files[0] + '.gani', loadnext, true);
		};
		if (files.length <= 0)
			loadend();
		else
			recv(files[0] + '.gani', loadnext, true);
	}, true);
});

// This function finishes the setup; it is called when all gani files are loaded.
function loadend() {
	// All files are loaded.
	for (var g in gani) {
		get('animation').AddElement('option').AddText(g).value = g;
	}
	select_animation();
	start_time = performance.now();
	requestAnimationFrame(animate);
}

// Parse a single gani file.
function parse_gani(gani_text) {
	// Copied (and edited) from M.GRL source.
	var ani = {
		'sprites' : {
			// 'sprites' is an object, not an array, but all of the keys
			// are numbers.  Values are objects like so:
			/*
			0 : {
			'hint' : 'Coin Frame 1',
			'resource': 'COIN',
			'x': 0,
			'y': 0,
			'w': 32,
			'h': 32,
			}
			*/
		},

		'attrs' : {
			/*
			'SPRITES' : 'sprites.png',
			'HEAD' : 'head19.png',
			'BODY' : 'body.png',
			'SWORD' : 'sword1.png',
			'SHIELD' : 'shield1.png',
			*/
		},

		'frames' : [
			/*
			{
				'data': [
					// index corresponds to facing index 'dir', so there
					// will be 1 or 4 entries here.
					// this is determined by 'single dir'
					[
						{
							'sprite': 608, // num is the key for this.sprites
							'x': -8,
							'y': -16,
						},
						//...
					],
				],
				'time': 200, // start time of frame from start of animation
				'wait': 40, // frame duration
				'sound': false, // or sound to play
			},
			// ...
			*/
		],

		'base_speed' : 50,
		'duration' : 0,

		'single_dir' : false,
		'looping' : false,
		'continuous' : false,
		'setbackto' : false,
	};

	var get_action_name = function(uri) {
		var name = uri;
		var path = 'gani/';
		if (name.substring(0, path.length) == path)
			name = name.substring(path.length);
		if (name.endsWith('.gani'))
			name = name.slice(0, -5);
		return name;
	};

	var frames_start = 0;
	var frames_end = 0;
	var defs_phase = true;

	var split_params = function(line, delim) {
		if (delim === undefined) {
			delim = ' ';
		}
		var parts = line.split(delim);
		var params = [];
		for (var i = 0; i < parts.length; i += 1) {
			var check = parts[i].replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '');
			if (check.length > 0) {
				params.push(check);
			}
		}
		return params;
	};

	var lines = gani_text.split('\n');
	for (var i = 0; i < lines.length; i += 1) {
		var line = lines[i].replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '');
		if (line.length == 0)
			continue;
		var params = split_params(line);

		if (defs_phase) {
			// update a sprite definition
			if (params[0] == 'SPRITE') {
				var sprite_id = Number(params[1]);
				var sprite = {
					'hint' : params.slice(7).join(' '),
				};
				var names = ['resource', 'x', 'y', 'w', 'h'];
				for (var k = 0; k < names.length; k += 1) {
					var datum = params[k + 2];
					var name = names[k];
					if (datum.match(/^[A-Za-z]+[0-9A-Za-z]*$/))
						sprite[name] = datum.toLowerCase();
					else {
						if (k > 0 && k < 5)
							sprite[name] = Number(datum);
						else
							sprite[name] = datum;
					}
				}
				ani.sprites[sprite_id] = sprite;
			}

			// single direction mode
			if (params[0] == 'SINGLEDIRECTION') {
				ani.single_dir = true;
			}

			// loop mode
			if (params[0] == 'LOOP') {
				ani.looping = true;
				if (!ani.setbackto) {
					ani.setbackto = 0;
				}
			}

			// continuous mode
			if (params[0] == 'CONTINUOUS') {
				ani.continuous = true;
			}

			// setbackto setting
			if (params[0] == 'SETBACKTO') {
				ani.continuous = false;
				if (params[1].match(/^\d+$/i))
					ani.setbackto = Number(params[1]);
				else {
					var next_file = params[1];
					if (next_file.slice(-5) != '.gani')
						next_file += '.gani';
					ani.setbackto = get_action_name(next_file);
				}
			}

			// default values for attributes
			if (params[0].slice(0, 7) == 'DEFAULT') {
				var attr_name = params[0].slice(7).toLowerCase();
				var datum = params[1];
				if (params[1].match(/^\d+$/i))
					datum = Number(datum);
				ani.attrs[attr_name] = datum;
			}

			// determine frameset boundaries
			if (params[0] == 'ANI') {
				frames_start = i + 1;
				defs_phase = false;
			}
		}
		else {
			if (params[0] === 'ANIEND') {
				frames_end = i - 1;
			}
		}
	}

	// next up is to parse out the frame data
	var pending_lines = [];
	var frame_size = ani.single_dir ? 1 : 4;
	var parse_frame_defs = function(line) {
		// parses a single direction's data from a frame line in the
		// gani file
		var defs = split_params(line, ',');
		var frame = [];
		for (var k = 0; k < defs.length; k += 1) {
			var chunks = split_params(defs[k], ' ');
			var names = ['sprite', 'x', 'y'];
			var sprite = {};
			for (var n = 0; n < names.length; n += 1) {
				var name = names[n];
				var datum = chunks[n];
				if (datum.match(/^[A-Za-z]+[0-9A-Za-z]*$/))
					sprite[name] = datum;
				else
					sprite[name] = Number(datum);
			}
			frame.push(sprite);
		}
		return frame;
	};

	for (var i = frames_start; i <= frames_end; i += 1) {
		var line = lines[i].trim();
		pending_lines.push(line);
		if (pending_lines.length > frame_size && line.length === 0) {
			// blank line indicates that the pending data should be
			// processed as a new frame.
			var frame = {
				'data': [],
				'time': 0,
				'wait': ani.base_speed,
				'sound': false,
			};
			for (var dir = 0; dir < frame_size; dir += 1) {
				// frame.data.length == 1 for singledir and 4 for multidir
				frame.data.push(parse_frame_defs(pending_lines[dir]));
			}
			for (var k = frame_size; k < pending_lines.length; k += 1) {
				var params = split_params(pending_lines[k]);
				if (params[0] === 'WAIT')
					frame.wait = ani.base_speed * (Number(params[1]) + 1);
				else if (params[0] === 'PLAYSOUND') {
					frame.sound = {
						'file' : params[1],
						'x' : Number(params[2]),
						'y' : Number(params[3]),
					};
				}
			}
			ani.frames.push(frame);
			pending_lines = [];
		}
	}

	// calculate animation duration
	for (var i = 0; i < ani.frames.length; i += 1) {
		ani.frames[i].time = ani.duration;
		ani.duration += ani.frames[i].wait;
	}

	if (ani.frames.length > 0)
		return ani;
	else
		return null;
}

// This function is called before drawing the next frame on screen.
function animate() {
	if (current === null) {
		animating = false;
		return;
	}
	if (!animating)
		console.error('animate() called but animating is false');
	var raw_now = performance.now();
	var now = raw_now - start_time;
	if (now >= current.duration) {
		if (current.setbackto !== false) {
			if (typeof(current.setbackto) == 'number') {
				start_time += current.duration - current.frames[current.setbackto].time;
				if (raw_now - start_time >= current.duration)
					start_time = raw_now - current.frames[current.setbackto].time;
				set_frame(current.setbackto);
			}
			else
				set_animation(current.setbackto, start_time + current.duration);
			return animate();
		}
		animating = false;
		return;
	}
	while (now >= current.frames[current_frame].time + current.frames[current_frame].wait)
		set_frame(current_frame + 1);
	requestAnimationFrame(animate);
}

function set_animation(name, time) {
	if (gani[name] === undefined) {
		name = null;
		console.warn('Trying to play undefined animation:', name);
	}
	current = gani[name];
	start_time = time !== undefined ? time : performance.now();
	// Draw first frame on empty screen.
	get('preview').ClearAll();
	resources = {};
	set_frame(0);
	if (!animating) {
		animating = true;
		requestAnimationFrame(animate);
	}
}

function set_frame(frame) {
	current_frame = frame;
	var dirs = current.single_dir ? ['50%'] : ['20%', '40%', '60%', '80%'];
	for (var dir = 0; dir < dirs.length; dir += 1) {
		var d = current.frames[current_frame].data[dir];
		var parent = get('preview').AddElement('div', 'character');
		parent.style.left = dirs[dir];
		for (var i = 0; i < d.length; i += 1) {
			var sprite = current.sprites[d[i].sprite];
			if (resources[sprite.resource] === undefined)
				resources[sprite.resource] = [null, null, null, null];
			if (resources[sprite.resource][dir] === null)
				resources[sprite.resource][dir] = parent.AddElement('div', 'part');
			var part = resources[sprite.resource][dir];
			part.style.left = d[i].x + 'px';
			part.style.top = (d[i].y + 64) + 'px';
			part.style.width = sprite.w + 'px';
			part.style.height = sprite.h + 'px';
			part.style.backgroundImage = "url('img/" + current.attrs[sprite.resource] + "')";
			part.style.backgroundPosition = -sprite.x + 'px ' + -sprite.y + 'px';
		}
	}
}

// This function is called when a new animation is selected in the UI.
function select_animation() {
	// Respond to a new selection in the animation control.
	var ani = get('animation');
	var cur = ani.options[ani.selectedIndex].value;
	if (cur == 'Create New') {
		// TODO: Create new animation.
	}
	set_animation(cur == '- ' ? null : cur);
}

// This function is called when a key is pressed in the name input box.
function namekey(event) {
	// Respond to a key in the rename input.
	if (event.keyCode != 13)
		return;
	event.preventDefault();
	// TODO: Rename animation.
}

// This function is called when a key is pressed in the category input box.
function newcategorykey(event) {
	// FIXME: replace with create/rename.
	if (event.keyCode != 13)
		return;
	event.preventDefault();
	// TODO: Add new category.
}

// This functin is called when the "new frame" button is clicked.
function newframe() {
	// TODO: Add new frame.
}

// vim: set foldmethod=marker foldmarker={,} :
