# Introduction
This is an editor for Graal animation (gani) files.  I have never played or
even seen Graal, but the format is used by M.GRL and doesn't have a free
editor, so I'm writing one.

# State
As far as I know, it's working.  Please report any bugs or requests for new features to wijnen@debian.org

# To Be Done
* Mass save, for all animations at once
* Automatically fix the state; the editor allows sprites to have the same number, for example, while that is not allowed by the file format.

# Installing
Copy builders.js (from my python-websocketd repository) into this directory.
Put a tree of gani files named \*.gani in a directory named gani and the images
they reference (and/or that you want to use) in a directory named img, and
sounds in a directory named audio/.  run "find > find.txt" to create a list of
files in this directory.  Start index.html in a browser.  I only test with
firefox, but it should work in any other browser as well.

Alternatively, you can run make to create a standalone gani-edit.html.  You can
copy it into a place which has a gani/, img/ and optionally audio/ directory,
run "find > find.txt" and use the editor.

# Using the Editor
The page shows the animation playing (in four direction if applicable) in the
top right, and frozen in the bottom right.  There are three boxes with
controls, each of which can be opened with a checkbox.

In the Animation Properties box, the animation to edit can be selected and
renamed, and a new animation can be created (but that doesn't work at the
moment).  It also allows controlling what happens at the end of the animation,
whether it is a single direction animation and it has a button to save the
animation, which will trigger a download of the active animation.

The Sprite Definitions box contains a list of resources, each of which has a
file associated with it and a list of sprite definitions.  The slider under the
image allows changing which box is shown in the image.

The Frame Definitions box contains a slider which sets the frame that is
currently displayed in the lower right.  All values in the box are for this
frame.  The hold time determines the time the frame will be displayed and for
each resource the sprite and position are specified; once for single direction
animations, for each direction otherwise.  The audio control selects which
sound is played when the animation reaches this frame.

# Contact
Please send me feedback at wijnen@debian.org.
