async function up(knex) {
  await knex.schema.alterTable("ms_booking", (table) => {
    table.string("voucher_code").nullable();
    table.string("discount_percent").nullable();
    table.string("discount_value").nullable();
    table.string("total_before_discount").nullable();
  });
}
async function down(knex) {
  await knex.schema.alterTable("ms_booking", (table) => {
    table.dropColumn("voucher_code");
    table.dropColumn("discount_percent");
    table.dropColumn("discount_value");
    table.dropColumn("total_before_discount");
  });
}

export { down, up };
