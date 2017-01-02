all: gani-edit.html

JSSRC = /usr/share/python3-websocketd/builders.js gani-edit.js
gani-edit.html: index.html ${JSSRC}
	( \
		sed '/application\/javascript/,$$d' < $< ;\
		for file in ${JSSRC} ; do \
			echo "<script type='application/javascript'>" ;\
			cat $$file ;\
			echo "</script>" ;\
		done ;\
		sed '1,/application\/javascript/d;/application\/javascript/d' < index.html \
	) > $@

clean:
	rm -f gani-edit.html
