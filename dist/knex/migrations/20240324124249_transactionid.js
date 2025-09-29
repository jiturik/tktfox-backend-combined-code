async function up(knex) {
  await knex.schema.alterTable("ms_payment_booking_detail", (table) => {
    table.string("payment_transaction_id").nullable();
  });
}
async function down(knex) {
  await knex.schema.alterTable("ms_payment_booking_detail", (table) => {
    table.dropColumn("payment_transaction_id");
  });
}

export { down, up };
