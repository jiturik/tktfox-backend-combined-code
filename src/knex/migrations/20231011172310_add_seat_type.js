export async function up(knex) {
  await knex.schema.alterTable("ms_seat_layout", (table) => {
    table.integer("price_data");
  });
}
export async function down(knex) {
  await knex.schema.alterTable("ms_seat_layout", (table) => {
    table.dropColumn("price_data");
  });
}
