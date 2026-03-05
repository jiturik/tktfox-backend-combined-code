export async function up(knex) {
  await knex.schema.alterTable("movie_event_pass", (table) => {
    table.integer("seat_type_id").nullable();
  });
}
export async function down(knex) {
  await knex.schema.alterTable("movie_event_pass", (table) => {
    table.dropColumn("seat_type_id");
  });
}
