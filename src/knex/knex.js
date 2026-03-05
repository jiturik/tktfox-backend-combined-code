import knex from "knex";
import { attachPaginate } from "knex-paginate";
import KnexConfig from "../../knexfile.js";

const ENVIRONMENT = process.env.ENVIRONMENT;

export async function KnexConnection() {
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
