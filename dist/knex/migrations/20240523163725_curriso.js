async function up(knex) {
  await knex.schema.alterTable("ms_currencies", (table) => {
    table.integer("curr_iso").nullable();
  });
}
async function down(knex) {
  await knex.schema.alterTable("ms_currencies", (table) => {
    table.dropColumn("curr_iso");
  });
}

export { down, up };
