export default {
  input: "./src/server.js",
  output: {
    dir: "dist", // Specify a directory for multiple chunks
    format: "es", // or 'cjs', 'umd', etc., depending on your needs
  },
  plugins: [
    /* your plugins here */
  ],
};
