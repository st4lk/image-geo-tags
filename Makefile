.PHONY: run, lint, test, deploy

CMD ?= 

all: install

install: .install
.install: package.json
	npm install
	touch $@

run: install
	npm run devserver

lint:
	npm run lint

test-only:
	node test/binarySearch.js

test: lint test-only

build-dev:
	npm run build-dev

build-prod:
	npm run build-prod

serve-dist:
	cd dist/ && python -m SimpleHTTPServer 8080

workbox:
	./node_modules/workbox-cli/build/bin.js $(CMD)
