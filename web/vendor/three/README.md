# Vendored Three.js

`three.min.js` is Three.js r187 (MIT, see `LICENSE`) as a plain script that
defines a global `THREE`. It only contains the pieces listed in `entry.js`, so
it can be loaded with a normal `<script>` tag and works when the built page is
opened straight from disk.

Three.js no longer ships a non-module build, so this file was generated with
esbuild. You do not need to rebuild it unless the app starts using more of
Three.js.

To regenerate (needs Node.js, only for this step), run this in an empty folder
that contains a copy of `entry.js`:

```
npm i three@0.187.0 esbuild
npx esbuild entry.js --bundle --format=iife --global-name=THREE --minify \
  --legal-comments=none --outfile=three.min.js
```

Then put the banner line back at the top of the output and copy it here.
