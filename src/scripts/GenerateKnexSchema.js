import fs from "fs";
import path from "path";
import { globSync } from "glob";
import { pathToFileURL } from "url";

// Point to your actual migrations folder under src
const migrationsPath = path.join(process.cwd(), "src", "knex", "migrations");

const schema = {};

function mockTable(tableName) {
  schema[tableName] = schema[tableName] || {};

  const chainable = {
    unsigned() {
      return this;
    },
    defaultTo() {
      return this;
    },
    nullable() {
      return this;
    },
    notNullable() {
      return this;
    },
    after() {
      return this;
    },
    primary() {
      return this;
    },
    index() {
      return this;
    },
    unique() {
      return this;
    },
  };

  return {
    increments(col) {
      schema[tableName][col] = "integer (pk)";
      return chainable;
    },
    string(col) {
      schema[tableName][col] = "string";
      return chainable;
    },
    integer(col) {
      schema[tableName][col] = "integer";
      return chainable;
    },
    boolean(col) {
      schema[tableName][col] = "boolean";
      return chainable;
    },
    timestamp(col) {
      schema[tableName][col] = "timestamp";
      return chainable;
    },
    datetime(col) {
      schema[tableName][col] = "datetime";
      return chainable;
    },
    date(col) {
      schema[tableName][col] = "date";
      return chainable;
    },
    time(col) {
      schema[tableName][col] = "time";
      return chainable;
    },
    decimal(col) {
      schema[tableName][col] = "decimal";
      return chainable;
    },
    float(col) {
      schema[tableName][col] = "float";
      return chainable;
    },
    text(col) {
      schema[tableName][col] = "text";
      return chainable;
    },
    enu(col) {
      schema[tableName][col] = "enum";
      return chainable;
    },
    dropColumn(col) {
      if (schema[tableName]) {
        delete schema[tableName][col];
      }
      return chainable;
    },
    index() {
      return chainable;
    },
    unique() {
      return chainable;
    },
  };
}

function createQueryBuilder() {
  const qb = {
    insert() {
      return Promise.resolve();
    },
    update() {
      return Promise.resolve();
    },
    delete() {
      return Promise.resolve();
    },
    del() {
      return Promise.resolve();
    },
    where() {
      return qb;
    },
    andWhere() {
      return qb;
    },
    orWhere() {
      return qb;
    },
    select() {
      return qb;
    },
    from() {
      return qb;
    },
  };
  return qb;
}

// Mock knex instance: callable function + schema helpers
const mockKnex = Object.assign(
  function () {
    return createQueryBuilder();
  },
  {
    schema: {
      createTable(name, cb) {
        const table = mockTable(name);
        cb(table);
      },
      alterTable(name, cb) {
        const table = mockTable(name);
        cb(table);
      },
    },
    fn: {
      now() {
        return "NOW()";
      },
    },
    // Support `await knex.raw(...)` in migrations
    raw() {
      return Promise.resolve();
    },
  },
);

const files = globSync(`${migrationsPath}/*.js`, { absolute: true });

for (const file of files) {
  const moduleUrl = pathToFileURL(file).href;
  const imported = await import(moduleUrl);
  const migration = imported.default ?? imported;

  if (typeof migration.up === "function") {
    await migration.up(mockKnex);
  }
}

fs.writeFileSync("schema-overview.json", JSON.stringify(schema, null, 2));

console.log("Schema generated!");
