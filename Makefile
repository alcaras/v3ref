# v3reference build pipeline. `make data build` is the usual loop.
#
# V3REF     — the Victoria 3 data mirror (script files only, no gfx)
# VIC3_APP  — a local Victoria 3 install, used only for icon art (DDS→PNG)

V3REF ?= ../v3ref
export V3REF

.PHONY: data art build dev check all

data:
	node scripts/build_goods.mjs
	node scripts/build_buildings.mjs
	node scripts/build_pops.mjs
	node scripts/build_politics.mjs
	node scripts/build_techs.mjs
	node scripts/build_characters.mjs
	node scripts/build_world.mjs
	node scripts/build_diplomacy.mjs
	node scripts/build_companies.mjs
	node scripts/build_military.mjs
	node scripts/build_diplomacy2.mjs
	node scripts/build_culture.mjs
	node scripts/build_entities.mjs

art:
	./scripts/extract_art.sh

build:
	npx astro build

dev:
	npx astro dev

check:
	npx astro check

all: data build
