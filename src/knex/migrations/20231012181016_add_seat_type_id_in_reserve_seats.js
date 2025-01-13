async function up(knex) {
  await knex.schema.alterTable("ms_reservation", (table) => {
    table.integer("seat_type_id").after("seat_type").defaultTo(null);
  });
}
async function down(knex) {
  await knex.schema.alterTable("ms_reservation", (table) => {
    table.dropColumn("seat_type_id");
  });
}

export { down, up };
