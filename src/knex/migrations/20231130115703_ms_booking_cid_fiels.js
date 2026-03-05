export async function up(knex) {
  await knex.schema.alterTable("ms_booking", (table) => {
    table.integer("customer_id").after("is_guest").defaultTo(0);
  });
}
export async function down(knex) {
  await knex.schema.alterTable("ms_booking", (table) => {
    table.dropColumn("customer_id");
  });
}
