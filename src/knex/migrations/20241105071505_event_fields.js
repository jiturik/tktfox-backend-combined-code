export async function up(knex) {
  await knex.schema.alterTable("ms_event", (table) => {
    table.float("event_booking_fees").defaultTo(0);
  });
}
export async function down(knex) {
  await knex.schema.alterTable("ms_event", (table) => {
    table.dropColumn("event_booking_fees");
  });
}
