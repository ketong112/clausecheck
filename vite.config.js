// Relative base so the built app also works when served from a sub-path
// (GitHub Pages project site), not just from the domain root.
export default {
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
};
