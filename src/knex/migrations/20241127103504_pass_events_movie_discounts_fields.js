export async function up(knex) {
  await knex.schema.alterTable("pass_event_movie_discount", (table) => {
    table.integer("pass_id");
    table.integer("event_id");
    table.dropColumn("pass_type");
    table.dropColumn("discount_for");
  });
}
export async function down(knex) {
  await knex.schema.alterTable("pass_event_movie_discount", (table) => {
    table.dropColumn("pass_id");
    table.dropColumn("event_id");
  });
}
