export async function up(knex) {
  await knex.schema.alterTable("movie_event_pass", (table) => {
    table.text("pass_feature").nullable();
    table.float("pass_tax_value").defaultTo(0);
  });
}
export async function down(knex) {
  await knex.schema.alterTable("movie_event_pass", (table) => {
    table.dropColumn("pass_feature");
    table.dropColumn("pass_tax_value");
  });
}
