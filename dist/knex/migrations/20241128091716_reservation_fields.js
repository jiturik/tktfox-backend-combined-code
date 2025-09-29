async function up(knex) {
  await knex.schema.alterTable("ms_reservation", (table) => {
    table.enu("voucher_applied", ["Y", "N"]).defaultTo(null);
    table.float("voucher_discount_percent").defaultTo(0);
    table.float("voucher_discount_amount").defaultTo(0);
    table.enu("pass_applied", ["Y", "N"]).defaultTo(null);
    table.float("pass_discount_percent").defaultTo(0);
    table.float("pass_discount_amount").defaultTo(0);
  });
}
async function down(knex) {
  await knex.schema.alterTable("ms_reservation", (table) => {
    table.dropColumn("voucher_applied");
    table.dropColumn("voucher_discount_percent");
    table.dropColumn("voucher_discount_amount");
    table.dropColumn("pass_applied");
    table.dropColumn("pass_discount_percent");
    table.dropColumn("pass_discount_amount");
  });
}

export { down, up };
