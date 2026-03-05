export async function up(knex) {
  await knex.schema.alterTable("ms_payment_booking_detail", (table) => {
    table.integer("pm_id").defaultTo(0);
  });
}

export async function down(knex) {
  await knex.schema.alterTable("ms_payment_booking_detail", (table) => {
    table.dropColumn("pm_id");
  });
}
