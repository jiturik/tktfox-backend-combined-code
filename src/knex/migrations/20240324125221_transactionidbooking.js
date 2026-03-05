export async function up(knex) {
  await knex.schema.alterTable("ms_booking", (table) => {
    table.string("payment_transaction_id").nullable();
  });
}
export async function down(knex) {
  await knex.schema.alterTable("ms_booking", (table) => {
    table.dropColumn("payment_transaction_id");
  });
}
