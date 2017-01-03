# Introduction
This is an editor for Graal animation (gani) files.  I have never played or
even seen Graal, but the format is used by M.GRL and doesn't have a free
editor, so I'm writing one.

# State
This is nowhere near complete, or even usable.  The use of this repository is
for people to read the code, and for me to have a backup.

# How to Use
Copy builders.js (from my python-websocketd repository) into this directory.
Put a tree of gani files named \*.gani in a directory named gani and the images
they reference in a directory named img.  run "find > find.txt" to create a
list of files in this directory.  Start index.html in a browser.  I only test
with firefox, but it should work in any other browser as well.

Alternatively, you can run make to create a standalone gani-edit.html.  You can
copy it into a place which has a gani/ and img/ directory, run "find >
find.txt" and use the editor.

Please send me feedback at wijnen@debian.org.
