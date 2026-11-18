#!/usr/bin/env node
// The CLI release's runtime dependencies, locked.
//
// The release tarball carries the bundled extension and CLI, plus a few
// runtime packages that install.sh fetches from npm. Without a lockfile that
// fetch resolves whatever is newest in each range on every install, so a
// compromised release of any of them (or of anything they depend on) would ship
// with no diff to review. This script owns that package list and its lock:
//
//   node apps/cli/scripts/release-lock.mjs package <version>   release package.json to stdout (build.sh)
//   node apps/cli/scripts/release-lock.mjs apply <releaseDir>  copy the lock in, after checking it matches
//   node apps/cli/scripts/release-lock.mjs update              regenerate apps/cli/release-lock.json
//
// install.sh installs with `npm ci` when the lock is present. After changing
// any of these packages' versions in apps/cli/package.json, run `update` and
// commit release-lock.json; `apply` fails the build until you do.
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const CLI_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const LOCK = path.join(CLI_DIR, "release-lock.json")
const RUNTIME_DEPS = ["@inkjs/ui", "@trpc/client", "commander", "fuzzysort", "ink", "p-wait-for", "react", "superjson", "zustand"]

function releasePackage(version) {
	const pkg = JSON.parse(fs.readFileSync(path.join(CLI_DIR, "package.json"), "utf8"))
	const dependencies = {}
	for (const name of RUNTIME_DEPS) {
		if (!pkg.dependencies?.[name]) throw new Error(`apps/cli/package.json has no dependency ${name}`)
		dependencies[name] = pkg.dependencies[name]
	}
	return { name: "@roo-code/cli", version, type: "module", dependencies }
}

const same = (a, b) => JSON.stringify(Object.entries(a || {}).sort()) === JSON.stringify(Object.entries(b || {}).sort())

const [mode, arg] = process.argv.slice(2)
if (mode === "package") {
	process.stdout.write(JSON.stringify(releasePackage(arg || "0.0.0"), null, 2) + "\n")
} else if (mode === "apply") {
	const dir = path.resolve(arg)
	const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"))
	const lock = JSON.parse(fs.readFileSync(LOCK, "utf8"))
	if (!same(lock.packages?.[""]?.dependencies, pkg.dependencies)) {
		console.error("apps/cli/release-lock.json does not match the release dependencies in apps/cli/package.json.")
		console.error("Run: node apps/cli/scripts/release-lock.mjs update   and commit the lock.")
		process.exit(1)
	}
	lock.version = pkg.version
	lock.packages[""].version = pkg.version
	fs.writeFileSync(path.join(dir, "package-lock.json"), JSON.stringify(lock, null, 2) + "\n")
	console.log(`release lock applied (${Object.keys(lock.packages).length - 1} packages)`)
} else if (mode === "update") {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "roo-release-lock-"))
	try {
		fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify(releasePackage("0.0.0"), null, 2) + "\n")
		execFileSync("npm", ["install", "--package-lock-only", "--ignore-scripts", "--omit=dev", "--no-audit", "--no-fund"], { cwd: tmp, stdio: "inherit" })
		fs.copyFileSync(path.join(tmp, "package-lock.json"), LOCK)
		console.log(`wrote ${path.relative(process.cwd(), LOCK)}`)
	} finally {
		fs.rmSync(tmp, { recursive: true, force: true })
	}
} else {
	console.error("usage: release-lock.mjs package <version> | apply <releaseDir> | update")
	process.exit(2)
}
