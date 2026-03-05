export async function up(knex) {
  await knex.schema.alterTable("pass_booking", (table) => {
    table.float("pass_discount_percent").defaultTo(0);
    table.float("pass_valid_days").defaultTo(0);
  });
}
export async function down(knex) {
  await knex.schema.alterTable("pass_booking", (table) => {
    table.dropColumn("pass_discount_percent");
    table.dropColumn("pass_valid_days");
  });
}
