# Victoria 3 Reference

A reference site for Paradox's Victoria 3, generated directly from the game's
own script files and updated each patch.

**Live:** https://alcaras.github.io/v3ref/

Every number on the site is parsed from the game's data (`game/common/**`,
localization, modifier definitions) — no hand-maintained tables. The build
pipeline (Node + [jomini](https://github.com/rakaly/jomini) + Astro) turns the
Paradox script into JSON, and the static site renders it.

## Building

```sh
npm install
make data     # parse game files → src/data/*.json  (needs V3REF=<game data mirror>)
make art      # extract icons from a local install   (needs VIC3_APP, ImageMagick)
make build    # astro build → dist/
```

`V3REF` points at a mirror of the game's script files (default `../v3ref`);
`VIC3_APP` at a local Victoria 3 install (macOS Steam default) for icon art.
Generated JSON and icons are committed, so deploys only run `astro build`.

See [CLAUDE.md](CLAUDE.md) for the architecture and contribution guide.

Sibling project: [owreference](https://github.com/alcaras/owreference) (Old World).

Victoria 3 © Paradox Interactive. This is an unofficial fan reference.
