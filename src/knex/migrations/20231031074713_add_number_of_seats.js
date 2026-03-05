export async function up(knex) {
  await knex.schema.alterTable("ms_booking_transaction", (table) => {
    table.integer("no_of_seats").defaultTo(0);
  });

  await knex.schema.alterTable("ms_reservation", (table) => {
    table.integer("no_of_seats").after("seat_type_id").defaultTo(0);
  });
}
export async function down(knex) {
  await knex.schema.alterTable("ms_booking_transaction", (table) => {
    table.dropColumn("no_of_seats");
  });

  await knex.schema.alterTable("ms_reservation", (table) => {
    table.dropColumn("no_of_seats");
  });
}
