export async function up(knex) {
  await knex.schema.alterTable("ms_payment_booking_detail", (table) => {
    table.enu("booking_type", ["Normal", "Shop_only"]).defaultTo("Normal");
  });
}

export async function down(knex) {
  await knex.schema.alterTable("ms_payment_booking_detail", (table) => {
    table.dropColumn("booking_type");
  });
}
