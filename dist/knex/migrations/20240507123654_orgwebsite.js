import 'knex';

async function up(knex) {
  await knex.schema.createTable("org_website", (table) => {
    table.increments("web_id").primary();
    table.integer("org_id");
    table.string("website_url");
  });
}

async function down(knex) {
  await knex.schema.dropTable("org_website");
}

export { down, up };
