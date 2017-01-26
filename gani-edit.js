/*
Data structure:

animations = [ Animation(), ... ];

Animation = {
	index: 0,			// index of self in animations array.
	resources: [ Resource(), ... ],	// sprite data.
	default_hold: 50,		// ms/frame.
	duration: 0,			// ms; total duration of animation.
	single_dir: false,		// whether there is 1 or 4 directions.
	setbackto: false,		// false for freeze, true for loop, index into animations for other.  During load: not index, but name.
	frames: [ Frame(), ... ],	// frame definitions.
	ui_sprites: div,		// sprite information, inserted into sprite definitions table when activating this animation.
	ui_frames: array of tr,		// resource rows in frame definition table, inserted when activating this animation.

	ui_select = function(),		// make this the active animation.
	ui_deselect = function(),	// make this no longer the active animation.
	ui_update: function(),		// reflect changes in underlying data in the UI.
	compute_timings: function(),	// recompute frame times and duration.
}; 

Resource = {
	animation: animations[0],	// parent animation.
	index: 0,			// index of self in parent.resources.
	name: 'shadow',			// name of this resource.
	sprites: [ Sprite(), ... ],	// sprites that are defined for this resource.
	li: li,				// html element in parent.ui_sprites.
	name_input: input,		// html element for name change.
	remove: button,			// resource remove button.
	image_select: select,		// html element to select default image.
	box: div,			// html element to show selected sprites on image.
	img: img,			// html element to show selected default image.
	select: input[type='range'],	// selector for box.
	selectvalue: span,		// indicator for selected sprite in select.
	table: table,			// html element for showing sprite definitions.
	frame_name: th,			// html element for showing resource name in frame definitions table.
	frame_sprite: [ select ] * 4,	// html elements for selecting sprite of frame.
	frame_x: [ input ] * 4,		// html elements for selecting x of frame.
	frame_y: [ input ] * 4,		// html elements for selecting y of frame.

	ui_update: function(),		// reflect changes in underlying data in the UI.
	update_box: function(),		// redraw the box that shows the selected sprite.
};

Sprite = {
	resource: animations[0].resources[0],	// parent resource.
	index: 0,				// index into parent.resources.
	tr: tr,					// html element to hold sprite definition data.
	attrs: ['name', ...],			// constant list of attributes that are in the tr.
	cells: [ input ] * attrs.length,	// table cells for sprite definition table.
	name: 100,				// sprite name.
	x: 0,					// x coordinate.
	y: 0,					// y coordinate.
	w: 32,					// width.
	h: 32,					// height.
	num_x: 1,				// number of sprites horizontally, names separated by dx.
	num_y: 4,				// number of sprites vertically, names separated by 1.
	dx: 10,					// 1 if num_y == 1, 10 otherwise.

	remove: function(),			// remove this sprite.
	ui_update: function(),			// reflect changes in underlying data in the UI.
};

Frame = {
	animation: animations[0],			// parent animation.
	index: 0,					// index in parent.frames.
	data: [ [ { sprite: [100, 2, 0], x: 0, y: 0 } ] * 4 ],	// frame data for 4 directions; if parent.single_dir, only first element is used, but all are always present.
	hold_time: 50,					// ms; time to hold this frame.
	audio: false,					// false for no audio, otherwise index into audiofiles.

	remove: function(),				// remove this frame.
	ui_update: function(),				// reflect changes in underlying data in the UI.
};
 */

// Global variables. {
// Database of all known ganis.
var animations = [];
// Currently edited animation object.
var current = null;
// Currently previewed animation (with setbackto, this need not be equal to current).
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
// All audio files that are available.
var audiofiles = [];
// Handle to cancel pending timeout; null if no timeout is pending.
var timeout = null;
// Constant: default hold time for frames.
var default_hold = 50;
// }

// Data management, including UI. {
function Animation(name) {
	this.name = name;
	this.index = animations.length;
	animations.push(this);
	// Data members of this object: {
	this.name = name;
	this.resources = [];
	this.default_hold = default_hold;
	this.duration = 0;
	this.single_dir = false;
	this.setbackto = false;
	this.frames = [];
	this.ui_sprites = Create('div'); // {
	this.ui_sprites.ul = this.ui_sprites.AddElement('ul');
	// }
	this.ui_frames = []; // This is a list of tr elements.
	// }
	// Methods. {
	// Hide previous animation and show this one in the interface.
	this.ui_select = function() {
		get('sprites').Add(this.ui_sprites);
		var table = get('frames');
		for (var i = 0; i < this.ui_frames.length; ++i)
			table.Add(this.ui_frames[i]);
		this.ui_update();
	};
	this.ui_deselect = function() {
		get('sprites').ClearAll();
		for (var i = 0; i < this.ui_frames.length; ++i)
			this.ui_frames[i].parentNode.removeChild(this.ui_frames[i]);
	};
	// Update the UI to reflect state of variables.
	this.ui_update = function() {
		// Update UI.
		// Animation Properties. {
		get('newname').value = this.name;
		for (var r = 0; r < this.resources.length; ++r)
			this.resources[r].update_box();
		if (current !== null) {
			// Setbackto controls. {
			if (current.setbackto === false)
				get('freeze').checked = true;
			else if (current.setbackto === true)
				get('loop').checked = true;
			else {
				get('setback').checked = true;
				get('setbackto').selectedIndex = current.setbackto;
			}
			// }
			// Single Direction checkbox. {
			get('onedirection').checked = current.single_dir;
			// }
		}
		// }

		// Sprite Definitions. {
		for (var i = 0; i < this.resources.length; ++i)
			this.resources[i].ui_update();
		// }

		// Frame Definitions. {
		get('numframes').value = this.frames.length;
		get('frameselect').max = this.frames.length - 1;
		var frame = get('frameselect').value;
		if (frame < this.frames.length)
			this.frames[frame].ui_update();
		// }

		// Update the bottom preview.  (Top is animated, so updates automatically.)
		update_frame();
	};
	this.compute_timings = function() {
		this.duration = 0;
		for (var i = 0; i < this.frames.length; ++i) {
			this.frames[i].time = this.duration;
			this.duration += this.frames[i].hold_time;
		}
	};
	// Create gani text from animation data.
	this.make_gani = function() {
		var ret = 'GANI0001\n';

		// Sprite definitions.
		for (var r = 0; r < this.resources.length; ++r) {
			var rname = this.resources[r].name;
			var resource = this.resources[r];
			for (var s = 0; s < resource.sprites.length; ++s) {
				var sprite = resource.sprites[s];
				for (var x = 0; x < sprite.num_x; ++x) {
					for (var y = 0; y < sprite.num_y; ++y) {
						ret += 'SPRITE\t' + (sprite.name + x * sprite.dx + y) + '\t' + rname.toUpperCase();
						ret += '\t' + (sprite.x + x * sprite.w);
						ret += '\t' + (sprite.y + y * sprite.h);
						var props = ['w', 'h', 'hint'];
						for (var p = 0; p < props.length; ++p)
							ret += '\t' + sprite[props[p]];
						if (sprite.num_x > 1)
							ret += ' ' + x;
						if (sprite.num_y > 1) {
							if (sprite.num_x == 1 || sprite.num_y != 4)
								ret += ' ' + y;
							if (sprite.num_y == 4) {
								ret += ' ' + ['up', 'left', 'down', 'right'][y];
							}
						}
						ret += '\n';
					}
				}
			}
		}
		ret += '\n';

		// Global settings.
		if (this.setbackto === false) {
			// Do nothing.
		}
		else if (this.setbackto === true)
			ret += 'LOOP\nCONTINUOUS\n';
		else
			ret += 'CONTINUOUS\nSETBACKTO ' + animations[this.setbackto].name + '\n';
		for (var r = 0; r < this.resources.length; ++r) {
			var rname = this.resources[r].name;
			ret += 'DEFAULT' + rname.toUpperCase() + '\t' + this.resources[r].file + '\n';
		}
		ret += '\n';

		// Animation.
		ret += 'ANI\n';
		for (var f = 0; f < this.frames.length; ++f) {
			var frame = this.frames[f];
			for (var d = 0; d < (this.single_dir ? 1 : 4); ++d) {
				console.info(frame, d);
				var data = frame.data[d];
				sep = '';
				for (var r = 0; r < data.length; ++r) {
					var sprite = data[r].sprite;
					var rsprite = this.resources[r].sprites[sprite[0]];
					ret += sep + '\t' + (rsprite.name + sprite[1] * rsprite.dx + sprite[2]) + '\t' + data[r].x + '\t' + data[r].y;
					sep = ',';
				}
				ret += '\n';
			}
			if (frame.hold_time != this.default_hold)
				ret += 'WAIT ' + (frame.hold_time / this.default_hold - 1) + '\n';
			ret += '\n';
		}
		ret += 'ANIEND\n';
		return ret;
	};
	// }
}

function Resource(animation, name) {
	this.animation = animation;
	this.index = this.animation.resources.length;
	this.animation.resources.push(this);
	this.name = name;
	this.sprites = [];
	this.li = animation.ui_sprites.ul.AddElement('li');
	this.li.AddText('Resource: ');
	this.name_input = this.li.AddElement('input');
	this.name_input.type = 'text';
	this.name_input.resource = this;
	this.name_input.AddEvent('keydown', function(event) {
		if (event.keyCode != 13)
			return;
		event.preventDefault();
		this.resource.name = this.value;
		this.resource.animation.ui_update();
	});
	this.remove = this.li.AddElement('button').AddText('Remove').AddEvent('click', function() {
		// Remove resource.
		while (this.resource.sprites.length > 0)
			this.resource.sprites[0].remove();
		this.resource.li.parentNode.removeChild(this.resource.li);
		this.resource.animation.resources.splice(this.resource.index, 1);
		for (var i = this.resource.index; i < this.resource.animation.resources.length; ++i)
			this.resource.animation.resources[i].index -= 1;
	});
	this.remove.type = 'button';
	this.remove.resource = this;
	this.li.AddElement('br');
	this.image_select = this.li.AddElement('select');
	for (var i = 0; i < imgfiles.length; ++i)
		this.image_select.AddElement('option').AddText(imgfiles[i]).value = i;
	this.image_select.AddEvent('change', function() {
		this.resource.file = this.selectedOptions[0].value;
		this.resource.ui_update();
	});
	this.image_select.resource = this;
	this.li.AddElement('br');
	var container = this.li.AddElement('div', 'container');
	this.box = container.AddElement('div', 'box');
	this.img = container.AddElement('img');
	this.img.src = 'img/' + this.file;
	this.update_box = function() {
		var selected = this.selectvalues[this.select.value];
		if (selected === undefined)
			return;
		this.selectvalue.ClearAll().AddText(selected[3]);
		var info = this.sprites[selected[0]];
		if (info !== undefined) {
			this.box.style.left = info.x - 4 + 'px';
			this.box.style.top = info.y - 4 + 'px';
			this.box.style.width = info.w * info.num_x - 1 + 'px';
			this.box.style.height = info.h * info.num_y - 1 + 'px';
			this.box.ClearAll();
			for (var y = 0; y < info.num_y; ++y) {
				for (var x = 0; x < info.num_x; ++x) {
					var cell = this.box.AddElement('div', x == selected[1] && y == selected[2] ? 'selectedcell' : 'cell');
					cell.style.left = x * info.w + 1;
					cell.style.top = y * info.h + 1;
					cell.style.width = info.w - 1;
					cell.style.height = info.h - 1;
				}
			}
		}
	};
	// Sprite selection in Sprite properties frame.
	this.select = this.li.AddElement('input').AddEvent('input', function() {
		this.resource.update_box();
	});
	this.selectvalues = [];
	this.select.type = 'range';
	this.select.min = 0;
	this.select.value = 0;
	this.selectvalue = this.li.AddElement('span');
	this.select.resource = this;
	this.li.AddElement('br');
	this.table = this.li.AddElement('table');
	var tr = this.table.AddElement('tr');
	var titles = ['', 'Sprite', 'X', 'Y', 'Width', 'Height', '#X', '#Y', 'Hint', ''];
	for (var i = 0; i < titles.length; ++i)
		tr.AddElement('th').AddText(titles[i]);
	e = this.li.AddElement('button').AddText('Create ' + this.name + ' Sprite').AddEvent('click', function() {
		var name = 100;
		while (this.resource.sprites[name] !== undefined)
			name += 100;
		new Sprite(this.resource, name);
		this.resource.ui_update();
	});
	e.type = 'button';
	e.resource = this;

	// Add resource to frames.
	tr = Create('tr');
	this.animation.ui_frames.push(tr);
	this.frame_name = tr.AddElement('th');
	this.frame_sprite = [];
	this.frame_x = [];
	this.frame_y = [];
	for (var d = 0; d < 4; ++d) {
		var select = tr.AddElement('td').AddElement('select').AddEvent('change', function() {
			var option = this.selectedOptions[0];
			if (option === undefined)
				return;
			var frame = Number(get('frameselect').value);
			if (this.resource.animation.frames[frame] === undefined)
				return;
			this.resource.animation.frames[frame].data[this.index][this.resource.index].sprite = option.data;
			// Update the static preview; the animated preview will update itself.
			update_frame();
		});
		select.resource = this;
		select.index = d;
		this.frame_sprite.push(select);
		var xy = ['x', 'y'];
		for (var c = 0; c < xy.length; ++c) {
			e = tr.AddElement('td').AddElement('input');
			this['frame_' + xy[c]].push(e);
			e.type = 'number';
			e.resource = this;
			e.c = xy[c];
			e.dir = d;
			e.AddEvent('input', function() {
				// Update animation data.
				var framenum = get('frameselect').value;
				var frame = this.resource.animation.frames[framenum];
				frame[this.dir][this.c] = this.value;
				this.resource.animation.ui_update();
			});
		}
	}

	this.ui_update = function() {
		// Update name.
		this.name_input.value = this.name;
		this.frame_name.ClearAll().AddText(this.name);
		// Update image and box.
		this.image_select.selectedIndex = this.file;
		this.img.src = 'img/' + imgfiles[this.file];
		this.update_box();
		// Update sprites.
		var num_sprites = 0;
		this.selectvalues = [];
		for (var i = 0; i < this.sprites.length; ++i) {
			this.sprites[i].selectindex = num_sprites;
			num_sprites += this.sprites[i].num_x * this.sprites[i].num_y;
			this.sprites[i].ui_update();
			for (var x = 0; x < this.sprites[i].num_x; ++x) {
				for (var y = 0; y < this.sprites[i].num_y; ++y) {
					this.selectvalues.push([i, x, y, this.sprites[i].name + x * this.sprites[i].dx + y]);
				}
			}
		}
		this.select.max = num_sprites - 1;
		// Update frame data.
		var framenum = get('frameselect').value;
		var xy = ['x', 'y'];
		for (var d = 0; d < 4; ++d) {
			var sprite = this.animation.frames[framenum].data[d][this.index].sprite;
			this.frame_sprite[d].ClearAll();
			for (var s = 0; s < this.sprites.length; ++s) {
				var spr_obj = this.sprites[s];
				for (var x = 0; x < spr_obj.num_x; ++x) {
					for (var y = 0; y < spr_obj.num_y; ++y) {
						var num = spr_obj.name + x * spr_obj.dx + y;
						var option = this.frame_sprite[d].AddElement('option').AddText(num);
						option.value = num;
						option.data = [s, x, y];
						if (s == sprite[0] && x == sprite[1] && y == sprite[2])
							this.frame_sprite[d].selectedIndex = this.frame_sprite[d].options.length - 1;
					}
				}
			}
			for (var c = 0; c < xy.length; ++c)
				this['frame_' + xy[c]][d].value = this.animation.frames[framenum].data[d][this.index][xy[c]];
		}
	};
}

function Sprite(resource, name) {
	this.resource = resource;
	this.index = this.resource.sprites.length;
	this.resource.sprites.push(this);
	this.tr = this.resource.table.AddElement('tr');
	var td = this.tr.AddElement('td');
	var e = td.AddElement('button').AddText('Show').AddEvent('click', function() {
		var select = this.sprite.resource.select;
		this.sprite.resource.select.value = this.sprite.selectindex;
		this.sprite.resource.update_box();
	});
	e.type = 'button';
	e.sprite = this;

	this.attrs = ['name', 'x', 'y', 'w', 'h', 'num_x', 'num_y', 'hint'];
	this.cells = [];
	for (var i = 0; i < this.attrs.length; ++i) {
		td = this.tr.AddElement('td');
		this.cells.push(td.AddElement('input'));
		if (i < 7)
			this.cells[i].type = 'number';
		this.cells[i].sprite = this;
		this.cells[i].attr = this.attrs[i];
		this[this.attrs[i]] = 0;
		this.cells[i].AddEvent('change', function() {
			this.sprite[this.attr] = (this.attr != 'hint' ? Number(this.value) : this.value);
			this.sprite.resource.animation.ui_update();
		});
	}
	this.name = name;
	this.hint = 'Frame';

	td = this.tr.AddElement('td');
	e = td.AddElement('button').AddText('Remove').AddEvent('click', function() {
		this.sprite.remove();
	});
	e.sprite = this;
	e.type = 'button';
	this.remove = function() {
		this.tr.parentNode.removeChild(this.tr);
		this.resource.sprites.splice(this.index, 1);
		for (var i = this.index; i < this.resource.sprites.length; ++i)
			this.resource.sprites[i].index -= 1;
	};
	this.ui_update = function() {
		this.dx = this.num_y == 1 ? 1 : 10;
		for (var i = 0; i < this.attrs.length; ++i)
			this.cells[i].value = this[this.attrs[i]];
	};
}

function Frame(animation, base) {
	this.animation = animation;
	this.index = this.animation.frames.length;
	this.animation.frames.push(this);
	this.data = base.data;
	this.hold_time = base.hold_time;
	this.audio = base.audio;
	this.remove = function() {
		this.animation.frames.splice(this.index, 1);
		for (var i = this.index; i < this.animation.frames.length; ++i)
			this.animation.frames[i].index -= 1;
		this.animation.compute_timings();
	};
	this.ui_update = function() {
		get('time').value = this.hold_time;
		get('audio').selectedIndex = this.audio === false ? 0 : this.audio + 1;
		for (var r = 0; r < this.animation.resources.length; ++r)
			this.animation.resources[r].ui_update();
	}
}
// }

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
			else if (files[i].match(/^\.\/audio\//))
				audiofiles.push(files[i].slice(8));
			else {
				//console.info('not handled:', files[i]);
			}
		}
		var loadnext = function(data) {
			var current_gani = ganifiles.splice(0, 1)[0];
			parse_gani(current_gani.slice(0, -5), data);
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
	for (var a = 0; a < animations.length; ++a) {
		animations[a].index = a;
		get('animation').AddElement('option').AddText(animations[a].name).value = a;
		if (typeof(animations[a].setbackto) != 'boolean') {
			outer: while (true) {
				for (var i = 0; i < animations.length; ++i) {
					if (animations[i].name == animations[a].setbackto) {
						animations[a].setbackto = i;
						break outer;
					}
				}
				console.warn('setbackto set to nonexistent animation: ' + animations[a].setbackto + '; resetting to true');
				animations[a].setbackto = true;
				break;
			}
		}
		get('setbackto').AddElement('option').AddText(animations[a].name).value = a;
	}
	// This loads the new animation into the interface.
	select_animation();
	start_time = performance.now();
}

// Parse a single gani file.
function parse_gani(name, gani_text) {
	// This function is based on M.GRL source.
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
	var resource_names = [];	// order is significant.
	var resources = {};	// keys are resource names.
	var single_dir = false;
	var setbackto = false;

	var split_params = function(line, delim) {
		if (delim === undefined) {
			delim = ' ';
		}
		var parts = line.split(delim);
		var params = [];
		for (var i = 0; i < parts.length; ++i) {
			if (parts[i].length > 0) {
				params.push(parts[i]);
			}
		}
		return params;
	};

	var lines = gani_text.split('\n');
	// Read sprite definitions, animations settings, and line range of frame definitions.
	for (var i = 0; i < lines.length; ++i) {
		// Strip leading and trailing whitespace (including BOMs).
		var line = lines[i].replace(/^\s+|\s+$/g, '');
		if (line.length == 0)
			continue;
		var params = split_params(line);

		if (defs_phase) {
			// update a sprite definition
			if (params[0] == 'SPRITE') {
				var sprite_id = Number(params[1]);
				var cut = 0;
				if (params.slice(-1) == 'up')
					cut += 1;
				if (params.slice(-(cut + 1)) == '1')
					cut += 1;
				var sprite = {
					name: sprite_id,
					hint: params.slice(7, params.length - cut).join(' '),
				};
				var attrs = ['resource', 'x', 'y', 'w', 'h'];
				for (var k = 0; k < attrs.length; ++k) {
					var datum = params[k + 2];
					var attr = attrs[k];
					if (datum.match(/^[A-Za-z]+[0-9A-Za-z]*$/))
						sprite[attr] = datum.toLowerCase();
					else {
						if (k > 0)
							sprite[attr] = Number(datum);
						else
							sprite[attr] = datum;
					}
				}
				if (resources[sprite.resource] === undefined)
					resources[sprite.resource] = { sprites: {} };
				resources[sprite.resource].sprites[sprite_id] = sprite;
			}

			// single direction mode
			if (params[0] == 'SINGLEDIRECTION')
				single_dir = true;

			// loop mode
			if (params[0] == 'LOOP')
				setbackto = true;

			// continuous mode
			// if (params[0] == 'CONTINUOUS')
			//	setbackto = true;

			// setbackto setting
			if (params[0] == 'SETBACKTO') {
				var next_file = params[1];
				if (next_file.slice(-5) != '.gani')
					next_file += '.gani';
				setbackto = get_action_name(next_file);
			}

			// default values for attributes
			if (params[0].slice(0, 7) == 'DEFAULT') {
				var attr_name = params[0].slice(7).toLowerCase();
				var datum = params[1];
				if (resources[attr_name] === undefined) {
					console.warn('Setting default value for unused resource', attr_name);
					resources[attr_name] = { sprites: {} };
				}
				resources[attr_name].file = imgfiles.indexOf(datum);
				if (resources[attr_name].file < 0) {
					console.error('Used invalid image name', datum);
					resources[attr_name].file = 0;
				}
				resource_names.push(attr_name);
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

	// Combine sprite blocks into single definition.
	for (var i = 0; i < resource_names.length; ++i) {
		var r = resources[resource_names[i]];
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
				delete r.sprites[names[n]];
			}
			else {
				base = names[n];
				r.sprites[base].num_x = 1;
				r.sprites[base].dx = r.sprites[base].num_y > 1 ? 10 : 1;
			}
		}
	}

	// Parse a single direction's data from a frame line.
	var parse_frame_defs = function(line) {
		// Return [{sprite: 10, x: 0, y: 18}, ...] with one entry per resource, in order of resources.
		var defs = split_params(line, ',');
		var frame = [];
		for (var i = 0; i < resource_names.length; ++i)
			frame.push(null);
		if (defs.length != frame.length)
			console.warn('not all resources are defined by frame', line, defs, frame);
		for (var k = 0; k < defs.length; ++k) {
			var chunks = split_params(defs[k], ' ');
			var attrs = ['sprite', 'x', 'y'];
			var sprite = {};
			for (var n = 0; n < attrs.length; ++n)
				sprite[attrs[n]] = Number(chunks[n]);
			// Find resource.
			outer: while (true) { // This while is always broken out; it is used to define the point to continue.
				debug = '';
				for (var i = 0; i < resource_names.length; ++i) {
					var sprites = resources[resource_names[i]].sprites;
					for (var s in sprites) {
						debug += 'sprite ' + s + ':\t';
						for (var x = 0; x < sprites[s].num_x; ++x) {
							for (var y = 0; y < sprites[s].num_y; ++y) {
								debug += s + '+' + x + '*' + sprites[s].dx + '+' + y + '\t';
								if (Number(s) + x * sprites[s].dx + y == sprite.sprite) {
									// Resource found.
									if (frame[i] !== null)
										console.warn('duplicate sprite definition for resource', resources[i], 'on line', line);
									sprite.sprite = [Number(s), x, y];
									frame[i] = sprite;
									break outer;
								}
							}
						}
					}
				}
				console.warn(name, 'Ignoring use of undefined sprite', sprite.sprite, debug);
				break;
			}
		}
		return frame;
	};

	// Read frame definitions.
	var frames = [];
	var pending_lines = [];
	var frame_size = single_dir ? 1 : 4;
	for (var i = frames_start; i <= frames_end; ++i) {
		var line = lines[i].trim();
		pending_lines.push(line);
		// Process pending queue on blank line.
		if (pending_lines.length > frame_size && line.length === 0) {
			var frame = {
				'data': [],
				'time': 0,
				'hold_time': default_hold,
				'sound': false,
			};
			// Fill 4 directions with data; use the same data 4 times for single-dir animations.
			for (var dir = 0; dir < 4; ++dir)
				frame.data.push(parse_frame_defs(pending_lines[dir < frame_size ? dir : 0]));
			// Read other parameters.
			for (var k = frame_size; k < pending_lines.length; ++k) {
				var params = split_params(pending_lines[k]);
				if (params[0] === 'WAIT')
					frame.hold_time = default_hold * (Number(params[1]) + 1);
				else if (params[0] === 'PLAYSOUND') {
					frame.sound = {
						'file' : params[1],
						'x' : Number(params[2]),
						'y' : Number(params[3]),
					};
				}
			}
			frames.push(frame);
			pending_lines = [];
		}
	}

	// Don't create a new animation object for a broken file.
	if (frames.length <= 0) {
		console.error('Skipping file without animation', name);
		return;
	}

	// Create animation object.
	var ani = new Animation(name);
	ani.single_dir = single_dir;
	ani.setbackto = setbackto;	// Animation names will be changed to indices in loadend.
	// Add sprites to resource objects, in order.
	for (var i = 0; i < resource_names.length; ++i) {
		var resource = resources[resource_names[i]];
		var r = new Resource(ani, resource_names[i]);
		r.file = resource.file;
		var names = [];
		for (var s in resource.sprites)
			names.push(Number(s));
		names.sort();
		for (var s = 0; s < names.length; ++s) {
			var sprite = new Sprite(r, names[s]);
			for (var a = 0; a < sprite.attrs.length; ++a)
				sprite[sprite.attrs[a]] = resource.sprites[names[s]][sprite.attrs[a]];
		}
		// Convert sprite names to indices.
		for (var f = 0; f < frames.length; ++f) {
			for (var d = 0; d < 4; ++d) {
				outer: while (true) {
					for (var s = 0; s < names.length; ++s) {
						if (Number(frames[f].data[d][r.index].sprite[0]) == names[s]) {
							frames[f].data[d][r.index].sprite[0] = s;
							break outer;
						}
					}
					console.warn('sprite not found');
					break;
				}
			}
		}
	}
	for (var f = 0; f < frames.length; ++f)
		new Frame(ani, frames[f]);
	ani.compute_timings();
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
	var update;
	if (now >= current.duration) {
		if (current.setbackto === false) {
			// Freeze for one animation duration.
			now -= current.duration;
			update = false;
		}
		else if (current.setbackto === true) {
			// Loop the animation.
			now -= current.duration;
			start_time += current.duration;
			current_frame = 0;
			update = true;
		}
		else {
			// Continue with other animation.
			if (animations[current.setbackto] === undefined) {
				console.warn('unable to set animation to undefined setbackto', current.setbackto);
			}
			else {
				now -= current.duration;
				current_animation = animations[current.setbackto];
				current_frame = 0;
			}
			update = true;
		}
		if (now >= current_animation.duration) {
			current_animation = current;
			start_time = raw_now;
			now = 0;
			update = true;
		}
	}
	while (current_frame + 1 < current_animation.frames.length && now >= current_animation.frames[current_frame].time + current_animation.frames[current_frame].hold_time) {
		set_frame(current_animation, current_frame + 1);
		update = false;
	}
	if (current_frame >= current_animation.frames.length)
		current_frame = 0;
	if (update)
		set_frame(current_animation, current_frame);
	// TODO: The above is wrong for freeze time.
	requestAnimationFrame(function() {
		var dt = current_animation.frames[current_frame].time + current_animation.frames[current_frame].hold_time - (performance.now() - start_time);
		timeout = setTimeout(animate, dt > 0 ? dt : 0);
	});
}

// Helper functions. {
// Retrieve a file from the server; call cb with result.
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

// Change the current animation, optionally with a start_time.
function set_animation(index, time) {
	if (current === animations[index])
		return;
	if (current !== null)
		current.ui_deselect();
	if (animations[index] === undefined) {
		console.warn('Trying to play undefined animation:', index);
		current = null;
		return;
	}
	current = animations[index];
	current.ui_select();
	start_time = time !== undefined ? time : performance.now();
	set_frame(current, 0);
	if (timeout !== null)
		clearTimeout(timeout);
	animate();

	current.ui_update();
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
		if (animation.frames[frame] === undefined) {
			console.error('no frame', frame, animation.frames);
			continue;
		}
		var d = animation.frames[frame].data[dir];
		var parent = preview.AddElement('div', 'character');
		parent.style.left = dirs[dir];
		for (var i = 0; i < d.length; ++i) {
			var resource = animation.resources[i];
			var s = d[i].sprite;
			var sprite = resource.sprites[s[0]];
			r[dir].push(parent.AddElement('div', 'part'));
			var part = r[dir][i];
			part.style.left = d[i].x + 'px';
			part.style.top = (d[i].y + 64) + 'px';
			part.style.width = sprite.w + 'px';
			part.style.height = sprite.h + 'px';
			part.style.backgroundImage = "url('img/" + imgfiles[resource.file] + "')";
			part.style.backgroundPosition = -(sprite.x + s[1] * sprite.w) + 'px ' + -(sprite.y + s[2] * sprite.h) + 'px';
		}
	}
}

// Create a new frame as a deep copy of another.
function new_frame_data(src) {
	var copy = [];
	for (var i = 0; i < src.length; ++i) {
		var obj = {};
		obj.sprite = [src[i].sprite[0], src[i].sprite[1], src[i].sprite[2]];
		obj.x = src[i].x;
		obj.y = src[i].y;
		copy.push(obj);
	}
	return copy;
}
// }

// UI callback functions. {
// This function is called when a new animation is selected in the UI.
function select_animation() {
	// Respond to a new selection in the animation control.
	var ani = get('animation');
	if (ani.options.length <= ani.selectedIndex)
		return;
	set_animation(ani.selectedOptions[0].value);
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
	var find_name = function(n) {
		for (var a = 0; a < animations.length; ++a) {
			if (animations[a].name == n)
				return a;
		}
		return null;
	};
	while (newname != old_name && find_name(newname) !== null) {
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
	current.name = newname;
}

// This function is called when the "create resource" button is pressed.
function createresource() {
	// TODO: Add new resource.
}

// This function is called when the value of the hold time is changed.
function new_time() {
	var frame = get('frameselect').value;
	current.frames[frame].hold_time = Number(get('time').value);
	if (current.frames[frame].hold_time < 50)
		current.frames[frame].hold_time = 50;
	current.compute_timings();
}

// This function is called when the number of frames is changed.
function change_num_frames() {
	// Add or remove frames.
	var num_frames = Number(get('numframes').value);
	// Weird notation to make sure non-numbers will be corrected as well.
	if (!(num_frames > 0)) {
		num_frames = current.frames.length;
		get('numframes').value = num_frames;
	}
	var selected_frame = get('frameselect').value;
	while (num_frames < current.frames.length) {
		current.frames.splice(selected_frame, 1);
		if (selected_frame >= current.frames.length)
			selected_frame = current.frames.length - 1;
	}
	while (num_frames > current.frames.length) {
		var data = [];
		var src = current.frames[selected_frame];
		for (var i = 0; i < src.data.length; ++i)
			data.push(new_frame_data(src.data[i]));
		var obj = {data: data};
		for (var i in src) {
			if (i != 'data')
				obj[i] = src[i];
		}
		current.frames = current.frames.slice(0, selected_frame).concat([obj], current.frames.slice(selected_frame));
	}
	// Update times.
	var t = 0;
	for (var i = 0; i < current.frames.length; ++i) {
		current.frames[i].time = t;
		t += current.frames[i].hold_time;
	}
	get('frameselect').max = current.frames.length - 1;
	get('frameselect').value = selected_frame;
}

// This function is called when the single direction checkbox is toggled.
function set_direction() {
	current.single_dir = get('onedirection').checked;
	current.ui_update();
}

// This function is called when a new frame is selected.
function update_frame() {
	var frame = Number(get('frameselect').value);
	get('framenum').ClearAll().AddText(frame);
	current.frames[frame].ui_update();
	set_frame(current, frame, true);
}

// This function is called when the "save" button is clicked.
function save() {
	var data = current.make_gani();
	var a = Create('a');
	a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(data);
	a.download = current.name + '.gani';
	var event = document.createEvent('MouseEvents');
	event.initEvent('click', true, true);
	a.dispatchEvent(event);
}
// }

// vim: set foldmethod=marker foldmarker={,} :
