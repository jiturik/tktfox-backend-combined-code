async function up(knex) {
  await knex.schema.alterTable("ms_payment_booking_detail", (table) => {
    table.enu("is_paid", ["Y", "N"]).defaultTo("N");
  });
}
async function down(knex) {
  await knex.schema.alterTable("ms_payment_booking_detail", (table) => {
    table.dropColumn("is_paid");
  });
}

export { down, up };
