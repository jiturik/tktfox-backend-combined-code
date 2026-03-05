export async function up(knex) {
  await knex.schema.alterTable("ms_payment_booking_detail", (table) => {
    table.text("payment_request").nullable();
  });
}
export async function down(knex) {
  await knex.schema.alterTable("ms_payment_booking_detail", (table) => {
    table.dropColumn("payment_request");
  });
}
