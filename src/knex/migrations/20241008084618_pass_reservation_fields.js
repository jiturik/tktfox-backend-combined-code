export async function up(knex) {
  await knex.schema.alterTable("ms_pass_reservation", (table) => {
    table.float("pass_tax_percent").defaultTo(0);
    table.float("pass_tax_value").defaultTo(0);
    table.float("pass_total_price").defaultTo(0);
  });
}
export async function down(knex) {
  await knex.schema.alterTable("ms_pass_reservation", (table) => {
    table.dropColumn("pass_tax_percent");
    table.dropColumn("pass_tax_value");
    table.dropColumn("pass_total_price");
  });
}
