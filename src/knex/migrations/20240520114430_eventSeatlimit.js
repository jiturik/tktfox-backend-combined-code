export async function up(knex) {
  await knex.schema.alterTable("ms_event", (table) => {
    table.integer("selectable_max_seats").defaultTo(1);
  });
}
export async function down(knex) {
  await knex.schema.alterTable("ms_event", (table) => {
    table.dropColumn("selectable_max_seats");
  });
}
