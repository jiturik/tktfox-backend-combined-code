export async function up(knex) {
  await knex.schema.alterTable("ms_event", (table) => {
    table.enu("has_shop", ["Y", "N"]).defaultTo("N");
  });
}

export async function down(knex) {
  await knex.schema.alterTable("ms_event", (table) => {
    table.dropColumn("has_shop");
  });
}

