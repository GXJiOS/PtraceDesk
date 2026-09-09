.PHONY: check build install package

check:
	bash ./install.sh --check

build:
	bash ./install.sh --build-only

install:
	bash ./install.sh

package:
	bash ./install.sh --package
