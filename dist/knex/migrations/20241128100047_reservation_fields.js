async function up(knex) {
  await knex.schema.alterTable("ms_reservation", (table) => {
    table.string("voucher_code").after("voucher_applied").nullable();
    table.string("pass_code").after("pass_applied").nullable();
  });
}
async function down(knex) {
  await knex.schema.alterTable("ms_reservation", (table) => {
    table.dropColumn("voucher_code");
    table.dropColumn("pass_code");
  });
}

export { down, up };
