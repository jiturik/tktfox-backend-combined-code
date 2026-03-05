export async function up(knex) {
  await knex.schema.alterTable("pass_booking", (table) => {
    table.float("pass_price").defaultTo(0);
    table.float("pass_tax_percent").defaultTo(0);
    table.float("pass_tax_value").defaultTo(0);
    table.float("pass_total_price").defaultTo(0);
  });
}
export async function down(knex) {
  await knex.schema.alterTable("pass_booking", (table) => {
    table.dropColumn("pass_price");
    table.dropColumn("pass_tax_percent");
    table.dropColumn("pass_tax_value");
    table.dropColumn("pass_total_price");
  });
}
