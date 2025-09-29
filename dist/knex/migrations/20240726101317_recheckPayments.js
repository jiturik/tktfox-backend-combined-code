async function up(knex) {
  await knex.schema.alterTable("ms_payment_booking_detail", (table) => {
    table.enu("recheck_payment", ["Y", "N"]).defaultTo("Y");
  });
}
async function down(knex) {
  await knex.schema.alterTable("ms_payment_booking_detail", (table) => {
    table.dropColumn("recheck_payment");
  });
}

export { down, up };
