.PHONY: install check lint test build package e2e
install:
	npm ci
check:
	npm run check
lint:
	npm run format:check
	npm run typecheck
test:
	npm test
build:
	npm run build
package:
	npm run build
	npm run test:package
e2e:
	npm run test:e2e
