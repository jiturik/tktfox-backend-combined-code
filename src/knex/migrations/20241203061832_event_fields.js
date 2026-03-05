export async function up(knex) {
  await knex.schema.alterTable("ms_event", (table) => {
    table.float("pass_discount_percent").defaultTo(0);
  });
}
export async function down(knex) {
  await knex.schema.alterTable("ms_event", (table) => {
    table.dropColumn("pass_discount_percent");
  });
}
