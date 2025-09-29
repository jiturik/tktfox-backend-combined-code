async function up(knex) {
  await knex.schema.alterTable("ms_cinemas", (table) => {
    table.integer("pay_currency_id").nullable();
    table.string("exchange_rate").nullable();
  });
}
async function down(knex) {
  await knex.schema.alterTable("ms_cinemas", (table) => {
    table.dropColumn("pay_currency_id");
    table.dropColumn("exchange_rate");
  });
}

export { down, up };
