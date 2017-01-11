// Global variables. {
// Database of all known ganis.
var gani = {};
// Currently edited gani object.
var current = null;
// Currently previewed gani (with setbackto, this need not be equal to current).
var current_animation = null;
// Currently displayed frame in the preview.
var current_frame;
// Time (like performance.now()) when current animation was started.
var start_time;
// Object with preview resources as keys, divs as values.
var resources;
// Same thing, for the frame preview.
var fresources;
// All image files that are available.
var imgfiles = [];
// Handle to cancel pending timeout; null if no timeout is pending.
var timeout = null;
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
		for (var i = 0; i < files.length; ++i) {
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
		++i;
	}
	select_animation();
	start_time = performance.now();
}

// Parse a single gani file.
function parse_gani(gani_text) {
	// Copied (and edited) from M.GRL source.
	var ani = {
		'resources': [
			// Named resources, in order.
		],
		'resource' : {
			// Resource data, by name; name is the base, actual names are base + ix * dx + iy.
			// 'shadow': {
			//   'file': 'shadow.png',
			//   'sprites': {
			//     10: {	// unless num_x == num_y == 1, name % 10 == 0.
			//       'hint': 'Coin Shadow 1',
			//       'x': 0,	// + ix * w
			//       'y': 0,	// + iy * h
			//       'w': 32,
			//       'h': 8,
			//	 'num_x': 4,
			//       'num_y': 6,
			//       'dx': 10,	// or 1, if num_y == 1.
			//     },
			//     ...
			//   },
			//   'lookup': {
			//     123: [100, 3, 2], ...	// base, nx, ny
			//   },
			// }
		},

		'frames' : [
			/*
			{
				'data': [
					// index corresponds to facing index 'dir', so there
					// will be 1 or 4 entries here.
					// this is determined by 'single dir'
					[
						// Every entry here corresponds to a resource.  There are exactly as many entries as members in resources.
						{
							'sprite': 608, // num is the key for this.resource[i].sprites
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
		for (var i = 0; i < parts.length; ++i) {
			var check = parts[i].replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '');
			if (check.length > 0) {
				params.push(check);
			}
		}
		return params;
	};

	var lines = gani_text.split('\n');
	for (var i = 0; i < lines.length; ++i) {
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
				for (var k = 0; k < names.length; ++k) {
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
				if (ani.resource[sprite.resource] === undefined) {
					ani.resources.push(sprite.resource);
					ani.resource[sprite.resource] = {file: null, sprites: {}, lookup: {}};
				}
				ani.resource[sprite.resource].sprites[sprite_id] = sprite;
				ani.resource[sprite.resource].lookup[sprite_id] = [sprite_id, 0, 0];
				// This information is not kept up to date, so having it is confusing.
				delete sprite.resource;
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
				if (ani.resource[attr_name] === undefined) {
					console.warn('Setting default value for undefined resource', attr_name);
					ani.resources.push(attr_name);
					ani.resource[attr_name] = {file: null, sprites: {}, lookup: {}};
				}
				ani.resource[attr_name].file = datum;
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
		// Return [{sprite: 10, x: 0, y: 18}, ...] with one entry per resource, in order of resources.
		var defs = split_params(line, ',');
		var frame = [];
		for (var i = 0; i < ani.resources.length; ++i)
			frame.push(null);
		if (defs.length != frame.length)
			console.warn('not all resources are defined by frame', line);
		for (var k = 0; k < defs.length; ++k) {
			var chunks = split_params(defs[k], ' ');
			var names = ['sprite', 'x', 'y'];
			var sprite = {};
			for (var n = 0; n < names.length; ++n) {
				var name = names[n];
				var datum = chunks[n];
				if (datum.match(/^[A-Za-z]+[0-9A-Za-z]*$/))
					sprite[name] = datum;
				else
					sprite[name] = Number(datum);
			}
			// Find resource.
			outer: while (true) { // This while is always broken out; it is used to define the point to continue.
				for (var i = 0; i < ani.resources.length; ++i) {
					var sprites = ani.resource[ani.resources[i]].sprites;
					if (sprites[sprite.sprite] !== undefined) {
						// Resource found.
						if (frame[i] !== null)
							console.warn('duplicate sprite definition for resource', ani.resources[i], 'on line', line);
						frame[i] = sprite;
						break outer;
					}
				}
				console.warn('Ignoring use of undefined sprite', sprite, 'on line', line);
				break;
			}
		}
		return frame;
	};

	for (var i = frames_start; i <= frames_end; ++i) {
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
			for (var dir = 0; dir < frame_size; ++dir) {
				// frame.data.length == 1 for singledir and 4 for multidir
				frame.data.push(parse_frame_defs(pending_lines[dir]));
			}
			for (var k = frame_size; k < pending_lines.length; ++k) {
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
	for (var i = 0; i < ani.frames.length; ++i) {
		ani.frames[i].time = ani.duration;
		ani.duration += ani.frames[i].wait;
	}

	// combine sprite blocks into single definition.
	for (var i = 0; i < ani.resources.length; ++i) {
		var r = ani.resource[ani.resources[i]];
		// combine y sequences first.
		var names = [];
		for (var n in r.sprites)
			names.push(Number(n));
		names.sort();
		var base = names[0];
		r.sprites[base].num_y = 1;
		for (var n = 1; n < names.length; ++n) {
			if (base % 10 == 0 && r.sprites[names[n]].w == r.sprites[base].w && r.sprites[names[n]].h == r.sprites[base].h && names[n] - base < 10 && names[n] == names[n - 1] + 1 && r.sprites[names[n]].x == r.sprites[base].x && r.sprites[names[n]].y == r.sprites[base].y + (names[n] - base) * r.sprites[base].h) {
				r.sprites[base].num_y += 1;
				r.lookup[names[n]] = [base, 0, r.sprites[base].num_y - 1];
				delete r.sprites[names[n]];
			}
			else {
				base = names[n];
				r.sprites[base].num_y = 1;
			}
		}
		// now combine x sequences.
		names = [];
		for (var n in r.sprites)
			names.push(Number(n));
		names.sort();
		base = names[0];
		r.sprites[base].num_x = 1;
		r.sprites[base].dx = r.sprites[base].num_y > 1 ? 10 : 1;
		for (var n = 1; n < names.length; ++n) {
			if (base % r.sprites[base].dx == 0 && r.sprites[names[n]].w == r.sprites[base].w && r.sprites[names[n]].h == r.sprites[base].h && names[n] == names[n - 1] + r.sprites[base].dx && r.sprites[names[n]].y == r.sprites[base].y && r.sprites[names[n]].x == r.sprites[base].x + (names[n] - base) / r.sprites[base].dx * r.sprites[base].w && r.sprites[names[n]].num_y == r.sprites[base].num_y) {
				r.sprites[base].num_x += 1;
				for (var k = 0; k < r.sprites[names[n]].num_y; ++k)
					r.lookup[names[n] + k] = [base, r.sprites[base].num_x - 1, r.lookup[names[n] + k][2]];
				delete r.sprites[names[n]];
			}
			else {
				base = names[n];
				r.sprites[base].num_x = 1;
			}
		}
	}
	if (ani.frames.length > 0)
		return ani;
	else
		return null;
}
// }

// This function is called before drawing the next frame on screen.
function animate() {
	timeout = null;
	if (current === null) {
		return;
	}
	if (current_animation === null) {
		current_animation = current;
		current_frame = 0;
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
	var dt = current_animation.frames[current_frame].time + current_animation.frames[current_frame].wait - now;
	timeout = setTimeout(animate, dt);
}

// Helper functions. {
// Change the current animation, optionally with a start_time.
function set_animation(name, time) {
	if (gani[name] === undefined) {
		console.warn('Trying to play undefined animation:', name);
		current = null;
		return;
	}
	get('newname').value = name;
	current = gani[name];
	start_time = time !== undefined ? time : performance.now();
	// Draw first frame on empty screen.
	set_frame(current, 0);
	if (timeout !== null)
		clearTimeout(timeout);
	animate();

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
	// Remove old values. {
	if (table.resources !== undefined) {
		for (var r = 0; r < table.resources.length; ++r) {
			table.resources[r].heading.parentNode.removeChild(table.resources[r].heading);
			table.resources[r].image.parentNode.removeChild(table.resources[r].image);
			table.resources[r].titles.parentNode.removeChild(table.resources[r].titles);
			table.resources[r].footing.parentNode.removeChild(table.resources[r].footing);
			table.resources[r].frame.parentNode.removeChild(table.resources[r].frame);
			for (var s in table.resources[r].sprites) {
				table.resources[r].sprites[s].row.parentNode.removeChild(table.resources[r].sprites[s].row);
			}
		}
	}
	table.resources = [];
	// }
	// Fill new sprites table. {
	var end = get('newresource');
	for (var index = 0; index < current.resources.length; ++index) { // Insert resources in table.
		var resource = current.resource[current.resources[index]];
		var r = {};
		table.resources.push(r);
		r.sprites = {};
		// Create heading. {
		r.heading = Create('tr');
		end.parentNode.insertBefore(r.heading, end);
		var th = r.heading.AddElement('th');
		th.colSpan = 3;
		th.AddText('Resource: ' + current.resources[index]);
		th = r.heading.AddElement('th');
		th.colSpan = 5;
		var input = th.AddElement('select').AddEvent('change', function() {
			// Handle file change.
			this.resource.file = this.selectedOptions[0].value;
			this.img.src = 'img/' + this.resource.file;
			// Update animations, they may be using this image.
			var selected = get('frameselect').value;
			set_frame(current, selected, true);
			set_frame(current_animation, current_frame);
		});
		input.resource = resource;
		for (var i = 0; i < imgfiles.length; ++i) {
			var option = input.AddElement('option').AddText(imgfiles[i]);
			option.value = imgfiles[i];
			if (imgfiles[i] == resource.file)
				option.selected = true;
		}
		r.heading.AddElement('td').AddElement('button', 'removebutton').AddText('Remove').AddEvent('click', function() {
			// TODO: remove resource.
		}).type = 'button';
		// }
		// Create image. {
		r.image = Create('tr');
		var td = r.image.AddElement('td');
		td.colSpan = 9;
		var container = td.AddElement('div', 'container');
		r.box = container.AddElement('div', 'box');
		input.img = container.AddElement('img');
		input.img.src = 'img/' + resource.file;
		r.update_box = function() {
			var selected = this.selectvalues[this.select.value];
			this.selectvalue.ClearAll().AddText(selected);
			var bxy = this.resource.lookup[selected];
			var info = this.resource.sprites[bxy[0]];
			this.box.style.left = info.x - 4 + 'px';
			this.box.style.top = info.y - 4 + 'px';
			this.box.style.width = info.w * info.num_x - 1 + 'px';
			this.box.style.height = info.h * info.num_y - 1 + 'px';
			this.box.ClearAll();
			for (var y = 0; y < info.num_y; ++y) {
				for (var x = 0; x < info.num_x; ++x) {
					var cell = this.box.AddElement('div', x == bxy[1] && y == bxy[2] ? 'selectedcell' : 'cell');
					cell.style.left = x * info.w + 1;
					cell.style.top = y * info.h + 1;
					cell.style.width = info.w - 1;
					cell.style.height = info.h - 1;
				}
			}
		};
		r.resource = resource;
		// Sprite selection in Sprite properties frame.
		r.select = td.AddElement('input').AddEvent('input', function() {
			this.r.update_box();
		});
		r.select.type = 'range';
		r.select.min = 0;
		r.select.value = 0;
		r.selectvalue = td.AddElement('span');
		r.selectvalues = [];
		r.select.r = r;
		end.parentNode.insertBefore(r.image, end);
		// }
		// Create titles. {
		r.titles = Create('tr');
		var titles = ['', 'Sprite', 'X', 'Y', 'Width', 'Height', '#X', '#Y', ''];
		for (var t = 0; t < titles.length; ++t)
			r.titles.AddElement('th').AddText(titles[t]);
		end.parentNode.insertBefore(r.titles, end);
		// }
		// Create footing {
		r.footing = Create('tr');
		end.parentNode.insertBefore(r.footing, end);
		var td = r.footing.AddElement('td');
		td.colSpan = 9;
		td.AddElement('button').AddText('Create ' + current.resources[index] + ' Sprite').AddEvent('click', function() {
			// TODO: create new sprite.
		}).type = 'button';
		// }
		// Create frame row {
		r.frame = framestable.AddElement('tr');
		r.frame.AddElement('th').AddText(current.resources[index]);
		// Create 4 of each.
		r.frame.select = [];
		r.frame.x = [];
		r.frame.y = [];
		for (var d = 0; d < 4; ++d) {
			td = r.frame.AddElement('td');
			r.frame.select.push(td.AddElement('select').AddEvent('change', function() {
				var selected = get('frameselect').value;
				var data = current.frames[selected].data[this.d];
				data[this.index].sprite = Number(this.value);
				this.r.update_frame();
				set_frame(current, selected, true);
			}));
			r.frame.select[d].r = r;
			r.frame.select[d].index = index;
			r.frame.select[d].d = d;
			r.frame.x.push(r.frame.AddElement('td').AddElement('input').AddEvent('input', function() {
				// Value of X changed.
				var selected = get('frameselect').value;
				var data = current.frames[selected].data[this.d];
				data[this.index].x = Number(this.value);
				set_frame(current, selected, true);
			}));
			r.frame.x[d].type = 'number';
			r.frame.x[d].index = index;
			r.frame.x[d].d = d;
			r.frame.x[d].min = -1000;
			r.frame.x[d].max = 1000;
			r.frame.x[d].step = 1;
			r.frame.y.push(r.frame.AddElement('td').AddElement('input').AddEvent('input', function() {
				// Value of Y changed.
				var selected = get('frameselect').value;
				var data = current.frames[selected].data[this.d];
				data[this.index].y = Number(this.value);
				set_frame(current, selected, true);
			}));
			r.frame.y[d].type = 'number';
			r.frame.y[d].index = index;
			r.frame.y[d].d = d;
			r.frame.y[d].min = -1000;
			r.frame.y[d].max = 1000;
			r.frame.y[d].step = 1;
		}
		r.update_frame = function() {
			var frameselect = get('frameselect');
			var selected_frame = frameselect.value;
			if (selected_frame >= current.frames.length)
				return;
			for (var d = 0; d < this.frame.select.length; ++d) {
				this.frame.select[d].ClearAll();
				var data = current.frames[selected_frame].data[d];
				if (data === undefined) {
					this.frame.x[d].value = '';
					this.frame.y[d].value = '';
					continue;
				}
				for (var s in this.resource.lookup) {
					var option = this.frame.select[d].AddElement('option').AddText(s);
					option.value = s;
					if (data[this.index].sprite == s) {
						this.frame.select[d].selectedIndex = this.frame.select[d].options.length - 1;
						this.frame.x[d].value = data[this.index].x;
						this.frame.y[d].value = data[this.index].y;
					}
				}
			}
		}
		r.index = index;
		// }
		var names = [];
		for (var s in resource.lookup)
			names.push(Number(s));
		names.sort();
		var spritelist = [];
		for (var s = 0; s < names.length; ++s) {
			r.selectvalues.push(names[s]);
			var bxy = resource.lookup[names[s]];
			if (bxy[1] == 0 && bxy[2] == 0)
				spritelist.push([bxy[0], r.selectvalues.length - 1]);
		}
		for (var s = 0; s < spritelist.length; ++s) { // Create sprite rows.
			var sprite = resource.sprites[spritelist[s][0]];
			r.sprites[spritelist[s][0]] = {index: spritelist[s][1]};
			// Sprite row in Sprite properties.
			var tr = r.sprites[spritelist[s][0]].row = Create('tr');
			end.parentNode.insertBefore(tr, r.footing);
			var td = tr.AddElement('td');
			var input = td.AddElement('button').AddText('Show').AddEvent('click', function() {
				var select = this.r.select;
				this.r.select.value = this.r.sprites[this.sprite].index;
				this.r.update_box();
			});
			input.r = r;
			input.sprite = spritelist[s][0];
			input.type = 'button';
			// Sprite name input.
			td = tr.AddElement('td');
			input = td.AddElement('input').AddEvent('change', function() {
				// Handle sprite name change.
				var name = this.value;
				// TODO: make name unique.
				var old = this.code;
				current.sprites[name] = current.sprites[old];
				delete current.sprites[old];
				for (var f = 0; f < current.frames.length; ++f) {
					var frame = current.frames[f].data;
					for (var d = 0; d < frame.length; ++d) {
						if (frame[d][this.index].sprite == old)
							frame[d][this.index].sprite = name;
					}
				}
			});
			input.index = index;
			input.type = 'number';
			input.min = 0;
			input.step = 1;
			input.value = spritelist[s][0];
			input.code = spritelist[s][0];
			// Sprite property inputs.
			var props = ['x', 'y', 'w', 'h', 'num_x', 'num_y'];
			for (var i = 0; i < props.length; ++i) {
				td = tr.AddElement('td');
				input = td.AddElement('input').AddEvent('input', function() {
					// Handle property change.
					this.sprite[this.prop] = this.value;
					// Update the box, for when this sprite is displayed.
					table.resource[current.resources[this.index]].update_box();
				});
				input.prop = props[i];
				input.sprite = sprite;
				input.index = index;
				input.type = 'number';
				input.value = sprite[props[i]];
			}
			// Sprite remove button.
			tr.AddElement('td').AddElement('button', 'removebutton').AddText('Remove').AddEvent('click', function() {
				// TODO: remove sprite.
			});
		}
		r.select.max = r.selectvalues.length - 1;
	}

	// }
	get('frameselect').max = current.frames.length > 0 ? current.frames.length - 1 : 0;
	get('numframes').value = current.frames.length;
	// Update all boxes. {
	for (var r = 0; r < table.resources.length; ++r)
		table.resources[r].update_box();
	update_frame();
	// }
	// }
}

// Update the display for a new frame.
function set_frame(animation, frame, frame_preview) {
	var preview;
	var r;
	if (frame_preview) {
		preview = get('fpreview');
		fresources = [];
		r = fresources;
	}
	else {
		current_animation = animation;
		current_frame = frame;
		preview = get('preview');
		resources = [];
		r = resources;
	}
	// r[d] is a direction.
	// r[d][i] is the div for resource i, direction d.
	preview.ClearAll();
	var dirs = animation.single_dir ? ['75%'] : ['60%', '70%', '80%', '90%'];
	for (var dir = 0; dir < dirs.length; ++dir) {
		r.push([]);
		var d = animation.frames[frame].data[dir];
		var parent = preview.AddElement('div', 'character');
		parent.style.left = dirs[dir];
		for (var i = 0; i < d.length; ++i) {
			//if (frame_preview)
			//	console.info(dir, i, d[i].sprite);
			var resource = animation.resource[animation.resources[i]];
			var s = d[i].sprite;
			var info = resource.lookup[s];
			var sprite = resource.sprites[info[0]];
			r[dir].push(parent.AddElement('div', 'part'));
			var part = r[dir][i];
			part.style.left = d[i].x + 'px';
			part.style.top = (d[i].y + 64) + 'px';
			part.style.width = sprite.w + 'px';
			part.style.height = sprite.h + 'px';
			part.style.backgroundImage = "url('img/" + resource.file + "')";
			part.style.backgroundPosition = -(sprite.x + info[1] * sprite.w) + 'px ' + -(sprite.y + info[2] * sprite.h) + 'px';
		}
	}
}

// This function creates gani text from animation data.
function make_gani(ani) {
	var ret = 'GANI0001\n';

	// Sprite definitions.
	for (var r = 0; r < ani.resources.length; ++r) {
		var rname = ani.resources[r];
		var resource = ani.resource[rname];
		for (var s in resource.lookup) {
			ret += 'SPRITE\t' + s + '\t' + rname.toUpperCase();
			var bxy = resource.lookup[s];
			var sprite = resource.sprites[bxy[0]];
			console.info(sprite);
			ret += '\t' + (sprite.x + bxy[1] * sprite.w);
			ret += '\t' + (sprite.y + bxy[2] * sprite.h);
			var props = ['w', 'h', 'hint'];
			for (var p = 0; p < props.length; ++p)
				ret += '\t' + sprite[props[p]];
			ret += '\n';
		}
	}
	ret += '\n';

	// Global settings.
	if (ani.setbackto === false) {
		// Do nothing.
	}
	else if (ani.setbackto == 0)
		ret += 'LOOP\nCONTINUOUS\n';
	else
		ret += 'CONTINUOUS\nSETBACKTO ' + ani.setbackto + '\n';
	for (var r = 0; r < ani.resources.length; ++r) {
		var rname = ani.resources[r];
		ret += 'DEFAULT' + rname.toUpperCase() + '\t' + ani.resource[rname].file + '\n';
	}
	ret += '\n';

	// Animation.
	ret += 'ANI\n';
	for (var f = 0; f < ani.frames.length; ++f) {
		var frame = ani.frames[f];
		for (var d = 0; d < frame.data.length; ++d) {
			var data = frame.data[d];
			sep = '';
			for (var r = 0; r < data.length; ++r) {
				ret += sep + '\t' + data[r].sprite + '\t' + data[r].x + '\t' + data[r].y;
				sep = ',';
			}
			ret += '\n';
		}
		if (frame.wait != ani.base_speed)
			ret += 'WAIT ' + (frame.wait / ani.base_speed - 1) + '\n';
		ret += '\n';
	}
	ret += 'ANIEND\n';
	return ret;
}
// }

// UI callback functions. {
// This function is called when a new animation is selected in the UI.
function select_animation() {
	// Respond to a new selection in the animation control.
	var ani = get('animation');
	if (ani.options.length <= ani.selectedIndex)
		return;
	var cur = ani.selectedOptions[0].value;
	if (cur == 'Create New') {
		// TODO: Create new animation.
	}
	set_animation(cur == '- ' ? null : cur);
}

// This function is called when the "one direction" button is toggled.
function set_type() {
	if (get('freeze').checked)
		current.setbackto = false;
	else if (get('loop').checked)
		current.setbackto = 0;
	else if (get('setback').checked)
		current.setbackto = get('setbackto').value;
	else
		console.warn('set_type called without a selected type');
}

// This function is called when the "one direction" button is toggled.
function set_direction() {
	current.single_dir = get('onedirection').checked;
	// If moving to single_dir, delete all other frames; otherwise generate them.
	for (var f = 0; f < current.frames.length; ++f) {
		if (current.single_dir)
			current.frames[f].data = [current.frames[f].data[0]];
		else while (current.frames[f].data.length < 4) {
			// Do a deep copy.
			var src = current.frames[f].data[0];
			var copy = [];
			for (var i = 0; i < src.length; ++i) {
				var keys = ['sprite', 'x', 'y'];
				var obj = {};
				for (var k = 0; k < keys.length; ++k)
					obj[keys[k]] = src[i][keys[k]];
				copy.push(obj);
			}
			current.frames[f].data.push(copy);
		}
	}
	select_animation();
}

// This function is called when a key is pressed in the name input box.
function namekey(event) {
	// Respond to a key in the rename input.
	if (event.keyCode != 13)
		return;
	event.preventDefault();
	var name = get('newname').value;
	var select = get('animation');
	var option = select.selectedOptions[0];
	var old_name = option.value;
	// Make name unique.
	var newname = name;
	var i = 0;
	while (newname != old_name && gani[newname] !== undefined) {
		newname = name + '-' + i;
		i += 1;
	}
	get('newname').value = newname;
	// Replace content and set value.
	option.ClearAll().AddText(newname).value = newname;
	select = get('setbackto');
	for (var o = 0; o < select.options.length; ++o) {
		if (select.options[o].value == old_name) {
			// Replace content and set value.
			select.options[o].ClearAll().AddText(newname).value = newname;
		}
	}
	for (var g in gani) {
		if (gani[g].setbackto == old_name)
			gani[g].setbackto = newname;
	}
	var ani = gani[old_name];
	delete gani[old_name];
	gani[newname] = ani;
}

// This function is called when the "create resource" button is pressed.
function createresource() {
	// TODO: Add new resource.
}

// This functin is called when the value of the hold time is changed.
function new_time() {
	var frame = get('frameselect').value;
	current.frames[frame].wait = Number(get('time').value);
	if (current.frames[frame].wait < 50)
		current.frames[frame].wait = 50;
	// Recalculate timings. {
	current.duration = 0;
	for (var f = 0; f < current.frames.length; ++f) {
		current.frames[f].time = current.duration;
		current.duration += current.frames[f].wait;
	}
	// }
}

// This functin is called when the "new frame" button is clicked.
function change_num_frames() {
	// TODO: Add or remove frames.
	var num_frames = Number(get('numframes').value);
	// Weird notation to make sure non-numbers will be corrected as well.
	if (!(num_frames > 0)) {
		num_frames = current.frames.length;
		get('numframes').value = num_frames;
	}
}

// This function is called when a new frame is selected.
function update_frame() {
	var frame = Number(get('frameselect').value);
	get('framenum').ClearAll().AddText(frame);
	get('time').value = current.frames[frame].wait;
	var data = get('spritelist').resources
	for (var r in data)
		data[r].update_frame();
	set_frame(current, frame, true);
}

// This functin is called when the "save" button is clicked.
function save() {
	var data = make_gani(current);
	var a = Create('a');
	a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(data);
	a.download = get('animation').selectedOptions[0].value + '.gani';
	var event = document.createEvent('MouseEvents');
	event.initEvent('click', true, true);
	a.dispatchEvent(event);
}
// }

// vim: set foldmethod=marker foldmarker={,} :
