import dotenv from "dotenv";
dotenv.config();
const KnexConfig = {
  development: {
    client: "mysql2",
    connection: {
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT,
    },
    migrations: {
      tableName: "knex_migrations",
      directory: "./src/knex/migrations",
      extension: "js",
      loadExtensions: [".js", ".ts"],
    },
    pool: {
      min: 0,
      max: 100,
    },
  },

  production: {
    client: "mysql2",
    connection: {
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT,
    },
    migrations: {
      tableName: "knex_migrations",
      directory: "./src/knex/migrations",
      extension: "js",
      loadExtensions: [".js", ".ts"],
    },
    pool: {
      min: 0,
      max: 100,
    },
  },
};

export default KnexConfig;
