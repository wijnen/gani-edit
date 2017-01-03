all: gani-edit.html

JSSRC = builders.js gani-edit.js
gani-edit.html: index.html ${JSSRC} style.css
	( \
		sed '/application\/javascript/,$$d' < $< ;\
		for file in ${JSSRC} ; do \
			echo "<script type='application/javascript'>" ;\
			cat $$file ;\
			echo "</script>" ;\
		done ;\
		echo "<style type='text/css'>" ;\
		cat style.css ;\
		echo "</style>" ;\
		sed '1,/text\/css/d' < index.html \
	) > $@

builders.js: /usr/share/python3-websocketd/builders.js
	ln -s $< $@

clean:
	# Don't clean builders.js, because it may be manually installed.
	rm -f gani-edit.html

.PHONY: clean all
