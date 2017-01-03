// Global variables. {
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
// All image files that are available.
var imgfiles = [];
// }

// Retrieve a file from gani/ on the server; call cb with result.
function recv(url, cb, text) {
	var xhr = new XMLHttpRequest();
	xhr.AddEvent('loadend', function() {
		cb(xhr.responseText);
	});
	//console.info(url);
	xhr.open('GET', url);
	if (text)
		xhr.responseType = 'text';
	xhr.send();
}

// Startup functions. {
// This function begins the setup; it is called when the document is loaded.
AddEvent('load', function() {
	// Initialize everything.
	window.get = function(id) { return document.getElementById(id); };
	recv('find.txt', function(data) {
		var files = data.split(/\r?\n/);
		var ganifiles = [];
		for (var i = 0; i < files.length; i += 1) {
			if (files[i].match(/^\.\/gani\/[^.].*\.gani$/))
				ganifiles.push(files[i].slice(7));
			else if (files[i].match(/^\.\/img\/[^.]+\./))
				imgfiles.push(files[i].slice(6));
			else {
				//console.info('not handled:', files[i]);
			}
		}
		var loadnext = function(data) {
			var current_gani = ganifiles.splice(0, 1)[0];
			var parsed = parse_gani(data);
			if (parsed !== null) {
				gani[current_gani.slice(0, -5)] = parsed;
			}
			if (ganifiles.length <= 0)
				loadend();
			else
				recv('gani/' + ganifiles[0], loadnext, true);
		};
		if (ganifiles.length <= 0)
			loadend();
		else
			recv('gani/' + ganifiles[0], loadnext, true);
	}, true);
});

// This function finishes the setup; it is called when all gani files are loaded.
function loadend() {
	// All files are loaded.
	var i = 0;
	for (var g in gani) {
		gani[g].index = i;
		get('animation').AddElement('option').AddText(g).value = g;
		get('setbackto').AddElement('option').AddText(g).value = g;
		i += 1;
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
// }

// This function is called before drawing the next frame on screen.
function animate() {
	if (!animating)
		console.error('animate() called but animating is false');
	if (current === null) {
		animating = false;
		return;
	}
	var raw_now = performance.now();
	var now = raw_now - start_time;
	var update = false;
	if (now >= current.duration) {
		if (current.setbackto !== false) {
			if (typeof(current.setbackto) == 'number') {
				now -= current.duration - current.frames[current.setbackto].time;
				current_frame = current.setbackto;
				//console.info(now);
			}
			else {
				if (gani[current.setbackto] === undefined) {
					console.warn('unable to set animation to undefined setbackto', current.setbackto);
				}
				else {
					now -= current.duration;
					current_animation = gani[current.setbackto];
					current_frame = 0;
				}
			}
			update = true;
		}
		if (now >= current_animation.duration) {
			//console.info(now);
			current_animation = current;
			start_time = raw_now;
			now = 0;
			update = true;
		}
	}
	while (now >= current_animation.frames[current_frame].time + current_animation.frames[current_frame].wait) {
		set_frame(current_animation, current_frame + 1);
		update = false;
	}
	if (update)
		set_frame(current_animation, current_frame);
	requestAnimationFrame(animate);
}

// Helper functions. {
// Change the current animation, optionally with a start_time.
function set_animation(name, time) {
	if (gani[name] === undefined) {
		console.warn('Trying to play undefined animation:', name);
		current = null;
		return;
	}
	current = gani[name];
	start_time = time !== undefined ? time : performance.now();
	// Draw first frame on empty screen.
	get('preview').ClearAll();
	resources = {};
	set_frame(current, 0);
	if (!animating) {
		animating = true;
		requestAnimationFrame(animate);
	}

	// Update UI.
	// Setbackto controls. {
	if (current.setbackto === false)
		get('freeze').checked = true;
	else if (typeof(current.setbackto) == 'number')
		get('loop').checked = true;
	else {
		get('setback').checked = true;
		get('setbackto').selectedIndex = gani[current.setbackto].index;
	}
	// }
	// Single Direction checkbox. {
	get('onedirection').checked = current.single_dir;
	// }

	// Sprite and Frames tables. {
	var table = get('spritelist');
	var framestable = get('frames');
	if (table.resources === undefined)
		table.resources = {};
	// Remove old values. {
	for (var r in table.resources) {
		table.resources[r].heading.parentNode.removeChild(table.resources[r].heading);
		table.resources[r].image.parentNode.removeChild(table.resources[r].image);
		table.resources[r].titles.parentNode.removeChild(table.resources[r].titles);
		table.resources[r].footing.parentNode.removeChild(table.resources[r].footing);
		table.resources[r].frame.parentNode.removeChild(table.resources[r].frame);
		for (var s in table.resources[r].sprites) {
			table.resources[r].sprites[s].row.parentNode.removeChild(table.resources[r].sprites[s].row);
		}
		delete table.resources[r];
	}
	// }
	// Fill new sprites table. {
	var end = get('newresource');
	for (var s in current.sprites) {
		var sprite = current.sprites[s];
		var r;
		if (table.resources[sprite.resource] === undefined) {
			r = table.resources[sprite.resource] = {};
			r.sprites = {};
			// Create heading. {
			r.heading = Create('tr');
			end.parentNode.insertBefore(r.heading, end);
			var th = r.heading.AddElement('th');
			th.colSpan = 2;
			th.AddText('Resource: ' + sprite.resource);
			th = r.heading.AddElement('th');
			th.colSpan = 3;
			var input = th.AddElement('select').AddEvent('change', function() {
				// TODO: handle file change.
			});
			for (var i = 0; i < imgfiles.length; ++i) {
				var option = input.AddElement('option').AddText(imgfiles[i]);
				option.value = imgfiles[i];
				if (imgfiles[i] == current.attrs[sprite.resource])
					option.selected = true;
			}
			r.heading.AddElement('th').AddElement('button', 'removebutton').AddText('Remove').AddEvent('click', function() {
				// TODO: remove resource.
			}).type = 'button';
			// }
			// Create image. {
			r.image = Create('tr');
			var td = r.image.AddElement('td');
			td.colSpan = 6;
			var container = td.AddElement('div', 'container');
			r.box = container.AddElement('div', 'box');
			var img = container.AddElement('img');
			img.src = 'img/' + current.attrs[sprite.resource];
			r.update_box = function() {
				var info = current.sprites[this.select.options[this.select.selectedIndex].value];
				this.box.style.left = info.x + 'px';
				this.box.style.top = info.y + 'px';
				this.box.style.width = info.w + 'px';
				this.box.style.height = info.h + 'px';
			};
			// Create a local copy of r.
			(function(r) {
				r.select = td.AddElement('select').AddEvent('change', function() {
					r.update_box();
				});
			})(r);
			end.parentNode.insertBefore(r.image, end);
			// }
			// Create titles. {
			r.titles = Create('tr');
			var titles = ['Sprite', 'X', 'Y', 'Width', 'Height', ''];
			for (var t = 0; t < titles.length; t += 1)
				r.titles.AddElement('th').AddText(titles[t]);
			end.parentNode.insertBefore(r.titles, end);
			// }
			// Create footing {
			r.footing = Create('tr');
			end.parentNode.insertBefore(r.footing, end);
			var td = r.footing.AddElement('td');
			td.colSpan = 6;
			td.AddElement('button').AddText('Create ' + sprite.resource + ' Sprite').AddEvent('click', function() {
				// TODO: create new sprite.
			}).type = 'button';
			// }
			// Create frame row {
			r.frame = framestable.AddElement('tr');
			r.frame.AddElement('th').AddText(sprite.resource);
			r.frame.select = [];
			r.frame.x = [];
			r.frame.y = [];
			for (var d = 0; d < 4; d += 1) {
				td = r.frame.AddElement('td');
				// Create a local copy of r.
				(function(r) {
					r.frame.select.push(td.AddElement('select').AddEvent('change', function() {
						r.update_frame();
					}));
				})(r);
				r.frame.x.push(r.frame.AddElement('td').AddElement('input'));
				r.frame.x[d].type = 'number';
				r.frame.x[d].min = -1000;
				r.frame.x[d].max = 1000;
				r.frame.x[d].step = 1;
				r.frame.y.push(r.frame.AddElement('td').AddElement('input'));
				r.frame.y[d].type = 'number';
				r.frame.y[d].min = -1000;
				r.frame.y[d].max = 1000;
				r.frame.y[d].step = 1;
			}
			r.update_frame = function() {
				var frameselect = get('frameselect');
				var selected_frame = frameselect.value;
				if (selected_frame >= current.frames.length)
					return;
				for (var d = 0; d < this.frame.select.length; d += 1) {
					this.frame.select[d].ClearAll();
					var data = current.frames[selected_frame].data[d];
					if (data === undefined) {
						this.frame.x[d].value = '';
						this.frame.y[d].value = '';
						continue;
					}
					var i = 0;
					for (var s in this.sprites) {
						var option = this.frame.select[d].AddElement('option').AddText(s);
						option.value = s;
						var sel = current.frames[selected_frame];
						if (sel === undefined) {
							continue;
						}
						for (var f = 0; f < data.length; ++f) {
							if (data[f].sprite == s) {
								this.frame.select[d].selectedIndex = i;
								this.frame.x[d].value = data[f].x;
								this.frame.y[d].value = data[f].y;
							}
						}
						i += 1;
					}
				}
			}
			// }
		}
		r = table.resources[sprite.resource];
		r.select.AddElement('option').AddText(s).value = s;
		r.sprites[s] = {};
		var tr = r.sprites[s].row = Create('tr');
		end.parentNode.insertBefore(tr, r.footing);
		var td = tr.AddElement('td');
		var input = td.AddElement('input').AddEvent('keydown', function(event) {
			// TODO: handle name change.
		});
		input.type = 'text';
		input.value = s;
		var props = ['x', 'y', 'w', 'h'];
		for (var i = 0; i < props.length; i += 1) {
			td = tr.AddElement('td');
			input = td.AddElement('input').AddEvent('keydown', function(event) {
				// TODO: handle property change.
			});
			input.type = 'number';
			input.value = sprite[props[i]];
		}
		tr.AddElement('button', 'removebutton').AddText('Remove').AddEvent('click', function() {
			// TODO: remove sprite.
		});
	}
	// }
	get('frameselect').max = current.frames.length;
	// Update all boxes. {
	for (var r in table.resources) {
		table.resources[r].update_box();
	}
	update_frame();
	// }
	// }
}

// Update the display for a new frame.
function set_frame(animation, frame) {
	current_animation = animation;
	current_frame = frame;
	var dirs = animation.single_dir ? ['50%'] : ['20%', '40%', '60%', '80%'];
	for (var dir = 0; dir < dirs.length; dir += 1) {
		var d = animation.frames[frame].data[dir];
		var parent = get('preview').AddElement('div', 'character');
		parent.style.left = dirs[dir];
		for (var i = 0; i < d.length; i += 1) {
			var sprite = animation.sprites[d[i].sprite];
			if (resources[sprite.resource] === undefined)
				resources[sprite.resource] = [null, null, null, null];
			if (resources[sprite.resource][dir] === null)
				resources[sprite.resource][dir] = parent.AddElement('div', 'part');
			var part = resources[sprite.resource][dir];
			part.style.left = d[i].x + 'px';
			part.style.top = (d[i].y + 64) + 'px';
			part.style.width = sprite.w + 'px';
			part.style.height = sprite.h + 'px';
			part.style.backgroundImage = "url('img/" + animation.attrs[sprite.resource] + "')";
			part.style.backgroundPosition = -sprite.x + 'px ' + -sprite.y + 'px';
		}
	}
}
// }

// UI callback functions. {
// This function is called when a new animation is selected in the UI.
function select_animation() {
	// Respond to a new selection in the animation control.
	var ani = get('animation');
	if (ani.options.length <= ani.selectedIndex)
		return;
	var cur = ani.options[ani.selectedIndex].value;
	if (cur == 'Create New') {
		// TODO: Create new animation.
	}
	set_animation(cur == '- ' ? null : cur);
}

// This function is called when the "one direction" button is toggled.
function setdirection() {
	// TODO: Update info.
}

// This function is called when a key is pressed in the name input box.
function namekey(event) {
	// Respond to a key in the rename input.
	if (event.keyCode != 13)
		return;
	event.preventDefault();
	var name = get('newname').value;
	get('newname').value = '';
	var select = get('animation');
	var option = select.options[select.selectedIndex];
	var old_name = option.value;
	// TODO: make name unique.
	// Replace content and set value.
	option.ClearAll().AddText(name).value = name;
	select = get('setbackto');
	for (var o = 0; o < select.options.length; ++o) {
		if (select.options[o].value == old_name) {
			// Replace content and set value.
			select.options[o].ClearAll().AddText(name).value = name;
		}
	}
	for (var g in gani) {
		if (gani[g].setbackto == old_name)
			gani[g].setbackto = name;
	}
	var ani = gani[old_name];
	delete gani[old_name];
	gani[name] = ani;
}

// This function is called when the "create resource" button is pressed.
function createresource() {
	// TODO: Add new resource.
}

// This functin is called when the "new frame" button is clicked.
function newframe() {
	// TODO: Add new frame.
}

// This functin is called when the "new frame" button is clicked.
function update_frame() {
	get('framenum').ClearAll().AddText(get('frameselect').value);
	var data = get('spritelist').resources
	for (var r in data)
		data[r].update_frame();
}
// }

// vim: set foldmethod=marker foldmarker={,} :
