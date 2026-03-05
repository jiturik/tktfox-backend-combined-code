export async function up(knex) {
  await knex.schema.alterTable("ms_customers", (table) => {
    table.enu("is_verified", ["Y", "N"]).defaultTo("N");
    table.string("email_otp");
  });
}
export async function down(knex) {
  await knex.schema.alterTable("ms_customers", (table) => {
    table.dropColumn("is_verified");
    table.dropColumn("email_otp");
  });
}
