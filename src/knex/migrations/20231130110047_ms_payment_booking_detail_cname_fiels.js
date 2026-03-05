export async function up(knex) {
  await knex.schema.alterTable("ms_payment_booking_detail", (table) => {
    table.string("c_name").after("failed_frontend_url");
    table.integer("customer_id").after("is_guest").defaultTo(0);
  });
}
export async function down(knex) {
  await knex.schema.alterTable("ms_payment_booking_detail", (table) => {
    table.dropColumn("c_name");
    table.dropColumn("customer_id");
  });
}
