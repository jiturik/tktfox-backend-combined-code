async function up(knex) {
  await knex.schema.alterTable("ms_payment_mode", (table) => {
    table.string("backend_api_route").nullable();
    table.integer("org_id").nullable();
  });
}
async function down(knex) {
  await knex.schema.alterTable("ms_payment_mode", (table) => {
    table.dropColumn("backend_api_route");
    table.integer("org_id").nullable();
  });
}

export { down, up };
