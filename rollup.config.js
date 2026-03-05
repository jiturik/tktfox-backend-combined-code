import multiInput from "rollup-plugin-multi-input";
import copy from "rollup-plugin-copy";

export default {
  input: ["./src/server.js", "./src/knex/**/*.js"],
  output: {
    dir: "dist", // Specify a directory for multiple chunks
    format: "es", // or 'cjs', 'umd', etc., depending on your needs
    //sourcemap: true, // Optional: generate sourcemaps
  },
  plugins: [
    multiInput(), // Handle multiple inputs via glob
    copy({
      targets: [
        {
          src: "src/modules/templetes/**/*.ejs",
          dest: "dist/modules/templetes",
        }, // Copy .ejs files
        {
          src: "src/winston-logs/*.log",
          dest: "dist/winston-logs",
        }, // Copy .ejs files
      ],
      verbose: true, // Optional: log the files being copied
    }),
  ],
};
