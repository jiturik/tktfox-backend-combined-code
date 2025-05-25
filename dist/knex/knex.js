import knex from 'knex';
import { attachPaginate } from 'knex-paginate';
import dotenv from 'dotenv';

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

const ENVIRONMENT = process.env.ENVIRONMENT;

async function KnexConnection() {
  return new Promise(async (resolve, reject) => {
    try {
      const knexInstance = knex(KnexConfig[ENVIRONMENT]);

      // attach pagination
      attachPaginate(knexInstance);

      const [result] = await knexInstance.raw("SELECT 1 + 1 AS sum");
      console.log("database connection with knex successful=>", result);

      resolve(knexInstance);
    } catch (error) {
      console.log("database connection with knex failed=>", error);
      reject("database connection with knex failed");
    }
  });
}

export { KnexConnection };
